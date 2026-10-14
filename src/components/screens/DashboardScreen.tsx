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
import { api, Order, Section, StaffUser, Table, isReservedTable } from '@/services/api';
import {
  DiningArea,
  filterTablesByDiningArea,
  getTablesByDiningArea,
  isIndoor,
  isOutdoor,
  getDiningAreaLabel,
  filterTablesByServiceType,
} from '@/utils/diningArea';
import { COLORS, formatMoney } from '@/components/dashboard/shared';
import { DashboardKpi, KpiGrid } from '@/components/dashboard/KpiGrid';
import { OrderActionList } from '@/components/dashboard/ActionQueue';
import { FloorPlanGrid } from '@/components/dashboard/FloorPlanGrid';
import { TableTabsCard } from '@/components/dashboard/TableTabsCard';
import { isOpenOrder } from '@/utils/openValue';
import { filterWaiterDashboardTables } from '@/utils/waiterTables';
import { isBillRequested } from '@/utils/billRequested';

interface DashboardScreenProps {
  user: StaffUser | null;
  tables: Table[];
  sections?: Section[];
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
  onSectionChange?: (sectionName: string) => void;
}

const EXTRAS_MIN_INTERVAL_MS = 45000;

// Section filter blocks: golden-orange fill when active/hovered,
// white block with dark-teal text when idle.
const SECTION_ACTIVE_FILL = '#C07F00';
const SECTION_INACTIVE_TEXT = '#0E5A6B';
const SECTION_INACTIVE_BORDER = '#D9E4E7';

export function DashboardScreen({
  user,
  tables,
  sections,
  activeOrders,
  refreshing,
  onRefresh,
  onNavigateToTab,
  onNavigateProfile,
  getElapsedDiningTime,
  onShowDrawer,
  isWaiter,
  onTablePress,
  onOrderPress,
  onOrderStatusChange,
  onChangeTableStatus,
  unreadCount = 0,
  onShowNotifications,
  onSectionChange,
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

  // ── Extra data: today's paid total for the KPI (own cadence, deduped) ──
  const [todayPaidTotal, setTodayPaidTotal] = useState(0);
  const lastExtrasAtRef = useRef(0);
  const todayPaidRef = useRef(todayPaidTotal);

  const loadExtras = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastExtrasAtRef.current < EXTRAS_MIN_INTERVAL_MS) return;
      lastExtrasAtRef.current = now;
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date();
      dayEnd.setHours(23, 59, 59, 999);

      const ordersRes = await api
        .getOrders({
          page: 1,
          limit: 500,
          dateFrom: dayStart.toISOString(),
          dateTo: dayEnd.toISOString(),
        })
        .catch(() => ({ success: false as const }));

      if (ordersRes.success && ordersRes.data) {
        const orders = ordersRes.data.orders;
        const baseUrl = api.getBaseUrl();
        const seen = new Set<number>();
        let revenue = 0;
        for (const o of orders) {
          const billed =
            o.paymentStatus === 'PAID' ||
            Boolean((o as { billRequested?: boolean }).billRequested) ||
            isBillRequested(o.id, baseUrl);
          if (!billed) continue;
          const id = Number(o.id);
          if (Number.isFinite(id)) {
            if (seen.has(id)) continue;
            seen.add(id);
          }
          revenue += Number(o.totalAmount || 0);
        }
        // Bill-requested rows still only in the live active list count too.
        for (const o of activeOrders) {
          const id = Number(o.id);
          if (!Number.isFinite(id) || seen.has(id)) continue;
          const billed =
            o.paymentStatus === 'PAID' ||
            Boolean((o as { billRequested?: boolean }).billRequested) ||
            isBillRequested(o.id, baseUrl);
          if (!billed) continue;
          seen.add(id);
          revenue += Number(o.totalAmount || 0);
        }
        todayPaidRef.current = revenue;
      }
    },
    [activeOrders],
  );

  useEffect(() => {
    loadExtras(true).then(() => setTodayPaidTotal(todayPaidRef.current));
  }, [loadExtras]);

  // Reload after a pull-to-refresh completes
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      loadExtras(true).then(() => setTodayPaidTotal(todayPaidRef.current));
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, loadExtras]);

  // Parent refetches activeOrders on event/poll/status changes — piggyback (throttled)
  useEffect(() => {
    loadExtras(false).then(() => setTodayPaidTotal(todayPaidRef.current));
  }, [activeOrders, loadExtras]);

  // ── Waiter dashboard shows ONLY the venue allowlist (IN 1-5, R 1-3,
  // C 1, Test 2 / Test Hall, G 1-4, P 1-2, Deluxe Room 1-5, Outdoor 01-06)
  // PLUS every Delivery (D1..D10, Del 1..3) + Takeaway (T1..T8, Take 1..4)
  // table, so the Delivery/Takeaway tabs never render empty.
  // Admin dashboard + My Tables keep the full server list.
  const displayTables = useMemo(
    () => (isWaiter ? filterWaiterDashboardTables(tables) : tables),
    [tables, isWaiter],
  );

  // ── System-wide derivations (every table / order, not just the current user's) ──
  // Reserve-only: tables are either Reserved or Free.
  const tableStats = useMemo(() => {
    const reserved = displayTables.filter((t) => isReservedTable(t)).length;
    const available = displayTables.length - reserved;
    return { reserved, available };
  }, [displayTables]);

  const activeOrderCount = activeOrders.length;

  const readyOrders = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'READY')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeOrders],
  );

  // ── Handlers ──
  const [servingIds, setServingIds] = useState<number[]>([]);

  const [activeSection, setActiveSection] = useState<'dine-in' | 'delivery' | 'takeaway'>('dine-in');
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  const sectionFilterOptions: { key: 'dine-in' | 'delivery' | 'takeaway'; label: string; icon: string }[] = [
    { key: 'dine-in', label: 'Dine In', icon: 'silverware-fork-knife' },
    { key: 'delivery', label: 'Delivery', icon: 'scooter' },
    { key: 'takeaway', label: 'Takeaway', icon: 'food-takeout-box' },
  ];

  const handleSectionChange = useCallback(
    (key: 'dine-in' | 'delivery' | 'takeaway') => {
      setActiveSection(key);
      onSectionChange?.(key);
    },
    [onSectionChange],
  );

  const filteredTables = useMemo(() => {
    // Strict service-type filter: Delivery shows ONLY delivery tables
    // (Del*/D*), Takeaway ONLY takeaway tables (Take*/T*). No fallback to
    // other tables — an empty result renders the empty state instead.
    return filterTablesByServiceType(displayTables, activeSection);
  }, [displayTables, activeSection]);

  const sectionLabels = useMemo(() => {
    const labels = new Set(displayTables.map((t) => t.section?.name).filter(Boolean));
    return Array.from(labels).sort();
  }, [displayTables]);

  // ── Handlers ──
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
      value: String(tableStats.reserved),
      label: 'Tables Reserved',
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

        {/* TABLE PICKER PROMPT */}
        <View style={styles.tablePromptWrap}>
          <Text style={styles.tablePromptText}>Please Choose Table for Ordering</Text>
        </View>

        {/* SECTION FILTER BUTTONS */}
        <View style={styles.sectionFilterBar}>
          {sectionFilterOptions.map((option) => {
            const isActive = activeSection === option.key;
            const isHovered = hoveredSection === option.key;
            const highlighted = isActive || isHovered;
            return (
              <Hoverable
                key={option.key}
                style={[
                  styles.sectionFilterBtn,
                  highlighted && styles.sectionFilterBtnActive,
                ]}
                hoverStyle={styles.sectionFilterBtnActive}
                onPress={() => handleSectionChange(option.key)}
                onHoverIn={() => setHoveredSection(option.key)}
                onHoverOut={() => setHoveredSection((cur) => (cur === option.key ? null : cur))}
                hoverOpacity={1}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <MaterialCommunityIcons
                  name={option.icon as any}
                  size={18}
                  color={highlighted ? COLORS.white : SECTION_INACTIVE_TEXT}
                />
                <Text
                  style={[
                    styles.sectionFilterBtnText,
                    highlighted && styles.sectionFilterBtnTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Hoverable>
            );
          })}
        </View>

        {/* TABLES — All / Free / Reserved tabs with table + order details */}
        <TableTabsCard
          tables={filteredTables}
          sections={sections}
          activeOrders={activeOrders}
          getElapsed={getElapsedDiningTime}
          onOrderPress={openOrder}
          onChangeTableStatus={onChangeTableStatus}
          onSeeAll={() => onNavigateToTab('home')}
          serviceType={activeSection}
        />

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

        {/* FLOOR PLAN — Dine-In only (ignores the Delivery/Takeaway tab):
            always the physical restaurant layout. Delivery/Takeaway ordering
            stays on the Tables card above. */}
        <FloorPlanGrid
          tables={displayTables}
          sections={sections}
          activeOrders={activeOrders}
          onChangeTableStatus={onChangeTableStatus}
          onSeeAll={() => onNavigateToTab('home')}
        />

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

  /* Section filter bar */
  tablePromptWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  tablePromptText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  sectionFilterBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    alignItems: 'center',
  },

  sectionFilterBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SECTION_INACTIVE_BORDER,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sectionFilterBtnActive: {
    backgroundColor: SECTION_ACTIVE_FILL,
    borderColor: SECTION_ACTIVE_FILL,
  },

  sectionFilterBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: SECTION_INACTIVE_TEXT,
  },
  sectionFilterBtnTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
});
