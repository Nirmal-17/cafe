import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';

import { Hoverable } from '@/components/Hoverable';
import { Order, OrderItem, api } from '@/services/api';

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const BRAND_YELLOW = '#FFD600';
const BRAND_WHITE = '#FFFFFF';

const BG_DARK = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';

const BORDER_COLOR = '#CBD5E1';

const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

interface KitchenOrder {
  order: Order;
  kitchenItems: OrderItem[];
}

interface KitchenScreenProps {
  refreshing: boolean;
  onRefresh: () => void;
  activeOrders: Order[];
  onShowDrawer: () => void;
  onOrderStatusChange: (orderId: number, newStatus: string) => void;
}

export function KitchenScreen({
  refreshing,
  onRefresh,
  activeOrders,
  onShowDrawer,
  onOrderStatusChange,
}: KitchenScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY'>('ALL');
  const prevOrderStatusesRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    const newStatuses = new Map(activeOrders.map(o => [o.id, o.status]));
    for (const [id, newStatus] of newStatuses) {
      const prevStatus = prevOrderStatusesRef.current.get(id);
      if (prevStatus && prevStatus !== newStatus && newStatus !== 'PREPARING') {
        setStatusFilter(newStatus as typeof statusFilter);
        break;
      }
    }
    prevOrderStatusesRef.current = newStatuses;
  }, [activeOrders]);

  const resolveOrderTableName = useCallback(
    (order: Order): string => {
      const rawTableNumber = order.table?.tableNumber;
      if (
        typeof rawTableNumber === 'string' &&
        rawTableNumber.trim().length > 0
      ) {
        const normalized = rawTableNumber.trim();
        if (!normalized.toLowerCase().startsWith('table ')) {
          return normalized;
        }
      }
      return api.resolveTableName(Number(order.tableId));
    },
    []
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      setShowGoToTop(y > 650);
    },
    []
  );

  const handleGoToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: true });
  }, []);

  const isKitchenItem = useCallback((item: OrderItem): boolean => {
    const itemName = item.menuItem?.name || '';
    const categoryName = item.menuItem?.category?.name || '';
    return api.isKitchenItem(itemName, categoryName);
  }, []);

  const kitchenOrders = useMemo<KitchenOrder[]>(() => {
    const result: KitchenOrder[] = [];
    for (const order of activeOrders) {
      const items = Array.isArray(order.items) ? order.items : [];
      const kitchenItems = items.filter(isKitchenItem);
      if (kitchenItems.length > 0) {
        result.push({ order, kitchenItems });
      }
    }
    return result;
  }, [activeOrders, isKitchenItem]);

  const filteredKitchenOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return kitchenOrders
      .map(({ order, kitchenItems }) => {
        if (
          statusFilter !== 'ALL' &&
          order.status !== statusFilter
        ) {
          return null;
        }

        if (!query) {
          return { order, kitchenItems };
        }

        const tableName = resolveOrderTableName(order);
        const matchesTableName = tableName.toLowerCase().includes(query);
        const matchesOrderId = String(order.id).includes(query);

        return matchesTableName || matchesOrderId ? { order, kitchenItems } : null;
      })
      .filter((item): item is KitchenOrder => item !== null);
  }, [kitchenOrders, statusFilter, searchQuery, resolveOrderTableName]);

  const getStatusColors = useCallback((status: Order['status']) => {
    switch (status) {
      case 'PENDING':
        return { backgroundColor: '#FFF8E1', color: '#F59E0B' };
      case 'CONFIRMED':
        return { backgroundColor: '#E3F2FD', color: '#1976D2' };
      case 'PREPARING':
        return { backgroundColor: '#FFF3E0', color: '#FF6D00' };
      case 'READY':
        return { backgroundColor: '#E8F5E9', color: '#16A34A' };
      case 'SERVED':
        return { backgroundColor: '#E3F2FD', color: '#073F78' };
      case 'CANCELLED':
        return { backgroundColor: '#FFEBEE', color: '#D32F2F' };
      default:
        return { backgroundColor: '#F1F5F9', color: TEXT_MUTED };
    }
  }, []);

  const canMarkServed = useCallback((currentStatus: Order['status']): boolean => {
    return ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(currentStatus);
  }, []);

  const getKitchenItemTotal = useCallback((items: OrderItem[]): number => {
    return items.reduce((total, item) => {
      const price = Number(item.price ?? 0);
      const quantity = Number(item.quantity ?? 1);
      return total + price * quantity;
    }, 0);
  }, []);

  const getOrderTotal = useCallback((order: Order): number => {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length > 0) {
      return items.reduce((total, item) => {
        const price = Number(item.price ?? 0);
        const quantity = Number(item.quantity ?? 1);
        return total + price * quantity;
      }, 0);
    }
    return Number(order.totalAmount ?? 0);
  }, []);

  return (
    <View style={styles.tabContent}>
      <View style={styles.appHeader}>
        <View style={styles.headerLeft}>
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onShowDrawer}
            hoverOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <MaterialIcons name="menu" size={24} color={BRAND_PRIMARY} />
          </Hoverable>
          <Text style={styles.headerTitleText}>Kitchen Display</Text>
        </View>
        <View style={styles.headerRight}>
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onRefresh}
            hoverOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Refresh orders"
          >
            <MaterialIcons name="refresh" size={22} color={BRAND_PRIMARY} />
          </Hoverable>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBarWrapper}>
          <MaterialIcons name="search" size={22} color={TEXT_MUTED} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by table name or order ID..."
            placeholderTextColor={TEXT_MUTED}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <MaterialIcons name="cancel" size={20} color={TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {(['ALL', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY'] as const).map((status) => {
          const isActive = statusFilter === status;
          return (
            <Hoverable
              key={status}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setStatusFilter(status)}
              hoverOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[styles.chipText, isActive && styles.chipTextActive]}
              >
                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
              </Text>
            </Hoverable>
          );
        })}
      </ScrollView>

      <ScrollView
        ref={scrollViewRef}
        style={styles.bodyScroll}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BRAND_ORANGE}
            colors={[BRAND_ORANGE, BRAND_YELLOW]}
          />
        }
      >
        {filteredKitchenOrders.map(({ order, kitchenItems }) => {
          const statusColors = getStatusColors(order.status);
          const tableName = resolveOrderTableName(order);
          const kitchenTotal = getKitchenItemTotal(kitchenItems);
          const orderTotal = getOrderTotal(order);

          return (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderCardHeader}>
                <View style={styles.orderCardHeaderLeft}>
                  <MaterialCommunityIcons name="table-furniture" size={18} color={BRAND_PRIMARY} />
                  <Text style={styles.orderCardTableName}>{tableName}</Text>
                </View>
                <View
                  style={[
                    styles.orderStatusBadge,
                    { backgroundColor: statusColors.backgroundColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.orderStatusBadgeText,
                      { color: statusColors.color },
                    ]}
                  >
                    {order.status}
                  </Text>
                </View>
              </View>

              <View style={styles.orderCardBody}>
                {kitchenItems.map((item, index) => {
                  const itemName = item.menuItem?.name || api.resolveMenuItemName(Number(item.menuItemId ?? 0));
                  const quantity = Number(item.quantity ?? 1);
                  const itemPrice = Number(item.price ?? 0);

                  return (
                    <View key={item.id ?? `${order.id}-${index}`} style={styles.kitchenItemRow}>
                      <View style={styles.kitchenItemInfo}>
                        <Text style={styles.kitchenItemName} numberOfLines={1} ellipsizeMode="tail">
                          {itemName}
                          {quantity > 1 ? ` x${quantity}` : ''}
                        </Text>
                        <Text style={styles.kitchenItemPrice}>Rs. {(itemPrice * quantity).toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.orderCardDivider} />

              {canMarkServed(order.status) && (
                <View style={styles.orderCardStatusActions}>
                  <Hoverable
                    style={[styles.statusActionBtn, { backgroundColor: '#DCFCE7' }]}
                    onPress={() => onOrderStatusChange(order.id, 'SERVED')}
                    hoverOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Mark order as SERVED"
                  >
                    <Text style={[styles.statusActionBtnText, { color: '#16A34A' }]}>
                      Mark Served
                    </Text>
                  </Hoverable>
                </View>
              )}

              <View style={styles.orderCardFooter}>
                <View style={styles.orderCardTotals}>
                  <View>
                    <Text style={styles.orderCardTotalLabel}>Kitchen Total</Text>
                    <Text style={styles.orderCardTotalValue}>Rs. {kitchenTotal.toFixed(2)}</Text>
                  </View>
                  <View style={{ marginLeft: 16 }}>
                    <Text style={styles.orderCardTotalLabel}>Order Total</Text>
                    <Text style={[styles.orderCardTotalValue, { color: BRAND_PRIMARY }]}>Rs. {orderTotal.toFixed(2)}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {filteredKitchenOrders.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="pot-steam" size={48} color={TEXT_MUTED} />
            <Text style={styles.emptyStateText}>
              {searchQuery.length > 0
                ? 'No kitchen orders match your search'
                : 'No kitchen orders at the moment'}
            </Text>
            {searchQuery.length > 0 && (
              <Hoverable
                style={styles.clearSearchButton}
                onPress={() => setSearchQuery('')}
                hoverOpacity={0.8}
              >
                <Text style={styles.clearSearchButtonText}>Clear Search</Text>
              </Hoverable>
            )}
          </View>
        )}

        {refreshing && filteredKitchenOrders.length > 0 && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="small" color={BRAND_ORANGE} />
          </View>
        )}
      </ScrollView>

      {showGoToTop && (
        <Hoverable
          style={styles.goToTopBtn}
          onPress={handleGoToTop}
          hoverOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
        >
          <MaterialCommunityIcons name="chevron-up" size={26} color={BRAND_WHITE} />
        </Hoverable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  bodyScroll: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  bodyContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 100,
  },
  appHeader: {
    backgroundColor: BG_DARK,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleText: {
    marginLeft: 10,
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    backgroundColor: BG_SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  searchBarWrapper: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: TEXT_DARK,
    paddingVertical: 0,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: BG_DARK,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: BG_SURFACE,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: BRAND_ORANGE,
    borderColor: BRAND_ORANGE,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  chipTextActive: {
    color: BRAND_WHITE,
    fontWeight: '800',
  },
  orderCard: {
    backgroundColor: BG_SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderCardTableName: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  orderStatusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  orderCardBody: {
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  kitchenItemRow: {
    paddingVertical: 4,
  },
  kitchenItemInfo: {
    flex: 1,
  },
  kitchenItemName: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    lineHeight: 18,
  },
  kitchenItemPrice: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: '500',
  },
  orderCardDivider: {
    height: 1,
    backgroundColor: BORDER_COLOR,
    marginVertical: 6,
    width: '100%',
  },
  orderCardFooter: {
    paddingTop: 4,
  },
  orderCardTotals: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderCardTotalLabel: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: '600',
    marginBottom: 2,
  },
  orderCardTotalValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  orderCardStatusActions: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  statusActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 100,
    alignItems: 'center',
  },
  statusActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    color: TEXT_MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },
  clearSearchButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: BRAND_ORANGE,
  },
  clearSearchButtonText: {
    color: BRAND_WHITE,
    fontSize: 13,
    fontWeight: '700',
  },
  refreshIndicator: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  goToTopBtn: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
});