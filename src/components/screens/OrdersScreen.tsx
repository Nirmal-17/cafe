import React, {
  useCallback,
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
  useWindowDimensions,
} from 'react-native';

import {
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';

import { Hoverable } from '@/components/Hoverable';
import { showBottomToast } from '@/components/BottomToast';
import { Order, api } from '@/services/api';
import { webAlert } from '@/utils/webAlert';
import { useResponsive, getSpacing, getFontSize, getBorderRadius, getIconSize, moderateScale, getResponsiveValue, getGridGap, getCardPadding } from '@/utils/responsive';

// ─────────────────────────────────────────────
// Brand / semantic colors (Light Theme — matches Dashboard)
// ─────────────────────────────────────────────

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const BRAND_DARK_ORANGE = '#E65100';
const BRAND_YELLOW = '#FFD600';
const BRAND_BLACK = '#000000';
const BRAND_WHITE = '#FFFFFF';

const COLOR_SUCCESS = '#2E7D32';

const BG_DARK = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';

const BORDER_COLOR = '#CBD5E1';

const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type OrderStatus =
  | 'ALL'
  | 'SERVED';

interface OrdersScreenProps {
  refreshing: boolean;
  onRefresh: () => void;

  activeOrders: Order[];

  ordersSearchQuery: string;
  setOrdersSearchQuery: (query: string) => void;

  orderStatusFilter: OrderStatus;
  setOrderStatusFilter: (status: OrderStatus) => void;

  onShowDrawer: () => void;
  onOrderPress: (tableId: number) => void;
  onOrderStatusChange: (orderId: number, newStatus: string) => void;
}

interface TableSection {
  tableId: number;
  tableName: string;
  orders: Order[];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function OrdersScreen({
  refreshing,
  onRefresh,
  activeOrders,
  ordersSearchQuery,
  setOrdersSearchQuery,
  orderStatusFilter,
  setOrderStatusFilter,
  onShowDrawer,
  onOrderPress,
  onOrderStatusChange,
}: OrdersScreenProps) {
  const { breakpoint } = useResponsive();
  const scrollViewRef = useRef<ScrollView>(null);

  const [showGoToTop, setShowGoToTop] = useState(false);
  const [cancelActionId, setCancelActionId] = useState<number | null>(null);

  // ─────────────────────────────────────────────
  // Resolve table name
  // ─────────────────────────────────────────────

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

  // ─────────────────────────────────────────────
  // Scroll handling
  // ─────────────────────────────────────────────

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;

      setShowGoToTop(y > 650);
    },
    []
  );

  const handleGoToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({
      x: 0,
      y: 0,
      animated: true,
    });
  }, []);

  // ─────────────────────────────────────────────
  // Group orders by table (individual orders preserved)
  // ─────────────────────────────────────────────

  const tableSections = useMemo<TableSection[]>(() => {
    const tableMap = new Map<number, TableSection>();

    for (const order of activeOrders) {
      const tableId = Number(order.tableId);
      const tableName = resolveOrderTableName(order);

      const existing = tableMap.get(tableId);

      if (!existing) {
        tableMap.set(tableId, {
          tableId,
          tableName,
          orders: [order],
        });
      } else {
        existing.orders.push(order);
      }
    }

    return Array.from(tableMap.values()).sort(
      (a, b) => a.tableName.localeCompare(b.tableName)
    );
  }, [activeOrders, resolveOrderTableName]);

  // ─────────────────────────────────────────────
  // Filter orders
  // ─────────────────────────────────────────────

  const filteredTableSections = useMemo(() => {
    const query = ordersSearchQuery.trim().toLowerCase();

    return tableSections
      .map((section) => {
        const filteredOrders = section.orders.filter(
          (order) => {
            if (
              orderStatusFilter !== 'ALL' &&
              order.status !== orderStatusFilter
            ) {
              return false;
            }

            if (!query) {
              return true;
            }

            const matchesTableName = section.tableName
              .toLowerCase()
              .includes(query);

            const matchesOrderId = String(order.id).includes(
              query
            );

            return matchesTableName || matchesOrderId;
          }
        );

        return {
          ...section,
          orders: filteredOrders,
        };
      })
      .filter((section) => section.orders.length > 0);
  }, [tableSections, orderStatusFilter, ordersSearchQuery]);

  // ─────────────────────────────────────────────
  // Compute order total
  // ─────────────────────────────────────────────

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

  // ─────────────────────────────────────────────
  // Valid status transitions
  // ─────────────────────────────────────────────

  const getValidNextStatuses = useCallback((currentStatus: Order['status']): string[] => {
    switch (currentStatus) {
      case 'PENDING':
      case 'CONFIRMED':
      case 'PREPARING':
      case 'READY':
        return ['SERVED'];
      default:
        return [];
    }
  }, []);

  // ─────────────────────────────────────────────
  // Cancel order
  // ─────────────────────────────────────────────

  const confirmCancelOrder = useCallback(
    async (order: Order, reason: string) => {
      await webAlert(
        'Confirm Cancellation',
        `Cancel Order #${order.id}?\nReason: ${reason}\n\nAll ordered items will be discarded.`,
        [
          { text: 'Go Back', style: 'cancel' },
          {
            text: 'Yes, Cancel Order',
            style: 'destructive',
            onPress: async () => {
              setCancelActionId(order.id);
              try {
                const res = await api.cancelOrder(order.id, reason);
                if (!res.success) {
                  throw new Error(res.error || 'Failed to cancel the order');
                }
                showBottomToast({
                  title: `Order #${order.id} cancelled`,
                  tone: 'success',
                });
                await onRefresh();
              } catch (err: any) {
                await webAlert(
                  'Error',
                  err?.message || 'Failed to cancel the order. Please try again.'
                );
              } finally {
                setCancelActionId(null);
              }
            },
          },
        ]
      );
    },
    [onRefresh]
  );

  const handleCancelOrder = useCallback(
    (order: Order) => {
      webAlert(
        'Cancel Order',
        `Are you sure you want to cancel Order #${order.id}? This will remove all ordered items from history.`,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Customer Changed Mind',
            onPress: () => confirmCancelOrder(order, 'Customer changed mind'),
          },
          {
            text: 'Ordered by Mistake',
            onPress: () => confirmCancelOrder(order, 'Ordered by mistake'),
          },
          {
            text: 'Item Unavailable',
            onPress: () => confirmCancelOrder(order, 'Item unavailable'),
          },
          {
            text: 'Other Reason',
            style: 'destructive',
            onPress: () => confirmCancelOrder(order, 'Other'),
          },
        ]
      );
    },
    [confirmCancelOrder]
  );

  // ─────────────────────────────────────────────
  // Status colors
  // ─────────────────────────────────────────────

  const getStatusColors = useCallback((status: Order['status']) => {
    switch (status) {
      case 'PENDING':
        return {
          backgroundColor: '#FFF8E1',
          color: '#F59E0B',
        };

      case 'PREPARING':
        return {
          backgroundColor: '#FFF3E0',
          color: '#FF6D00',
        };

      case 'READY':
        return {
          backgroundColor: '#E8F5E9',
          color: '#16A34A',
        };

      case 'SERVED':
        return {
          backgroundColor: '#E3F2FD',
          color: '#073F78',
        };

      case 'CANCELLED':
        return {
          backgroundColor: '#FFEBEE',
          color: '#D32F2F',
        };

      default:
        return {
          backgroundColor: '#F1F5F9',
          color: TEXT_MUTED,
        };
    }
  }, []);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  const styles = createStyles({ breakpoint, width: 0, height: 0, isTablet: breakpoint === 'md' || breakpoint === 'lg' || breakpoint === 'xl', isDesktop: breakpoint === 'lg' || breakpoint === 'xl', isLandscape: false });

  return (
    <View style={styles.tabContent}>

      {/* Header */}
      <View style={styles.appHeader}>
        <View style={styles.headerLeft}>
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onShowDrawer}
            hoverOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <MaterialIcons
              name="menu"
              size={24}
              color={BRAND_PRIMARY}
            />
          </Hoverable>

          <Text style={styles.headerTitleText}>
            Order Details
          </Text>
        </View>

        <View style={styles.headerRight}>
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onRefresh}
            hoverOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Refresh orders"
          >
            <MaterialIcons
              name="refresh"
              size={22}
              color={BRAND_PRIMARY}
            />
          </Hoverable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBarWrapper}>
          <MaterialIcons
            name="search"
            size={22}
            color={TEXT_MUTED}
            style={styles.searchIcon}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Search by table name or order ID..."
            placeholderTextColor={TEXT_MUTED}
            value={ordersSearchQuery}
            onChangeText={setOrdersSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {ordersSearchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setOrdersSearchQuery('')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <MaterialIcons
                name="cancel"
                size={20}
                color={TEXT_MUTED}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {(
          [
            'ALL',
            'SERVED',
          ] as const
        ).map((status) => {
          const isActive =
            orderStatusFilter === status;

          return (
            <Hoverable
              key={status}
              style={[
                styles.chip,
                isActive && styles.chipActive,
              ]}
              onPress={() =>
                setOrderStatusFilter(status)
              }
              hoverOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{
                selected: isActive,
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  isActive && styles.chipTextActive,
                ]}
              >
                {status === 'ALL'
                  ? 'All'
                  : status.charAt(0) +
                    status.slice(1).toLowerCase()}
              </Text>
            </Hoverable>
          );
        })}
      </ScrollView>

      {/* Orders */}
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
        {/* Orders grouped by table */}
        {filteredTableSections.map((section) => (
          <View
            key={section.tableId}
            style={styles.tableSection}
          >
            {/* Table section header */}
            <View style={styles.tableSectionHeader}>
              <View style={styles.tableSectionHeaderLeft}>
                <MaterialCommunityIcons
                  name="table-furniture"
                  size={18}
                  color={BRAND_PRIMARY}
                />
                <Text style={styles.tableSectionTitle}>
                  {section.tableName}
                </Text>
              </View>
              <View style={styles.tableOrderCountBadge}>
                <Text style={styles.tableOrderCountText}>
                  {section.orders.length}{' '}
                  {section.orders.length === 1
                    ? 'order'
                    : 'orders'}
                </Text>
              </View>
            </View>

            {/* Individual orders for this table */}
            <View style={styles.tableOrdersList}>
              {section.orders.map((order) => {
                const statusColors = getStatusColors(
                  order.status
                );

                const items = Array.isArray(order.items)
                  ? order.items
                  : [];

                const orderTotal = getOrderTotal(order);

                const MAX_VISIBLE_ITEMS = 4;
                const visibleItems = items.slice(
                  0,
                  MAX_VISIBLE_ITEMS
                );
                const hiddenItemCount =
                  items.length - visibleItems.length;

                const showRequestBill =
                  order.status === 'SERVED' &&
                  order.paymentStatus !== 'PAID' &&
                  !order.billRequested;

                const showCancel =
                  order.status !== 'CANCELLED' &&
                  order.status !== 'COMPLETED' &&
                  order.paymentStatus !== 'PAID';

                return (
                  <Hoverable
                    key={order.id}
                    style={styles.orderCard}
                    hoverOpacity={0.85}
                    onPress={() =>
                      onOrderPress(section.tableId)
                    }
                    accessibilityRole={
                      getValidNextStatuses(order.status)
                        .length > 0
                        ? 'none'
                        : 'button'
                    }
                    accessibilityLabel={`Open order ${order.id}`}
                  >
                    {/* Order header: ID + status */}
                    <View style={styles.orderCardHeader}>
                      <Text style={styles.orderCardId}>
                        Order #{order.id}
                      </Text>
                      <View
                        style={[
                          styles.orderStatusBadge,
                          {
                            backgroundColor:
                              statusColors.backgroundColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.orderStatusBadgeText,
                            {
                              color: statusColors.color,
                            },
                          ]}
                        >
                          {order.status}
                        </Text>
                      </View>
                    </View>

                    {/* Items */}
                    <View style={styles.orderCardBody}>
                      {visibleItems.map((item, index) => {
                        const itemName =
                          item.menuItem?.name ||
                          api.resolveMenuItemName(
                            Number(item.menuItemId ?? 0)
                          );

                        const quantity = Number(
                          item.quantity ?? 1
                        );

                        const rate = Number(
                          item.price ?? 0
                        );

                        return (
                          <View
                            key={
                              item.id ??
                              `${order.id}-${index}`
                            }
                            style={styles.orderItemRow}
                          >
                            <Text
                              style={[
                                styles.orderItemText,
                                styles.orderItemName,
                              ]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {itemName}
                            </Text>

                            <Text
                              style={styles.orderItemQty}
                            >
                              Qty: {quantity}
                            </Text>

                            <Text
                              style={styles.orderItemRate}
                            >
                              Rs. {rate.toFixed(2)}
                            </Text>
                          </View>
                        );
                      })}

                      {hiddenItemCount > 0 && (
                        <Text style={styles.orderItemsMore}>
                          +{hiddenItemCount} more item
                          {hiddenItemCount > 1 ? 's' : ''}
                        </Text>
                      )}

                      {items.length === 0 && (
                        <Text
                          style={styles.orderItemText}
                        >
                          No items
                        </Text>
                      )}
                    </View>

                    {/* Divider */}
                    <View style={styles.orderCardDivider} />

                    {/* Status Actions */}
                    {(getValidNextStatuses(order.status).length > 0 ||
                      showRequestBill ||
                      showCancel) && (
                      <View style={styles.orderCardStatusActions}>
                        {showRequestBill && (
                          <Hoverable
                            style={[
                              styles.statusActionBtn,
                              { backgroundColor: '#E0E7FF' },
                            ]}
                            onPress={() =>
                              onOrderPress(section.tableId)
                            }
                            hoverOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Request bill for order ${order.id}`}
                          >
                            <Text
                              style={[
                                styles.statusActionBtnText,
                                { color: BRAND_PRIMARY },
                              ]}
                            >
                              Request Bill
                            </Text>
                          </Hoverable>
                        )}

                        {getValidNextStatuses(order.status).length > 0 && (
                          <Hoverable
                            style={[
                              styles.statusActionBtn,
                              { backgroundColor: '#DCFCE7' },
                            ]}
                            onPress={() => onOrderStatusChange(order.id, 'SERVED')}
                            hoverOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Mark order ${order.id} as served`}
                          >
                            <Text
                              style={[
                                styles.statusActionBtnText,
                                { color: COLOR_SUCCESS },
                              ]}
                            >
                              Mark Served
                            </Text>
                          </Hoverable>
                        )}

                        {showCancel && (
                          <Hoverable
                            style={[
                              styles.statusActionBtn,
                              { backgroundColor: '#FEE2E2' },
                              cancelActionId === order.id && styles.statusActionBtnDisabled,
                            ]}
                            onPress={() => handleCancelOrder(order)}
                            disabled={cancelActionId === order.id}
                            hoverOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Cancel order ${order.id}`}
                          >
                            {cancelActionId === order.id ? (
                              <ActivityIndicator
                                size="small"
                                color="#DC2626"
                              />
                            ) : (
                              <Text
                                style={[
                                  styles.statusActionBtnText,
                                  { color: '#DC2626' },
                                ]}
                              >
                                Cancel
                              </Text>
                            )}
                          </Hoverable>
                        )}
                      </View>
                    )}

                    {/* Footer */}
                    <View style={styles.orderCardFooter}>
                      <Text style={styles.orderCardTotal}>
                        Rs. {orderTotal.toFixed(2)}
                      </Text>
                    </View>
                  </Hoverable>
                );
              })}
            </View>
          </View>
        ))}

        {/* Empty state */}
        {filteredTableSections.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="receipt-text-outline"
              size={48}
              color={TEXT_MUTED}
            />

            <Text style={styles.emptyStateText}>
              No orders match your search
            </Text>

            {ordersSearchQuery.length > 0 && (
              <Hoverable
                style={styles.clearSearchButton}
                onPress={() =>
                  setOrdersSearchQuery('')
                }
                hoverOpacity={0.8}
              >
                <Text
                  style={
                    styles.clearSearchButtonText
                  }
                >
                  Clear Search
                </Text>
              </Hoverable>
            )}
          </View>
        )}

        {/* Loading indicator during refresh */}
        {refreshing && filteredTableSections.length > 0 && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator
              size="small"
              color={BRAND_ORANGE}
            />
          </View>
        )}
      </ScrollView>

      {/* Go to top */}
      {showGoToTop && (
        <Hoverable
          style={styles.goToTopBtn}
          onPress={handleGoToTop}
          hoverOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
        >
          <MaterialCommunityIcons
            name="chevron-up"
            size={26}
            color={BRAND_WHITE}
          />
        </Hoverable>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const createStyles = (bp: ReturnType<typeof useResponsive>) => StyleSheet.create({
  tabContent: {
    flex: 1,
    backgroundColor: BG_DARK,
  },

  bodyScroll: {
    flex: 1,
    backgroundColor: BG_DARK,
  },

  bodyContent: {
    paddingHorizontal: getSpacing(bp.breakpoint, 'sm'),
    paddingTop: getSpacing(bp.breakpoint, 'sm'),
    paddingBottom: getSpacing(bp.breakpoint, 'xxl'),
  },

  // Header
  appHeader: {
    backgroundColor: BG_DARK,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: getResponsiveValue({ xs: 48, sm: 50, md: 52, lg: 56, xl: 60 }, bp.breakpoint),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingVertical: getSpacing(bp.breakpoint, 'sm'),
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerTitleText: {
    marginLeft: getSpacing(bp.breakpoint, 'sm'),
    fontSize: getFontSize(bp.breakpoint, 'xl'),
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.1,
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerIconBtn: {
    width: getIconSize(bp.breakpoint, 'lg'),
    height: getIconSize(bp.breakpoint, 'lg'),
    borderRadius: getIconSize(bp.breakpoint, 'lg') / 2,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Search
  searchContainer: {
    backgroundColor: BG_SURFACE,
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingVertical: getSpacing(bp.breakpoint, 'md'),
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },

  searchBarWrapper: {
    height: getResponsiveValue({ xs: 40, sm: 42, md: 44, lg: 48, xl: 52 }, bp.breakpoint),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: getBorderRadius(bp.breakpoint, 'md'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },

  searchIcon: {
    marginRight: getSpacing(bp.breakpoint, 'sm'),
  },

  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: getFontSize(bp.breakpoint, 'md'),
    color: TEXT_DARK,
    paddingVertical: 0,
  },

  // Filters
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: BG_DARK,
  },

  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingVertical: getSpacing(bp.breakpoint, 'sm'),
    gap: getSpacing(bp.breakpoint, 'sm'),
  },

  chip: {
    height: getResponsiveValue({ xs: 34, sm: 36, md: 38, lg: 40, xl: 42 }, bp.breakpoint),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    borderRadius: getResponsiveValue({ xs: 17, sm: 18, md: 19, lg: 20, xl: 21 }, bp.breakpoint),
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
    fontSize: getFontSize(bp.breakpoint, 'sm'),
    fontWeight: '600',
    color: TEXT_MUTED,
  },

  chipTextActive: {
    color: BRAND_WHITE,
    fontWeight: '800',
  },

  // Table sections
  tableSection: {
    marginBottom: getSpacing(bp.breakpoint, 'md'),
  },

  tableSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND_PRIMARY,
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    paddingVertical: getSpacing(bp.breakpoint, 'sm'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    marginBottom: getSpacing(bp.breakpoint, 'sm'),
  },

  tableSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getSpacing(bp.breakpoint, 'sm'),
  },

  tableSectionTitle: {
    color: BRAND_WHITE,
    fontWeight: '800',
    fontSize: getFontSize(bp.breakpoint, 'lg'),
  },

  tableOrderCountBadge: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'sm'),
    paddingVertical: getSpacing(bp.breakpoint, 'xs'),
  },

  tableOrderCountText: {
    color: BRAND_WHITE,
    fontSize: getFontSize(bp.breakpoint, 'xs'),
    fontWeight: '700',
  },

  tableOrdersList: {
    gap: getSpacing(bp.breakpoint, 'sm'),
  },

  // Individual order card
  orderCard: {
    backgroundColor: BG_SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    padding: getCardPadding(bp.breakpoint),
  },

  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: getSpacing(bp.breakpoint, 'sm'),
  },

  orderCardId: {
    fontSize: getFontSize(bp.breakpoint, 'md'),
    fontWeight: '700',
    color: TEXT_DARK,
  },

  orderStatusBadge: {
    paddingHorizontal: getSpacing(bp.breakpoint, 'sm'),
    paddingVertical: getSpacing(bp.breakpoint, 'xs'),
    borderRadius: getBorderRadius(bp.breakpoint, 'xs'),
  },

  orderStatusBadgeText: {
    fontSize: getFontSize(bp.breakpoint, 'xs'),
    fontWeight: '900',
  },

  // Items
  orderCardBody: {
    paddingHorizontal: moderateScale(2, 0.5, bp.breakpoint),
    paddingBottom: getSpacing(bp.breakpoint, 'sm'),
  },

  orderItemText: {
    color: TEXT_DARK,
    fontSize: getFontSize(bp.breakpoint, 'sm'),
    fontWeight: '500',
    marginBottom: moderateScale(3, 0.5, bp.breakpoint),
    lineHeight: getResponsiveValue({ xs: 15, sm: 16, md: 17, lg: 18, xl: 19 }, bp.breakpoint),
  },

  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: getSpacing(bp.breakpoint, 'sm'),
    marginBottom: moderateScale(3, 0.5, bp.breakpoint),
    lineHeight: getResponsiveValue({ xs: 15, sm: 16, md: 17, lg: 18, xl: 19 }, bp.breakpoint),
  },

  orderItemName: {
    flex: 1,
    marginBottom: 0,
  },

  orderItemQty: {
    color: TEXT_MUTED,
    fontSize: getFontSize(bp.breakpoint, 'xs'),
    fontWeight: '700',
    backgroundColor: '#F1F5F9',
    borderRadius: getBorderRadius(bp.breakpoint, 'xs'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'xs'),
    paddingVertical: moderateScale(2, 0.5, bp.breakpoint),
    overflow: 'hidden',
  },

  orderItemRate: {
    color: BRAND_PRIMARY,
    fontSize: getFontSize(bp.breakpoint, 'sm'),
    fontWeight: '800',
    minWidth: moderateScale(72, 0.5, bp.breakpoint),
    textAlign: 'right',
  },

  orderItemsMore: {
    color: TEXT_MUTED,
    fontSize: getFontSize(bp.breakpoint, 'xs'),
    fontWeight: '700',
    marginTop: moderateScale(2, 0.5, bp.breakpoint),
    marginBottom: moderateScale(3, 0.5, bp.breakpoint),
  },

  // Divider
  orderCardDivider: {
    height: 1,
    backgroundColor: BORDER_COLOR,
    marginVertical: getSpacing(bp.breakpoint, 'sm'),
    width: '100%',
  },

  // Footer
  orderCardFooter: {
    alignItems: 'flex-end',
    paddingRight: moderateScale(2, 0.5, bp.breakpoint),
  },

  orderCardTotal: {
    color: BRAND_PRIMARY,
    fontWeight: '800',
    fontSize: getFontSize(bp.breakpoint, 'md'),
  },

  // Status actions
  orderCardStatusActions: {
    flexDirection: 'row',
    gap: getSpacing(bp.breakpoint, 'sm'),
    marginBottom: getSpacing(bp.breakpoint, 'sm'),
    flexWrap: 'wrap',
  },

  statusActionBtn: {
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingVertical: getSpacing(bp.breakpoint, 'sm'),
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    minWidth: moderateScale(80, 0.5, bp.breakpoint),
    alignItems: 'center',
  },

  statusActionBtnText: {
    fontSize: getFontSize(bp.breakpoint, 'xs'),
    fontWeight: '700',
    textAlign: 'center',
  },

  statusActionBtnDisabled: {
    opacity: 0.6,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: getSpacing(bp.breakpoint, 'xl'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
  },

  emptyStateText: {
    marginTop: getSpacing(bp.breakpoint, 'sm'),
    fontSize: getFontSize(bp.breakpoint, 'md'),
    color: TEXT_MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },

  clearSearchButton: {
    marginTop: getSpacing(bp.breakpoint, 'md'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingVertical: getSpacing(bp.breakpoint, 'sm'),
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    backgroundColor: BRAND_ORANGE,
  },

  clearSearchButtonText: {
    color: BRAND_WHITE,
    fontSize: getFontSize(bp.breakpoint, 'sm'),
    fontWeight: '700',
  },

  refreshIndicator: {
    paddingVertical: getSpacing(bp.breakpoint, 'md'),
    alignItems: 'center',
  },

  // Go to top
  goToTopBtn: {
    position: 'absolute',
    bottom: getSpacing(bp.breakpoint, 'xxl'),
    right: getSpacing(bp.breakpoint, 'md'),
    width: getIconSize(bp.breakpoint, 'xl'),
    height: getIconSize(bp.breakpoint, 'xl'),
    borderRadius: getIconSize(bp.breakpoint, 'xl') / 2,
    backgroundColor: BRAND_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',

    shadowColor: BRAND_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(8, 0.5, bp.breakpoint),
    shadowOffset: {
      width: 0,
      height: moderateScale(4, 0.5, bp.breakpoint),
    },

    elevation: 6,

    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
        }
      : {}),
  },
});
