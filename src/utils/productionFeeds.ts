// Mappers for the flat production feeds served by the hosted CafeOS backend:
//   GET /api/cafetable/all     — floor plan rows (snake_case, un-nested)
//   GET /api/tablecategory/all — table category names (session-gated)
//   GET /api/customer/all      — customer directory
// The screens consume the app's own models (Table / Section / CafeTable /
// Customer), so every conversion lives here — no screen ever sees a raw row.
// Deliberately free of I/O so it can be reasoned about alone.

import type { CafeTable, Customer, Section, Table, TableCategory } from '@/services/api';
import { classifyTableServiceType } from '@/utils/diningArea';
import { inferSectionFromTableName } from '@/utils/tableSections';

/**
 * No feed carries a seating capacity, but every floor-plan tile renders one.
 * 4 is the default the local backend seeds new tables with, so the tiles keep
 * reading the way they do against a CafeOS server.
 */
export const DEFAULT_TABLE_CAPACITY = 4;

/** Raw row from GET /api/cafetable/all. */
export interface RemoteCafeTable {
  table_id: number;
  table_category_id: number;
  name: string;
  display_name?: string | null;
  is_active?: boolean;
  is_reserved?: boolean;
}

/** Raw row from GET /api/tablecategory/all (shape inferred from the feeds' conventions). */
export interface RemoteTableCategory {
  table_category_id?: number;
  id?: number;
  name?: string | null;
  display_name?: string | null;
}

/** Raw row from GET /api/customer/all. */
export interface RemoteCustomer {
  customer_id: number;
  name: string;
  contact_no?: string | null;
  email?: string | null;
  address?: string | null;
  description?: string | null;
  image_path?: string | null;
  is_enabled?: boolean;
}

const num = (value: unknown): number => Number(value);

const text = (value: unknown): string => String(value ?? '').trim();

/** Table label shown across the app; falls back to a readable placeholder. */
export const tableLabel = (row: RemoteCafeTable): string =>
  text(row.display_name) || text(row.name) || `Table ${row.table_id}`;

/** Reserve-only: the hosted feed carries no occupancy state — only reservation. */
const tableStatus = (row: RemoteCafeTable): Table['status'] => {
  if (row.is_reserved === true) return 'RESERVED';
  return 'AVAILABLE';
};

/** Flat cafetable row → the CafeTable model (table list APIs). */
export function mapCafeTable(row: RemoteCafeTable): CafeTable {
  return {
    id: num(row.table_id),
    tableCategoryId: num(row.table_category_id),
    tableNumber: tableLabel(row),
    capacity: DEFAULT_TABLE_CAPACITY,
    status: tableStatus(row),
    isReserved: row.is_reserved === true,
  };
}

/** Flat cafetable row → the Table model the floor plan and order screens use. */
export function mapCafeTableToTable(row: RemoteCafeTable): Table {
  const tableNum = tableLabel(row);
  return {
    id: num(row.table_id),
    sectionId: num(row.table_category_id),
    tableNumber: tableNum,
    capacity: DEFAULT_TABLE_CAPACITY,
    status: tableStatus(row),
    is_reserved: row.is_reserved === true,
    serviceType: classifyTableServiceType(tableNum),
    // The hosted feed carries no dining sessions, so the tile renders as
    // unassigned — same as a table nobody has seated yet on a CafeOS server.
    activeSession: null,
  };
}

/**
 * Table rows → Section[] for the floor-plan tabs, grouped by table category.
 * `names` (from /tablecategory/all when the session can reach it) labels the
 * groups; anything unnamed is inferred from the tables' own labels
 * (IN→Indoor, R→Roof, … — see inferSectionFromTableName) so the tabs read
 * Indoor / Roof / Cabin / Hall / Garden / Pool / Room / Outdoor instead of
 * the "Section {id}" placeholders the old code produced.
 */
export function sectionsFromTables(tables: Table[], names: Map<number, string> = new Map()): Section[] {
  const order: number[] = [];
  for (const table of tables) {
    const id = num(table.sectionId);
    if (!Number.isFinite(id)) continue;
    if (!order.includes(id)) order.push(id);
  }
  return order.sort((a, b) => a - b).map((id) => {
    const known = (names.get(id) || '').trim();
    if (known && !/^section\s+\d+$/i.test(known)) {
      return { id, name: known, description: null, status: 'ACTIVE' as const };
    }
    // No backend name — infer from the category's own tables by majority vote,
    // so one odd table (e.g. a single O6 among IN tables, or vice versa) can't
    // mislabel the whole tab the way a first-sample pick could.
    const votes = new Map<string, number>();
    for (const t of tables) {
      if (num(t.sectionId) !== id) continue;
      const inferred = inferSectionFromTableName(t.tableNumber);
      if (inferred) votes.set(inferred, (votes.get(inferred) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [name, count] of votes) {
      if (count > bestCount) {
        best = name;
        bestCount = count;
      }
    }
    return {
      id,
      name: best || `Section ${id}`,
      description: null,
      status: 'ACTIVE' as const,
    };
  });
}

/** Category-name rows → the lookup used by sectionsFromTables(). */
export function sectionNamesFromCategories(rows: RemoteTableCategory[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const row of rows) {
    const id = num(row.table_category_id ?? row.id);
    const label = text(row.display_name ?? row.name);
    if (Number.isFinite(id) && label) names.set(id, label);
  }
  return names;
}

/** Category row → the TableCategory model (id + label; the feed carries no counts). */
export function mapTableCategory(row: RemoteTableCategory): TableCategory {
  const id = num(row.table_category_id ?? row.id);
  return {
    id: Number.isFinite(id) ? id : 0,
    name: text(row.display_name ?? row.name) || `Section ${id}`,
    description: null,
  };
}

/** Flat customer row → the Customer model (order flow, future CRM screens). */
export function mapCustomer(row: RemoteCustomer): Customer {
  return {
    id: num(row.customer_id),
    name: text(row.name) || `Customer #${row.customer_id}`,
    phone: text(row.contact_no) || null,
    email: text(row.email) || null,
    address: text(row.address) || null,
    // Free-text notes field on the feed — closest thing the backend carries
    // to a customer remark, so it rides along as description-style context.
    description: text(row.description) || null,
    enabled: row.is_enabled !== false,
  };
}
