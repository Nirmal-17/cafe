'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { api, DashboardData, Order, StaffUser, Table } from '@/services/api';
import { COLORS, SectionCard, formatMoney } from '@/components/dashboard/shared';
import { DashboardKpi, KpiGrid } from '@/components/dashboard/KpiGrid';
import { ShiftStats, TodayServiceCard } from '@/components/dashboard/TodayServiceCard';
import { OrderActionList } from '@/components/dashboard/ActionQueue';
import { FloorPlanGrid } from '@/components/dashboard/FloorPlanGrid';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { TableTabsCard } from '@/components/dashboard/TableTabsCard';
import { isOpenOrder } from '@/utils/openValue';

interface DashboardScreenProps {
  user: StaffUser | null;
  tables: Table[];
  activeOrders: Order[];
  refreshing: boolean;
  onRefresh: () => void;
  onNavigateToTab: (tab: string) => void;
  onNavigateProfile: () => void;
  getElapsedDiningTime: (tableId: number) => string;
  isWaiter?: boolean;
  onShowDrawer: () => void;
  onTablePress?: (table: Table) => void;
  onOrderPress?: (tableId: number) => void;
  onOrderStatusChange?: (orderId: number, status: string) => Promise<void> | void;
  onChangeTableStatus: (tableId: number, status: string) => Promise<boolean>;
  unreadCount?: number;
  onShowNotifications?: () => void;
}

const EXTRAS_MIN_INTERVAL_MS = 45000;

export function DashboardScreen({
  user,
  tables,
  activeOrders,
  refreshing,
  onRefresh,
  onNavigateToTab,
  onNavigateProfile,
  getElapsedDiningTime,
  isWaiter = false,
  onShowDrawer,
  onTablePress,
  onOrderPress,
  onOrderStatusChange,
  onChangeTableStatus,
  unreadCount = 0,
  onShowNotifications,
}: DashboardScreenProps) {
  // ── Live clock (greeting + header time) ──
  const [clock, setClock] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 20000);
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(() => {
    const hour = clock.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, [clock]);

  const timeLabel = useMemo(() => {
    const h = clock.getHours();
    const m = clock.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }, [clock]);

  // ── Extra data: analytics + today's shift stats (own cadence, deduped) ──
  const [analytics, setAnalytics] = useState<DashboardData | null>(null);
  const [shiftStats, setShiftStats] = useState<ShiftStats | null>(null);
  const [todayPaidTotal, setTodayPaidTotal] = useState(0);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const lastExtrasAtRef = useRef(0);

  const loadExtras = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastExtrasAtRef.current < EXTRAS_MIN_INTERVAL_MS) return;
      lastExtrasAtRef.current = now;
      setExtrasLoading(true);
      try {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date();
        dayEnd.setHours(23, 59, 59, 999);

        const [analyticsRes, ordersRes] = await Promise.all([
          isWaiter
            ? Promise.resolve({ success: false as const })
            : api.getDashboardAnalytics().catch(() => ({ success: false as const })),
          api
            .getOrders({
              page: 1,
              limit: 500,
              dateFrom: dayStart.toISOString(),
              dateTo: dayEnd.toISOString(),
            })
            .catch(() => ({ success: false as const })),
        ]);

        if (analyticsRes.success && analyticsRes.data) {
          setAnalytics(analyticsRes.data);
        }
        if (ordersRes.success && ordersRes.data) {
          const orders = ordersRes.data.orders;
          const paid = orders.filter((o) => o.paymentStatus === 'PAID');
          const cancelled = orders.filter((o) => o.status === 'CANCELLED');
          const revenue = paid.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
          setTodayPaidTotal(revenue);
          if (!isWaiter) {
            setShiftStats({
              orders: Math.max(0, ordersRes.data.total - cancelled.length),
              bills: paid.length,
              revenue,
              avgTicket: paid.length > 0 ? Math.round(revenue / paid.length) : 0,
            });
          }
        }
      } finally {
        setExtrasLoading(false);
      }
    },
    [isWaiter],
  );

  useEffect(() => {
    loadExtras(true);
  }, [loadExtras]);

  // Reload after a pull-to-refresh completes
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      loadExtras(true);
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, loadExtras]);

  // Parent refetches activeOrders on event/poll/status changes — piggyback (throttled)
  useEffect(() => {
    loadExtras(false);
  }, [activeOrders, loadExtras]);

  // ── System-wide derivations (every table / order, not just the current user's) ──
  const tableStats = useMemo(() => {
    const occupied = tables.filter((t) => t.status === 'OCCUPIED').length;
    const pendingBill = tables.filter((t) => t.status === 'PENDING_BILL').length;
    const available = tables.filter((t) => t.status === 'AVAILABLE').length;
    return { occupied, pendingBill, available, busyTableCount: occupied + pendingBill };
  }, [tables]);

  const activeOrderCount = activeOrders.length;

  const billRequests = useMemo(
    () =>
      activeOrders
        .filter((o) => o.billRequested && o.paymentStatus !== 'PAID')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeOrders],
  );

  const readyOrders = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'READY')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeOrders],
  );

  const attentionOrders = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED' || o.status === 'PREPARING')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeOrders],
  );

  // ── Handlers ──
  const [servingIds, setServingIds] = useState<number[]>([]);

  const handleServe = useCallback(
    async (order: Order) => {
      if (!onOrderStatusChange) return;
      setServingIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
      try {
        await onOrderStatusChange(order.id, 'SERVED');
      } finally {
        setServingIds((prev) => prev.filter((id) => id !== order.id));
      }
    },
    [onOrderStatusChange],
  );

  const openOrder = useCallback(
    (order: Order) => {
      if (onOrderPress) onOrderPress(order.tableId);
      else onNavigateToTab('orders');
    },
    [onOrderPress, onNavigateToTab],
  );

  // KPI: jump straight into the order-details (bill) screen for the newest open order
  const openOrderDetails = useCallback(() => {
    const target = activeOrders.find(isOpenOrder) || activeOrders[0];
    if (target?.tableId && onOrderPress) onOrderPress(target.tableId);
    else onNavigateToTab('orders');
  }, [activeOrders, onOrderPress, onNavigateToTab]);

  const showNotifications = useCallback(() => {
    if (onShowNotifications) onShowNotifications();
    else onNavigateToTab('notifications');
  }, [onShowNotifications, onNavigateToTab]);

  const kpis: DashboardKpi[] = [
    {
      icon: 'table-furniture',
      color: COLORS.orange,
      value: String(tableStats.busyTableCount),
      label: 'Tables In Use',
      onPress: () => onNavigateToTab('home'),
    },
    {
      icon: 'receipt',
      color: COLORS.primary,
      value: String(activeOrderCount),
      label: 'Active Orders',
      onPress: () => onNavigateToTab('orders'),
    },
    {
      icon: 'cash',
      color: COLORS.green,
      value: formatMoney(todayPaidTotal),
      label: "Today's Bill",
    },
    {
      icon: 'clipboard-text-outline',
      color: COLORS.purple,
      value: 'View',
      label: 'Order Details',
      onPress: openOrderDetails,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.orange} colors={[COLORS.orange]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Hoverable style={styles.headerIconBtn} onPress={onShowDrawer} hoverOpacity={0.7}>
              <MaterialIcons name="menu" size={24} color={COLORS.primary} />
            </Hoverable>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'Waiter'}
              </Text>
              <View style={styles.headerBadges}>
                <View style={styles.roleBadge}>
                  <MaterialCommunityIcons name="account-check" size={11} color={COLORS.green} />
                  <Text style={styles.roleBadgeText}>{user?.role || 'WAITER'} ON DUTY</Text>
                </View>
                <View style={styles.clockBadge}>
                  <MaterialCommunityIcons name="clock-outline" size={11} color={COLORS.primary} />
                  <Text style={styles.clockBadgeText}>{timeLabel}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Hoverable style={styles.headerIconBtn} onPress={showNotifications} hoverOpacity={0.7}>
              <MaterialCommunityIcons name="bell-outline" size={22} color={COLORS.primary} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Hoverable>
            <Hoverable style={styles.headerIconBtn} onPress={onNavigateProfile} hoverOpacity={0.7}>
              <Image
                source={require('../../../assets/images/profile.jpg')}
                style={{ width: 28, height: 28, borderRadius: 14 }}
                resizeMode="contain"
              />
            </Hoverable>
          </View>
        </View>

        {/* KPI SUMMARY */}
        <KpiGrid kpis={kpis} />

        {/* TABLES — All / Free / Reserved tabs with table + order details */}
        <TableTabsCard
          tables={tables}
          activeOrders={activeOrders}
          getElapsed={getElapsedDiningTime}
          onOrderPress={openOrder}
          onChangeTableStatus={onChangeTableStatus}
          onSeeAll={() => onNavigateToTab('home')}
        />

        {/* TODAY'S SERVICE (extra — hidden for waiters) */}
        {!isWaiter && (
          <TodayServiceCard title="Cafe Today" stats={shiftStats} loading={extrasLoading} />
        )}

        {/* BILL REQUESTS — most urgent waiter action */}
        {billRequests.length > 0 && (
          <OrderActionList
            title="Bill Requests"
            icon="cash-register"
            color={COLORS.amber}
            orders={billRequests}
            getElapsed={getElapsedDiningTime}
            onOrderPress={openOrder}
            onViewAll={() => onNavigateToTab('orders')}
          />
        )}

        {/* READY TO SERVE — one-tap Mark Served */}
        {readyOrders.length > 0 && (
          <OrderActionList
            title="Ready to Serve"
            icon="food-variant"
            color={COLORS.green}
            orders={readyOrders}
            getElapsed={getElapsedDiningTime}
            onOrderPress={openOrder}
            rowAction={
              onOrderStatusChange
                ? { label: 'Serve', color: COLORS.green, onPress: handleServe }
                : undefined
            }
            busyOrderIds={servingIds}
            onViewAll={() => onNavigateToTab('orders')}
          />
        )}

        {/* NEEDS ATTENTION — pending / preparing */}
        {attentionOrders.length > 0 && (
          <OrderActionList
            title="In the Kitchen"
            icon="clock-alert"
            color={COLORS.orange}
            orders={attentionOrders}
            getElapsed={getElapsedDiningTime}
            onOrderPress={openOrder}
            onViewAll={() => onNavigateToTab('orders')}
          />
        )}

        {/* FLOOR PLAN (extra — hidden for waiters) */}
        {!isWaiter && (
          <FloorPlanGrid
            tables={tables}
            activeOrders={activeOrders}
            isWaiter={isWaiter}
            userId={user?.id}
            getElapsed={getElapsedDiningTime}
            onChangeTableStatus={onChangeTableStatus}
            onSeeAll={() => onNavigateToTab('home')}
          />
        )}

        {/* CAFE INSIGHTS / TOP SELLERS (extra — hidden for waiters) */}
        {!isWaiter && <InsightsCard data={analytics} loading={extrasLoading} />}

        {/* QUICK ACTIONS */}
        <SectionCard icon="lightning-bolt" iconColor={COLORS.purple} title="Quick Actions">
          <View style={styles.actionsGrid}>
            <Hoverable style={styles.actionBtn} onPress={() => onNavigateToTab('home')} hoverOpacity={0.7}>
              <View style={[styles.actionIconWrap, { backgroundColor: COLORS.orange + '18' }]}>
                <MaterialCommunityIcons name="table-plus" size={24} color={COLORS.orange} />
              </View>
              <Text style={styles.actionLabel}>{isWaiter ? 'My Tables' : 'Tables'}</Text>
            </Hoverable>
            <Hoverable style={styles.actionBtn} onPress={() => onNavigateToTab('orders')} hoverOpacity={0.7}>
              <View style={[styles.actionIconWrap, { backgroundColor: COLORS.primary + '18' }]}>
                <MaterialCommunityIcons name="receipt-text" size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.actionLabel}>Orders</Text>
            </Hoverable>
            <Hoverable style={styles.actionBtn} onPress={() => onNavigateToTab('menu')} hoverOpacity={0.7}>
              <View style={[styles.actionIconWrap, { backgroundColor: COLORS.green + '18' }]}>
                <MaterialCommunityIcons name="book-open-variant" size={24} color={COLORS.green} />
              </View>
              <Text style={styles.actionLabel}>Menu</Text>
            </Hoverable>
            {!isWaiter ? (
              <Hoverable style={styles.actionBtn} onPress={() => onNavigateToTab('kitchen')} hoverOpacity={0.7}>
                <View style={[styles.actionIconWrap, { backgroundColor: COLORS.teal + '18' }]}>
                  <MaterialCommunityIcons name="chef-hat" size={24} color={COLORS.teal} />
                </View>
                <Text style={styles.actionLabel}>Kitchen</Text>
              </Hoverable>
            ) : (
              <Hoverable style={styles.actionBtn} onPress={() => onNavigateToTab('history')} hoverOpacity={0.7}>
                <View style={[styles.actionIconWrap, { backgroundColor: COLORS.cyan + '18' }]}>
                  <MaterialCommunityIcons name="history" size={24} color={COLORS.cyan} />
                </View>
                <Text style={styles.actionLabel}>History</Text>
              </Hoverable>
            )}
          </View>
        </SectionCard>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                              SUB COMPONENTS                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                   STYLES                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.red,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.white,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '600',
    marginBottom: 2,
  },
  userName: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.green + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.green,
    letterSpacing: 0.4,
  },
  clockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  clockBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.4,
  },

  /* Quick actions */
  actionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
});
