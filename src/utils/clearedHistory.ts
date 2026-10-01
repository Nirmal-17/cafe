import { getStorageItemSync, setStorageItemSync } from './storage';

const CLEARED_KEY = 'smart_cafe_cleared_history';

interface UserClearState {
  clearedAt: number | null;
  removedIds: number[];
}

type ClearedMap = Record<string, UserClearState>;

function readMap(): ClearedMap {
  try {
    const raw = getStorageItemSync(CLEARED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(map: ClearedMap): void {
  setStorageItemSync(CLEARED_KEY, JSON.stringify(map));
}

function stateFor(userId: number | string | null): UserClearState {
  const map = readMap();
  const key = String(userId ?? 'all');
  if (!map[key]) map[key] = { clearedAt: null, removedIds: [] };
  return map[key];
}

function persist(userId: number | string | null, state: UserClearState): void {
  const map = readMap();
  const key = String(userId ?? 'all');
  map[key] = state;
  writeMap(map);
}

export function isOrderCleared(order: { id?: number; createdAt?: string }, userId: number | string | null): boolean {
  const s = stateFor(userId);
  if (!order.createdAt) return false;
  if (s.clearedAt !== null && new Date(order.createdAt).getTime() <= s.clearedAt) return true;
  return s.removedIds.includes(Number(order.id) || 0);
}

export function clearAllHistory(userId: number | string | null): void {
  persist(userId, { clearedAt: Date.now(), removedIds: [] });
}

export function removeOrderFromHistory(orderId: number, userId: number | string | null): void {
  const s = stateFor(userId);
  const id = Number(orderId);
  if (!s.removedIds.includes(id)) {
    s.removedIds.push(id);
    persist(userId, s);
  }
}

export function getClearedState(userId: number | string | null): UserClearState {
  return stateFor(userId);
}
