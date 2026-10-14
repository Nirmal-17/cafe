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
import { Order, api } from '@/services/api';
import { useResponsive, getSpacing, getFontSize, getBorderRadius, getIconSize, moderateScale, getResponsiveValue, getCardPadding } from '@/utils/responsive';

// ─────────────────────────────────────────────
// Brand / semantic colors (Light Theme — matches Dashboard)
// ─────────────────────────────────────────────

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const BRAND_DARK_ORANGE = '#E65100';
const BRAND_YELLOW = '#FFD600';
const BRAND_BLACK = '#000000';
const BRAND_WHITE = '#FFFFFF';

const BG_DARK = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';

const BORDER_COLOR = '#CBD5E1';

const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface OrdersScreenProps {
  refreshing: boolean;
  onRefresh: () => void;

  activeOrders: Order[];

  ordersSearchQuery: string;
  setOrdersSearchQuery: (query: string) => void;

  onShowDrawer: () => void;
  onOrderPress: (tableId: number) => void;
  onOrderStatusChange: (orderId: number, newStatus: string) => void;
  onBookTable: () => void;
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
  onShowDrawer,
  onOrderPress,
  onOrderStatusChange,
  onBookTable,
}: OrdersScreenProps) {
  const { breakpoint } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);

  const [showGoToTop, setShowGoToTop] = useState(false);

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
            if (!query) {
              return true;
            }

            return section.tableName
              .toLowerCase()
              .includes(query);
          }
        );

        return {
          ...section,
          orders: filteredOrders,
        };
      })
      .filter((section) => section.orders.length > 0);
  }, [tableSections, ordersSearchQuery]);

  // ─────────────────────────────────────────────
  // Aggregate a table's orders into one tab-card: merged item names + total
  // ─────────────────────────────────────────────

  const getTableCardData = useCallback((section: TableSection): { lines: { name: string; qty: number }[]; total: number } => {
    const merged = new Map<string, { name: string; qty: number }>();
    let total = 0;

    for (const order of section.orders) {
      const items = Array.isArray(order.items) ? order.items : [];
      if (items.length > 0) {
        for (const item of items) {
          const name =
            item.menuItem?.name ||
            api.resolveMenuItemName(Number(item.menuItemId ?? 0));
          const qty = Number(item.quantity ?? 1);
          total += Number(item.price ?? 0) * qty;
          const key = name.trim().toLowerCase();
          const prev = merged.get(key);
          if (prev) {
            prev.qty += qty;
          } else {
            merged.set(key, { name, qty });
          }
        }
      } else {
        total += Number(order.totalAmount ?? 0);
      }
    }

    return { lines: Array.from(merged.values()), total };
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

      {/* Search, filters, CTA and orders all scroll together */}
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
              placeholder="Search by table name..."
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

        {/* Book table for ordering */}
        <View style={styles.bookTableRow}>
          <Hoverable
            style={styles.bookTableButton}
            onPress={onBookTable}
            hoverOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Book table for ordering"
          >
            <MaterialIcons
              name="event-seat"
              size={18}
              color={BRAND_WHITE}
            />
            <Text style={styles.bookTableButtonText}>
              Book table for ordering
            </Text>
          </Hoverable>
        </View>

        {/* Orders — one tab-card per table (tap opens full details) */}
        <View style={styles.ordersWrap}>
        <View style={styles.tabGrid}>
        {filteredTableSections.map((section) => {
          const { lines, total } = getTableCardData(section);
          const MAX_VISIBLE_LINES = 4;
          const visibleLines = lines.slice(0, MAX_VISIBLE_LINES);
          const hiddenCount = lines.length - visibleLines.length;

          return (
            <Hoverable
              key={section.tableId}
              style={[
                styles.tabCard,
                { width: windowWidth >= 1024 ? '23.5%' : windowWidth >= 768 ? '31.5%' : '48%' },
              ]}
              hoverOpacity={0.85}
              onPress={() => onOrderPress(section.tableId)}
              accessibilityRole="button"
              accessibilityLabel={`Open orders for ${section.tableName}`}
            >
              {/* Table header pill */}
              <View style={styles.tabCardHeader}>
                <Text style={styles.tabCardHeaderText} numberOfLines={1}>
                  {section.tableName}
                </Text>
              </View>

              {/* Item names */}
              <View style={styles.tabCardBody}>
                {visibleLines.map((line, index) => (
                  <Text
                    key={`${section.tableId}-${index}`}
                    style={styles.orderItemText}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {line.name}
                    {line.qty > 1 ? `  x${line.qty}` : ''}
                  </Text>
                ))}

                {hiddenCount > 0 && (
                  <Text style={styles.orderItemsMore}>
                    +{hiddenCount} more item
                    {hiddenCount > 1 ? 's' : ''}
                  </Text>
                )}

                {lines.length === 0 && (
                  <Text style={styles.orderItemText}>
                    No items
                  </Text>
                )}
              </View>

              {/* Divider */}
              <View style={styles.orderCardDivider} />

              {/* Footer */}
              <View style={styles.tabCardFooter}>
                <Text style={styles.orderCardTotal}>
                  Total: Rs. {total.toFixed(2)}
                </Text>
              </View>
            </Hoverable>
          );
        })}
        </View>

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
        </View>
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
    paddingBottom: getSpacing(bp.breakpoint, 'xxl'),
  },

  ordersWrap: {
    paddingHorizontal: getSpacing(bp.breakpoint, 'sm'),
    marginTop: getSpacing(bp.breakpoint, 'sm'),
  },

  // Tab-card grid (one card per table — tap opens full details)
  tabGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: getSpacing(bp.breakpoint, 'sm'),
  },

  tabCard: {
    backgroundColor: BG_SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    padding: getCardPadding(bp.breakpoint),
    marginBottom: getSpacing(bp.breakpoint, 'sm'),
  },

  tabCardHeader: {
    backgroundColor: BRAND_PRIMARY,
    borderRadius: getBorderRadius(bp.breakpoint, 'xs'),
    paddingVertical: getSpacing(bp.breakpoint, 'xs'),
    paddingHorizontal: getSpacing(bp.breakpoint, 'sm'),
    alignItems: 'center',
    marginBottom: getSpacing(bp.breakpoint, 'sm'),
  },

  tabCardHeaderText: {
    color: BRAND_WHITE,
    fontWeight: '800',
    fontSize: getFontSize(bp.breakpoint, 'lg'),
  },

  tabCardBody: {
    paddingHorizontal: moderateScale(2, 0.5, bp.breakpoint),
    minHeight: moderateScale(110, 0.5, bp.breakpoint),
  },

  tabCardFooter: {
    alignItems: 'flex-end',
    paddingRight: moderateScale(2, 0.5, bp.breakpoint),
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

  // Book table CTA
  bookTableRow: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: getSpacing(bp.breakpoint, 'md'),
    paddingBottom: getSpacing(bp.breakpoint, 'sm'),
    backgroundColor: BG_DARK,
  },

  bookTableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: getSpacing(bp.breakpoint, 'sm'),
    height: getResponsiveValue({ xs: 38, sm: 40, md: 42, lg: 44, xl: 46 }, bp.breakpoint),
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'),
    backgroundColor: BRAND_ORANGE,
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
        }
      : {}),
  },

  bookTableButtonText: {
    color: BRAND_WHITE,
    fontSize: getFontSize(bp.breakpoint, 'sm'),
    fontWeight: '700',
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
