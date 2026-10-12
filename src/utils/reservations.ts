// Reservation codes for tables.
//
// Frontend-only: a code is minted the moment a table is booked (RESERVED) and
// lives in AsyncStorage, so it survives an app restart. Format is RES-0042 —
// a monotonic sequence that is never reused, so the same table always gets a
// different code each time. It is dropped as soon as the table is free again.

import { useSyncExternalStore } from 'react';
import { getStorageItemSync, setStorageItemSync } from '@/utils/storage';

export const RESERVATIONS_STORAGE_KEY = 'smart_cafe_reservations';

const PREFIX = 'RES-';
const MIN_SEQ = 1;

interface ReservationState {
  seq: number;
  byTable: Record<string, string>;
}

const EMPTY_STATE: ReservationState = { seq: 0, byTable: {} };

/**
 * How long a freshly minted code is shielded from reconciliation, so a refetch
 * that was already in flight when the table was booked/seated cannot drop it.
 */
const RELEASE_GRACE_MS = 30_000;

/** In-memory only: when each code was last minted (not persisted). */
const mintedAt = new Map<string, number>();

function readState(): ReservationState {
  try {
    const raw = getStorageItemSync(RESERVATIONS_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_STATE;
    const record = parsed as { seq?: unknown; byTable?: unknown };
    const seq = Number(record.seq);
    const byTable =
      record.byTable && typeof record.byTable === 'object' && !Array.isArray(record.byTable)
        ? (record.byTable as Record<string, string>)
        : {};
    return { seq: Number.isFinite(seq) && seq >= MIN_SEQ ? seq : 0, byTable };
  } catch {
    return EMPTY_STATE;
  }
}

// ── change notifications (useSyncExternalStore) ──

let revision = 0;
const listeners = new Set<() => void>();

function writeState(next: ReservationState): void {
  setStorageItemSync(RESERVATIONS_STORAGE_KEY, JSON.stringify(next));
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getRevision(): number {
  return revision;
}

/**
 * Force subscribers to re-read storage. Called once AsyncStorage hydration has
 * finished — until then the native cache is empty, so every table would read
 * as unreserved and nothing would trigger a repaint when the codes land.
 */
export function primeReservations(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

/** Re-renders the caller whenever any reservation code is minted or dropped. */
export function useReservationsRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}

/** Live code for one table (null when the table is not reserved here). */
export function useReservationId(tableId: number | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getReservationId(tableId),
    () => getReservationId(tableId),
  );
}

// ── store operations ──

export function formatReservationId(seq: number): string {
  return `${PREFIX}${String(seq).padStart(4, '0')}`;
}

export function getReservationId(tableId: number | null | undefined): string | null {
  if (tableId == null) return null;
  return readState().byTable[String(tableId)] ?? null;
}

/** Mint a code for the table. Idempotent — an existing code is returned as-is. */
export function assignReservationId(tableId: number): string {
  const state = readState();
  const key = String(tableId);
  const existing = state.byTable[key];
  if (existing) {
    // An explicit book/seated action also re-arms the release grace window.
    mintedAt.set(key, Date.now());
    return existing;
  }
  const seq = state.seq + 1;
  const id = formatReservationId(seq);
  mintedAt.set(key, Date.now());
  writeState({ seq, byTable: { ...state.byTable, [key]: id } });
  return id;
}

/** Forget a table's code (table freed / booking cancelled). */
export function releaseReservationId(tableId: number): void {
  const state = readState();
  const key = String(tableId);
  mintedAt.delete(key);
  if (!(key in state.byTable)) return;
  const byTable = { ...state.byTable };
  delete byTable[key];
  writeState({ ...state, byTable });
}

/** Put a code back exactly as it was — used to roll back a failed booking. */
export function restoreReservationId(tableId: number, id: string | null): void {
  if (!id) return;
  const state = readState();
  const key = String(tableId);
  if (state.byTable[key] === id) return;
  const match = /^RES-(\d+)$/.exec(id);
  const seq = match ? Number(match[1]) : 0;
  mintedAt.set(key, Date.now());
  writeState({
    seq: Math.max(state.seq, Number.isFinite(seq) ? seq : 0),
    byTable: { ...state.byTable, [key]: id },
  });
}

/**
 * Reconcile the store against the table snapshot we are about to show:
 * every "live" table (reserved or being served) gets a code, and every other
 * table loses its code — unless it was minted within RELEASE_GRACE_MS, so a
 * stale in-flight refetch cannot take back a code that was just issued.
 *
 * Codes are minted here as well as at the book/take-order action so a table
 * that became busy through a path we did not observe (auto session open on
 * the first order, another device) still carries an id.
 */
export function syncReservationIds(liveTableIds: ReadonlySet<string>): void {
  const state = readState();
  const now = Date.now();
  const byTable = { ...state.byTable };
  let seq = state.seq;
  let changed = false;

  for (const key of liveTableIds) {
    if (byTable[key]) continue;
    seq += 1;
    byTable[key] = formatReservationId(seq);
    mintedAt.set(key, now);
    changed = true;
  }

  for (const key of Object.keys(byTable)) {
    if (liveTableIds.has(key)) continue;
    const at = mintedAt.get(key);
    if (at !== undefined && now - at < RELEASE_GRACE_MS) continue;
    mintedAt.delete(key);
    delete byTable[key];
    changed = true;
  }

  if (!changed) return;
  writeState({ seq, byTable });
}
