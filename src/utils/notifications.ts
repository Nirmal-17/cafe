import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from './storage';

const NOTIFICATIONS_KEY = 'smart_cafe_notifications';

export type NotificationType = 'order_ready' | 'order_served' | 'bill_requested' | 'order_created' | 'order_paid' | 'table_status' | 'order_assigned';

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

export function cacheNotifications(list: StoredNotification[]): void {
  setStorageItemSync(NOTIFICATIONS_KEY, JSON.stringify(list));
}

export function clearCachedNotifications(): void {
  removeStorageItemSync(NOTIFICATIONS_KEY);
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
