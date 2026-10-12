// Canonical ordered menu items specification.
// Screen: PlaceOrderScreen (src/app/table/[id].tsx)
//
// Matches the user's authoritative 106-item list and order.
// Filters out any items outside this list ("remove items rather than")
// and orders them strictly in this exact sequence.

import type { MenuItem } from '@/services/api';

export interface CanonicalMenuItem {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  available: boolean;
  aliases?: string[];
}

export const CANONICAL_ORDERED_ITEMS: CanonicalMenuItem[] = [
  { id: 65, categoryId: 10, name: "Americano", price: 110, available: true },
  { id: 84, categoryId: 4, name: "Balvenie 25Y 180ml", price: 24000, available: true },
  { id: 81, categoryId: 4, name: "Balvenie 25Y 30ml", price: 4000, available: true },
  { id: 82, categoryId: 4, name: "Balvenie 25Y 60ml", price: 8000, available: true },
  { id: 83, categoryId: 4, name: "Balvenie 25Y 90ml", price: 12000, available: true },
  { id: 86, categoryId: 4, name: "Balvenie 25Y full", price: 140000, available: true },
  { id: 85, categoryId: 4, name: "Balvenie 25Y half", price: 70000, available: true },
  { id: 96, categoryId: 2, name: "Bread Butter and Jam", price: 120, available: true },
  { id: 36, categoryId: 5, name: "Budweiser Big", price: 700, available: true },
  { id: 35, categoryId: 5, name: "Budweiser small", price: 450, available: true },
  { id: 17, categoryId: 3, name: "Buff Chilly Momo", price: 250, available: true },
  { id: 12, categoryId: 3, name: "Buff Momo", price: 179, available: true },
  { id: 9, categoryId: 2, name: "Butter Naan", price: 220, available: true },
  { id: 73, categoryId: 15, name: "Camel Chilly", price: 390, available: true },
  { id: 72, categoryId: 15, name: "Camel Fry", price: 350, available: true },
  { id: 74, categoryId: 15, name: "Camel Sekuwa", price: 350, available: true },
  { id: 1, categoryId: 1, name: "Chicken Chowmein", price: 150, available: true },
  { id: 11, categoryId: 3, name: "Chicken Momo", price: 150, available: true },
  { id: 16, categoryId: 3, name: "Chicken chilly momo", price: 200, available: true },
  { id: 21, categoryId: 3, name: "Chicken fry momo", price: 170, available: true },
  { id: 108, categoryId: 19, name: "DIVINE 30 ML", price: 150, available: true },
  { id: 3, categoryId: 2, name: "Egg Omlet", price: 80, available: true },
  { id: 4, categoryId: 2, name: "Egg boil", price: 40, available: true },
  { id: 2, categoryId: 2, name: "Egg pouch", price: 120, available: true },
  { id: 51, categoryId: 10, name: "Fanta 250ml", price: 50, available: true },
  { id: 59, categoryId: 11, name: "Fresh Juice", price: 650, available: true },
  { id: 38, categoryId: 5, name: "Gorkha Big", price: 650, available: true },
  { id: 37, categoryId: 5, name: "Gorkha Small", price: 400, available: true },
  { id: 30, categoryId: 4, name: "JD 180ml", price: 3200, available: true },
  { id: 27, categoryId: 4, name: "JD 30Ml", price: 600, available: true },
  { id: 28, categoryId: 4, name: "JD 60ml", price: 1000, available: true },
  { id: 29, categoryId: 4, name: "JD 90ml", price: 1500, available: true },
  { id: 32, categoryId: 4, name: "JD full", price: 12000, available: true },
  { id: 31, categoryId: 4, name: "JD half", price: 6000, available: true },
  { id: 50, categoryId: 4, name: "Jagermister 60ml", price: 9100, available: true },
  { id: 52, categoryId: 10, name: "Jameson Water", price: 25, available: true },
  { id: 47, categoryId: 4, name: "Jameson irish 30ml", price: 300, available: true },
  { id: 42, categoryId: 8, name: "Khukuri cig", price: 20, available: true },
  { id: 93, categoryId: 8, name: "Khukuri cigs", price: 20, available: true },
  { id: 103, categoryId: 4, name: "Macallan Double Cask 12 Y 180ml", price: 3300, available: true },
  { id: 100, categoryId: 4, name: "Macallan Double Cask 12 Y 30ml", price: 600, available: true },
  { id: 101, categoryId: 4, name: "Macallan Double Cask 12 Y 60ml", price: 1100, available: true },
  { id: 102, categoryId: 4, name: "Macallan Double Cask 12 Y 90ml", price: 1700, available: true },
  { id: 104, categoryId: 4, name: "Macallan Double Cask 12 Y full", price: 18000, available: true },
  { id: 19, categoryId: 3, name: "Mutton chilly momo", price: 280, available: true },
  { id: 14, categoryId: 3, name: "Mutton momo", price: 250, available: true },
  { id: 8, categoryId: 2, name: "Naan", price: 200, available: true },
  { id: 43, categoryId: 4, name: "Nepse Bull 30ml", price: 400, available: true },
  { id: 44, categoryId: 4, name: "Nepse Bull 60Ml", price: 800, available: true },
  { id: 22, categoryId: 4, name: "OD Regular 30Ml", price: 200, available: true },
  { id: 25, categoryId: 4, name: "OD regular 180ml", price: 1200, available: true },
  { id: 23, categoryId: 4, name: "OD regular 60ml", price: 400, available: true },
  { id: 24, categoryId: 4, name: "OD regular 90ml", price: 600, available: true },
  { id: 26, categoryId: 4, name: "OD regular full", price: 3500, available: true },
  { id: 69, categoryId: 2, name: "Oatmeal Waffle", price: 120, available: true },
  { id: 7, categoryId: 2, name: "Plain roti", price: 100, available: true },
  { id: 13, categoryId: 3, name: "Pork Momo", price: 170, available: true },
  { id: 18, categoryId: 3, name: "Pork chilly momo", price: 250, available: true },
  { id: 68, categoryId: 12, name: "Preeti Soup", price: 70, available: true },
  { id: 5, categoryId: 2, name: "Puri", price: 80, available: true },
  { id: 62, categoryId: 10, name: "Red Bull blue", price: 180, available: true },
  { id: 53, categoryId: 4, name: "Royal Blue", price: 1500, available: true },
  { id: 78, categoryId: 4, name: "Singleton 25Y 180ml", price: 14800, available: true },
  { id: 75, categoryId: 4, name: "Singleton 25Y 30ml", price: 2500, available: true },
  { id: 76, categoryId: 4, name: "Singleton 25Y 60ml", price: 4900, available: true },
  { id: 77, categoryId: 4, name: "Singleton 25Y 90ml", price: 7300, available: true },
  { id: 80, categoryId: 4, name: "Singleton 25Y Full", price: 70000, available: true },
  { id: 79, categoryId: 4, name: "Singleton 25Y half", price: 40000, available: true },
  { id: 70, categoryId: 13, name: "Spaghetti Carbonara", price: 300, available: true },
  { id: 66, categoryId: 10, name: "Spring water", price: 80, available: true },
  { id: 90, categoryId: 4, name: "Strathclyde 1990 35Y 180ml", price: 11500, available: true },
  { id: 87, categoryId: 4, name: "Strathclyde 1990 35Y 30ml", price: 2000, available: true },
  { id: 88, categoryId: 4, name: "Strathclyde 1990 35Y 60ml", price: 3900, available: true },
  { id: 89, categoryId: 4, name: "Strathclyde 1990 35Y 90ml", price: 5800, available: true },
  { id: 92, categoryId: 4, name: "Strathclyde 1990 35Y full", price: 60000, available: true },
  { id: 91, categoryId: 4, name: "Strathclyde 1990 35Y half", price: 30000, available: true },
  { id: 39, categoryId: 8, name: "Surya", price: 25, available: true },
  { id: 34, categoryId: 5, name: "Tuborg big", price: 500, available: true },
  { id: 33, categoryId: 5, name: "Tuborg small", price: 350, available: true },
  { id: 10, categoryId: 3, name: "Veg Momo", price: 80, available: true },
  { id: 15, categoryId: 3, name: "Veg chilly momo", price: 130, available: true },
  { id: 20, categoryId: 3, name: "Veg fry momo", price: 100, available: true },
  { id: 67, categoryId: 12, name: "Wai-Wai Soup", price: 80, available: true },
  { id: 98, categoryId: 11, name: "apple juice", price: 150, available: true },
  { id: 71, categoryId: 5, name: "barhasinge", price: 600, available: true },
  { id: 60, categoryId: 4, name: "black chimey 30ml", price: 300, available: true },
  { id: 61, categoryId: 4, name: "black chimey 60ml", price: 600, available: true },
  { id: 6, categoryId: 2, name: "bread and jam", price: 120, available: true },
  { id: 41, categoryId: 8, name: "captain", price: 20, available: true },
  { id: 64, categoryId: 10, name: "coke 2.5L", price: 250, available: true },
  { id: 63, categoryId: 10, name: "coke glass", price: 80, available: true },
  { id: 49, categoryId: 4, name: "jagermister 90ml", price: 9000, available: true },
  { id: 46, categoryId: 4, name: "jameson irish", price: 7090, available: true },
  { id: 48, categoryId: 4, name: "jameson irish 60 ml", price: 600, available: true, aliases: ['jameson irish 60  ml'] },
  { id: 54, categoryId: 4, name: "royal blue 30ml", price: 60, available: true },
  { id: 58, categoryId: 4, name: "royal blue 60", price: 120, available: true },
  { id: 56, categoryId: 4, name: "royal blue 90ml", price: 180, available: true },
  { id: 106, categoryId: 18, name: "shikahr ice", price: 30, available: true },
  { id: 40, categoryId: 8, name: "shikhar ice", price: 20, available: true },
  { id: 45, categoryId: 9, name: "soyabin", price: 100, available: true },
  { id: 95, categoryId: 6, name: "sukuti Chatpate", price: 350, available: true },
  { id: 94, categoryId: 6, name: "sukuti chatpTE", price: 350, available: true },
  { id: 97, categoryId: 8, name: "surya fuison", price: 30, available: true },
  { id: 107, categoryId: 18, name: "surya ltem", price: 40, available: true },
  { id: 105, categoryId: 12, name: "wai wai soup", price: 50, available: true },
  { id: 99, categoryId: 10, name: "xtreme", price: 150, available: true },
];

// Normalized name lookup: lowercase, collapse multi-spaces
function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Sort menu items by their position in the canonical ordered list.
 * Items not in the canonical list are placed at the end, maintaining
 * their relative order. The canonical list provides authoritative
 * ordering for place-order consistency.
 */
export function sortMenuItemsByCanonicalOrder(
  items: MenuItem[]
): MenuItem[] {
  // Build index maps if not already built
  if (idToIndex.size === 0 && CANONICAL_ORDERED_ITEMS.length > 0) {
    CANONICAL_ORDERED_ITEMS.forEach((it, idx) => {
      idToIndex.set(it.id, idx);
      nameToIndex.set(normalize(it.name), idx);
      if (it.aliases) {
        it.aliases.forEach(alias => nameToIndex.set(normalize(alias), idx));
      }
    });
  }

  const sorted = [...items].sort((a, b) => {
    const idxA = idToIndex.get(a.id) ?? nameToIndex.get(normalize(a.name)) ?? Infinity;
    const idxB = idToIndex.get(b.id) ?? nameToIndex.get(normalize(b.name)) ?? Infinity;
    if (idxA !== idxB) return idxA - idxB;
    // Tie-break: keep original order
    return 0;
  });

  // Ensure items not in canonical list appear after canonical items,
  // preserving their original relative order
  const canonicalItems: MenuItem[] = [];
  const nonCanonicalItems: MenuItem[] = [];
  for (const item of sorted) {
    const idx = idToIndex.get(item.id) ?? nameToIndex.get(normalize(item.name));
    if (idx !== undefined) {
      canonicalItems.push(item);
    } else {
      nonCanonicalItems.push(item);
    }
  }

  return [...canonicalItems, ...nonCanonicalItems];
}

const idToIndex = new Map<number, number>();
const nameToIndex = new Map<string, number>();

CANONICAL_ORDERED_ITEMS.forEach((it, idx) => {
  idToIndex.set(it.id, idx);
  nameToIndex.set(normalize(it.name), idx);
  if (it.aliases) {
    it.aliases.forEach(alias => nameToIndex.set(normalize(alias), idx));
  }
});

/**
 * Filter items to only include the canonical 106 items, and sort them
 * strictly in the required order with authoritative pricing.
 */
export function filterAndOrderMenuItems(rawItems: MenuItem[]): MenuItem[] {
  if (!rawItems || rawItems.length === 0) {
    return CANONICAL_ORDERED_ITEMS.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: null,
      price: item.price,
      image: null,
      available: item.available,
    }));
  }

  // Index the raw items by canonical index
  const matchedByIndex = new Map<number, MenuItem>();

  for (const raw of rawItems) {
    let targetIndex: number | undefined = idToIndex.get(raw.id);
    if (targetIndex === undefined) {
      targetIndex = nameToIndex.get(normalize(raw.name));
    }
    if (targetIndex !== undefined) {
      const canonical = CANONICAL_ORDERED_ITEMS[targetIndex];
      // Keep server properties (image, available flag if explicitly false),
      // but enforce the authoritative name, price, and ID
      matchedByIndex.set(targetIndex, {
        ...raw,
        id: canonical.id,
        categoryId: raw.categoryId || canonical.categoryId,
        name: canonical.name,
        price: canonical.price,
        available: raw.available !== false,
      });
    }
  }

  // Ensure all canonical items are present even if the server omitted some
  const result: MenuItem[] = [];
  for (let i = 0; i < CANONICAL_ORDERED_ITEMS.length; i++) {
    const canonical = CANONICAL_ORDERED_ITEMS[i];
    const item = matchedByIndex.get(i) || {
      id: canonical.id,
      categoryId: canonical.categoryId,
      name: canonical.name,
      description: null,
      price: canonical.price,
      image: null,
      available: canonical.available,
    };
    result.push(item);
  }

  return result;
}

/**
 * Category names and order for the canonical items.
 */
export const CANONICAL_CATEGORIES = [
  { id: 1, name: 'Chowmein' },
  { id: 2, name: 'Breakfast' },
  { id: 3, name: 'Momo' },
  { id: 4, name: 'Whiskey' },
  { id: 5, name: 'Beer' },
  { id: 6, name: 'Lunch' },
  { id: 8, name: 'Cigrattes' },
  { id: 9, name: 'Bag' },
  { id: 10, name: 'Cold Drinks' },
  { id: 11, name: 'Juice' },
  { id: 12, name: 'Noodles' },
  { id: 13, name: 'Pasta' },
  { id: 15, name: 'Meat Lovers' },
  { id: 18, name: 'churot items' },
  { id: 19, name: 'WINE' },
];
