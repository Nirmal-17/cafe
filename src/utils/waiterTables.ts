// Waiter dashboard floor-plan allowlist.
//
// The venue wants the waiter-logged-in dashboard to show ONLY:
//   Indoor  → IN 1..IN 5
//   Roof    → R 1..R 3
//   Cabin   → C 1
//   Hall    → Test 2, Test Hall
//   Garden  → G 1..G 4
//   Pool    → P 1..P 2
//   Room    → Deluxe Room 1..5
//   Outdoor → 01..06 (O1..O6 / Outdoor 1..6 / bare 01..06)
//
// Everything else from the server (Indoor 1/2, Cabin 2, Hall 1..3,
// Outdoor 1, Bar 1..4, …) is hidden — but ONLY on the waiter dashboard.
// Admin dashboard + My Tables keep the full server list.
//
// Matching is spaceless/caseless so "IN 1", "in-1", "In1" all match,
// while "Indoor 1" does NOT (it has no IN-prefix + number shape).

import type { Table } from '@/services/api';

const flat = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\s\-_]+/g, '');

const trailingNumber = (v: string): number | null => {
  const m = v.match(/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** True when this table belongs in the waiter dashboard floor plan. */
export function isWaiterDashboardTable(tableNumber: unknown): boolean {
  const raw = String(tableNumber ?? '').trim();
  if (!raw) return false;
  const v = raw.toLowerCase().trim();
  const f = flat(raw);

  // Room first (contains "deluxe" or "room"): Deluxe Room 1..5.
  if (v.includes('deluxe') || v.includes('room')) {
    const n = trailingNumber(v);
    return n !== null && n >= 1 && n <= 5;
  }

  // Hall: only the two test tables — anything carrying "test".
  // Covers "Test 2", "Test2", "Test Hall", "TestHall".
  if (v.includes('test') || v.includes('hall')) {
    return v.includes('test');
  }

  // Full-word prefixes with number: indoor1..5 is NOT allowed —
  // Indoor allows IN-prefix only (IN 1..IN 5).
  if (f.startsWith('indoor')) return false;
  if (f.startsWith('garden')) {
    const n = trailingNumber(v);
    return n !== null && n >= 1 && n <= 4;
  }
  if (f.startsWith('cabin')) {
    const n = trailingNumber(v);
    return n !== null && n === 1;
  }
  if (f.startsWith('roof')) {
    const n = trailingNumber(v);
    return n !== null && n >= 1 && n <= 3;
  }
  if (f.startsWith('pool')) {
    const n = trailingNumber(v);
    return n !== null && n >= 1 && n <= 2;
  }
  if (f.startsWith('outdoor') || f.startsWith('outdoor')) {
    const n = trailingNumber(v);
    return n !== null && n >= 1 && n <= 6;
  }

  // Short codes: IN1..IN5, R1..R3, C1, G1..G4, P1..P2, O1..O6.
  const code = v.match(/^(in|r|c|g|p|o)\s*[-_]?\s*0?(\d+)$/);
  if (code) {
    const prefix = code[1];
    const n = Number(code[2]);
    if (!Number.isFinite(n)) return false;
    switch (prefix) {
      case 'in':
        return n >= 1 && n <= 5;
      case 'r':
        return n >= 1 && n <= 3;
      case 'c':
        return n === 1;
      case 'g':
        return n >= 1 && n <= 4;
      case 'p':
        return n >= 1 && n <= 2;
      case 'o':
        return n >= 1 && n <= 6;
      default:
        return false;
    }
  }

  // Bare numbers 01..06 → Outdoor 01..06.
  if (/^0?[1-6]$/.test(v.trim())) return true;

  return false;
}

/** Keep only the allowlisted tables (order preserved). */
export function filterWaiterDashboardTables<T extends { tableNumber?: unknown }>(
  tables: readonly T[],
): T[] {
  return tables.filter((t) => isWaiterDashboardTable(t.tableNumber));
}

/** Type-safe helper for Table[] specifically. */
export function filterWaiterTables(tables: Table[]): Table[] {
  return filterWaiterDashboardTables(tables);
}
