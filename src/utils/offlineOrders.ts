// Offline orders — place-order without any order API.
//
// When POST /api/orders does not exist on the server (read-only feed host) or
// the device is offline (status 0), the order is saved on this device instead
// of failing. Stored per server URL so one host's local orders never leak into
// another. Offline rows merge into getActiveOrders / table detail reads and are
// dropped on bill request / checkout, exactly like server orders.

import { getStorageItemSync, setStorageItemSync } from '@/utils/storage';
import type { Order } from '@/services/api';

/** Storage key hydrated before first paint — see PERSISTED_KEYS in _layout.tsx. */
export const OFFLINE_ORDERS_KEY = 'smart_cafe_offline_orders';

type OfflineBucket = Record<string, Order[]>;

const readAll = (): OfflineBucket => {
  try {
    const raw = getStorageItemSync(OFFLINE_ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as OfflineBucket)
      : {};
  } catch {
    return {};
  }
};

const writeAll = (all: OfflineBucket): void => {
  try {
    setStorageItemSync(OFFLINE_ORDERS_KEY, JSON.stringify(all));
  } catch {
    // Storage full/blocked — offline orders stay in memory for this session.
  }
};

/** Offline rows use timestamp ids (> 1e12) so they never collide with server ids. */
export const isOfflineOrderId = (id: unknown): boolean => {
  const n = Number(id);
  return Number.isFinite(n) && n > 1000000000000;
};

export const isOfflineOrder = (order: Pick<Order, 'id'> | null | undefined): boolean =>
  Boolean(order && isOfflineOrderId(order.id));

export function getOfflineOrders(baseUrl: string): Order[] {
  const list = readAll()[baseUrl];
  return Array.isArray(list) ? list : [];
}

export function getOfflineOrdersForTable(baseUrl: string, tableId: number): Order[] {
  return getOfflineOrders(baseUrl).filter((o) => Number(o.tableId) === Number(tableId));
}

export function addOfflineOrder(baseUrl: string, order: Order): void {
  const all = readAll();
  const list = Array.isArray(all[baseUrl]) ? all[baseUrl] : [];
  all[baseUrl] = [order, ...list.filter((o) => o.id !== order.id)];
  writeAll(all);
}

export function updateOfflineOrder(baseUrl: string, order: Order): void {
  const all = readAll();
  const list = Array.isArray(all[baseUrl]) ? all[baseUrl] : [];
  if (!list.some((o) => o.id === order.id)) return;
  all[baseUrl] = list.map((o) => (o.id === order.id ? order : o));
  writeAll(all);
}

export function removeOfflineOrders(baseUrl: string, orderIds: number[]): void {
  const all = readAll();
  const list = Array.isArray(all[baseUrl]) ? all[baseUrl] : [];
  if (list.length === 0) return;
  const drop = new Set(orderIds.map(Number));
  all[baseUrl] = list.filter((o) => !drop.has(Number(o.id)));
  if (all[baseUrl].length === 0) delete all[baseUrl];
  writeAll(all);
}
