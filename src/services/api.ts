// CafeOS API Service
// Connects the Expo frontend to the backend API

import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from '@/utils/storage';
import { handleDemoRequest } from './demoData';
import type { NotificationListResponse } from '@/utils/notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// expo-device has no web support — lazy-load only when needed on native
let isDevice: boolean | undefined;
if (Platform.OS !== 'web') {
  try {
    const device = require('expo-device');
    isDevice = device.isDevice;
  } catch {
    // expo-device not available (e.g. web bundle)
  }
}

/**
 * Base URL resolution (single source — no fallback cascades):
 *   1. Explicitly saved value (Profile -> Configure Server URL)
 *   2. EXPO_PUBLIC_API_URL from the environment
 *   3. Web:   current origin (backend serves the SPA from the same port)
 *      Native in Expo Go: http://<dev-machine-LAN-IP>:3000 via Constants.expoGoConfig.debuggerHost
 *      Android emulator:  http://10.0.2.2:3000 (host loopback alias)
 *      Otherwise:         http://localhost:3000 (iOS simulator / same machine)
 */
function resolveDefaultBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    // In production the backend serves the SPA on the same port (3000),
    // so window.location.origin is correct. In dev mode the Expo web dev
    // server runs on a different port (8081 / 19006), so fall back to the
    // backend at localhost:3000.
    const origin = new URL(window.location.origin);
    if (!origin.port || origin.port === '3000') {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  }
  // Expo Go on a physical device: debuggerHost is the dev machine's LAN address
  // the phone used to load this bundle — localhost would point back at the phone.
  // It carries the Metro port (e.g. "192.168.10.232:8081"), so strip it and use
  // the backend port instead.
  const debuggerHost = Constants.expoGoConfig?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3000`;
  }
  // Android emulator: 10.0.2.2 is the alias for the host machine's loopback.
  if (Platform.OS === 'android' && !isDevice) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

const DEFAULT_BASE_URL = resolveDefaultBaseUrl();
const LOCAL_ACTIVE_ORDERS_KEY = 'smart_cafe_active_orders';

const DEMO_ACCOUNTS: Record<string, { password: string; user: StaffUser }> = {
  'waiter@leadingedge.com': {
    password: 'Wait3rCafe123',
    user: { id: 2, name: 'Waiter Staff', email: 'waiter@leadingedge.com', role: 'WAITER' },
  },
  'chef@leadingedge.com': {
    password: 'Ch3fCafe123',
    user: { id: 3, name: 'Chef Staff', email: 'chef@leadingedge.com', role: 'CHEF' },
  },
  'cashier@leadingedge.com': {
    password: 'Cash1erCafe123',
    user: { id: 4, name: 'Cashier Staff', email: 'cashier@leadingedge.com', role: 'CASHIER' },
  },
};

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP status; 0 = network-level failure (server unreachable). */
  status?: number;
  /** True when the request was cancelled by requestKey dedup — not a server error. */
  aborted?: boolean;
  /** True when sign-in happened locally because the API server was unreachable. */
  offline?: boolean;
}

export interface Section {
  id: number;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  _count?: { tables: number };
}

export interface Table {
  id: number;
  sectionId: number;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'PENDING_BILL';
  is_reserved?: boolean;
  createdAt?: string;
  section?: { id: number; name: string };
  activeSession?: {
    id: number;
    tableId: number;
    waiterId: number;
    openedAt: string;
    closedAt?: string | null;
    waiter?: { id: number; name: string };
  } | null;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  available: boolean;
  isVeg?: boolean;
  is_veg?: boolean;
  veg?: boolean;
  isSpicy?: boolean;
  is_spicy?: boolean;
  spicy?: boolean;
  type?: string;
  itemType?: string;
  category?: { id: number; name: string };
}

export interface MenuCategory {
  id: number;
  name: string;
  description: string | null;
  items?: MenuItem[];
  _count?: { items: number };
}

export interface OrderItem {
  id?: number;
  orderId?: number;
  menuItemId?: number;
  quantity: number;
  price: number;
  notes?: string | null;
  menuItem?: MenuItem;
}

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: 'WAITER' | 'CHEF' | 'CASHIER' | 'ADMIN';
  createdAt?: string;
}

export interface Order {
  id: number;
  tableId: number;
  waiterId: number;
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PAID';
  billRequested?: boolean;
  customerNotes?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  serviceCharge?: number;
  discount?: number;
  totalAmount: number;
  createdAt: string;
  updatedAt?: string;
  table?: Table;
  waiter?: StaffUser;
  items?: OrderItem[];
  payments?: { id: number; method: string; amount: number; createdAt?: string }[];
}

export interface TableDetail extends Table {
  section?: { id: number; name: string };
  orders?: Order[];
  activeOrders?: Order[];
}

export interface CafeSettings {
  cafeName: string;
  address: string;
  phone: string;
  currencySymbol: string;
  taxRate: string;
  serviceChargeRate: string;
  receiptFooter: string;
}

export interface DashboardData {
  summary: {
    totalOrders: number;
    todayOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    activeOrders: number;
    totalRevenue: number;
    todayRevenue: number;
    totalDiscounts: number;
    totalTax: number;
    totalServiceCharge: number;
    totalLosses: number;
    totalMenuItems: number;
    totalTables: number;
    totalStaff: number;
    averageOrderValue: number;
  };
  revenueBreakdown: {
    revenue: number;
    tax: number;
    serviceCharge: number;
    discounts: number;
    losses: number;
  };
  orderStatusDistribution: {
    completed: number;
    cancelled: number;
    pending: number;
    preparing: number;
    active: number;
  };
  paymentMethods: {
    method: string;
    count: number;
    total: number;
  }[];
  dailyRevenue: {
    date: string;
    revenue: number;
    orders: number;
  }[];
  topSellingItems: {
    name: string;
    category: string;
    totalQuantity: number;
    orderCount: number;
  }[];
  tableUtilization: {
    total: number;
    occupied: number;
    available: number;
    reserved: number;
    cleaning: number;
    utilizationRate: number;
  };
}

class ApiService {
  private baseUrl: string = DEFAULT_BASE_URL;
  private token: string | null = null;
  private offlineSession: boolean = getStorageItemSync('smart_cafe_offline_demo') === '1';

  constructor() {
    let initial = DEFAULT_BASE_URL;
    const saved = getStorageItemSync('smart_cafe_base_url');
    if (saved && saved.trim()) {
      initial = saved.trim();
    }
    this.baseUrl = this.normalizeUrl(initial);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): string {
    const clean = this.normalizeUrl(url);
    this.baseUrl = clean;
    setStorageItemSync('smart_cafe_base_url', clean);
    return this.baseUrl;
  }

  /** Forget the saved override and return to the environment default. */
  public resetBaseUrl(): string {
    removeStorageItemSync('smart_cafe_base_url');
    this.baseUrl = this.normalizeUrl(DEFAULT_BASE_URL);
    return this.baseUrl;
  }

  /** Latency + reachability probe against /health. Returns null if unreachable. */
  async pingHealth(): Promise<{ latencyMs: number } | null> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return null;
      await response.json();
      return { latencyMs: Date.now() - start };
    } catch {
      return null;
    }
  }

  private normalizeUrl(url: string): string {
    let clean = (url || '').trim();
    if (!clean) return DEFAULT_BASE_URL;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    clean = clean.replace(/\/+$/, '');
    if (clean.endsWith('/api')) {
      clean = clean.substring(0, clean.length - 4);
    }
    return clean;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  /** True while the current session was opened without a reachable backend. */
  isOfflineSession(): boolean {
    if (this.offlineSession) return true;
    const flagged = getStorageItemSync('smart_cafe_offline_demo') === '1';
    this.offlineSession = flagged;
    return flagged;
  }

  private getCachedActiveOrders(): Order[] {
    try {
      const raw = getStorageItemSync(LOCAL_ACTIVE_ORDERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveCachedActiveOrders(orders: Order[]) {
    const serialized = JSON.stringify(orders);
    const existing = getStorageItemSync(LOCAL_ACTIVE_ORDERS_KEY);
    if (existing !== serialized) {
      setStorageItemSync(LOCAL_ACTIVE_ORDERS_KEY, serialized);
    }
  }

  private demoFallback<T>(endpoint: string, options?: RequestInit): ApiResponse<T> | null {
    if (!this.isOfflineSession()) return null;
    try {
      const demo = handleDemoRequest(endpoint, options) as ApiResponse<T> | null;
      // Tag demo responses so callers can tell them apart from real ones —
      // the fake ids/prices must never be written into a server-backed cache.
      return demo ? { ...demo, offline: true } : null;
    } catch {
      return null;
    }
  }

  private async request<T>(endpoint: string, options?: RequestInit & { requestKey?: string; signal?: AbortSignal }): Promise<ApiResponse<T>> {
    const formattedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}/api${formattedPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Deduplication: if requestKey provided, cancel any in-flight request with same key
    let controller: AbortController | null = null;
    if (options?.requestKey) {
      controller = this.getRequestController(options.requestKey);
    }
    const signal = options?.signal ?? controller?.signal;

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, signal });
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
        return { success: false, error: 'Request aborted', aborted: true, status: 0 };
      }
      const demo = this.demoFallback<T>(formattedPath, options);
      if (demo) return demo;
      return { success: false, error: error?.message || 'Network error — server unreachable', status: 0 };
    } finally {
      if (options?.requestKey) {
        this.releaseRequestController(options.requestKey);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text().catch(() => '');
      const demo = this.demoFallback<T>(formattedPath, options);
      if (demo) return demo;
      return { success: false, error: text || `Invalid server response (HTTP ${response.status})`, status: response.status };
    }

    const data = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        const demo = this.demoFallback<T>(formattedPath, options);
        if (demo) return demo;
      }
      return {
        success: false,
        error: data.error || data.responseText || data.message || `Request failed (HTTP ${response.status})`,
        status: response.status,
      };
    }

    return { success: true, data: data.data !== undefined ? data.data : data, status: response.status };
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  private offlineLogin(
    username: string,
    password: string,
  ): ApiResponse<{ token: string; user: StaffUser }> | null {
    const account = DEMO_ACCOUNTS[username.trim().toLowerCase()];
    if (!account || account.password !== password) return null;
    const user: StaffUser = { ...account.user };
    const token = `demo-token-${user.role.toLowerCase()}-${user.id}-${Date.now()}`;
    this.offlineSession = true;
    setStorageItemSync('smart_cafe_offline_demo', '1');
    this.setToken(token);
    return { success: true, data: { token, user }, status: 0, offline: true };
  }

  private unreachableLogin(
    username: string,
    password: string,
    error: string,
    status: number,
  ): ApiResponse<{ token: string; user: StaffUser }> {
    const demo = this.offlineLogin(username, password);
    if (demo) return demo;
    const account = DEMO_ACCOUNTS[username.trim().toLowerCase()];
    if (!account) {
      return {
        success: false,
        error: `Server unreachable at ${this.baseUrl} and "${username}" is not a demo account (try waiter@leadingedge.com)`,
        status,
      };
    }
    return { success: false, error: error || 'Server unreachable — password rejected for this demo account', status };
  }

  async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: StaffUser }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        return this.unreachableLogin(username, password, text || `Invalid server response (HTTP ${response.status})`, response.status);
      }
      const data = await response.json().catch(() => ({} as any));

      // Backend responds: { success: true, data: { token, user } }
      if (response.ok && data.success !== false && data.data?.token && data.data?.user) {
        const user: StaffUser = {
          id: data.data.user.id,
          name: data.data.user.name,
          email: data.data.user.email || username,
          role: data.data.user.role || 'WAITER',
        };
        this.setToken(data.data.token);
        this.offlineSession = false;
        removeStorageItemSync('smart_cafe_offline_demo');
        // A real sign-in means we are back on the live backend — any menu
        // snapshot cached during an offline/demo session is no longer valid.
        this.invalidateMenuCache();
        return { success: true, data: { token: data.data.token, user }, status: response.status };
      }

      return {
        success: false,
        error: data.error || data.responseText || data.message || 'Username and Password did not match',
        status: response.status,
      };
    } catch (error: any) {
      return this.unreachableLogin(username, password, error?.message || 'Network error during login — server unreachable', 0);
    }
  }

  async logout() {
    const res = await this.request<{ message: string }>('/auth/logout', { method: 'POST' });
    this.setToken(null);
    this.offlineSession = false;
    removeStorageItemSync('smart_cafe_offline_demo');
    this.invalidateMenuCache();
    return res;
  }

  // ─── Settings ─────────────────────────────────────────────────────────────
  async getSettings() {
    return this.request<CafeSettings>('/settings');
  }

  // ─── Sections ─────────────────────────────────────────────────────────────
  async getSections(): Promise<ApiResponse<Section[]>> {
    return this.request<Section[]>('/sections');
  }

  // ─── Tables ───────────────────────────────────────────────────────────────
  async getTables(sectionId?: number): Promise<ApiResponse<Table[]>> {
    const res = await this.request<Table[]>('/tables');
    if (res.success && res.data) {
      const serialized = JSON.stringify(res.data);
      if (getStorageItemSync('smart_cafe_cached_tables') !== serialized) {
        setStorageItemSync('smart_cafe_cached_tables', serialized);
        this.invalidateResolveCaches();
      }
      const filtered = sectionId ? res.data.filter((t) => t.sectionId === sectionId) : res.data;
      return { success: true, data: filtered };
    }
    return res;
  }

  async getTable(id: number): Promise<ApiResponse<TableDetail>> {
    return this.request<TableDetail>(`/tables/${id}`);
  }

  async updateTableStatus(id: number, status: string): Promise<ApiResponse<Table>> {
    return this.request<Table>(`/tables/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async startTableSession(id: number): Promise<ApiResponse<{ session: any; table: Table }>> {
    return this.request<{ session: any; table: Table }>(`/tables/${id}/session`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ─── Menu ─────────────────────────────────────────────────────────────────
  /** Drop the persisted menu snapshot (stale or demo data) and its lookup caches. */
  invalidateMenuCache() {
    removeStorageItemSync('smart_cafe_cached_menu');
    this.invalidateResolveCaches();
  }

  private readCachedMenu(): MenuCategory[] | null {
    const cachedRaw = getStorageItemSync('smart_cafe_cached_menu');
    if (!cachedRaw) return null;
    try {
      const parsed = JSON.parse(cachedRaw) as MenuCategory[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Menu catalogue fetch.
   *  - default: serves the cached snapshot immediately and refreshes in the background
   *  - force:   skip the cache read and wait for a fresh response (order screens —
   *             they submit these ids to the backend, so they must be current)
   * Offline/demo responses are never persisted: their fake ids would be rejected
   * by the real backend with "Menu item not found".
   */
  async getMenu(options?: { force?: boolean; requestKey?: string }): Promise<ApiResponse<MenuCategory[]>> {
    const fetchFresh = async (): Promise<ApiResponse<MenuCategory[]>> => {
      const res = await this.request<MenuCategory[]>('/menu', { requestKey: options?.requestKey });
      if (res.success && res.data && !res.offline) {
        setStorageItemSync('smart_cafe_cached_menu', JSON.stringify(res.data));
        this.invalidateResolveCaches();
      }
      return res;
    };

    if (options?.force) {
      const res = await fetchFresh();
      if (res.success) return res;
      // Server unreachable: show the last known menu instead of an empty screen.
      if (res.status === 0 && !res.aborted) {
        const cachedData = this.readCachedMenu();
        if (cachedData) return { success: true, data: cachedData, status: 0 };
      }
      return res;
    }

    const cachedData = this.readCachedMenu();
    if (cachedData) {
      fetchFresh().catch(() => {});
      return { success: true, data: cachedData };
    }

    return fetchFresh();
  }

  // ─── Orders ────────────────────────────────────────────────────────────────
  async getOrders(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
    tableId?: number;
    waiterId?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<{ orders: Order[]; page: number; limit: number; total: number; hasMore: boolean }>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.paymentStatus) query.set('paymentStatus', params.paymentStatus);
    if (params?.tableId) query.set('tableId', String(params.tableId));
    if (params?.waiterId) query.set('waiterId', String(params.waiterId));
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    return this.request(`/orders?${query.toString()}`) as Promise<ApiResponse<{ orders: Order[]; page: number; limit: number; total: number; hasMore: boolean }>>;
  }

  async getActiveOrders(requestKey?: string) {
    const response = await this.request<Order[]>('/orders/active', { requestKey: requestKey || 'active-orders' });
    if (response.success && response.data) {
      this.saveCachedActiveOrders(response.data);
    }
    return response;
  }

  async getOrder(id: number) {
    return this.request<Order>(`/orders/${id}`);
  }

  async createOrder(data: {
    tableId: number;
    waiterId?: number;
    customerNotes?: string;
    clientRequestId?: string;
    items: { menuItemId: number; quantity: number; price: number; notes?: string }[];
  }): Promise<ApiResponse<Order>> {
    const res = await this.request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.success && res.data) {
      const cached = this.getCachedActiveOrders();
      this.saveCachedActiveOrders([res.data, ...cached.filter((order) => order.id !== res.data!.id)]);
    }
    return res;
  }

  async updateOrderStatus(id: number, status: string) {
    const response = await this.request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (response.success && response.data) {
      const cached = this.getCachedActiveOrders();
      this.saveCachedActiveOrders(status === 'COMPLETED'
        ? cached.filter((order) => order.id !== id)
        : cached.map((order) => order.id === id ? response.data! : order));
    }
    return response;
  }

  async cancelOrder(id: number, reason?: string) {
    const response = await this.request<Order>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (response.success) {
      const cached = this.getCachedActiveOrders();
      this.saveCachedActiveOrders(cached.map((order) => order.id === id ? response.data! : order));
    }
    return response;
  }

  async requestBill(orderId: number) {
    return this.request<Order>(`/orders/${orderId}/request-bill`, {
      method: 'POST',
    });
  }

  async printBill(orderId: number) {
    return this.request<{ message: string; orderId: number; printer: { configured: boolean; host: string | null; port: number; queueLength: number; nextJobId: number } }>(`/orders/${orderId}/print`, {
      method: 'POST',
    });
  }

  // ─── Notifications (per-user read/clear) ───────────────────────────────────
  async getNotifications(requestKey?: string): Promise<ApiResponse<NotificationListResponse>> {
    return this.request<NotificationListResponse>('/notifications', {
      requestKey: requestKey || 'notifications',
    });
  }

  async markNotificationRead(id: number): Promise<ApiResponse<{ id: number; read: boolean }>> {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead(): Promise<ApiResponse<{ updated: number }>> {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  async clearNotification(id: number): Promise<ApiResponse<{ id: number; cleared: boolean }>> {
    return this.request(`/notifications/${id}`, { method: 'DELETE' });
  }

  async clearAllNotifications(): Promise<ApiResponse<{ cleared: number }>> {
    return this.request('/notifications/clear-all', { method: 'POST' });
  }

  // ─── In-memory caches for resolve methods (avoid repeated JSON.parse) ──
  private _menuItemNameCache: Map<number, string> = new Map();
  private _menuItemCacheVersion = -1;
  private _tableNameCache: Map<number, string> = new Map();
  private _tableCacheVersion = -1;
  private _cacheGeneration = 0;

  private invalidateResolveCaches() {
    this._cacheGeneration++;
  }

  resolveMenuItemName(id: number): string {
    // Fast path: check in-memory cache
    if (this._menuItemNameCache.has(id)) {
      return this._menuItemNameCache.get(id)!;
    }

    try {
      const cachedRaw = getStorageItemSync('smart_cafe_cached_menu');
      if (cachedRaw) {
        const version = this._cacheGeneration;
        if (this._menuItemCacheVersion !== version) {
          this._menuItemNameCache.clear();
          const categories = JSON.parse(cachedRaw) as MenuCategory[];
          for (const cat of categories) {
            if (cat.items) {
              for (const item of cat.items) {
                this._menuItemNameCache.set(item.id, item.name);
              }
            }
          }
          this._menuItemCacheVersion = version;
        }
        const found = this._menuItemNameCache.get(id);
        if (found) return found;
      }
    } catch {
      // ignore
    }

    return `Menu item #${id}`;
  }

  resolveTableName(id: number): string {
    if (this._tableNameCache.has(id)) {
      return this._tableNameCache.get(id)!;
    }

    try {
      const cachedRaw = getStorageItemSync('smart_cafe_cached_tables');
      if (cachedRaw) {
        const version = this._cacheGeneration;
        if (this._tableCacheVersion !== version) {
          this._tableNameCache.clear();
          const tables = JSON.parse(cachedRaw) as Table[];
          for (const t of tables) {
            this._tableNameCache.set(t.id, t.tableNumber);
          }
          this._tableCacheVersion = version;
        }
        const found = this._tableNameCache.get(id);
        if (found) return found;
      }
    } catch {
      // ignore
    }

    return `Table ${id}`;
  }

  // ─── Smart Item Classification (Kitchen vs Counter) ─────────────────────────
  getItemDestination(name: string, categoryName?: string): 'KITCHEN' | 'COUNTER' {
    const cleanName = (name || '').toLowerCase().trim();
    const cleanCat = (categoryName || '').toLowerCase().trim();

    // Packed Food / Bottled Drinks / Bar Items -> COUNTER
    const counterKeywords = [
      'vodka', 'whisky', 'whiskey', 'wine', 'beer', 'tequila', 'rum', 'gin',
      '8848', 'smirnoff', 'absolute', 'signature', 'old durbar', 'tuborg', 'carlsberg', 'gorkha',
      'cheese balls', 'cheese ball', 'packaged', 'packed', 'hookah', 'shikhar', 'ice', 'cigarette', 'cigar',
      'soft drinks', 'soft drink', 'coke', 'pepsi', 'fanta', 'sprite', 'red bull', 'mineral water', 'water bottle',
      'chips packet', 'kurkure', 'lays', 'wafer', 'juice bottle', 'can', 'canned'
    ];

    for (const kw of counterKeywords) {
      if (cleanName.includes(kw) || cleanCat.includes(kw)) {
        return 'COUNTER';
      }
    }

    // Cooked Food / Fresh Dishes -> KITCHEN
    const kitchenKeywords = [
      'momo', 'chowmein', 'chowmin', 'chilly', 'chilli', 'aalu', 'jeera', 'potato',
      'biryani', 'rice', 'fried rice', 'curry', 'gravy', 'paneer', 'chicken', 'pork',
      'mutton', 'buff', 'fish', 'pizza', 'burger', 'sandwich', 'pasta', 'soup', 'salad',
      'breakfast', 'omelette', 'egg', 'starter', 'veg starter', 'non veg starter',
      'roti', 'naan', 'bread', 'paratha', 'sekuwa', 'sukuti', 'sadeko', 'tadka', 'dal'
    ];

    for (const kw of kitchenKeywords) {
      if (cleanName.includes(kw) || cleanCat.includes(kw)) {
        return 'KITCHEN';
      }
    }

    // Category matching fallback
    if (['vodka', 'wine', 'whisky', 'tequila', 'hookah', 'soft drinks'].includes(cleanCat)) {
      return 'COUNTER';
    }

    return 'KITCHEN';
  }

  isKitchenItem(name: string, categoryName?: string): boolean {
    return this.getItemDestination(name, categoryName) === 'KITCHEN';
  }

  /** Generate a unique idempotency key for order submissions. */
  generateClientRequestId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // ─── Printer ───────────────────────────────────────────────────────────────
  async getPrinterStatus(): Promise<ApiResponse<{
    configured: boolean;
    host: string | null;
    port: number;
    queueLength: number;
    nextJobId: number;
  }>> {
    return this.request('/printer/status');
  }

  // ─── Dashboard Analytics ─────────────────────────────────────────────────
  async getDashboardAnalytics(): Promise<ApiResponse<DashboardData>> {
    return this.request<DashboardData>('/dashboard');
  }

  // ─── Request Controller (AbortController) ────────────────────────────────────
  /** Map of in-flight requests keyed by endpoint for deduplication. */
  private pendingRequests: Map<string, AbortController> = new Map();

  /** Get or create an AbortController for a request key. */
  private getRequestController(key: string): AbortController {
    const existing = this.pendingRequests.get(key);
    if (existing) {
      existing.abort(); // cancel previous in-flight request for same key
    }
    const controller = new AbortController();
    this.pendingRequests.set(key, controller);
    return controller;
  }

  /** Release a request controller after completion. */
  private releaseRequestController(key: string): void {
    this.pendingRequests.delete(key);
  }

  /** Abort all in-flight requests (e.g., on logout/unmount). */
  abortAllRequests(): void {
    for (const controller of this.pendingRequests.values()) {
      controller.abort();
    }
    this.pendingRequests.clear();
  }

  // ─── Real-time events (WebSocket) ──────────────────────────────────────────
  private _eventConnected = false;

  /** Whether the WebSocket event stream is currently connected. */
  get eventConnected(): boolean {
    return this._eventConnected;
  }

  /**
   * Subscribe to server events over WebSocket with auto-reconnect + backoff.
   * Same transport on every platform (web, Android, iOS).
   * Returns an unsubscribe function.
   * Events: order.created | order.status | order.paid | order.cancelled | table.status | table.session | menu.availability
   */
  subscribeToEvents(onEvent: (event: { type: string; payload: any; ts: number }) => void): () => void {
    if (this.isOfflineSession()) {
      return () => {};
    }
    let ws: WebSocket | null = null;
    let backoffMs = 1000;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const token = this.getToken();
      const url = `${this.baseUrl}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const wsUrl = url.replace(/^http/, 'ws');
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { backoffMs = 1000; this._eventConnected = true; };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.event === 'cafe' || data.type) {
            onEvent(data.data || data);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => { /* error handled by onclose */ };
      ws.onclose = () => {
        ws = null;
        this._eventConnected = false;
        if (closed) return;
        retryTimer = setTimeout(connect, backoffMs);
        backoffMs = Math.min(backoffMs * 2, 30000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }
}

export const api = new ApiService();
