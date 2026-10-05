// CafeOS API Service
// Connects the Expo frontend to the backend API.
// The backend Base URL lives in @/config/apiConfig — every request built here
// (login, CRUD, WebSocket events) resolves through getBaseUrl(), so switching
// the server URL switches the whole app at once.

import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from '@/utils/storage';
import { clearSession, loadSession, saveSession } from '@/utils/sessions';
import type { NotificationListResponse } from '@/utils/notifications';
import {
  alternateSchemeUrl,
  describeLoopbackIssue,
  getBaseUrl,
  normalizeBaseUrl,
  onBaseUrlChange,
  resetBaseUrl,
  setBaseUrl,
  validateBaseUrl,
} from '@/config/apiConfig';
import type { BaseUrlValidation } from '@/config/apiConfig';

const LOCAL_ACTIVE_ORDERS_KEY = 'smart_cafe_active_orders';
// Every request gets a deadline so a dead connection can't hang a screen forever.
const REQUEST_TIMEOUT_MS = 20000;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP status; 0 = network-level failure (server unreachable). */
  status?: number;
  /** True when the request was cancelled by requestKey dedup — not a server error. */
  aborted?: boolean;
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
  private token: string | null = null;

  constructor() {
    this.token = loadSession(getBaseUrl())?.token ?? null;
    // The URL can change from the login screen, Profile or any other module:
    // every switch adopts that server's own session and drops the previous
    // server's in-flight requests + cached data. Registered first, so it runs
    // before later subscribers (e.g. the WebSocket event stream).
    onBaseUrlChange(() => this.applySessionForBaseUrl());
  }

  /** Single source of truth for the server URL — see @/config/apiConfig. */
  private get baseUrl(): string {
    return getBaseUrl();
  }

  /** Server URL every request is built from, e.g. https://server1.example.com */
  public getBaseUrl(): string {
    return getBaseUrl();
  }

  /**
   * Point every request at another backend. The URL is validated, persisted
   * (survives app restart) and that URL's session token is adopted.
   * Invalid input leaves the current URL untouched — call validateBaseUrl()
   * first when the value came from user input. Returns the URL now in effect.
   */
  public setBaseUrl(url: string): string {
    return setBaseUrl(url).url;
  }

  /** Validate a typed URL without applying it: { ok, url, error? }. */
  public validateBaseUrl(url: string): BaseUrlValidation {
    return validateBaseUrl(url);
  }

  /** Forget the saved override and return to the environment/platform default. */
  public resetBaseUrl(): string {
    return resetBaseUrl();
  }

  /**
   * Point the client at another backend: adopt that URL's own session token
   * (none if it was never signed in) and drop every cache holding the previous
   * server's data so it can never leak across URLs.
   */
  private applySessionForBaseUrl() {
    const session = loadSession(this.baseUrl);
    this.token = session?.token ?? null;
    this.abortAllRequests();
    this.invalidateMenuCache();
    removeStorageItemSync('smart_cafe_cached_tables');
    removeStorageItemSync(LOCAL_ACTIVE_ORDERS_KEY);
  }

  /** Latency + reachability probe against /health. Returns null if unreachable. */
  async pingHealth(url: string = this.baseUrl): Promise<{ latencyMs: number } | null> {
    const start = Date.now();
    // AbortController + setTimeout instead of AbortSignal.timeout(): the latter
    // is missing from React Native's AbortSignal polyfill, and calling it would
    // make every probe (and the login request) fail instantly on device.
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), 4000);
    try {
      const response = await fetch(`${url}/health`, {
        signal: timeoutController.signal,
      });
      // Any HTTP answer proves the host is up — only a network failure/timeout
      // is "offline". Servers are not required to expose /health (the hosted
      // production API answers 404 there), and a
      // 404/405 used to be read as unreachable, showing a false "server
      // offline" banner over a login endpoint that works. A 2xx body is still
      // parsed as JSON so a captive-portal HTML page is not reported healthy.
      if (response.ok) await response.json();
      return { latencyMs: Date.now() - start };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Does this address answer under the opposite scheme? Returns that URL when
   * it does (e.g. https://localhost:3000 typed against a plain-HTTP dev server
   * that is really http://localhost:3000), null otherwise. Call only after
   * pingHealth() failed — the primary probe is never delayed by this one.
   */
  async detectSchemeMismatch(url: string = this.baseUrl): Promise<string | null> {
    const alternate = alternateSchemeUrl(url);
    if (!alternate) return null;
    return (await this.pingHealth(alternate)) ? alternate : null;
  }

  /** Canonical form of a server URL (scheme, no trailing slash or /api). */
  public normalizeUrl(url: string): string {
    return normalizeBaseUrl(url);
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
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

  private async request<T>(endpoint: string, options?: RequestInit & { requestKey?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<ApiResponse<T>> {
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
    const externalSignal = options?.signal ?? controller?.signal ?? null;

    // Deadline: a hung connection must never leave the UI waiting forever.
    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const timeoutController = new AbortController();
    let timedOut = false;
    const relayAbort = () => timeoutController.abort();
    if (externalSignal) {
      if (externalSignal.aborted) relayAbort();
      else externalSignal.addEventListener('abort', relayAbort);
    }
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
    const signal = timeoutController.signal;

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, signal });
    } catch (error: any) {
      if (timedOut) {
        return { success: false, error: `Request timed out after ${Math.round(timeoutMs / 1000)}s`, status: 0 };
      }
      if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
        return { success: false, error: 'Request aborted', aborted: true, status: 0 };
      }
      return { success: false, error: error?.message || 'Network error — server unreachable', status: 0 };
    } finally {
      clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener('abort', relayAbort);
      if (options?.requestKey) {
        this.releaseRequestController(options.requestKey);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text().catch(() => '');
      return { success: false, error: text || `Invalid server response (HTTP ${response.status})`, status: response.status };
    }

    const data = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.responseText || data.message || `Request failed (HTTP ${response.status})`,
        status: response.status,
      };
    }

    return { success: true, data: data.data !== undefined ? data.data : data, status: response.status };
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  /**
   * Sign in against the currently configured server URL. Credentials are only
   * ever checked by that backend — there is no local/demo fallback. A successful
   * sign-in stores the session under this URL so every server keeps its own
   * login.
   */
  async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: StaffUser }>> {
    // AbortController + setTimeout rather than AbortSignal.timeout(): React
    // Native's AbortSignal polyfill has no timeout() — using it throws a
    // TypeError before any request is sent, so login would always fail on a
    // device while working in the browser.
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      // Two login paths exist in the wild: /api/auth/login (local backend) and
      // /api/account/login (production). Try the first; only if the server says
      // the route itself is missing do we retry the other, so a 404 never turns
      // into "Route not found" on the login screen.
      let response: Response | undefined;
      for (const path of ['/api/auth/login', '/api/account/login']) {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: timeoutController.signal,
        });
        if (response.status !== 404) break;
      }
      if (!response) {
        return { success: false, error: `Login failed — no response from ${this.baseUrl}`, status: 0 };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        return {
          success: false,
          error: text || `Invalid server response from ${this.baseUrl} (HTTP ${response.status})`,
          status: response.status,
        };
      }
      const data = await response.json().catch(() => ({} as any));

      // Two success shapes exist: the local CafeOS backend wraps the payload
      // as { success: true, data: { token, user } }, while /api/account/login
      // (production) returns it flat:
      //   { user_id, full_name, email, token, organisation_detail, ... }
      const wrapped = data.data?.token && data.data?.user ? data.data : null;
      const flat = data.token && (data.user_id != null || data.full_name) ? data : null;
      const payload = data.success === false ? null : wrapped || flat;
      if (response.ok && payload) {
        const wrappedUser = payload.user || {};
        const user: StaffUser = {
          id: wrappedUser.id ?? payload.user_id,
          name: wrappedUser.name ?? payload.full_name ?? username,
          email: (wrappedUser.email ?? payload.email) || username,
          role: wrappedUser.role ?? payload.role ?? 'WAITER',
        };
        this.setToken(payload.token);
        saveSession(this.baseUrl, { token: payload.token, user, username: username.trim() });
        this.invalidateMenuCache();
        return { success: true, data: { token: payload.token, user }, status: response.status };
      }

      return {
        success: false,
        error:
          response.status === 404
            ? `Login route not found on ${this.baseUrl} — check the server URL`
            : data.error || data.responseText || data.message || 'Username and Password did not match',
        status: response.status,
      };
    } catch (error: any) {
      if (timedOut) {
        return {
          success: false,
          error: `Login timed out — no response from ${this.baseUrl}`,
          status: 0,
        };
      }
      if (error?.name === 'TimeoutError' || /timeout/i.test(error?.message || '')) {
        return {
          success: false,
          error: `Login timed out — no response from ${this.baseUrl}`,
          status: 0,
        };
      }
      // A loopback URL on a device can never work — say so instead of showing
      // a generic "server unreachable" that gives no way forward.
      const loopbackHint = describeLoopbackIssue(this.baseUrl);
      return {
        success: false,
        error: loopbackHint
          ? `Cannot reach server at ${this.baseUrl}. ${loopbackHint}`
          : `Cannot reach server at ${this.baseUrl} — check the server URL and connection`,
        status: 0,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async logout(): Promise<ApiResponse<{ message: string }>> {
    const token = this.token;
    // Clear the local session first — sign-out must never wait on the network.
    clearSession(this.baseUrl);
    this.setToken(null);
    this.invalidateMenuCache();
    removeStorageItemSync('smart_cafe_cached_tables');
    removeStorageItemSync(LOCAL_ACTIVE_ORDERS_KEY);
    if (!token) {
      return { success: true, data: { message: 'Signed out' }, status: 200 };
    }
    // Fire-and-forget from the caller's perspective; short deadline so a dead
    // server can't keep this promise hanging.
    return this.request<{ message: string }>('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 5000,
    });
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
    // requestKey coalesces concurrent table fetches — the newest wins, stale ones abort.
    const res = await this.request<Table[]>('/tables', { requestKey: 'tables' });
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
  /** Drop the persisted menu snapshot (stale or cross-server data) and its lookup caches. */
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
   */
  async getMenu(options?: { force?: boolean; requestKey?: string }): Promise<ApiResponse<MenuCategory[]>> {
    const fetchFresh = async (): Promise<ApiResponse<MenuCategory[]>> => {
      const res = await this.request<MenuCategory[]>('/menu', { requestKey: options?.requestKey });
      if (res.success && res.data) {
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

    // A server-URL switch must move this stream to the new backend now — not
    // on the next backoff retry against a server the user already left.
    const unsubscribeUrlChange = onBaseUrlChange(() => {
      if (closed) return;
      if (ws) {
        const previous = ws;
        ws = null;
        this._eventConnected = false;
        previous.onclose = null;
        previous.onerror = null;
        previous.close();
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      backoffMs = 1000;
      connect();
    });

    connect();

    return () => {
      closed = true;
      unsubscribeUrlChange();
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }
}

export const api = new ApiService();
