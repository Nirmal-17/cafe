// Bill-requested orders — dropped from the active/order-details lists.
//
// Request Bill checks an order out: the server may still return it from
// /orders/active until it is paid, so the client tracks requested ids per
// server URL (same rule as offline orders/sessions) and filters them out of
// every active list. A table whose last open order was requested therefore
// disappears from the Order Details list immediately.

import { getStorageItemSync, setStorageItemSync } from '@/utils/storage';

/** Storage key hydrated before first paint — see PERSISTED_KEYS in _layout.tsx. */
export const BILL_REQUESTED_KEY = 'smart_cafe_bill_requested_ids';

type Bucket = Record<string, number[]>;

const mem = new Map<string, Set<number>>();
let hydrated = false;

function readAll(): Bucket {
  try {
    const raw = getStorageItemSync(BILL_REQUESTED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Bucket)
      : {};
  } catch {
    return {};
  }
}

function writeAll(all: Bucket): void {
  try {
    setStorageItemSync(BILL_REQUESTED_KEY, JSON.stringify(all));
  } catch {
    // Storage full/blocked — ids stay in memory for this session.
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const all = readAll();
  for (const [url, ids] of Object.entries(all)) {
    if (Array.isArray(ids)) mem.set(url, new Set(ids.map(Number).filter(Number.isFinite)));
  }
}

function getSet(baseUrl: string): Set<number> {
  hydrate();
  let set = mem.get(baseUrl);
  if (!set) {
    set = new Set();
    mem.set(baseUrl, set);
  }
  return set;
}

function persist(baseUrl: string): void {
  const all = readAll();
  const set = mem.get(baseUrl);
  if (!set || set.size === 0) {
    delete all[baseUrl];
  } else {
    all[baseUrl] = Array.from(set);
  }
  writeAll(all);
}

export function markBillRequested(orderId: unknown, baseUrl: string): void {
  const id = Number(orderId);
  if (!Number.isFinite(id) || !baseUrl) return;
  const set = getSet(baseUrl);
  if (set.has(id)) return;
  set.add(id);
  // Bound growth: drop the oldest inserts first (Sets iterate in insertion
  // order and the new id sorts last, so this never drops `id` itself).
  while (set.size > 500) {
    const oldest = set.values().next();
    if (oldest.done) break;
    set.delete(oldest.value);
  }
  persist(baseUrl);
}

export function isBillRequested(orderId: unknown, baseUrl?: string): boolean {
  const id = Number(orderId);
  if (!Number.isFinite(id)) return false;
  hydrate();
  if (baseUrl) return mem.get(baseUrl)?.has(id) ?? false;
  for (const set of mem.values()) {
    if (set.has(id)) return true;
  }
  return false;
}

/** Drop ids the server no longer returns so the store cannot grow forever. */
export function pruneBillRequested(presentIds: Iterable<unknown>, baseUrl: string): void {
  if (!baseUrl) return;
  const set = getSet(baseUrl);
  if (set.size === 0) return;
  const present = new Set<number>();
  for (const raw of presentIds) {
    const n = Number(raw);
    if (Number.isFinite(n)) present.add(n);
  }
  let changed = false;
  for (const id of Array.from(set)) {
    if (!present.has(id)) {
      set.delete(id);
      changed = true;
    }
  }
  if (changed) persist(baseUrl);
}
