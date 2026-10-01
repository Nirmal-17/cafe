// Home screen API — sections, tables, notifications and dining-session actions.
// Thin per-screen composition layer over the core `api` client (api.ts);
// active orders come in through orderApi (the order domain owns them).

import { api, ApiResponse, Order, Section, Table } from '@/services/api';
import type { NotificationListResponse } from '@/utils/notifications';
import { orderApi } from '@/services/orderApi';

export interface HomeData {
  sections: ApiResponse<Section[]>;
  tables: ApiResponse<Table[]>;
  activeOrders: ApiResponse<Order[]>;
}

// The core client resolves failures into ApiResponse, but guard against
// unexpected throws so a screen never sees a rejected promise.
const safe = <T>(promise: Promise<ApiResponse<T>>): Promise<ApiResponse<T>> =>
  promise.catch((e) => ({
    success: false,
    error: e?.message || 'Network error',
    status: 0,
    aborted: false,
  }));

export const homeApi = {
  /** Full home snapshot — sections + tables + active orders in parallel. */
  async getHomeData(): Promise<HomeData> {
    const [sections, tables, activeOrders] = await Promise.all([
      safe(api.getSections()),
      safe(api.getTables()),
      orderApi.getActiveOrders('active-orders-refresh'),
    ]);
    return { sections, tables, activeOrders };
  },

  getSections(): Promise<ApiResponse<Section[]>> {
    return safe(api.getSections());
  },

  getTables(): Promise<ApiResponse<Table[]>> {
    return safe(api.getTables());
  },

  getNotifications(requestKey?: string): Promise<ApiResponse<NotificationListResponse>> {
    return safe(api.getNotifications(requestKey));
  },

  // ─── Dining session / table status actions ───────────────────────────────
  startTableSession(tableId: number) {
    return safe(api.startTableSession(tableId));
  },

  updateTableStatus(tableId: number, status: string) {
    return safe(api.updateTableStatus(tableId, status));
  },
};
