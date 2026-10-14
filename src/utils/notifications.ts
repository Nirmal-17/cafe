import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from './storage';

const NOTIFICATIONS_KEY = 'smart_cafe_notifications';

export type NotificationType = 'order_ready' | 'order_served' | 'bill_requested' | 'order_created' | 'order_paid' | 'table_status' | 'order_assigned' | 'print_proceeded';

/** Row shape returned by GET /api/notifications (server is the source of truth). */
export interface ServerNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  orderId: number | null;
  tableId: number | null;
  tableNumber: string | null;
  orderStatus: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: ServerNotification[];
  unreadCount: number;
}

/** Client-side view model used by the Alerts UI. */
export interface StoredNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: NotificationType;
  orderId?: number;
  tableId?: number;
  tableNumber?: string;
  orderStatus?: string;
}

export function fromServerNotification(n: ServerNotification): StoredNotification {
  return {
    id: String(n.id),
    title: n.title,
    message: n.message,
    timestamp: new Date(n.createdAt).getTime(),
    read: n.read,
    type: n.type as NotificationType,
    orderId: n.orderId ?? undefined,
    tableId: n.tableId ?? undefined,
    tableNumber: n.tableNumber ?? undefined,
    orderStatus: n.orderStatus ?? undefined,
  };
}

/** Last-known list kept for instant badge hydration on app restart (refreshed from server). */
export function getCachedNotifications(): StoredNotification[] {
  try {
    const raw = getStorageItemSync(NOTIFICATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Number of unread rows — the single source of truth for every badge. */
export function countUnread(list: StoredNotification[]): number {
  return list.filter((n) => !n.read).length;
}

const MAX_LOCAL_NOTIFICATIONS = 100;

/**
 * Local-first notification factory. The documented API (api.txt) exposes no
 * GET /api/notifications feed, so order events (READY / SERVED / bill
 * requested) must still count even when the server has no such route.
 */
export function buildLocalNotification(opts: {
  type: NotificationType;
  title: string;
  message: string;
  orderId?: number;
  tableId?: number;
  tableNumber?: string;
  orderStatus?: string;
}): StoredNotification {
  const tableLabel =
    opts.tableNumber || (opts.tableId != null ? `Table ${opts.tableId}` : '');
  const dedupeKey = opts.orderId != null ? `${opts.type}-${opts.orderId}` : null;
  return {
    id: dedupeKey ?? `local-${opts.type}-${Date.now()}`,
    title: opts.title,
    message: opts.message || tableLabel,
    timestamp: Date.now(),
    read: false,
    type: opts.type,
    orderId: opts.orderId,
    tableId: opts.tableId,
    tableNumber: opts.tableNumber,
    orderStatus: opts.orderStatus,
  };
}

/**
 * Prepend a notification, deduping repeats of the same (type, orderId) so a
 * WebSocket echo plus its polling diff can't double-count one event.
 */
export function prependNotification(
  list: StoredNotification[],
  item: StoredNotification,
): StoredNotification[] {
  const next = list.some((n) => n.id === item.id)
    ? list.map((n) => (n.id === item.id ? item : n))
    : [item, ...list];
  return next.slice(0, MAX_LOCAL_NOTIFICATIONS);
}

export function markLocalNotificationRead(
  list: StoredNotification[],
  id: string,
): StoredNotification[] {
  return list.map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function markAllLocalNotificationsRead(
  list: StoredNotification[],
): StoredNotification[] {
  return list.map((n) => ({ ...n, read: true }));
}

export function removeLocalNotification(
  list: StoredNotification[],
  id: string,
): StoredNotification[] {
  return list.filter((n) => n.id !== id);
}

export function cacheNotifications(list: StoredNotification[]): void {
  setStorageItemSync(NOTIFICATIONS_KEY, JSON.stringify(list));
}

export function clearCachedNotifications(): void {
  removeStorageItemSync(NOTIFICATIONS_KEY);
}

/**
 * Persist one popup (BottomToast) event into the cached Notifications list.
 * Called synchronously from showBottomToast so popups fired on routes where
 * the home list isn't mounted (e.g. order-details) still appear in the
 * Notifications screen. Dedupes by (type, orderId) like prependNotification.
 */
export function persistToastNotification(opts: {
  type: NotificationType;
  title: string;
  message: string;
  orderId?: number;
  tableId?: number;
  tableNumber?: string;
  orderStatus?: string;
}): StoredNotification {
  const item = buildLocalNotification(opts);
  try {
    cacheNotifications(prependNotification(getCachedNotifications(), item));
  } catch {
    // Cache write must never break the popup itself.
  }
  return item;
}

/** Returns human-readable relative time string like "2 min ago", "1h ago", "3d ago" */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
