// Order screens API — order listing/detail, placement, status transitions,
// bill/print actions, plus the table/menu/settings loads the order screens need.
// Thin per-screen composition layer over the core `api` client (api.ts).

import {
  api,
  ApiResponse,
  CafeSettings,
  MenuCategory,
  Order,
  TableDetail,
} from '@/services/api';

export interface PlaceOrderData {
  table: ApiResponse<TableDetail>;
  menu: ApiResponse<MenuCategory[]>;
  settings: ApiResponse<CafeSettings>;
}

export interface OrdersPage {
  orders: Order[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
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

export const orderApi = {
  // ─── Reads ────────────────────────────────────────────────────────────────
  getActiveOrders(requestKey?: string): Promise<ApiResponse<Order[]>> {
    return safe(api.getActiveOrders(requestKey));
  },

  getOrders(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
    tableId?: number;
    waiterId?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<OrdersPage>> {
    return safe(api.getOrders(params));
  },

  getOrder(id: number): Promise<ApiResponse<Order>> {
    return safe(api.getOrder(id));
  },

  /** Table detail including the table's active orders (order-details screen). */
  getTableDetail(tableId: number): Promise<ApiResponse<TableDetail>> {
    return safe(api.getTable(tableId));
  },

  /** Everything the place-order screen loads up front, in parallel. */
  async getPlaceOrderData(tableId: number): Promise<PlaceOrderData> {
    const [table, menu, settings] = await Promise.all([
      safe(api.getTable(tableId)),
      // force: this screen submits these menu ids to the backend, so a stale
        // A stale snapshot would be rejected with "Menu item not found".
      safe(api.getMenu({ force: true })),
      safe(api.getSettings()),
    ]);
    return { table, menu, settings };
  },

  // ─── Writes ───────────────────────────────────────────────────────────────
  createOrder(data: {
    tableId: number;
    waiterId?: number;
    customerNotes?: string;
    clientRequestId?: string;
    items: { menuItemId: number; quantity: number; price: number; notes?: string }[];
  }): Promise<ApiResponse<Order>> {
    return safe(api.createOrder(data));
  },

  updateOrderStatus(id: number, status: string): Promise<ApiResponse<Order>> {
    return safe(api.updateOrderStatus(id, status));
  },

  cancelOrder(id: number, reason?: string): Promise<ApiResponse<Order>> {
    return safe(api.cancelOrder(id, reason));
  },

  requestBill(orderId: number): Promise<ApiResponse<Order>> {
    return safe(api.requestBill(orderId));
  },

  printBill(orderId: number) {
    return safe(api.printBill(orderId));
  },

  /** Idempotency key for order submissions — one per cart, reused on retry. */
  generateClientRequestId(prefix: string): string {
    return api.generateClientRequestId(prefix);
  },
};
