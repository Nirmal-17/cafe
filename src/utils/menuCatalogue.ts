// Production menu catalogue mapping.
//
// The hosted server exposes the menu as three flat feeds:
//   GET /api/menu-item/all        — every item (snake_case rows, flat)
//   GET /api/menucategory/all     — category names + display order
//   GET /api/explore-menu/get-menu — legacy join that carries item ordering
// Screens consume the nested MenuCategory[] shape, so this module folds the
// feeds together. It is deliberately free of I/O so it can be reasoned about
// (and tested) alone.

import type { MenuItem, MenuCategory } from '@/services/api';

/** Raw row from GET /api/menu-item/all (flat, public). */
export interface RemoteMenuItem {
  menu_item_id: number;
  menu_category_id: number;
  name: string;
  display_name: string;
  short_name?: string | null;
  menu_item_code?: string | null;
  position?: number | null;
  rate: number;
  is_shown?: boolean;
  menu_unit_id?: number | null;
}

/** Raw row from GET /api/menucategory/all — category names + ordering. */
export interface RemoteMenuCategory {
  menu_category_id: number;
  name: string;
  display_name?: string | null;
  is_visible_in_menu?: boolean;
  position?: number | null;
}

/** Raw row from GET /api/explore-menu/get-menu — legacy item-ordering feed. */
export interface RemoteMenuRow {
  menuCategoryId: number;
  menuCategoryName: string;
  menuItemName: string;
  menuItemRate: number;
}

/** Category descriptor the fold needs: identity, label and display order. */
export interface MenuCategoryEntry {
  id: number;
  name: string;
  /** Sort key from the feed; 0 means "unpositioned" and sorts last by id. */
  position: number;
  /** false when the feed marks the category as hidden from the menu. */
  visible: boolean;
}

const entryName = (row: { name?: string | null; display_name?: string | null }, id: number): string =>
  String(row.display_name ?? row.name ?? '').trim() || `Category ${id}`;

const byPosition = (a: MenuCategoryEntry, b: MenuCategoryEntry): number => {
  const ap = a.position > 0 ? a.position : Number.MAX_SAFE_INTEGER;
  const bp = b.position > 0 ? b.position : Number.MAX_SAFE_INTEGER;
  return ap !== bp ? ap - bp : a.id - b.id;
};

/** Fold /menucategory/all rows into ordered entries. */
export function categoryEntriesFromCategories(rows: RemoteMenuCategory[]): MenuCategoryEntry[] {
  return rows
    .map((row) => ({
      id: Number(row.menu_category_id),
      name: entryName(row, Number(row.menu_category_id)),
      position: Number(row.position) || 0,
      visible: row.is_visible_in_menu !== false,
    }))
    .filter((entry) => Number.isFinite(entry.id))
    .sort(byPosition);
}

/** Fold the legacy explore feed into ordered entries (when /menucategory/all is unavailable). */
export function categoryEntriesFromExplore(rows: RemoteMenuRow[]): MenuCategoryEntry[] {
  const seen = new Map<number, MenuCategoryEntry>();
  rows.forEach((row, index) => {
    const id = Number(row.menuCategoryId);
    if (!Number.isFinite(id) || seen.has(id)) return;
    seen.set(id, {
      id,
      name: String(row.menuCategoryName || '').trim() || `Category ${id}`,
      // The explore feed has no explicit order — it lists categories in the
      // order they first appear, which is the only signal available.
      position: index + 1,
      visible: true,
    });
  });
  return [...seen.values()].sort(byPosition);
}

/**
 * Flat catalogue row → the MenuItem model every screen renders.
 * `description` carries short_name (the public alias): it never renders, it
 * only widens menu search.
 */
export function mapMenuItem(raw: RemoteMenuItem, categoryId: number = Number(raw.menu_category_id)): MenuItem {
  const shortName = typeof raw.short_name === 'string' ? raw.short_name.trim() : '';
  return {
    id: Number(raw.menu_item_id),
    categoryId: Number.isFinite(categoryId) ? categoryId : Number(raw.menu_category_id),
    name: String(raw.display_name || raw.name || '').trim() || `Menu item #${raw.menu_item_id}`,
    description: shortName || null,
    price: Number(raw.rate) || 0,
    image: null,
    available: raw.is_shown !== false,
  };
}

/**
 * Fold the flat production feeds into the nested MenuCategory[] shape.
 *
 * - category names/order come from `entries` (the /menucategory/all feed when
 *   reachable, the explore feed otherwise); categories the feed never mentions
 *   are appended in id order so no item is silently dropped
 * - item order inside a category follows the explore feed when it covers that
 *   item, otherwise the server's own array order
 * - items with is_shown === false and categories with visible === false are
 *   dropped, matching the local backend's available-items-only GET /menu
 */
export function buildMenuCategories(
  items: RemoteMenuItem[],
  entries: MenuCategoryEntry[],
  exploreRows: RemoteMenuRow[] = [],
): MenuCategory[] {
  const itemRank = new Map<string, number>();
  const rankKey = (categoryId: number, name: string) => `${categoryId}\u0000${name.trim().toLowerCase()}`;
  exploreRows.forEach((row, index) => {
    const categoryId = Number(row.menuCategoryId);
    if (!Number.isFinite(categoryId)) return;
    const key = rankKey(categoryId, String(row.menuItemName || ''));
    if (!itemRank.has(key)) itemRank.set(key, index);
  });

  const serverOrder = new Map<number, number>();
  const buckets = new Map<number, RemoteMenuItem[]>();
  for (const item of items) {
    if (item.is_shown === false) continue;
    const categoryId = Number(item.menu_category_id);
    const itemId = Number(item.menu_item_id);
    if (!Number.isFinite(categoryId) || !Number.isFinite(itemId)) continue;
    const bucket = buckets.get(categoryId);
    if (bucket) bucket.push(item);
    else buckets.set(categoryId, [item]);
    if (!serverOrder.has(itemId)) serverOrder.set(itemId, serverOrder.size);
  }

  const orderedIds = [
    ...entries.filter((entry) => entry.visible && buckets.has(entry.id)).map((entry) => entry.id),
    ...[...buckets.keys()].filter((id) => !entries.some((entry) => entry.id === id)).sort((a, b) => a - b),
  ];
  const nameById = new Map(entries.map((entry) => [entry.id, entry.name]));

  const rankOf = (item: RemoteMenuItem): number => {
    const exploreRank = itemRank.get(
      rankKey(Number(item.menu_category_id), String(item.display_name || item.name || '')),
    );
    // Missing explore rank falls back to the server's own array order, so an
    // item never jumps to the end just because the legacy feed lacks it.
    return exploreRank ?? (serverOrder.get(Number(item.menu_item_id)) ?? Number.MAX_SAFE_INTEGER);
  };

  return orderedIds.map((categoryId) => {
    const rawItems = [...buckets.get(categoryId)!].sort((a, b) => {
      const rank = rankOf(a) - rankOf(b);
      if (rank !== 0) return rank;
      const position = (a.position ?? 0) - (b.position ?? 0);
      if (position !== 0) return position;
      return String(a.display_name || a.name || '').localeCompare(String(b.display_name || b.name || ''));
    });

    return {
      id: categoryId,
      name: nameById.get(categoryId) || `Category ${categoryId}`,
      description: null,
      items: rawItems.map((raw) => mapMenuItem(raw, categoryId)),
    };
  });
}
