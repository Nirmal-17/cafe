import { Table } from '@/services/api';

export type DiningArea =
  | 'indoor'
  | 'outdoor'
  | 'tables'
  | 'roof'
  | 'cabin'
  | 'hall'
  | 'garden'
  | 'pool'
  | 'room';

export type ServiceType = 'dine-in' | 'delivery' | 'takeaway';

export const DINING_AREAS: DiningArea[] = [
  'indoor',
  'outdoor',
  'tables',
  'roof',
  'cabin',
  'hall',
  'garden',
  'pool',
  'room',
];

export const isIndoor = (area: DiningArea): boolean => {
  return area === 'indoor' || area === 'tables' || area === 'roof' || area === 'cabin' || area === 'hall' || area === 'garden' || area === 'room';
};

export const isOutdoor = (area: DiningArea): boolean => {
  return area === 'outdoor' || area === 'pool';
};

export const getDiningAreaLabel = (area: DiningArea): string => {
  const labels: Record<DiningArea, string> = {
    indoor: 'Indoor',
    outdoor: 'Outdoor',
    tables: 'Tables Area',
    roof: 'Roof',
    cabin: 'Cabin',
    hall: 'Hall',
    garden: 'Garden',
    pool: 'Pool',
    room: 'Room',
  };
  return labels[area];
};

/** Display heading for a service-type filter: 'dine-in' → 'Dine In', etc. */
export const getServiceTypeLabel = (type: ServiceType | string): string => {
  const v = String(type ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (v === 'delivery') return 'Delivery';
  if (v === 'takeaway' || v === 'take-away') return 'Takeaway';
  return 'Dine In';
};

export const filterTablesByDiningArea = (  tables: Table[],
  area: DiningArea | 'all'
): Table[] => {
  if (area === 'all') return tables;
  return tables.filter((table) => table.diningArea === area);
};

export const getTablesByDiningArea = (
  tables: Table[],
  area: DiningArea
): Table[] => filterTablesByDiningArea(tables, area);

/**
 * Classify a table into its service type based on its table name / number:
 * - Delivery: contains 'del' tables and 'd' tables (e.g. Del 1..3, D1..D10, Delivery 1, D-1)
 * - Takeaway: contains 't' tables and 'take' tables (e.g. Take 1..4, T1..T8, Takeaway 1, T-1)
 * - Dine In: attach remaining tables to dine in
 */
export function classifyTableServiceType(tableNumber: string): ServiceType {
  const raw = String(tableNumber || '').trim().toLowerCase();
  if (!raw) return 'dine-in';
  const clean = raw.replace(/^table\s*[-_]?\s*/i, '').trim();

  // Delivery: 'del' tables and 'd' tables (excludes 'deluxe' dining rooms)
  if (
    /^delivery/i.test(clean) ||
    /^del\b(?!uxe)/i.test(clean) ||
    /^del\s*[-_]?\s*\d+/i.test(clean) ||
    /^d\s*[-_]?\s*\d+/i.test(clean)
  ) {
    return 'delivery';
  }

  // Takeaway: 't' tables and 'take' tables (excludes 'test' tables)
  if (
    /^takeaway/i.test(clean) ||
    /^take\b/i.test(clean) ||
    /^take\s*[-_]?\s*\d+/i.test(clean) ||
    /^t\s*[-_]?\s*\d+/i.test(clean)
  ) {
    return 'takeaway';
  }

  // Attach remaining tables to Dine In
  return 'dine-in';
}

export const filterTablesByServiceType = (
  tables: Table[],
  type: ServiceType | 'all'
): Table[] => {
  if (type === 'all') return tables;
  return tables.filter((table) => {
    const tableType = table.serviceType || classifyTableServiceType(table.tableNumber);
    return tableType === type;
  });
};

/**
 * Outer-level service filter (dashboard / My Tables top buttons). Same as
 * filterTablesByServiceType, except Delivery/Takeaway fall back to the shared
 * tables when no dedicated delivery or takeaway tables exist — otherwise the
 * tab would render a blank screen. Inner tabs (TableTabsCard) intentionally
 * use the strict version so their counts stay truthful.
 */
export const filterTablesByServiceTypeWithFallback = (
  tables: Table[],
  type: ServiceType | 'all'
): Table[] => {
  if (type === 'all') return tables;
  const matched = filterTablesByServiceType(tables, type);
  return matched.length > 0 ? matched : tables;
};

export const getTablesByServiceType = (
  tables: Table[],
  type: ServiceType
): Table[] => filterTablesByServiceType(tables, type);