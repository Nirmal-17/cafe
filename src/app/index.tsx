'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  RefreshControl, 
  Modal,
  Pressable,
  Image,
  BackHandler,
  Platform,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { TableTabIcon } from '@/components/TableTabIcon';
import { api, Table, Section, Order, StaffUser } from '@/services/api';
import { homeApi } from '@/services/homeApi';
import { orderApi } from '@/services/orderApi';
import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from '@/utils/storage';
import { clearSession, loadSession } from '@/utils/sessions';
import { executeOrderPrint } from '@/utils/print';
import { webAlert } from '@/utils/webAlert';
import { useResponsive, getResponsiveValue, getSpacing, getFontSize, getBorderRadius, getTabBarHeight, getHeaderHeight, getColumnCount, getCardWidth, getGridGap, getCardPadding, getIconSize, moderateScale } from '@/utils/responsive';
import {
  StoredNotification,
  fromServerNotification,
  getCachedNotifications,
  cacheNotifications,
  clearCachedNotifications,
} from '@/utils/notifications';
import { notifyOrderReady } from '@/utils/orderReadyToast';
import { notifyOrderServed } from '@/utils/orderServedToast';
import { notifyBillRequested } from '@/utils/orderBillToast';
import { notifyPrintProceeded } from '@/utils/printProceededToast';
import { showBottomToast } from '@/components/BottomToast';
import { subscribeMainTabSwitch } from '@/utils/mainTab';
import { isOpenOrder } from '@/utils/openValue';
import { formatMoney } from '@/components/dashboard/shared';

// ── Modular Screens ──
import { LoginScreen } from '@/components/screens/LoginScreen';
import { MyTableScreen } from '@/components/screens/MyTableScreen';
import { OrdersScreen } from '@/components/screens/OrdersScreen';
import { MenuScreen } from '@/components/screens/MenuScreen';
import { DashboardScreen } from '@/components/screens/DashboardScreen';
import { PastOrdersScreen } from '@/components/screens/PastOrdersScreen';
import { NotificationScreen } from '@/components/screens/NotificationScreen';
import { KitchenScreen } from '@/components/screens/KitchenScreen';

// ── Strict Color Palette (Dark Blue Primary) ──
const BRAND_PRIMARY = '#073F78';   // Dark Blue - Primary
const BRAND_ORANGE = '#FF6D00';    // Brand Orange - Secondary
const BRAND_YELLOW = '#FFD600';    // Yellow - Accent
const COLOR_SUCCESS = '#16A34A';   // Green
const COLOR_WARNING = '#F97316';   // Orange
const COLOR_PENDING = '#EAB308';   // Yellow (Pending)
const COLOR_ERROR = '#D32F2F';     // Error Red
const COLOR_MUTED = '#6B7280';     // Gray
const BG_LIGHT = '#F0F4FF';        // Page Background (light blue tint)
const BG_WHITE = '#FFFFFF';        // Card Background
const BORDER_COLOR = '#CBD5E1';    // Borders
const TEXT_DARK = '#000000';       // Black
const TEXT_MUTED = '#6B7280';      // Secondary Text

// Live-refetch coalescing window: the first event runs immediately, later
// events inside the window share one trailing run — nothing is ever dropped.
const REFRESH_THROTTLE_MS = 1500;
// How long an optimistic table change suppresses its own echo event.
const SELF_CHANGE_TTL_MS = 4000;

export default function MainAppContainer() {
  const router = useRouter();
  const { width, height, breakpoint, isTablet, isDesktop } = useResponsive();

  // Enable LayoutAnimation on Android (once on mount)
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // ── Auth State ──
  // The active session belongs to the configured server URL: each URL keeps its
  // own token/user, so switching servers switches (or drops) the login.
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    const session = loadSession(api.getBaseUrl());
    if (session) {
      api.setToken(session.token);
      return true;
    }
    return false;
  });

  const [user, setUser] = useState<StaffUser | null>(() => {
    const session = loadSession(api.getBaseUrl());
    return (session?.user as StaffUser | undefined) ?? null;
  });

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'menu' | 'orders' | 'profile' | 'history' | 'kitchen' | 'notifications'>(() => {
    const savedTab = getStorageItemSync('smart_cafe_active_tab');
    if (savedTab) {
      const tabs = ['home', 'dashboard', 'menu', 'orders', 'profile', 'history', 'kitchen', 'notifications'];
      if (tabs.includes(savedTab)) return savedTab as any;
    }
    return 'dashboard';
  });

  // Role-based tab visibility
  const isWaiter = user?.role === 'WAITER';
  const isChef = user?.role === 'CHEF';
  const isCashier = user?.role === 'CASHIER';
  const isAdmin = user?.role === 'ADMIN';

  // Waiters: Dashboard, Home, Orders, Menu, Notifications — no Kitchen
  // Chefs: Kitchen, Orders — no tables/dashboard
  // Cashiers: Orders, Menu — no tables/kitchen
  // Admin: everything
  const visibleTabs: string[] = (() => {
    if (isAdmin) return ['dashboard', 'home', 'orders', 'menu', 'notifications'];
    if (isWaiter) return ['dashboard', 'home', 'orders', 'menu', 'notifications'];
    if (isChef) return ['kitchen', 'orders'];
    if (isCashier) return ['orders', 'menu'];
    return ['dashboard', 'home', 'orders', 'menu', 'kitchen', 'notifications'];
  })();

  // ── Side Drawer (absolute overlay — never squeezes the main column) ──
  const [showDrawer, setShowDrawer] = useState(false);
  const openDrawer = () => setShowDrawer(true);
  const closeDrawer = () => setShowDrawer(false);

  // Android hardware back button: close drawer first, go home, then confirm exit
  useEffect(() => {
    if (Platform.OS === 'web') return; // BackHandler is Android-only
    if (!isLoggedIn) return;
    const handler = () => {
      if (showDrawer) {
        closeDrawer();
        return true;
      }
      if (activeTab !== 'dashboard') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveTab('dashboard');
        return true;
      }
      webAlert('Exit App', 'Are you sure you want to exit?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [isLoggedIn, activeTab, showDrawer]);

  useEffect(() => {
    setStorageItemSync('smart_cafe_active_tab', activeTab);
  }, [activeTab]);

  // Tab switches requested from pushed screens (e.g. Order Details → Orders)
  useEffect(() => subscribeMainTabSwitch((tab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }), []);

  // ── Global Modals & Overlay States ──
  const [showServerUrlModal, setShowServerUrlModal] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>(() => api.getBaseUrl());
  const [serverUrlError, setServerUrlError] = useState('');


  // ── Tables & Sections States ──
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [tableSearchQuery, setTableSearchQuery] = useState('');

  // ── Server-side dining sessions (openedAt comes with each table) ──
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const [selectedTableForModal, setSelectedTableForModal] = useState<Table | null>(null);
  const [startingService, setStartingService] = useState(false);
  const [updatingTableStatus, setUpdatingTableStatus] = useState(false);

  // ── Active Orders States ──
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [todayBill, setTodayBill] = useState<number>(0);
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'SERVED'>('ALL');

  // ── Past Order History (handled by PastOrdersScreen component) ──

  // ── Loading & Pull to Refresh ──
  const [homeLoading, setHomeLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [homeError, setHomeError] = useState<string>('');

  // ── Notifications: server-backed per-user list; cache only hydrates the first paint ──
  const [notificationsList, setNotificationsList] = useState<StoredNotification[]>(() => getCachedNotifications());
  const [unreadCount, setUnreadCount] = useState<number>(() =>
    getCachedNotifications().filter((n) => !n.read).length
  );

  const refreshNotifications = useCallback(async () => {
    const res = await homeApi.getNotifications('notifications-refresh');
    if (res.success && res.data) {
      const list = res.data.notifications.map(fromServerNotification);
      setNotificationsList(list);
      setUnreadCount(res.data.unreadCount);
      cacheNotifications(list);
    } else if (res.status === 401 || res.status === 403) {
      // Handled by fetchData / selective refetch paths on next cycle.
    }
  }, []);

  // ── API Fetch Coordination ──
  // Generation counter: a newer fetch invalidates older in-flight ones so a
  // stale aborted response can never overwrite a fresh success/error state.
  const fetchGenerationRef = useRef(0);

  const tablesRef = useRef(tables);
  const activeOrdersRef = useRef(activeOrders);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    activeOrdersRef.current = activeOrders;
  }, [activeOrders]);

  const tableNumberForOrder = useCallback((orderId: unknown): string | undefined => {
    const id = Number(orderId);
    if (!Number.isFinite(id)) return undefined;
    const order = activeOrdersRef.current.find((o) => o.id === id);
    if (!order) return undefined;
    return tablesRef.current.find((t) => t.id === order.tableId)?.tableNumber;
  }, []);

  const notifyReadyWithTable = useCallback(
    (orderId: unknown) => {
      const id = Number(orderId);
      if (!Number.isFinite(id)) return;
      notifyOrderReady(id, tableNumberForOrder(id));
    },
    [tableNumberForOrder],
  );

  const notifyServedWithTable = useCallback(
    (orderId: unknown) => {
      const id = Number(orderId);
      if (!Number.isFinite(id)) return;
      notifyOrderServed(id, tableNumberForOrder(id));
    },
    [tableNumberForOrder],
  );

  // Bill requests complete the order, so it may already be gone from the active
  // list — prefer the table id carried by the event and fall back to the order lookup.
  const notifyBillWithTable = useCallback(
    (orderId: unknown, tableId?: unknown) => {
      const id = Number(orderId);
      if (!Number.isFinite(id)) return;
      const tid = Number(tableId);
      const tableName = Number.isFinite(tid) ? api.resolveTableName(tid) : undefined;
      notifyBillRequested(id, tableName || tableNumberForOrder(id));
    },
    [tableNumberForOrder],
  );

  // Force local logout when the JWT is missing/expired/invalid (401/403).
  // Does not call the server (the token is already rejected there).
  const forceSessionExpiry = useCallback((reason: string) => {
    const hadToken = Boolean(api.getToken());
    clearSession(api.getBaseUrl());
    removeStorageItemSync('smart_cafe_active_tab');
    clearCachedNotifications();
    setNotificationsList([]);
    setUnreadCount(0);
    api.abortAllRequests();
    api.setToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setActiveTab('dashboard');
    // No token left (the server URL was just switched) — the login screen is
    // already showing, a "Session Expired" dialog would only be noise.
    if (!hadToken) return;
    webAlert('Session Expired', reason, [{ text: 'Sign In Again' }]);
  }, []);

  // ── Today's Bill — same math as the dashboard KPI: Σ totalAmount of today's
  // PAID orders, so every settlement (bill request or checkout) is recorded.
  const lastTodayBillAtRef = useRef(0);
  const fetchTodayBill = useCallback(async () => {
    if (!isLoggedIn) return;
    const now = Date.now();
    if (now - lastTodayBillAtRef.current < 3000) return;
    lastTodayBillAtRef.current = now;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    try {
      const res = await api.getOrders({
        page: 1,
        limit: 500,
        dateFrom: dayStart.toISOString(),
        dateTo: dayEnd.toISOString(),
      });
      if (res.success && res.data) {
        const revenue = res.data.orders
          .filter((o) => o.paymentStatus === 'PAID')
          .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
        setTodayBill(revenue);
      } else if (res.status === 401 || res.status === 403) {
        forceSessionExpiry('Your session is no longer valid. Please sign in again.');
      }
    } catch {
      // Server unreachable — keep the last known total.
    }
  }, [isLoggedIn, forceSessionExpiry]);

  // Recompute whenever active orders change (bill requests, payments, polls).
  useEffect(() => {
    queueMicrotask(() => {
      fetchTodayBill();
    });
  }, [fetchTodayBill, activeOrders]);

  const fetchData = useCallback(async () => {
    if (!isLoggedIn) return;
    const generation = ++fetchGenerationRef.current;
    try {
      setHomeError('');
      const { sections: sectionsRes, tables: tablesRes, activeOrders: activeOrdersRes } = await homeApi.getHomeData();

      // A newer fetch started while this one was in flight — discard stale results.
      if (generation !== fetchGenerationRef.current) return;

      const results = [sectionsRes, tablesRes, activeOrdersRes];

      // Auth failure: token expired/invalid → re-login instead of a bogus "unreachable" banner.
      const authFailure = results.find((r) => !r.success && (r.status === 401 || r.status === 403));
      if (authFailure && 'status' in authFailure) {
        forceSessionExpiry(authFailure.error || 'Your session is no longer valid. Please sign in again.');
        return;
      }

      // Ignore aborted (deduped) requests — the newer request owns the state.
      const realFailures = results.filter((r) => !r.success && !r.aborted);

      if (sectionsRes.success && sectionsRes.data) {
        setSections(sectionsRes.data);
      }
      if (tablesRes.success && tablesRes.data) {
        setTables(tablesRes.data);
      }
      if (activeOrdersRes.success && activeOrdersRes.data) {
        setActiveOrders(activeOrdersRes.data);
      }

      if (realFailures.length > 0) {
        const first = realFailures[0] as { error?: string; status?: number };
        setHomeError(
          first.status === 0
            ? `Cannot reach server at ${api.getBaseUrl()} — check connection or server URL`
            : first.error || 'Server unreachable — check connection or server URL',
        );
      } else {
        setHomeError('');
      }
      refreshNotifications().catch(() => {});
    } catch (_err) {
      if (generation === fetchGenerationRef.current) {
        setHomeError(`Network error syncing data — server at ${api.getBaseUrl()} may be down`);
      }
    } finally {
      if (generation === fetchGenerationRef.current) {
        setHomeLoading(false);
        setRefreshing(false);
      }
    }
  }, [isLoggedIn, refreshNotifications, forceSessionExpiry]);

  // ── Table status changes (reserve / free / mark bill) ──
  // Optimistic: flip the local snapshot immediately so the press paints on the
  // next frame, then confirm with the server and either reconcile or roll back.
  const patchTableStatus = useCallback((tableId: number, status: string) => {
    const next = String(status).toUpperCase() as Table['status'];
    const patch = { status: next, is_reserved: next === 'RESERVED' };
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, ...patch } : t)));
    setSelectedTableForModal((prev) =>
      prev && prev.id === tableId ? { ...prev, ...patch } : prev,
    );
  }, []);

  // Tables-only refetch — cheap reconciliation after an optimistic change.
  const refreshTables = useCallback(async () => {
    const res = await homeApi.getTables();
    if (res.success && res.data) {
      setTables(res.data);
    } else if (res.status === 401 || res.status === 403) {
      forceSessionExpiry('Your session is no longer valid. Please sign in again.');
    }
  }, [forceSessionExpiry]);

  // Optimistic changes are confirmed by the PATCH response itself, so the
  // server's own `table.status` echo is a redundant refetch — skip it.
  const selfTableChangesRef = useRef<Map<string, number>>(new Map());
  const markSelfTableChange = useCallback((tableId: number, status: string) => {
    const map = selfTableChangesRef.current;
    map.set(`${tableId}:${String(status).toUpperCase()}`, Date.now());
    if (map.size > 50) {
      const cutoff = Date.now() - SELF_CHANGE_TTL_MS;
      for (const [key, at] of map) if (at < cutoff) map.delete(key);
    }
  }, []);
  const consumeSelfTableChange = useCallback((tableId: unknown, status: unknown) => {
    if (tableId == null || !status) return false;
    const key = `${tableId}:${String(status).toUpperCase()}`;
    const at = selfTableChangesRef.current.get(key);
    if (at && Date.now() - at < SELF_CHANGE_TTL_MS) {
      selfTableChangesRef.current.delete(key);
      return true;
    }
    return false;
  }, []);
  const clearSelfTableChange = useCallback((tableId: number, status: string) => {
    selfTableChangesRef.current.delete(`${tableId}:${String(status).toUpperCase()}`);
  }, []);

  const changeTableStatus = useCallback(
    async (tableId: number, status: string): Promise<boolean> => {
      const before = tablesRef.current.find((t) => t.id === tableId);
      patchTableStatus(tableId, status);
      // Mark before awaiting: the server's echo can beat the PATCH response.
      markSelfTableChange(tableId, status);
      const res = await homeApi.updateTableStatus(tableId, status);
      if (res.success && res.data) {
        const server = res.data;
        setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, ...server } : t)));
        setSelectedTableForModal((prev) =>
          prev && prev.id === tableId ? { ...prev, ...server } : prev,
        );
        return true;
      }
      clearSelfTableChange(tableId, status);
      if (before) patchTableStatus(tableId, before.status);
      if (res.status === 401 || res.status === 403) {
        forceSessionExpiry('Your session is no longer valid. Please sign in again.');
        return false;
      }
      webAlert('Error', res.error || 'Failed to update table status');
      return false;
    },
    [patchTableStatus, markSelfTableChange, clearSelfTableChange, forceSessionExpiry],
  );

  // ── Live updates: WebSocket events trigger a throttled refetch (all platforms).
  useEffect(() => {
    if (!isLoggedIn) return;

    queueMicrotask(() => {
      fetchData();
    });

    // Coalescing scheduler: keyed, trailing-edge. The first call for a key runs
    // on the next tick; calls inside the window are merged into that pending run
    // (the old drop-throttle silently discarded them until the 30s heartbeat).
    const timers = new Map<string, { handle: ReturnType<typeof setTimeout>; fn: () => void | Promise<void> }>();
    const lastRunAt = new Map<string, number>();
    const schedule = (key: string, fn: () => void | Promise<void>) => {
      const pending = timers.get(key);
      if (pending) {
        pending.fn = fn; // already scheduled — keep the deadline, take the newest work
        return;
      }
      const wait = Math.max(0, REFRESH_THROTTLE_MS - (Date.now() - (lastRunAt.get(key) ?? 0)));
      const handle = setTimeout(() => {
        timers.delete(key);
        lastRunAt.set(key, Date.now());
        fn();
      }, wait);
      timers.set(key, { handle, fn });
    };

    const fetchTablesOnly = refreshTables;

    const fetchActiveOrdersOnly = async () => {
      const res = await orderApi.getActiveOrders('active-orders-selective');
      if (!res.success && (res.status === 401 || res.status === 403)) {
        forceSessionExpiry('Your session is no longer valid. Please sign in again.');
        return;
      }
      if (res.success && res.data) {
        setActiveOrders(res.data);
      }
    };

    const refetchOrdersAndTables = () =>
      Promise.all([fetchActiveOrdersOnly(), fetchTablesOnly()]).then(() => {});

    // Real-time events: event-driven with selective refetch
    const unsubscribe = api.subscribeToEvents((event) => {
      const type = event?.type;
      if (!type) {
        schedule('all', fetchData);
        return;
      }
      switch (type) {
        case 'table.status':
        case 'table.session': {
          // Our own optimistic free/reserve already reconciled from the PATCH
          // response — skipping this echo saves a full GET /tables per action.
          const p = event.payload ?? {};
          if (type === 'table.status' && consumeSelfTableChange(p.tableId, p.status)) break;
          schedule('tables', fetchTablesOnly);
          break;
        }
        case 'order.created':
        case 'order.paid':
        case 'order.cancelled':
          schedule('orders+tables', refetchOrdersAndTables);
          break;
        case 'order.status':
          if (event.payload?.status === 'READY') {
            notifyReadyWithTable(event.payload.orderId);
          }
          if (event.payload?.status === 'SERVED') {
            notifyServedWithTable(event.payload.orderId);
          }
          if (event.payload?.billRequested === true) {
            notifyBillWithTable(event.payload.orderId, event.payload.tableId);
          }
          schedule('orders+tables', refetchOrdersAndTables);
          break;
        case 'notification.created':
          if (event.payload?.type === 'order_ready') {
            notifyReadyWithTable(event.payload.orderId);
          }
          if (event.payload?.type === 'order_served') {
            notifyServedWithTable(event.payload.orderId);
          }
          if (event.payload?.type === 'bill_requested') {
            notifyBillWithTable(event.payload.orderId, event.payload.tableId);
          }
          schedule('notifications', refreshNotifications);
          break;
        default:
          schedule('all', fetchData);
          break;
      }
    });

    // Fallback heartbeat: heals any missed events on every platform.
    // 30s to reduce UI churn.
    const intervalId = setInterval(() => {
      fetchData();
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
      timers.forEach((t) => clearTimeout(t.handle));
      timers.clear();
      api.abortAllRequests();
    };
  }, [isLoggedIn, fetchData, refreshTables, refreshNotifications, forceSessionExpiry, consumeSelfTableChange, notifyReadyWithTable, notifyServedWithTable, notifyBillWithTable]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Event Handlers ──
  // Switching the backend URL adopts that URL's own session (every server keeps
  // its own login) and drops all state belonging to the previous server.
  const applyServerUrl = useCallback((url: string) => {
    fetchGenerationRef.current++;
    const session = loadSession(url);
    api.setToken(session?.token ?? null);
    setUser((session?.user as StaffUser | undefined) ?? null);
    setIsLoggedIn(Boolean(session));
    setActiveTab('dashboard');
    setSections([]);
    setTables([]);
    setActiveOrders([]);
    setTodayBill(0);
    clearCachedNotifications();
    setNotificationsList([]);
    setUnreadCount(0);
    removeStorageItemSync('smart_cafe_cleared_history');
    setHomeError('');
    setHomeLoading(true);
    if (session) {
      fetchData();
    }
  }, [fetchData]);

  const handleLoginSuccess = (loggedUser: StaffUser) => {
    setUser(loggedUser);
    setIsLoggedIn(true);
    setHomeLoading(true);
    fetchData();
  };

  const performLogout = () => {
    clearSession(api.getBaseUrl());
    removeStorageItemSync('smart_cafe_active_tab');
    clearCachedNotifications();
    setNotificationsList([]);
    setUnreadCount(0);
    setUser(null);
    setIsLoggedIn(false);
    setActiveTab('dashboard');
    api.abortAllRequests();
    // Best-effort server logout — never gates the UI transition.
    api.logout().catch(() => {});
  };

  const handleLogout = () => {
    webAlert(
      'Sign Out',
      'Surely you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: performLogout },
      ]
    );
  };

  const handleTablePress = (table: Table) => {
    setSelectedTableForModal(table);
  };

  // Order Details shortcut (Menu tab + My Tables header) → order-details
  // for the most relevant open order (same target logic as the Dashboard KPI).
  const handleOrderDetailsPress = useCallback(() => {
    const target =
      activeOrders.find((o) => o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED') ||
      activeOrders[0];
    if (target?.tableId) {
      router.push(`/order-details/${target.tableId}` as any);
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveTab('orders');
    }
  }, [activeOrders, router]);

  // Start service server-side: creates the dining session + marks occupied.
  // No optimistic local state — the server response is the truth.
  const handleConfirmStartService = async () => {
    if (!selectedTableForModal || startingService) return;
    const tableId = selectedTableForModal.id;
    setStartingService(true);
    try {
      const res = await homeApi.startTableSession(tableId);
      if (res.success) {
        setSelectedTableForModal(null);
        await fetchData();
        router.push(`/table/${tableId}` as any);
      } else {
        webAlert('Error', res.error || 'Failed to start service');
      }
    } catch (_err) {
      webAlert('Error', 'Network error — could not start service');
    } finally {
      setStartingService(false);
    }
  };

  // RESERVED table popup → "Take Order". Jump straight to order details when the
  // table already has an open order, otherwise open a dining session first.
  const handleReservedTakeOrder = () => {
    if (!selectedTableForModal) return;
    const tableId = selectedTableForModal.id;
    const hasOpenOrders = activeOrders.some((o) => o.tableId === tableId && isOpenOrder(o));
    if (hasOpenOrders) {
      setSelectedTableForModal(null);
      router.push(`/order-details/${tableId}` as any);
      return;
    }
    handleConfirmStartService();
  };

  const handleUpdateModalTableStatus = async (newStatus: string) => {
    if (!selectedTableForModal || updatingTableStatus) return;
    const tableId = selectedTableForModal.id;
    setSelectedTableForModal(null);
    setUpdatingTableStatus(true);
    try {
      await changeTableStatus(tableId, newStatus);
    } finally {
      setUpdatingTableStatus(false);
    }
  };

  // Dining time from the SERVER session (table.activeSession.openedAt)
  const getElapsedDiningTime = useCallback((tableId: number): string => {
    const table = tables.find((t) => t.id === tableId);
    const openedAt = table?.activeSession ? new Date(table.activeSession.openedAt).getTime() : 0;
    if (!openedAt) return '0 min';
    const diffMs = Math.max(0, nowTimestamp - openedAt);
    const totalMinutes = Math.floor(diffMs / 60000);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }, [tables, nowTimestamp]);

  const handlePrintBill = async (orderId: number) => {
    try {
      const order = activeOrders.find(o => o.id === orderId);
      const success = await executeOrderPrint(orderId, order);
      if (success) {
        notifyPrintProceeded(orderId, tableNumberForOrder(orderId) || order?.table?.tableNumber);
      } else {
        showBottomToast({
          title: 'Printing',
          message: 'Print dialog displayed or sent to print queue.',
          tone: 'info',
        });
      }
    } catch (_err) {
      showBottomToast({
        title: 'Print Failed',
        message: 'Failed to connect to printer.',
        tone: 'error',
      });
    }
  };

  // Shared order status transition — used by Dashboard, Orders and Kitchen screens
  const handleOrderStatusChange = useCallback(async (orderId: number, newStatus: string) => {
    try {
      const res = await orderApi.updateOrderStatus(orderId, newStatus);
      if (res.success) {
        const status = String(newStatus).toUpperCase();
        if (status === 'READY') {
          notifyReadyWithTable(orderId);
        } else if (status === 'SERVED') {
          notifyServedWithTable(orderId);
        }
        fetchData();
      } else {
        webAlert('Error', res.error || 'Failed to update order status');
      }
    } catch (_err) {
      webAlert('Error', 'Network error — could not update order status');
    }
  }, [fetchData, notifyReadyWithTable, notifyServedWithTable]);

  // ── Render Guard ──
  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const styles = createStyles({ width, height, breakpoint, isTablet, isDesktop, isLandscape: width > height });

  return (
    <SafeAreaView style={styles.appContainer} edges={['top']}>
      <View style={styles.drawerRow}>
      {showDrawer && (
        <>
        <Animated.View key="drawer-scrim" entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.drawerScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} accessibilityLabel="Close menu" />
        </Animated.View>
        <Animated.View key="drawer-panel" entering={SlideInLeft.duration(220)} exiting={SlideOutLeft.duration(180)} style={styles.horizontalDrawerContainer}>
        <View style={styles.drawerInner}>
              {/* Drawer Brand Header */}
              <View style={styles.darkDrawerHeader}>
                <Text style={styles.darkDrawerBrand}>Cafe OS</Text>
                <TouchableOpacity onPress={() => closeDrawer()} activeOpacity={0.7} style={{ padding: 4 }}>
                  <MaterialIcons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.darkDrawerDivider} />

              {/* User Block — tap to open profile */}
              <Hoverable
                style={styles.darkDrawerUserBlock}
                hoverStyle={styles.darkDrawerItemHover}
                onPress={() => {
                  closeDrawer();
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setActiveTab('profile');
                }}
                hoverOpacity={1}
              >
                <>
                  <Image
                    source={require('../../assets/images/profile.jpg')}
                    style={styles.darkDrawerUserAvatar}
                    resizeMode="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.darkDrawerUserName}>{user?.name || 'Staff'}</Text>
                    <Text style={styles.darkDrawerUserRole}>{user?.role || 'Staff'}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#6B7280" />
                </>
              </Hoverable>

              <View style={styles.darkDrawerDivider} />

              {/* Scrollable menu items */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {/* Section: Main Tabs */}
              {[
                { key: 'dashboard', icon: '📊', label: 'Dashboard', tab: 'dashboard' as const, roles: ['ADMIN', 'WAITER'] },
                { key: 'home', icon: '🪑', label: 'My Tables', tab: 'home' as const, roles: ['ADMIN', 'WAITER'] },
                { key: 'orders', icon: '📄', label: 'Order Details', tab: 'orders' as const, roles: ['ADMIN', 'WAITER', 'CHEF', 'CASHIER'] },
                { key: 'kitchen', icon: '🍳', label: 'Kitchen Display', tab: 'kitchen' as const, roles: ['ADMIN', 'CHEF'] },
              ].filter(item => item.roles.includes(user?.role || '')).map((item) => (
                <Hoverable
                  key={item.key}
                  style={[
                    styles.darkDrawerItem,
                    activeTab === item.tab && styles.darkDrawerItemActive,
                  ]}
                  hoverStyle={styles.darkDrawerItemHover}
                  onPress={() => { closeDrawer(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab(item.tab); }}
                  hoverOpacity={1}
                >
                  <Text style={styles.darkDrawerItemIcon}>{item.icon}</Text>
                  <Text style={[styles.darkDrawerItemText, activeTab === item.tab && styles.darkDrawerItemTextActive]}>{item.label}</Text>
                </Hoverable>
              ))}

              <Hoverable
                style={styles.darkDrawerItem}
                hoverStyle={styles.darkDrawerItemHover}
                onPress={() => { closeDrawer(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('notifications'); }}
                hoverOpacity={1}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Text style={styles.darkDrawerItemIcon}>🔔</Text>
                  <Text style={styles.darkDrawerItemText}>Notifications</Text>
                </View>
                {unreadCount > 0 && (
                  <View style={styles.darkDrawerBadge}>
                    <Text style={styles.darkDrawerBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </Hoverable>

                <View style={styles.darkDrawerDivider} />

                {/* Section: Quick Actions */}
                <View style={styles.darkDrawerSectionHeaderRow}>
                  <Text style={styles.darkDrawerSectionHeader}>⚡ QUICK ACTIONS</Text>
                </View>

                <Hoverable
                  style={styles.darkDrawerItem}
                  hoverStyle={styles.darkDrawerItemHover}
                  onPress={() => { closeDrawer(); onRefresh(); }}
                  hoverOpacity={1}
                >
                  <Text style={styles.darkDrawerItemIcon}>🔄</Text>
                  <Text style={styles.darkDrawerItemText}>Refresh Data</Text>
                </Hoverable>

              <Hoverable
                style={styles.darkDrawerItem}
                hoverStyle={styles.darkDrawerItemHover}
                onPress={async () => {
                  closeDrawer();
                  const ping = await api.pingHealth();
                  if (ping) {
                    webAlert(
                      'Connection Status',
                      `Server: ${api.getBaseUrl()}\nLatency: ${ping.latencyMs}ms • Status: Online`,
                      [{ text: 'OK' }]
                    );
                  } else {
                    webAlert(
                      'Connection Status',
                      `Server: ${api.getBaseUrl()}\nStatus: UNREACHABLE\n\nCheck that the backend is running and the URL is correct.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Configure URL',
                          onPress: () => {
                            setServerUrlInput(api.getBaseUrl());
                            setShowServerUrlModal(true);
                          },
                        },
                      ]
                    );
                  }
                }}
                hoverOpacity={1}
              >
                <Text style={styles.darkDrawerItemIcon}>📶</Text>
                <Text style={styles.darkDrawerItemText}>Connection Status</Text>
              </Hoverable>

                <View style={styles.darkDrawerDivider} />

                {/* Section: Utilities */}
                <Hoverable
                  style={styles.darkDrawerItem}
                  hoverStyle={styles.darkDrawerItemHover}
                  onPress={() => {
                    closeDrawer();
                    setActiveTab('profile');
                  }}
                  hoverOpacity={1}
                >
                  <Text style={styles.darkDrawerItemIcon}>⚙️</Text>
                  <Text style={styles.darkDrawerItemText}>Settings</Text>
                </Hoverable>

                <Hoverable
                  style={styles.darkDrawerItem}
                  hoverStyle={styles.darkDrawerItemHover}
                  onPress={() => {
                    closeDrawer();
                    webAlert('About CafeOS', 'CafeOS Terminal v1.0.0\nRestaurant POS & Kitchen Display System Client.\n\nPowered by Leading Edge Software.', [{ text: 'OK' }]);
                  }}
                  hoverOpacity={1}
                >
                  <Text style={styles.darkDrawerItemIcon}>ℹ️</Text>
                  <Text style={styles.darkDrawerItemText}>About CafeOS</Text>
                </Hoverable>

                <Hoverable
                  style={styles.darkDrawerItem}
                  hoverStyle={styles.darkDrawerItemHover}
                  onPress={() => { closeDrawer(); handleLogout(); }}
                  hoverOpacity={1}
                >
                  <Text style={styles.darkDrawerItemIcon}>🚪</Text>
                  <Text style={[styles.darkDrawerItemText, { color: '#EF4444' }]}>Sign Out</Text>
                </Hoverable>
              </ScrollView>
        </View>
        </Animated.View>
        </>
      )}


      <View style={styles.mainColumn}>

      {/* ─── Render Selected Tab ───
          Home/Orders/Menu render on demand, but KitchenScreen stays MOUNTED
          (visibility toggle) so KDS progress state survives tab switches. */}
      {activeTab === 'dashboard' && (
        <Animated.View key="dashboard" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <DashboardScreen
            user={user}
            tables={tables}
            activeOrders={activeOrders}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onNavigateToTab={(tab) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab(tab as any); }}
            onNavigateProfile={() => setActiveTab('profile')}
            getElapsedDiningTime={getElapsedDiningTime}
            isWaiter={isWaiter}
            onShowDrawer={openDrawer}
            onTablePress={handleTablePress}
            onOrderPress={(tableId) => router.push(`/order-details/${tableId}` as any)}
            onOrderStatusChange={handleOrderStatusChange}
            onChangeTableStatus={changeTableStatus}
            unreadCount={unreadCount}
            onShowNotifications={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('notifications'); }}
          />
        </Animated.View>
      )}

      {activeTab === 'home' && (
        <Animated.View key="home" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <MyTableScreen
            refreshing={refreshing}
            onRefresh={onRefresh}
            homeError={homeError}
            tables={tables}
            sections={sections}
            activeSectionId={activeSectionId}
            setActiveSectionId={setActiveSectionId}
            tableSearchQuery={tableSearchQuery}
            setTableSearchQuery={setTableSearchQuery}
            getElapsedDiningTime={getElapsedDiningTime}
            activeOrders={activeOrders}
            homeLoading={homeLoading}
            onTablePress={handleTablePress}
            onChangeTableStatus={changeTableStatus}
            onOrderDetailsPress={handleOrderDetailsPress}
            onShowDrawer={openDrawer}
            onShowNotifications={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('notifications'); }}
            onNavigateProfile={() => setActiveTab('profile')}
            unreadCount={unreadCount}
            user={user}
          />
        </Animated.View>
      )}

      {activeTab === 'orders' && (
        <Animated.View key="orders" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <OrdersScreen
            refreshing={refreshing}
            onRefresh={onRefresh}
            activeOrders={activeOrders}
            ordersSearchQuery={ordersSearchQuery}
            setOrdersSearchQuery={setOrdersSearchQuery}
            orderStatusFilter={orderStatusFilter}
            setOrderStatusFilter={setOrderStatusFilter}
            onShowDrawer={openDrawer}
            onOrderPress={(tableId) => router.push(`/order-details/${tableId}` as any)}
            onOrderStatusChange={handleOrderStatusChange}
            onBookTable={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('home'); }}
          />
        </Animated.View>
      )}

      {activeTab === 'menu' && (
        <Animated.View key="menu" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <MenuScreen onShowDrawer={openDrawer} onOrderDetailsPress={handleOrderDetailsPress} />
        </Animated.View>
      )}

      {activeTab === 'kitchen' && (
        <Animated.View key="kitchen" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <KitchenScreen
            refreshing={refreshing}
            onRefresh={onRefresh}
            activeOrders={activeOrders}
            onShowDrawer={openDrawer}
            onOrderStatusChange={handleOrderStatusChange}
          />
        </Animated.View>
      )}

      {activeTab === 'notifications' && (
        <Animated.View key="notifications" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <NotificationScreen
            notifications={notificationsList}
            unreadCount={unreadCount}
            onRefresh={refreshNotifications}
            onNavigateBack={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('dashboard'); }}
          />
        </Animated.View>
      )}

      {activeTab === 'profile' && (
        <Animated.View key="profile" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <View style={styles.tabContent}>
            <View style={styles.screenHeader}>
              <Hoverable
                style={styles.screenHeaderIconBtn}
                onPress={openDrawer}
                hoverOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Open menu"
              >
                <MaterialIcons name="menu" size={24} color="#FFFFFF" />
              </Hoverable>
              <Text style={styles.screenHeaderTitle}>Profile</Text>
            </View>
            <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
              <View style={styles.profileCard}>
                <View style={styles.profileAvatar}>
                  <Image
                    source={require('../../assets/images/profile.jpg')}
                    style={{ width: 64, height: 64, borderRadius: 32 }}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.profileName}>{user?.name || 'Staff On Duty'}</Text>
                <Text style={styles.profileRole}>{user?.role || 'Staff'} • CafeOS Terminal</Text>
                <View style={[styles.badge, { backgroundColor: '#DCFCE7', marginTop: 8 }]}>
                  <Text style={[styles.badgeText, { color: COLOR_SUCCESS }]}>ACTIVE SHIFT</Text>
                </View>
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.summaryCardAccent} />
                <View style={styles.summaryCardHeader}>
                  <MaterialIcons name="bar-chart" size={24} color={BRAND_ORANGE} />
                  <Text style={styles.summaryCardTitle}>{"Today's Summary"}</Text>
                </View>
                <View style={styles.summaryMetricsRow}>
                  <View style={styles.metricItem}>
                    <MaterialCommunityIcons name="table-furniture" size={16} color={BRAND_ORANGE} />
                    <Text style={styles.metricLabel}>Active Tables</Text>
                    <Text style={styles.metricValue}>
                      {tables.filter(t => t.status === 'OCCUPIED' || t.status === 'RESERVED').length}
                    </Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <MaterialCommunityIcons name="receipt-text-outline" size={16} color={BRAND_ORANGE} />
                    <Text style={styles.metricLabel}>Open Orders</Text>
                    <Text style={styles.metricValue}>
                      {activeOrders.filter(isOpenOrder).length}
                    </Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <MaterialCommunityIcons name="cash-multiple" size={16} color={COLOR_SUCCESS} />
                    <Text style={styles.metricLabel}>{"Today's Bill"}</Text>
                    <Text style={[styles.metricValue, styles.metricValueRevenue]}>
                      {formatMoney(todayBill)}
                    </Text>
                  </View>
                </View>
              </View>

              <Hoverable style={styles.actionListItem} onPress={() => setActiveTab('history')} hoverOpacity={0.8}>
                <View style={styles.actionListLeft}>
                  <MaterialCommunityIcons name="history" size={22} color={BRAND_ORANGE} />
                  <Text style={styles.actionListText}>View Past Order Receipts</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={TEXT_MUTED} />
              </Hoverable>
              
              <Hoverable
                style={styles.actionListItem}
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('notifications'); }}
                hoverOpacity={0.8}
              >
                <View style={styles.actionListLeft}>
                  <MaterialCommunityIcons name="bell-outline" size={22} color={BRAND_ORANGE} />
                  <Text style={styles.actionListText}>Notifications</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={TEXT_MUTED} />
              </Hoverable>

              <Hoverable
                style={styles.actionListItem}
                onPress={() => { setServerUrlInput(api.getBaseUrl()); setServerUrlError(''); setShowServerUrlModal(true); }}
                hoverOpacity={0.8}
              >
                <View style={styles.actionListLeft}>
                  <MaterialCommunityIcons name="server-network" size={22} color={BRAND_ORANGE} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionListText}>Configure Server URL</Text>
                    <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
                      {api.getBaseUrl()}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={TEXT_MUTED} />
              </Hoverable>

              <Hoverable style={styles.btnDangerOutlined} onPress={handleLogout} hoverOpacity={0.8}>
                <MaterialIcons name="logout" size={20} color={COLOR_ERROR} />
                <Text style={styles.btnDangerOutlinedText}>Sign Out</Text>
              </Hoverable>
            </ScrollView>
          </View>
        </Animated.View>
      )}

      {activeTab === 'history' && (
        <Animated.View key="history" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <PastOrdersScreen
            user={user}
            onBack={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('profile'); }}
          />
        </Animated.View>
      )}


      {/* ─── SERVER URL CONFIG MODAL ─── */}
      <Modal visible={showServerUrlModal} transparent animationType="fade" onRequestClose={() => setShowServerUrlModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowServerUrlModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="server-network" size={24} color={BRAND_ORANGE} />
                <Text style={styles.modalTitle}>Server URL</Text>
              </View>
              <TouchableOpacity onPress={() => setShowServerUrlModal(false)}>
                <MaterialIcons name="close" size={22} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Address of the CafeOS backend. Include http:// and port (e.g. http://192.168.1.10:3000).</Text>
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: serverUrlError ? COLOR_ERROR : BORDER_COLOR, marginBottom: serverUrlError ? 6 : 12 }}>
              <TextInput
                style={{ paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: TEXT_DARK, minHeight: 44 }}
                value={serverUrlInput}
                onChangeText={(text) => { setServerUrlInput(text); setServerUrlError(''); }}
                placeholder="http://localhost:3000"
                placeholderTextColor={TEXT_MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            {serverUrlError ? (
              <Text style={{ fontSize: 12, color: COLOR_ERROR, fontWeight: '600', marginBottom: 12 }}>{serverUrlError}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Hoverable
                style={[styles.btnSecondary, { flex: 1 }]}
                onPress={() => {
                  const previous = api.getBaseUrl();
                  const url = api.resetBaseUrl();
                  const changed = url !== previous;
                  setServerUrlInput(url);
                  setServerUrlError('');
                  setShowServerUrlModal(false);
                  // Only drop caches/session state when the URL actually moved —
                  // a no-op reset must not wipe the current screen.
                  if (changed) applyServerUrl(url);
                  showBottomToast({
                    title: changed ? 'Server URL reset' : 'Already on the default server',
                    message: changed
                      ? `Now using ${url}`
                      : `${url} is the default — edit the field to point elsewhere.`,
                    tone: changed ? 'success' : 'info',
                  });
                }}
                hoverOpacity={0.8}
              >
                <Text style={styles.btnSecondaryText}>Reset Default</Text>
              </Hoverable>
              <Hoverable
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={() => {
                  // Reject malformed URLs up front — the current server stays
                  // active and the reason is shown under the input.
                  const check = api.validateBaseUrl(serverUrlInput);
                  if (!check.ok) {
                    setServerUrlError(check.error || 'Invalid server URL');
                    return;
                  }
                  const saved = api.setBaseUrl(serverUrlInput);
                  setServerUrlInput(saved);
                  setServerUrlError('');
                  setShowServerUrlModal(false);
                  applyServerUrl(saved);
                }}
                hoverOpacity={0.8}
              >
                <Text style={styles.btnPrimaryText}>Save & Retry</Text>
              </Hoverable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── TABLE STATUS & SERVICE MODAL ─── */}
      <Modal visible={selectedTableForModal !== null} transparent animationType="slide" onRequestClose={() => setSelectedTableForModal(null)}>
        {selectedTableForModal && (
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedTableForModal(null)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="table-furniture" size={24} color={BRAND_ORANGE} />
                  <Text style={styles.modalTitle}>{selectedTableForModal.tableNumber}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedTableForModal(null)}>
                  <MaterialIcons name="close" size={22} color={TEXT_MUTED} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>Section: {sections.find(s => s.id === selectedTableForModal.sectionId)?.name || 'Main'}</Text>

              {selectedTableForModal.status === 'AVAILABLE' ? (
                <View style={{ gap: 12 }}>
                  <Hoverable style={[styles.btnPrimary, startingService && { opacity: 0.6 }]} onPress={handleConfirmStartService} disabled={startingService} hoverOpacity={0.8}>
                    <MaterialIcons name="restaurant" size={20} color={BG_WHITE} />
                    <Text style={styles.btnPrimaryText}>{startingService ? 'Taking…' : 'Take Order'}</Text>
                  </Hoverable>
                  <View style={[styles.divider, { marginVertical: 8 }]} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT_MUTED }}>Other Actions:</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Hoverable style={[styles.btnSecondary, { flex: 1, backgroundColor: '#FEE2E2', borderColor: '#FEE2E2' }]} onPress={() => handleUpdateModalTableStatus('RESERVED')} hoverOpacity={0.8}>
                      <Text style={[styles.btnSecondaryText, { color: COLOR_ERROR }]}>Reserve</Text>
                    </Hoverable>
                  </View>
                </View>
              ) : selectedTableForModal.status === 'RESERVED' || selectedTableForModal.is_reserved === true ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.occupiedSummary}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600' }}>Status</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: COLOR_ERROR, marginTop: 2 }}>Reserved</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600' }}>Seats</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: TEXT_DARK, marginTop: 2 }}>{selectedTableForModal.capacity} seats</Text>
                    </View>
                  </View>
                  <Hoverable style={[styles.btnPrimary, startingService && { opacity: 0.6 }]} onPress={handleReservedTakeOrder} disabled={startingService} hoverOpacity={0.8}>
                    <MaterialIcons name="restaurant" size={20} color={BG_WHITE} />
                    <Text style={styles.btnPrimaryText}>{startingService ? 'Taking…' : 'Take Order'}</Text>
                  </Hoverable>
                  <Hoverable style={[styles.btnPrimary, { backgroundColor: COLOR_SUCCESS }]} onPress={() => handleUpdateModalTableStatus('AVAILABLE')} hoverOpacity={0.8}>
                    <MaterialIcons name="lock-open" size={20} color={BG_WHITE} />
                    <Text style={styles.btnPrimaryText}>Free Table</Text>
                  </Hoverable>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <View style={styles.occupiedSummary}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600' }}>Status</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND_ORANGE, marginTop: 2 }}>Occupied</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600' }}>Time</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: TEXT_DARK, marginTop: 2 }}>
                        {getElapsedDiningTime(selectedTableForModal.id)}
                      </Text>
                    </View>
                  </View>
                  <Hoverable style={styles.btnPrimary} onPress={() => { const id = selectedTableForModal.id; setSelectedTableForModal(null); router.push(`/table/${id}` as any); }} hoverOpacity={0.8}>
                    <MaterialIcons name="menu-book" size={20} color={BG_WHITE} />
                    <Text style={styles.btnPrimaryText}>Open Order Pad</Text>
                  </Hoverable>
                  <Hoverable style={[styles.btnPrimary, { backgroundColor: COLOR_WARNING }]} onPress={() => handleUpdateModalTableStatus('PENDING_BILL')} hoverOpacity={0.8}>
                    <MaterialIcons name="receipt-long" size={20} color={BG_WHITE} />
                    <Text style={styles.btnPrimaryText}>Mark Pending Bill</Text>
                  </Hoverable>
                  <Hoverable style={[styles.btnPrimary, { backgroundColor: COLOR_SUCCESS }]} onPress={() => handleUpdateModalTableStatus('AVAILABLE')} hoverOpacity={0.8}>
                    <MaterialIcons name="cleaning-services" size={20} color={BG_WHITE} />
                    <Text style={styles.btnPrimaryText}>Free & Clear Table</Text>
                  </Hoverable>
                </View>
              )}
            </Pressable>
          </Pressable>
        )}
      </Modal>

      {/* ─── BOTTOM TAB NAVIGATION ─── */}
      <View style={styles.bottomTabBar}>
        {visibleTabs.includes('dashboard') && (
          <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('dashboard'); }} hoverOpacity={0.7}>
            <MaterialCommunityIcons name="view-dashboard" size={activeTab === 'dashboard' ? 28 : 24} color={activeTab === 'dashboard' ? BRAND_PRIMARY : TEXT_MUTED} />
            <Text style={[styles.tabBtnText, activeTab === 'dashboard' && styles.tabBtnTextActive]}>Dashboard</Text>
          </Hoverable>
        )}
        {visibleTabs.includes('home') && (
          <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('home'); }} hoverOpacity={0.7}>
            <TableTabIcon active={activeTab === 'home'} size={activeTab === 'home' ? 28 : 24} color={activeTab === 'home' ? BRAND_PRIMARY : TEXT_MUTED} />
            <Text style={[styles.tabBtnText, activeTab === 'home' && styles.tabBtnTextActive]}>My Tables</Text>
          </Hoverable>
        )}
        {visibleTabs.includes('orders') && (
          <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('orders'); }} hoverOpacity={0.7}>
            <View style={styles.tabIconWrapper}>
              <MaterialCommunityIcons name="receipt" size={activeTab === 'orders' ? 28 : 24} color={activeTab === 'orders' ? BRAND_PRIMARY : TEXT_MUTED} />
              {activeOrders.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{activeOrders.length > 99 ? '99+' : activeOrders.length}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabBtnText, activeTab === 'orders' && styles.tabBtnTextActive]}>Order Details</Text>
          </Hoverable>
        )}
        {visibleTabs.includes('menu') && (
          <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('menu'); }} hoverOpacity={0.7}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={activeTab === 'menu' ? 28 : 24} color={activeTab === 'menu' ? BRAND_PRIMARY : TEXT_MUTED} />
            <Text style={[styles.tabBtnText, activeTab === 'menu' && styles.tabBtnTextActive]}>Menu</Text>
          </Hoverable>
        )}
        {visibleTabs.includes('notifications') && (
          <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('notifications'); }} hoverOpacity={0.7}>
            <View style={styles.tabIconWrapper}>
              <MaterialCommunityIcons name="bell-ring" size={activeTab === 'notifications' ? 28 : 24} color={activeTab === 'notifications' ? BRAND_PRIMARY : TEXT_MUTED} />
              {unreadCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabBtnText, activeTab === 'notifications' && styles.tabBtnTextActive]}>Alerts</Text>
          </Hoverable>
        )}
        {visibleTabs.includes('kitchen') && (
          <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('kitchen'); }} hoverOpacity={0.7}>
            <MaterialCommunityIcons name="chef-hat" size={activeTab === 'kitchen' ? 28 : 24} color={activeTab === 'kitchen' ? BRAND_PRIMARY : TEXT_MUTED} />
            <Text style={[styles.tabBtnText, activeTab === 'kitchen' && styles.tabBtnTextActive]}>Kitchen</Text>
          </Hoverable>
        )}
        <Hoverable style={styles.tabBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('profile'); }} hoverOpacity={0.7}>
          <Image
            source={require('../../assets/images/profile.jpg')}
            style={[styles.tabProfileAvatar, activeTab === 'profile' && styles.tabProfileAvatarActive]}
            resizeMode="contain"
          />
          <Text style={[styles.tabBtnText, activeTab === 'profile' && styles.tabBtnTextActive]}>Profile</Text>
        </Hoverable>
      </View>
      </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (bp: ReturnType<typeof useResponsive>) => StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: BG_LIGHT },
  tabContent: { flex: 1, backgroundColor: BG_LIGHT },
  bodyScroll: { flex: 1, backgroundColor: BG_LIGHT },
  bodyContent: { 
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'), 
    paddingTop: getSpacing(bp.breakpoint, 'md'), 
    paddingBottom: getTabBarHeight(bp.breakpoint) + getSpacing(bp.breakpoint, 'xl') 
  },
  divider: { height: 1, backgroundColor: BORDER_COLOR, width: '100%' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: getSpacing(bp.breakpoint, 'xl'), gap: getSpacing(bp.breakpoint, 'sm') },
  emptyStateText: { fontSize: getFontSize(bp.breakpoint, 'md'), color: TEXT_MUTED, fontWeight: '500' },
  badge: {
    paddingHorizontal: getSpacing(bp.breakpoint, 'sm'),
    paddingVertical: getSpacing(bp.breakpoint, 'xs'),
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: getFontSize(bp.breakpoint, 'xs'),
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  btnPrimary: {
    backgroundColor: BRAND_PRIMARY,
    height: getResponsiveValue({ xs: 40, sm: 42, md: 44, lg: 48, xl: 52 }, bp.breakpoint),
    borderRadius: getBorderRadius(bp.breakpoint, 'md'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: getSpacing(bp.breakpoint, 'sm'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
  },
  btnPrimaryText: { color: BG_WHITE, fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '700' },
  btnSecondary: {
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    height: getResponsiveValue({ xs: 40, sm: 42, md: 44, lg: 48, xl: 52 }, bp.breakpoint),
    borderRadius: getBorderRadius(bp.breakpoint, 'md'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: getSpacing(bp.breakpoint, 'sm'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
  },
  btnSecondaryText: { color: TEXT_DARK, fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '600' },
  btnDangerOutlined: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    height: getResponsiveValue({ xs: 40, sm: 42, md: 44, lg: 48, xl: 52 }, bp.breakpoint),
    borderRadius: getBorderRadius(bp.breakpoint, 'md'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: getSpacing(bp.breakpoint, 'sm'),
    marginTop: getSpacing(bp.breakpoint, 'md'),
  },
  btnDangerOutlinedText: { color: COLOR_ERROR, fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '700' },
  searchContainer: {
    backgroundColor: BG_WHITE,
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingVertical: getSpacing(bp.breakpoint, 'md'),
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: getBorderRadius(bp.breakpoint, 'md'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    height: getResponsiveValue({ xs: 40, sm: 42, md: 44, lg: 48, xl: 52 }, bp.breakpoint),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: getFontSize(bp.breakpoint, 'md'), color: TEXT_DARK, height: '100%' },
  screenHeader: { backgroundColor: BRAND_PRIMARY, paddingHorizontal: getSpacing(bp.breakpoint, 'lg'), paddingVertical: getSpacing(bp.breakpoint, 'md'), flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  screenHeaderTitle: { fontSize: getFontSize(bp.breakpoint, 'xxl'), fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  screenHeaderIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: getSpacing(bp.breakpoint, 'sm'), backgroundColor: 'rgba(255,255,255,0.15)' },
  summaryCard: { backgroundColor: BG_WHITE, borderRadius: getBorderRadius(bp.breakpoint, 'xl'), padding: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, overflow: 'hidden', shadowColor: BRAND_PRIMARY, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  summaryCardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: BRAND_PRIMARY },
  summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: getSpacing(bp.breakpoint, 'sm'), marginBottom: getSpacing(bp.breakpoint, 'md'), marginTop: getSpacing(bp.breakpoint, 'xs') },
  summaryCardTitle: { fontSize: getFontSize(bp.breakpoint, 'lg'), fontWeight: '700', color: TEXT_DARK },
  summaryMetricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: getBorderRadius(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'sm'), paddingHorizontal: getSpacing(bp.breakpoint, 'sm'), borderWidth: 1, borderColor: BORDER_COLOR },
  metricItem: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: getFontSize(bp.breakpoint, 'xl'), fontWeight: '900', color: TEXT_DARK, marginTop: getSpacing(bp.breakpoint, 'xs') },
  metricValueRevenue: { color: COLOR_SUCCESS, fontSize: getFontSize(bp.breakpoint, 'lg') },
  metricLabel: { fontSize: getFontSize(bp.breakpoint, 'xs'), color: TEXT_MUTED, fontWeight: '600', marginTop: getSpacing(bp.breakpoint, 'xs') },
  metricDivider: { width: 1, height: moderateScale(32, 0.5, bp.breakpoint), backgroundColor: BORDER_COLOR },
  actionListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BG_WHITE, borderRadius: getBorderRadius(bp.breakpoint, 'md'), padding: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'sm'), borderWidth: 1, borderColor: BORDER_COLOR },
  actionListLeft: { flexDirection: 'row', alignItems: 'center', gap: getSpacing(bp.breakpoint, 'md') },
  actionListText: { fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '600', color: TEXT_DARK },
  historyCard: { backgroundColor: BG_WHITE, borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, padding: getSpacing(bp.breakpoint, 'md'), shadowColor: BRAND_PRIMARY, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  historyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: getSpacing(bp.breakpoint, 'sm') },
  historyCardTable: { fontSize: getFontSize(bp.breakpoint, 'lg'), fontWeight: '800', color: TEXT_DARK },
  historyCardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputWrapper: { marginBottom: getSpacing(bp.breakpoint, 'md'), backgroundColor: '#F8FAFC', borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', height: getResponsiveValue({ xs: 44, sm: 46, md: 48, lg: 52, xl: 56 }, bp.breakpoint) },
  textInput: { flex: 1, fontSize: getFontSize(bp.breakpoint, 'md'), color: TEXT_DARK, height: '100%', paddingHorizontal: getSpacing(bp.breakpoint, 'md') },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  drawerRow: { flex: 1, flexDirection: 'row', backgroundColor: BG_LIGHT },
  mainColumn: { flex: 1, minWidth: 0, backgroundColor: BG_LIGHT, zIndex: 0 },
  drawerInner: { flex: 1, backgroundColor: '#FFFFFF' },
  drawerScrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 90, elevation: 9 },
  horizontalDrawerContainer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: getResponsiveValue<string | number>({ xs: '78%', sm: '70%', md: '55%', lg: 340, xl: 380 }, bp.breakpoint) as any, maxWidth: getResponsiveValue<number>({ xs: 320, sm: 340, md: 380, lg: 420, xl: 460 }, bp.breakpoint) as any, backgroundColor: '#FFFFFF', borderTopRightRadius: getBorderRadius(bp.breakpoint, 'xl'), borderBottomRightRadius: getBorderRadius(bp.breakpoint, 'xl'), borderRightWidth: 1, borderRightColor: BORDER_COLOR, overflow: 'hidden', zIndex: 100, elevation: 10, shadowColor: '#000000', shadowOffset: { width: 3, height: 0 }, shadowOpacity: 0.12, shadowRadius: 12 },
  darkDrawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md') },
  darkDrawerBrand: { color: '#000000', fontSize: getFontSize(bp.breakpoint, 'xxl'), fontWeight: '800', fontFamily: 'Times New Roman', letterSpacing: 0.5 },
  darkDrawerDivider: { height: 1, backgroundColor: '#E5E7EB', marginHorizontal: getSpacing(bp.breakpoint, 'md'), marginVertical: getSpacing(bp.breakpoint, 'sm') },
  darkDrawerUserBlock: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md') },
  darkDrawerUserAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: getSpacing(bp.breakpoint, 'sm'), backgroundColor: '#FFFFFF' },
  darkDrawerUserName: { color: '#000000', fontSize: getFontSize(bp.breakpoint, 'lg'), fontWeight: '700' },
  darkDrawerUserRole: { color: '#6B7280', fontSize: getFontSize(bp.breakpoint, 'sm'), fontWeight: '500', marginTop: getSpacing(bp.breakpoint, 'xs') },
  darkDrawerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md'), borderRadius: getBorderRadius(bp.breakpoint, 'md'), marginHorizontal: getSpacing(bp.breakpoint, 'sm'), marginVertical: getSpacing(bp.breakpoint, 'xs'), ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) },
  darkDrawerItemActive: { backgroundColor: '#F3F4F6' },
  darkDrawerItemHover: { backgroundColor: '#F9FAFB' },
  darkDrawerItemIcon: { fontSize: getIconSize(bp.breakpoint, 'md'), marginRight: getSpacing(bp.breakpoint, 'md'), width: getIconSize(bp.breakpoint, 'lg'), textAlign: 'center' },
  darkDrawerItemText: { color: '#000000', fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '600' },
  darkDrawerItemTextActive: { color: BRAND_PRIMARY, fontWeight: '700' },
  darkDrawerBadge: { backgroundColor: '#EF4444', borderRadius: getBorderRadius(bp.breakpoint, 'full'), paddingHorizontal: getSpacing(bp.breakpoint, 'sm'), paddingVertical: getSpacing(bp.breakpoint, 'xs'), justifyContent: 'center', alignItems: 'center' },
  darkDrawerBadgeText: { color: '#FFFFFF', fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '800' },
  darkDrawerSectionHeaderRow: { paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingTop: getSpacing(bp.breakpoint, 'md'), paddingBottom: getSpacing(bp.breakpoint, 'sm') },
  darkDrawerSectionHeader: { color: '#6B7280', fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '800', letterSpacing: 1.2 },
  drawerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md'), borderBottomWidth: 1, borderBottomColor: BORDER_COLOR, backgroundColor: BG_WHITE },
  modalCard: { backgroundColor: BG_WHITE, borderTopLeftRadius: getBorderRadius(bp.breakpoint, 'xl'), borderTopRightRadius: getBorderRadius(bp.breakpoint, 'xl'), padding: getSpacing(bp.breakpoint, 'lg'), maxHeight: getResponsiveValue({ xs: '90%', sm: '88%', md: '85%', lg: '80%', xl: '75%' }, bp.breakpoint) as any },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: getSpacing(bp.breakpoint, 'sm') },
  modalTitle: { fontSize: getFontSize(bp.breakpoint, 'xl'), fontWeight: '800', color: TEXT_DARK },
  modalSubtitle: { fontSize: getFontSize(bp.breakpoint, 'sm'), color: TEXT_MUTED, marginBottom: getSpacing(bp.breakpoint, 'md'), fontWeight: '500' },
  occupiedSummary: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: getBorderRadius(bp.breakpoint, 'md'), padding: getSpacing(bp.breakpoint, 'md'), justifyContent: 'space-around', borderWidth: 1, borderColor: BORDER_COLOR },
  notifCard: { flexDirection: 'row', gap: getSpacing(bp.breakpoint, 'md'), backgroundColor: BG_WHITE, borderRadius: getBorderRadius(bp.breakpoint, 'md'), padding: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'sm'), borderWidth: 1, borderColor: BORDER_COLOR },
  notifCardUnread: { borderColor: BRAND_PRIMARY, borderWidth: 1, backgroundColor: '#EFF6FF' },
  notifUnreadDot: { position: 'absolute', top: getSpacing(bp.breakpoint, 'md'), left: getSpacing(bp.breakpoint, 'xs'), width: moderateScale(8, 0.5, bp.breakpoint), height: moderateScale(8, 0.5, bp.breakpoint), borderRadius: getBorderRadius(bp.breakpoint, 'xs'), backgroundColor: COLOR_ERROR },
  notifIconCircle: { width: moderateScale(36, 0.5, bp.breakpoint), height: moderateScale(36, 0.5, bp.breakpoint), borderRadius: moderateScale(18, 0.5, bp.breakpoint), justifyContent: 'center', alignItems: 'center' },
  modalBadge: { backgroundColor: BRAND_PRIMARY, borderRadius: getBorderRadius(bp.breakpoint, 'full'), paddingHorizontal: getSpacing(bp.breakpoint, 'sm'), paddingVertical: getSpacing(bp.breakpoint, 'xs'), justifyContent: 'center', alignItems: 'center', minWidth: moderateScale(20, 0.5, bp.breakpoint), marginLeft: getSpacing(bp.breakpoint, 'xs') },
  modalBadgeText: { color: '#FFFFFF', fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '800' },
  bottomTabBar: { flexDirection: 'row', height: getTabBarHeight(bp.breakpoint), marginHorizontal: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'sm'), borderRadius: getBorderRadius(bp.breakpoint, 'xl'), backgroundColor: BG_WHITE, alignItems: 'center', justifyContent: 'space-around', borderWidth: 1, borderColor: BORDER_COLOR, elevation: 8, shadowColor: BRAND_PRIMARY, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 16 },
  tabBtn: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', borderRadius: getBorderRadius(bp.breakpoint, 'lg'), gap: 2 },
  tabBtnText: { fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '600', color: TEXT_MUTED },
  tabBtnTextActive: { color: BRAND_PRIMARY, fontWeight: '800' },
  tabProfileAvatar: { width: moderateScale(26, 0.5, bp.breakpoint), height: moderateScale(26, 0.5, bp.breakpoint), borderRadius: moderateScale(13, 0.5, bp.breakpoint), borderWidth: 1, borderColor: BORDER_COLOR, backgroundColor: BG_WHITE },
  tabProfileAvatarActive: { width: moderateScale(30, 0.5, bp.breakpoint), height: moderateScale(30, 0.5, bp.breakpoint), borderRadius: moderateScale(15, 0.5, bp.breakpoint), borderWidth: 2, borderColor: BRAND_PRIMARY },
  tabIconWrapper: { position: 'relative', flexDirection: 'column', alignItems: 'center' },
  tabBadge: { position: 'absolute', top: -moderateScale(4, 0.5, bp.breakpoint), right: -moderateScale(8, 0.5, bp.breakpoint), minWidth: moderateScale(18, 0.5, bp.breakpoint), height: moderateScale(18, 0.5, bp.breakpoint), borderRadius: moderateScale(9, 0.5, bp.breakpoint), backgroundColor: COLOR_ERROR, justifyContent: 'center', alignItems: 'center', paddingHorizontal: moderateScale(3, 0.5, bp.breakpoint), borderWidth: 2, borderColor: BG_WHITE },
  tabBadgeText: { color: BG_WHITE, fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '900', lineHeight: moderateScale(12, 0.5, bp.breakpoint) },
  profileCard: { backgroundColor: BG_WHITE, borderRadius: getBorderRadius(bp.breakpoint, 'xl'), padding: getSpacing(bp.breakpoint, 'lg'), alignItems: 'center', marginBottom: getSpacing(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, shadowColor: BRAND_PRIMARY, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  profileAvatar: { width: moderateScale(64, 0.5, bp.breakpoint), height: moderateScale(64, 0.5, bp.breakpoint), borderRadius: moderateScale(32, 0.5, bp.breakpoint), backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginBottom: getSpacing(bp.breakpoint, 'md'), overflow: 'hidden' },
  profileAvatarText: { color: BG_WHITE, fontSize: getFontSize(bp.breakpoint, 'xxl'), fontWeight: '900' },
  profileName: { fontSize: getFontSize(bp.breakpoint, 'xl'), fontWeight: '800', color: TEXT_DARK, marginBottom: getSpacing(bp.breakpoint, 'xs') },
  profileRole: { fontSize: getFontSize(bp.breakpoint, 'sm'), color: TEXT_MUTED, fontWeight: '600' },
  loadMoreContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: getSpacing(bp.breakpoint, 'sm'), padding: getSpacing(bp.breakpoint, 'md') },
  loadMoreText: { fontSize: getFontSize(bp.breakpoint, 'sm'), color: TEXT_MUTED },
  loadMoreBtn: { backgroundColor: BG_WHITE, borderWidth: 1, borderColor: BORDER_COLOR, borderRadius: getBorderRadius(bp.breakpoint, 'md'), padding: getSpacing(bp.breakpoint, 'md'), alignItems: 'center', marginTop: getSpacing(bp.breakpoint, 'sm') },
  loadMoreBtnText: { fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '700', color: BRAND_PRIMARY },
});
