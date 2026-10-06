import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import {
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';

import { Hoverable } from '@/components/Hoverable';
import { showBottomToast } from '@/components/BottomToast';
import {
  Table,
  Section,
  Order,
  StaffUser,
} from '@/services/api';

import {
  useResponsive,
  getBreakpoint,
  getSpacing,
  getFontSize,
  getBorderRadius,
  getGridGap,
  getCardPadding,
  getIconSize,
  moderateScale,
  getResponsiveValue,
} from '@/utils/responsive';

// ============================================================
// COLORS
// ============================================================

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const BRAND_YELLOW = '#FFD600';
const BRAND_WHITE = '#FFFFFF';

const COLOR_ERROR = '#D32F2F';
const COLOR_MUTED = '#6B7280';
const COLOR_BOOKED = '#7C3AED';

const BG_LIGHT = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';

const BORDER_COLOR = '#CBD5E1';

const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

// ============================================================
// TYPES
// ============================================================

interface MyTableScreenProps {
  refreshing: boolean;
  onRefresh: () => void;

  homeError: string;

  tables: Table[];
  sections: Section[];

  activeSectionId: number | null;
  setActiveSectionId: (id: number | null) => void;

  tableSearchQuery: string;
  setTableSearchQuery: (query: string) => void;

  getElapsedDiningTime: (tableId: number) => string;

  activeOrders: Order[];

  homeLoading: boolean;

  onTablePress: (table: Table) => void;
  onChangeTableStatus: (tableId: number, status: string) => Promise<boolean>;
  onOrderDetailsPress: () => void;

  onShowDrawer: () => void;
  onShowNotifications: () => void;
  onNavigateProfile: () => void;

  unreadCount: number;

  user?: StaffUser | null;
}

// ============================================================
// COMPONENT
// ============================================================

export function MyTableScreen({
  refreshing,
  onRefresh,
  homeError,

  tables,
  sections,

  activeSectionId,
  setActiveSectionId,

  tableSearchQuery,
  setTableSearchQuery,

  getElapsedDiningTime,

  activeOrders,

  homeLoading,

  onTablePress,
  onChangeTableStatus,
  onOrderDetailsPress,

  onShowDrawer,
  onShowNotifications,
  onNavigateProfile,

  unreadCount,

  user,
}: MyTableScreenProps) {
  const { width: windowWidth } = useResponsive();

  const breakpoint = getBreakpoint(windowWidth);

  // ----------------------------------------------------------
  // SCROLL
  // ----------------------------------------------------------

  const scrollViewRef = useRef<ScrollView>(null);

  const [showGoToTop, setShowGoToTop] = useState(false);

  // ----------------------------------------------------------
  // BOOKING (direct reserve — no customer details form)
  // ----------------------------------------------------------

  // Per-table busy id: only the pressed button locks, and the parent applies
  // the status change optimistically so the card repaints on the next frame.
  const [bookingTableId, setBookingTableId] = useState<number | null>(null);
  // Status a table had before being booked (CLEANING tables restored on cancel)
  const preBookStatusRef = useRef<Map<number, string>>(new Map());

  const handleBookTable = useCallback(async (table: Table) => {
    if (bookingTableId != null) return;
    setBookingTableId(table.id);
    try {
      const ok = await onChangeTableStatus(table.id, 'RESERVED');
      if (ok) {
        preBookStatusRef.current.set(table.id, String(table.status).toUpperCase());
        showBottomToast({ title: `Table ${table.tableNumber} reserved`, tone: 'success' });
      }
    } finally {
      setBookingTableId(null);
    }
  }, [bookingTableId, onChangeTableStatus]);

  const handleCancelBooking = useCallback(async (table: Table) => {
    if (bookingTableId != null) return;
    setBookingTableId(table.id);
    try {
      const restoreStatus = preBookStatusRef.current.get(table.id) ?? 'AVAILABLE';
      const ok = await onChangeTableStatus(table.id, restoreStatus);
      if (ok) {
        preBookStatusRef.current.delete(table.id);
        showBottomToast({ title: `Booking cancelled for table ${table.tableNumber}`, tone: 'info' });
      }
    } finally {
      setBookingTableId(null);
    }
  }, [bookingTableId, onChangeTableStatus]);

  const handleScroll = useCallback((event: any) => {
    const y = event.nativeEvent.contentOffset.y;

    setShowGoToTop(y > 650);
  }, []);

  const handleGoToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({
      x: 0,
      y: 0,
      animated: true,
    });
  }, []);

  // ----------------------------------------------------------
  // USER ROLE
  // ----------------------------------------------------------

  const isWaiter = user?.role === 'WAITER';

  // ----------------------------------------------------------
  // FILTERED TABLES
  // ----------------------------------------------------------

  // Search + waiter visibility (section filter NOT applied yet) — shared by the
  // grid and the section counts so a chip's number always matches its cards.
  const visibleTables = useMemo(() => {
    const search = tableSearchQuery.trim().toLowerCase();

    return tables.filter((table) => {
      // Search filter
      const tableName = String(
        table.tableNumber ??
          (table as any).name ??
          (table as any).number ??
          ''
      );

      if (search && !tableName.toLowerCase().includes(search)) {
        return false;
      }

      // Waiter filter
      if (isWaiter) {
        const status = String(table.status).toUpperCase();

        const isAvailable =
          status === 'AVAILABLE' ||
          status === 'RESERVED';

        const waiterId = table.activeSession?.waiterId;

        const isMyTable =
          waiterId !== null &&
          waiterId !== undefined &&
          String(waiterId) === String(user?.id);

        // Busy tables nobody is serving (e.g. stuck in PENDING_BILL with no
        // open session) must stay visible — someone has to clear them.
        const isUnassigned = !table.activeSession;

        return isAvailable || isMyTable || isUnassigned;
      }

      return true;
    });
  }, [tables, tableSearchQuery, isWaiter, user?.id]);

  const filteredTables = useMemo(() => {
    const result = visibleTables
      .filter((table) => {
        // Section filter
        if (
          activeSectionId !== null &&
          String(table.sectionId) !== String(activeSectionId)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const getPriority = (table: Table) => {
          const status = String(table.status).toUpperCase();

          if (
            status === 'UNAVAILABLE' ||
            status === 'PACKED' ||
            status === 'OUT_OF_SERVICE'
          ) {
            return 4;
          }

          if (
            status === 'RESERVED' ||
            table.is_reserved === true
          ) {
            return 3;
          }

          if (
            status === 'OCCUPIED' ||
            status === 'PENDING_BILL'
          ) {
            return 2;
          }

          return 1;
        };

        return getPriority(a) - getPriority(b);
      });

    return result;
  }, [visibleTables, activeSectionId]);

  // ----------------------------------------------------------
  // ORDER LOOKUP
  // ----------------------------------------------------------

  const ordersByTable = useMemo(() => {
    const map = new Map<
      number,
      {
        count: number;
        hasUnpaidBill: boolean;
      }
    >();

    activeOrders.forEach((order) => {
      const tableId = order.tableId;

      if (tableId === null || tableId === undefined) {
        return;
      }

      const current = map.get(tableId) ?? {
        count: 0,
        hasUnpaidBill: false,
      };

      current.count += 1;

      if (order.paymentStatus === 'UNPAID') {
        current.hasUnpaidBill = true;
      }

      map.set(tableId, current);
    });

    return map;
  }, [activeOrders]);

  // ----------------------------------------------------------
  // DYNAMIC STYLES
  // ----------------------------------------------------------

  const styles = useMemo(
    () =>
      createStyles(breakpoint),
    [breakpoint]
  );

  // ----------------------------------------------------------
  // SECTION COUNTS
  // ----------------------------------------------------------

  const getSectionCount = useCallback(
    (sectionId: number) => {
      return visibleTables.filter(
        (table) => String(table.sectionId) === String(sectionId)
      ).length;
    },
    [visibleTables]
  );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <View style={styles.tabContent}>
      {/* ====================================================
          HEADER
      ==================================================== */}

      <View style={styles.appHeader}>
        <View style={styles.headerLeft}>
          <Hoverable
            style={[
              styles.headerIconBtn,
              styles.menuButton,
            ]}
            onPress={onShowDrawer}
            hoverOpacity={0.7}
          >
            <MaterialIcons
              name="menu"
              size={24}
              color={BRAND_WHITE}
            />
          </Hoverable>
        </View>

        <View style={styles.headerRight}>
          {/* Refresh — web equivalent of Android pull-to-refresh (mouse can't pull) */}
          {Platform.OS === 'web' && (
            <Hoverable
              style={styles.headerIconBtn}
              onPress={refreshing ? undefined : onRefresh}
              disabled={refreshing}
              hoverOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Refresh tables and orders"
            >
              <MaterialIcons
                name="refresh"
                size={20}
                color={BRAND_WHITE}
              />
            </Hoverable>
          )}

          {/* Notifications */}
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onShowNotifications}
            hoverOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="bell-outline"
              size={22}
              color={BRAND_WHITE}
            />

            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Hoverable>

          {/* Profile */}
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onNavigateProfile}
            hoverOpacity={0.7}
          >
            <Image
              source={require('../../../assets/images/profile.jpg')}
              style={styles.profileImage}
              resizeMode="contain"
            />
          </Hoverable>
        </View>
      </View>

      {/* ====================================================
          CONTENT
      ==================================================== */}

      <ScrollView
        ref={scrollViewRef}
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[BRAND_ORANGE, BRAND_YELLOW]}
            tintColor={BRAND_ORANGE}
          />
        }
      >
        {/* Error */}
        {homeError ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={20}
              color={COLOR_ERROR}
            />

            <Text style={styles.errorBoxText}>
              {homeError}
            </Text>
          </View>
        ) : null}

        {/* ==================================================
            TITLE
        ================================================== */}

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>
            {isWaiter ? 'My Tables' : 'All Tables'}
          </Text>

          <Text style={styles.sectionCount}>
            {filteredTables.length}{' '}
            {filteredTables.length === 1 ? 'Table' : 'Tables'}
          </Text>
        </View>

        {/* ==================================================
            ORDER DETAILS BUTTON (above search)
        ================================================== */}

        <Hoverable
          style={styles.orderDetailsBtn}
          onPress={onOrderDetailsPress}
          hoverOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open order details"
        >
          <MaterialIcons
            name="receipt-long"
            size={22}
            color={BRAND_WHITE}
          />

          <Text style={styles.orderDetailsBtnText}>
            Order Details
          </Text>
        </Hoverable>

        {/* ==================================================
            SEARCH
        ================================================== */}

        <View style={styles.searchBarContainer}>
          <MaterialIcons
            name="search"
            size={20}
            color={TEXT_MUTED}
          />

          <TextInput
            style={styles.searchBarInput}
            placeholder="Search tables..."
            placeholderTextColor={TEXT_MUTED}
            value={tableSearchQuery}
            onChangeText={setTableSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {/* ==================================================
            SECTION FILTERS
        ================================================== */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.chipsRow}
        >
          {/* All */}
          <Hoverable
            style={[
              styles.chip,
              activeSectionId === null &&
                styles.chipActive,
            ]}
            onPress={() => setActiveSectionId(null)}
            hoverOpacity={0.8}
          >
            <Text
              style={[
                styles.chipText,
                activeSectionId === null &&
                  styles.chipTextActive,
              ]}
            >
              All ({visibleTables.length})
            </Text>
          </Hoverable>

          {/* Sections */}
          {sections.map((section) => {
            const isActive =
              section.id === activeSectionId;

            return (
              <Hoverable
                key={section.id}
                style={[
                  styles.chip,
                  isActive && styles.chipActive,
                ]}
                onPress={() =>
                  setActiveSectionId(section.id)
                }
                hoverOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    isActive && styles.chipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {section.name} ({getSectionCount(section.id)})
                </Text>
              </Hoverable>
            );
          })}
        </ScrollView>

        {/* ==================================================
            TABLE GRID
        ================================================== */}

        <View style={styles.tablesGrid}>
          {filteredTables.map((table) => {
            const status = String(
              table.status
            ).toUpperCase();

            const isReserved =
              status === 'RESERVED' ||
              table.is_reserved === true;

            const isOccupied =
              status === 'OCCUPIED' ||
              status === 'PENDING_BILL';

            const orderInfo =
              ordersByTable.get(table.id);

            const orderCount =
              orderInfo?.count ?? 0;

            const hasUnpaidBill =
              orderInfo?.hasUnpaidBill ?? false;

            const canToggleBooked =
              status === 'AVAILABLE' ||
              status === 'RESERVED' ||
              status === 'CLEANING';

            return (
              <View
                key={table.id}
                style={styles.tableWrapper}
              >
                {/* ==================================================
                    TABLE CARD
                ================================================== */}

                <TouchableOpacity
                  style={[
                    styles.tableCard,
                    isReserved || isOccupied
                      ? styles.tableCardReserved
                      : styles.tableCardAvailable,
                  ]}
                  activeOpacity={0.85}
                  onPress={() =>
                    onTablePress(table)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${table.tableNumber}`}
                >
                  {/* Top row */}
                  <View
                    style={styles.tableCardTopRow}
                  >
                    {/* Order badge */}
                    {orderCount > 0 ? (
                      <View
                        style={styles.orderCountBadge}
                      >
                        <Text
                          style={
                            styles.orderCountBadgeText
                          }
                        >
                          {orderCount}
                        </Text>
                      </View>
                    ) : (
                      <View />
                    )}

                    {/* Right actions */}
                    <View
                      style={styles.tableCardActions}
                    >
                      {/* Unpaid bill */}
                      {hasUnpaidBill && (
                        <View
                          style={
                            styles.unpaidBillIndicator
                          }
                        >
                          <MaterialCommunityIcons
                            name="receipt-text-outline"
                            size={10}
                            color="#D97706"
                          />

                          <Text
                            style={
                              styles.unpaidBillText
                            }
                          >
                            Bill
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Table number */}
                  <Text
                    style={[
                      styles.tableCardText,
                      isReserved || isOccupied
                        ? styles.tableCardTextBooked
                        : null,
                    ]}
                    numberOfLines={1}
                  >
                    {table.tableNumber}
                  </Text>

                  {/* Meta information */}
                  <View
                    style={styles.tableCardMeta}
                  >
                    {isOccupied ? (
                      <>
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={11}
                          color={BRAND_WHITE}
                        />

                        <Text
                          style={[
                            styles.tableCardMetaText,
                            styles.lightMetaText,
                          ]}
                        >
                          {getElapsedDiningTime(
                            table.id
                          )}
                        </Text>
                      </>
                    ) : isReserved ? (
                      <View
                        style={
                          styles.reservedMeta
                        }
                      >
                        <MaterialCommunityIcons
                          name="bookmark"
                          size={11}
                          color={BRAND_WHITE}
                        />

                        <Text
                          style={
                            styles.reservedMetaText
                          }
                        >
                          Booked · {table.capacity}{' '}
                          seats
                        </Text>
                      </View>
                    ) : status === 'CLEANING' ? (
                      <View
                        style={
                          styles.reservedMeta
                        }
                      >
                        <MaterialCommunityIcons
                          name="broom"
                          size={11}
                          color={COLOR_MUTED}
                        />

                        <Text
                          style={
                            styles.tableCardMetaText
                          }
                        >
                          Cleaning · {table.capacity}{' '}
                          seats
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={
                          styles.reservedMeta
                        }
                      >
                        <MaterialCommunityIcons
                          name="account-multiple-outline"
                          size={11}
                          color={COLOR_MUTED}
                        />

                        <Text
                          style={
                            styles.tableCardMetaText
                          }
                        >
                          {table.capacity} seats
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {/* ==================================================
                    BOOK / CANCEL BUTTON

                    Kept outside TouchableOpacity to prevent
                    nested press handling.
                ================================================== */}

                {canToggleBooked && (
                  <Hoverable
                    style={[
                      styles.bookedToggle,
                      isReserved && styles.bookedToggleActive,
                    ]}
                    onPress={() =>
                      isReserved
                        ? handleCancelBooking(table)
                        : handleBookTable(table)
                    }
                    disabled={bookingTableId !== null}
                    hoverOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isReserved
                        ? `Cancel booking for table ${table.tableNumber}`
                        : `Book table ${table.tableNumber}`
                    }
                  >
                    <MaterialCommunityIcons
                      name={
                        isReserved ? 'bookmark-remove-outline' : 'bookmark-plus-outline'
                      }
                      size={11}
                      color={
                        isReserved ? COLOR_ERROR : COLOR_BOOKED
                      }
                    />

                    <Text
                      style={[
                        styles.bookedToggleText,
                        isReserved && styles.bookedToggleTextActive,
                      ]}
                    >
                      {isReserved ? 'Cancel' : 'Book'}
                    </Text>
                  </Hoverable>
                )}
              </View>
            );
          })}
        </View>

        {/* ==================================================
            EMPTY STATE
        ================================================== */}

        {filteredTables.length === 0 &&
          !homeLoading && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="table-furniture"
                size={48}
                color={TEXT_MUTED}
              />

              <Text style={styles.emptyStateText}>
                {tableSearchQuery.trim()
                  ? 'No tables match your search'
                  : 'No tables found in this section'}
              </Text>
            </View>
          )}

        {/* Loading state */}
        {homeLoading &&
          filteredTables.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="loading"
                size={32}
                color={BRAND_ORANGE}
              />

              <Text style={styles.emptyStateText}>
                Loading tables...
              </Text>
            </View>
          )}
      </ScrollView>

      {/* ======================================================
          GO TO TOP
      ====================================================== */}

      {showGoToTop && (
        <Hoverable
          style={styles.goToTopBtn}
          onPress={handleGoToTop}
          hoverOpacity={0.85}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
        >
          <MaterialCommunityIcons
            name="chevron-up"
            size={24}
            color={BRAND_WHITE}
          />
        </Hoverable>
      )}
    </View>
  );
}

// ============================================================
// RESPONSIVE STYLES
// ============================================================

function createStyles(breakpoint: any) {
  return StyleSheet.create({
    // --------------------------------------------------------
    // MAIN
    // --------------------------------------------------------

    tabContent: {
      flex: 1,
      backgroundColor: BG_LIGHT,
      width: '100%',
    },

    bodyScroll: {
      flex: 1,
      backgroundColor: BG_LIGHT,
    },

    bodyContent: {
      paddingHorizontal: getSpacing(
        breakpoint,
        'md'
      ),
      paddingTop: getSpacing(
        breakpoint,
        'md'
      ),
      paddingBottom: getSpacing(
        breakpoint,
        'xxl'
      ),
    },

    // --------------------------------------------------------
    // HEADER
    // --------------------------------------------------------

    appHeader: {
      backgroundColor: BRAND_PRIMARY,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',

      paddingHorizontal: getSpacing(
        breakpoint,
        'md'
      ),

      minHeight: getResponsiveValue(
        {
          xs: 48,
          sm: 50,
          md: 52,
          lg: 56,
          xl: 60,
        },
        breakpoint
      ),

      paddingVertical: getSpacing(
        breakpoint,
        'sm'
      ),

      borderBottomWidth: 2,
      borderBottomColor: BRAND_ORANGE,
    },

    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    headerRight: {
      flexDirection: 'row',
      gap: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    menuButton: {
      marginRight: 10,
    },

    headerIconBtn: {
      width: getIconSize(
        breakpoint,
        'lg'
      ),

      height: getIconSize(
        breakpoint,
        'lg'
      ),

      borderRadius:
        getIconSize(
          breakpoint,
          'lg'
        ) / 2,

      backgroundColor:
        'rgba(255,255,255,0.15)',

      justifyContent: 'center',
      alignItems: 'center',

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'opacity 0.15s ease' as any,
          }
        : {}),
    },

    profileImage: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },

    notifBadge: {
      position: 'absolute',

      top: moderateScale(
        3,
        0.5,
        breakpoint
      ),

      right: moderateScale(
        3,
        0.5,
        breakpoint
      ),

      backgroundColor: BRAND_ORANGE,

      borderRadius: moderateScale(
        6,
        0.5,
        breakpoint
      ),

      minWidth: moderateScale(
        12,
        0.5,
        breakpoint
      ),

      height: moderateScale(
        12,
        0.5,
        breakpoint
      ),

      justifyContent: 'center',
      alignItems: 'center',

      borderWidth: 1.5,
      borderColor: BRAND_WHITE,
    },

    notifBadgeText: {
      color: BRAND_WHITE,

      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      fontWeight: '900',
    },

    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    errorBox: {
      backgroundColor: '#FEF2F2',

      padding: getSpacing(
        breakpoint,
        'md'
      ),

      borderRadius: getBorderRadius(
        breakpoint,
        'md'
      ),

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),

      borderWidth: 1,
      borderColor: '#FECACA',

      flexDirection: 'row',
      alignItems: 'center',

      gap: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    errorBoxText: {
      flex: 1,

      color: COLOR_ERROR,

      fontSize: getFontSize(
        breakpoint,
        'sm'
      ),

      textAlign: 'left',

      fontWeight: '600',
    },

    // --------------------------------------------------------
    // TITLE
    // --------------------------------------------------------

    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),
    },

    sectionTitle: {
      fontSize: getFontSize(
        breakpoint,
        'xxl'
      ),

      fontWeight: '900',

      color: TEXT_DARK,

      letterSpacing: -0.3,
    },

    sectionCount: {
      fontSize: getFontSize(
        breakpoint,
        'sm'
      ),

      fontWeight: '800',

      color: TEXT_MUTED,
    },

    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',

      backgroundColor: BG_SURFACE,

      borderWidth: 1,
      borderColor: BORDER_COLOR,

      borderRadius: getBorderRadius(
        breakpoint,
        'md'
      ),

      paddingHorizontal: getSpacing(
        breakpoint,
        'md'
      ),

      paddingVertical: getSpacing(
        breakpoint,
        'sm'
      ),

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),
    },

    searchBarInput: {
      flex: 1,

      fontSize: getFontSize(
        breakpoint,
        'md'
      ),

      color: TEXT_DARK,

      marginLeft: getSpacing(
        breakpoint,
        'sm'
      ),

      ...(Platform.OS === 'web'
        ? {
            outlineStyle: 'none' as any,
          }
        : {}),
    },

    // --------------------------------------------------------
    // FILTERS
    // --------------------------------------------------------

    filterScroll: {
      flexGrow: 0,
      flexShrink: 0,

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),
    },

    chipsRow: {
      flexDirection: 'row',

      gap: getSpacing(
        breakpoint,
        'sm'
      ),

      alignItems: 'center',

      paddingRight: getSpacing(
        breakpoint,
        'md'
      ),
    },

    chip: {
      height: getResponsiveValue(
        {
          xs: 34,
          sm: 36,
          md: 38,
          lg: 40,
          xl: 42,
        },
        breakpoint
      ),

      paddingHorizontal: getSpacing(
        breakpoint,
        'md'
      ),

      borderRadius: getResponsiveValue(
        {
          xs: 17,
          sm: 18,
          md: 19,
          lg: 20,
          xl: 21,
        },
        breakpoint
      ),

      backgroundColor: BG_SURFACE,

      borderWidth: 1,
      borderColor: BORDER_COLOR,

      justifyContent: 'center',
      alignItems: 'center',

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, background-color 0.15s ease' as any,
          }
        : {}),
    },

    chipActive: {
      backgroundColor: BRAND_ORANGE,
      borderColor: BRAND_ORANGE,
    },

    chipText: {
      fontSize: getFontSize(
        breakpoint,
        'sm'
      ),

      fontWeight: '600',

      color: TEXT_MUTED,
    },

    chipTextActive: {
      color: BRAND_WHITE,
      fontWeight: '800',
    },

    // --------------------------------------------------------
    // TABLE GRID
    // --------------------------------------------------------

    tablesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',

      gap: getGridGap(
        breakpoint
      ),

      justifyContent: 'flex-start',
    },

    tableWrapper: {
      width: getResponsiveValue(
        {
          xs: '48%',
          sm: '48%',
          md: '31%',
          lg: '23.5%',
          xl: '19%',
        },
        breakpoint
      ),

      position: 'relative',

      marginBottom: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    tableCard: {
      width: '100%',

      minHeight: getResponsiveValue(
        {
          xs: 80,
          sm: 84,
          md: 86,
          lg: 90,
          xl: 94,
        },
        breakpoint
      ),

      borderRadius: getBorderRadius(
        breakpoint,
        'lg'
      ),

      justifyContent: 'space-between',
      alignItems: 'center',

      borderWidth: 1.5,

      padding: getCardPadding(
        breakpoint
      ),

      backgroundColor: BG_SURFACE,

      borderColor: BORDER_COLOR,

      shadowColor: BRAND_ORANGE,
      shadowRadius: moderateScale(
        5,
        0.5,
        breakpoint
      ),

      shadowOffset: {
        width: 0,
        height: moderateScale(
          2,
          0.5,
          breakpoint
        ),
      },

      shadowOpacity: 0.15,

      elevation: 2,

      overflow: 'visible',

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease' as any,
          }
        : {}),
    },

    tableCardAvailable: {
      backgroundColor: '#FFFFFF',
      borderColor: BORDER_COLOR,
    },

    tableCardReserved: {
      backgroundColor: COLOR_BOOKED,
      borderColor: COLOR_BOOKED,
    },

    // --------------------------------------------------------
    // TABLE TOP ROW
    // --------------------------------------------------------

    tableCardTopRow: {
      flexDirection: 'row',

      justifyContent:
        'space-between',

      alignItems: 'center',

      width: '100%',

      minHeight: moderateScale(
        12,
        0.5,
        breakpoint
      ),
    },

    tableCardActions: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: moderateScale(
        4,
        0.5,
        breakpoint
      ),
    },

    // --------------------------------------------------------
    // ORDER BADGE
    // --------------------------------------------------------

    orderCountBadge: {
      position: 'absolute',

      top: -moderateScale(
        8,
        0.5,
        breakpoint
      ),

      left: -moderateScale(
        8,
        0.5,
        breakpoint
      ),

      minWidth: moderateScale(
        24,
        0.5,
        breakpoint
      ),

      height: moderateScale(
        24,
        0.5,
        breakpoint
      ),

      borderRadius: moderateScale(
        12,
        0.5,
        breakpoint
      ),

      backgroundColor: COLOR_ERROR,

      justifyContent: 'center',
      alignItems: 'center',

      paddingHorizontal: moderateScale(
        6,
        0.5,
        breakpoint
      ),

      borderWidth: 2,
      borderColor: BG_SURFACE,

      shadowColor: COLOR_ERROR,

      shadowOpacity: 0.4,

      shadowRadius: moderateScale(
        4,
        0.5,
        breakpoint
      ),

      shadowOffset: {
        width: 0,
        height: moderateScale(
          2,
          0.5,
          breakpoint
        ),
      },

      elevation: 4,

      zIndex: 10,
    },

    orderCountBadgeText: {
      color: BRAND_WHITE,

      fontSize: getFontSize(
        breakpoint,
        'sm'
      ),

      fontWeight: '900',

      lineHeight: moderateScale(
        16,
        0.5,
        breakpoint
      ),

      textAlign: 'center',
    },

    // --------------------------------------------------------
    // BILL
    // --------------------------------------------------------

    unpaidBillIndicator: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: moderateScale(
        2,
        0.5,
        breakpoint
      ),

      backgroundColor: BG_SURFACE,

      borderRadius: getBorderRadius(
        breakpoint,
        'sm'
      ),

      paddingHorizontal: moderateScale(
        5,
        0.5,
        breakpoint
      ),

      paddingVertical: moderateScale(
        2,
        0.5,
        breakpoint
      ),

      borderWidth: 1,
      borderColor: BORDER_COLOR,
    },

    unpaidBillText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: '#D97706',

      fontWeight: '800',
    },

    // --------------------------------------------------------
    // TABLE NUMBER
    // --------------------------------------------------------

    tableCardText: {
      fontSize: getFontSize(
        breakpoint,
        'lg'
      ),

      lineHeight: getFontSize(
        breakpoint,
        'xl'
      ),

      fontWeight: '900',

      textAlign: 'center',

      alignSelf: 'stretch',

      color: TEXT_DARK,
    },

    tableCardTextBooked: {
      color: BRAND_WHITE,
    },

    // --------------------------------------------------------
    // TABLE META
    // --------------------------------------------------------

    tableCardMeta: {
      flexDirection: 'row',

      alignItems: 'center',

      justifyContent: 'center',

      minHeight: moderateScale(
        12,
        0.5,
        breakpoint
      ),

      gap: moderateScale(
        3,
        0.5,
        breakpoint
      ),

      width: '100%',

      marginTop: moderateScale(
        2,
        0.5,
        breakpoint
      ),
    },

    tableCardMetaText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: TEXT_MUTED,

      fontWeight: '800',
    },

    lightMetaText: {
      color: BRAND_WHITE,
    },

    reservedMeta: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: 3,
    },

    reservedMetaText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: BRAND_WHITE,

      fontWeight: '800',
    },

    // --------------------------------------------------------
    // BOOK BUTTON
    // --------------------------------------------------------

    bookedToggle: {
      position: 'absolute',

      right: 6,
      top: 6,

      flexDirection: 'row',

      alignItems: 'center',

      gap: moderateScale(
        2,
        0.5,
        breakpoint
      ),

      backgroundColor: BG_SURFACE,

      borderRadius: getBorderRadius(
        breakpoint,
        'sm'
      ),

      paddingHorizontal: moderateScale(
        5,
        0.5,
        breakpoint
      ),

      paddingVertical: moderateScale(
        2,
        0.5,
        breakpoint
      ),

      borderWidth: 1,
      borderColor: BORDER_COLOR,

      zIndex: 20,

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, border-color 0.15s ease' as any,
          }
        : {}),
    },

    bookedToggleActive: {
      backgroundColor: BG_SURFACE,
      borderColor: COLOR_BOOKED,
    },

    bookedToggleText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: TEXT_MUTED,

      fontWeight: '800',
    },

    bookedToggleTextActive: {
      color: COLOR_BOOKED,
    },

    // --------------------------------------------------------
    // ORDER DETAILS BUTTON
    // --------------------------------------------------------

    orderDetailsBtn: {
      flexDirection: 'row',

      alignItems: 'center',

      justifyContent: 'center',

      gap: moderateScale(6, 0.5, breakpoint),

      backgroundColor: BRAND_PRIMARY,

      borderRadius: getBorderRadius(
        breakpoint,
        'md'
      ),

      paddingHorizontal: getSpacing(
        breakpoint,
        'lg'
      ),

      paddingVertical: getSpacing(
        breakpoint,
        'md'
      ),

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),

      minHeight: 52,

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, opacity 0.15s ease' as any,
          }
        : {}),
    },

    orderDetailsBtnText: {
      fontSize: getFontSize(
        breakpoint,
        'lg'
      ),

      color: BRAND_WHITE,

      fontWeight: '800',
    },

    // --------------------------------------------------------
    // EMPTY
    // --------------------------------------------------------

    emptyState: {
      alignItems: 'center',

      justifyContent: 'center',

      paddingVertical: getSpacing(
        breakpoint,
        'xl'
      ),

      gap: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    emptyStateText: {
      fontSize: getFontSize(
        breakpoint,
        'md'
      ),

      color: TEXT_MUTED,

      fontWeight: '500',

      textAlign: 'center',
    },

    // --------------------------------------------------------
    // GO TO TOP
    // --------------------------------------------------------

    goToTopBtn: {
      position: 'absolute',

      bottom: getSpacing(
        breakpoint,
        'xxl'
      ),

      right: getSpacing(
        breakpoint,
        'md'
      ),

      width: getIconSize(
        breakpoint,
        'xl'
      ),

      height: getIconSize(
        breakpoint,
        'xl'
      ),

      borderRadius:
        getIconSize(
          breakpoint,
          'xl'
        ) / 2,

      backgroundColor: BRAND_ORANGE,

      justifyContent: 'center',
      alignItems: 'center',

      shadowColor: BRAND_ORANGE,

      shadowOpacity: 0.3,

      shadowRadius: moderateScale(
        8,
        0.5,
        breakpoint
      ),

      shadowOffset: {
        width: 0,
        height: moderateScale(
          4,
          0.5,
          breakpoint
        ),
      },

      elevation: 6,

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
          }
        : {}),
    },
  });
}

export default MyTableScreen;