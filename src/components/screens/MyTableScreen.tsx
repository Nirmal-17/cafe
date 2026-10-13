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
import {
  Table,
  Section,
  Order,
  StaffUser,
  isReservedTable as isTableReserved,
} from '@/services/api';
import {
  useReservationsRevision,
} from '@/utils/reservations';
import {
  filterTablesByServiceType,
  getServiceTypeLabel,
  ServiceType,
} from '@/utils/diningArea';
import { groupTablesBySection } from '@/utils/tableSections';

import {
  useResponsive,
  getBreakpoint,
  getSpacing,
  getFontSize,
  getBorderRadius,
  getGridGap,
  getIconSize,
  moderateScale,
  getResponsiveValue,
} from '@/utils/responsive';

// ============================================================
// COLORS
// ============================================================

const BRAND_PRIMARY = '#073F78';
const BRAND_NAVY = '#0A3D66';
const BRAND_ORANGE = '#FF6D00';
const BRAND_YELLOW = '#FFD600';
const BRAND_WHITE = '#FFFFFF';

const COLOR_ERROR = '#D32F2F';

const DOT_FREE = '#16A34A';
const DOT_RESERVED = '#4C1D95';
const DOT_OFFLINE = '#9CA3AF';

const RESERVED_BG = '#4C1D95';
const RESERVED_BORDER = '#4C1D95';
const FREE_BG = '#FFFFFF';
const FREE_BORDER = '#E5E7EB';

const BG_LIGHT = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';

const BORDER_COLOR = '#CBD5E1';

const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

// Service filter blocks: golden-orange fill when active/hovered,
// white block with dark-teal text when idle.
const SERVICE_ACTIVE_FILL = '#C07F00';
const SERVICE_INACTIVE_TEXT = '#0E5A6B';
const SERVICE_INACTIVE_BORDER = '#D9E4E7';

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

  // Re-render the grid when a RES-#### code is minted or dropped.
  useReservationsRevision();

  // ----------------------------------------------------------
  // FILTERS (match the floor-plan mockup)
  // Top row: Dine In / Delivery / Takeaway (service type).
  // Inside the Tables card: All / Free / Reserved (availability).
  // ----------------------------------------------------------

  const [serviceFilter, setServiceFilter] = useState<ServiceType>('dine-in');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'free' | 'reserved'>('all');
  const [hoveredServiceTab, setHoveredServiceTab] = useState<string | null>(null);

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

  // Parity: waiter and admin see the same table list — no role-based
  // filtering or labelling. `user` stays in props for API compat.
  void user;

  // ----------------------------------------------------------
  // FILTERED TABLES
  // ----------------------------------------------------------

  // Search visibility (service/section/availability filters NOT applied
  // yet) — shared by the grid and the chips so a chip's number always
  // matches its cards.
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

      return true;
    });
  }, [tables, tableSearchQuery]);

  const isReservedTable = useCallback((table: Table) => isTableReserved(table), []);

  const isFreeTable = useCallback((table: Table) => !isTableReserved(table), []);

  // Service-type slice (top Dine In / Delivery / Takeaway row).
  // Strict filter: Delivery/Takeaway show ONLY their dedicated tables.
  // Backend section filter still applies underneath for compatibility.
  const serviceTables = useMemo(() => {
    const byService = filterTablesByServiceType(visibleTables, serviceFilter);
    if (activeSectionId === null) return byService;
    return byService.filter(
      (table) => String(table.sectionId) === String(activeSectionId)
    );
  }, [visibleTables, serviceFilter, activeSectionId]);

  const allCount = serviceTables.length;
  const freeCount = useMemo(
    () => serviceTables.filter(isFreeTable).length,
    [serviceTables, isFreeTable]
  );
  const reservedCount = useMemo(
    () => serviceTables.filter(isReservedTable).length,
    [serviceTables, isReservedTable]
  );

  const handleSeeAllTables = useCallback(() => {
    setServiceFilter('dine-in');
    setAvailabilityFilter('all');
    setActiveSectionId(null);
    setTableSearchQuery('');
  }, [setActiveSectionId, setTableSearchQuery]);

  const filteredTables = useMemo(() => {
    const result = serviceTables
      .filter((table) => {
        // Availability filter (All / Free / Reserved chips in the Tables card)
        if (availabilityFilter === 'free' && !isFreeTable(table)) {
          return false;
        }
        if (availabilityFilter === 'reserved' && !isReservedTable(table)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Reserve-only: reserved tables first, then free.
        const getPriority = (table: Table) => (isTableReserved(table) ? 1 : 2);

        const priorityDiff = getPriority(a) - getPriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        // Natural sort so "D2" comes before "D10", matching the floor plan.
        return String(a.tableNumber).localeCompare(
          String(b.tableNumber),
          undefined,
          { numeric: true, sensitivity: 'base' }
        );
      });

    return result;
  }, [serviceTables, availabilityFilter, isFreeTable, isReservedTable]);

  // Dine In groups by dining area so every floor section gets its own
  // heading — Indoor / Outdoor / Roof / Cabin / Hall / Garden / Pool / Room
  // (resolved via sections list + table-name inference, see tableSections).
  // Delivery / Takeaway keep a single group under their own heading, since
  // their tables (Del*, T*) share one service meaning, not an area.
  const groupedTables = useMemo<[string, Table[]][]>(
    () => {
      if (filteredTables.length === 0) return [];
      if (serviceFilter === 'dine-in') {
        return groupTablesBySection(filteredTables, sections);
      }
      return [[getServiceTypeLabel(serviceFilter), filteredTables]];
    },
    [filteredTables, serviceFilter, sections],
  );

  // ----------------------------------------------------------
  // DYNAMIC STYLES
  // ----------------------------------------------------------

  const styles = useMemo(
    () =>
      createStyles(breakpoint),
    [breakpoint]
  );

  // ----------------------------------------------------------
  // SERVICE TABS (top row of the mockup)
  // ----------------------------------------------------------

  const serviceTabs = useMemo(
    () =>
      [
        { key: 'dine-in', label: 'Dine In', icon: 'silverware-fork-knife' },
        { key: 'delivery', label: 'Delivery', icon: 'scooter' },
        { key: 'takeaway', label: 'Takeaway', icon: 'food-takeout-box' },
      ] as const,
    []
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
            All Tables
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
            SERVICE FILTERS (Dine In / Delivery / Takeaway)
        ================================================== */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.chipsRow}
        >
          {serviceTabs.map((tab) => {
            const isActive = serviceFilter === tab.key;
            const isHovered = hoveredServiceTab === tab.key;
            const highlighted = isActive || isHovered;

            return (
              <Hoverable
                key={tab.key}
                style={[
                  styles.serviceChip,
                  highlighted && styles.serviceChipActive,
                ]}
                hoverStyle={styles.serviceChipActive}
                onPress={() => setServiceFilter(tab.key)}
                onHoverIn={() => setHoveredServiceTab(tab.key)}
                onHoverOut={() =>
                  setHoveredServiceTab((cur) => (cur === tab.key ? null : cur))
                }
                hoverOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={`Show ${tab.label} tables`}
              >
                <MaterialCommunityIcons
                  name={tab.icon as any}
                  size={18}
                  color={highlighted ? BRAND_WHITE : SERVICE_INACTIVE_TEXT}
                />
                <Text
                  style={[
                    styles.serviceChipText,
                    highlighted && styles.serviceChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Hoverable>
            );
          })}
        </ScrollView>

        {/* ==================================================
            TABLES CARD (Tables + All/Free/Reserved + grid)
        ================================================== */}

        <View style={styles.tablesCard}>
          {/* Card header */}
          <View style={styles.tablesCardHeader}>
            <View style={styles.tablesCardTitleRow}>
              <View style={styles.tablesCardIconBox}>
                <MaterialCommunityIcons
                  name="table-furniture"
                  size={20}
                  color={BRAND_ORANGE}
                />
              </View>

              <Text style={styles.tablesCardTitle}>
                Tables
              </Text>
            </View>

            <View style={styles.tablesCardHeaderRight}>
              <View style={styles.tablesCountPill}>
                <Text style={styles.tablesCountPillText}>
                  {allCount}
                </Text>
              </View>

              <Hoverable
                onPress={handleSeeAllTables}
                hoverOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Show all tables"
              >
                <Text style={styles.seeAllText}>
                  See all
                </Text>
              </Hoverable>
            </View>
          </View>

          {/* Availability chips */}
          <View style={styles.statusChipsRow}>
            <Hoverable
              style={[
                styles.statusChip,
                availabilityFilter === 'all' && styles.statusChipActive,
              ]}
              onPress={() => setAvailabilityFilter('all')}
              hoverOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Show all ${allCount} tables`}
            >
              <Text
                style={[
                  styles.statusChipText,
                  availabilityFilter === 'all' && styles.statusChipTextActive,
                ]}
              >
                All ({allCount})
              </Text>
            </Hoverable>

            <Hoverable
              style={[
                styles.statusChip,
                availabilityFilter === 'free' && styles.statusChipActive,
              ]}
              onPress={() => setAvailabilityFilter('free')}
              hoverOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Show ${freeCount} free tables`}
            >
              <Text
                style={[
                  styles.statusChipText,
                  availabilityFilter === 'free' && styles.statusChipTextActive,
                ]}
              >
                Free ({freeCount})
              </Text>
            </Hoverable>

            <Hoverable
              style={[
                styles.statusChip,
                availabilityFilter === 'reserved' && styles.statusChipActive,
              ]}
              onPress={() => setAvailabilityFilter('reserved')}
              hoverOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Show ${reservedCount} reserved tables`}
            >
              <Text
                style={[
                  styles.statusChipText,
                  availabilityFilter === 'reserved' && styles.statusChipTextActive,
                ]}
              >
                Reserved ({reservedCount})
              </Text>
            </Hoverable>
          </View>

          {/* Table grid — grouped by section (Indoor / Roof / Cabin / Hall …) */}
          {groupedTables.map(([sectionName, sectionTables]) => (
          <View key={sectionName} style={styles.sectionGroup}>
          <Text style={styles.sectionHeading}>{sectionName}</Text>
          <View style={styles.tablesGrid}>
          {sectionTables.map((table) => {
            const isReserved = isTableReserved(table);

            const statusLabel = isReserved ? 'Reserved' : 'Free';

            // Reserve-only: reserved = solid purple + white text, free = white.
            const cardBackground = isReserved ? RESERVED_BG : FREE_BG;
            const cardBorder = isReserved ? RESERVED_BG : FREE_BORDER;
            const cardTextColor = isReserved ? '#FFFFFF' : TEXT_DARK;

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
                    { backgroundColor: cardBackground, borderColor: cardBorder },
                  ]}
                  activeOpacity={0.85}
                  onPress={() =>
                    onTablePress(table)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${table.tableNumber}, ${statusLabel}`}
                >
                  <Text
                    style={[styles.tableCardText, { color: cardTextColor }]}
                    numberOfLines={1}
                  >
                    {table.tableNumber}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          </View>
          </View>
          ))}

          {filteredTables.length === 0 && !homeLoading && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="table-furniture"
                size={40}
                color={TEXT_MUTED}
              />

              <Text style={styles.emptyStateText}>
                {tableSearchQuery.trim()
                  ? 'No tables match your search'
                  : availabilityFilter === 'free'
                    ? 'No free tables right now'
                    : availabilityFilter === 'reserved'
                      ? 'No reserved tables'
                      : 'No tables found'}
              </Text>
            </View>
          )}

          {homeLoading && filteredTables.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="loading"
                size={28}
                color={BRAND_ORANGE}
              />

              <Text style={styles.emptyStateText}>
                Loading tables...
              </Text>
            </View>
          )}
        </View>
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

    // --------------------------------------------------------
    // SERVICE FILTERS (top Dine In / Delivery / Takeaway)
    // --------------------------------------------------------

    serviceChip: {
      height: 48,

      paddingHorizontal: getSpacing(
        breakpoint,
        'lg'
      ),

      borderRadius: 8,

      backgroundColor: BG_SURFACE,

      borderWidth: 1,
      borderColor: SERVICE_INACTIVE_BORDER,

      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, background-color 0.15s ease' as any,
          }
        : {}),
    },

    serviceChipActive: {
      backgroundColor: SERVICE_ACTIVE_FILL,
      borderColor: SERVICE_ACTIVE_FILL,
    },

    serviceChipHovered: {
      backgroundColor: SERVICE_ACTIVE_FILL,
      borderColor: SERVICE_ACTIVE_FILL,
    },

    serviceChipText: {
      fontSize: getFontSize(
        breakpoint,
        'md'
      ),

      fontWeight: '800',

      color: SERVICE_INACTIVE_TEXT,
    },

    serviceChipTextActive: {
      color: BRAND_WHITE,
      fontWeight: '800',
    },

    serviceChipTextHovered: {
      color: BRAND_WHITE,
      fontWeight: '800',
    },

    // --------------------------------------------------------
    // TABLES CARD
    // --------------------------------------------------------

    tablesCard: {
      backgroundColor: BG_SURFACE,

      borderRadius: getBorderRadius(
        breakpoint,
        'lg'
      ),

      borderWidth: 1,
      borderColor: '#E5E7EB',

      padding: getSpacing(
        breakpoint,
        'md'
      ),

      shadowColor: '#0F172A',
      shadowRadius: moderateScale(
        6,
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

      shadowOpacity: 0.06,

      elevation: 2,
    },

    tablesCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),
    },

    tablesCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',

      gap: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    tablesCardIconBox: {
      width: moderateScale(36, 0.5, breakpoint),
      height: moderateScale(36, 0.5, breakpoint),
      borderRadius: moderateScale(10, 0.5, breakpoint),
      backgroundColor: '#FFF3E8',
      justifyContent: 'center',
      alignItems: 'center',
    },

    tablesCardTitle: {
      fontSize: getFontSize(
        breakpoint,
        'xl'
      ),

      fontWeight: '800',

      color: TEXT_DARK,
    },

    tablesCardHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',

      gap: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    tablesCountPill: {
      backgroundColor: BRAND_NAVY,

      borderRadius: moderateScale(
        12,
        0.5,
        breakpoint
      ),

      minWidth: moderateScale(
        36,
        0.5,
        breakpoint
      ),

      paddingHorizontal: moderateScale(
        10,
        0.5,
        breakpoint
      ),

      paddingVertical: moderateScale(
        4,
        0.5,
        breakpoint
      ),

      justifyContent: 'center',
      alignItems: 'center',
    },

    tablesCountPillText: {
      color: BRAND_WHITE,

      fontSize: getFontSize(
        breakpoint,
        'sm'
      ),

      fontWeight: '800',
    },

    seeAllText: {
      fontSize: getFontSize(
        breakpoint,
        'md'
      ),

      fontWeight: '700',

      color: BRAND_ORANGE,
    },

    statusChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',

      gap: getSpacing(
        breakpoint,
        'sm'
      ),

      alignItems: 'center',

      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),
    },

    statusChip: {
      height: getResponsiveValue(
        {
          xs: 32,
          sm: 34,
          md: 36,
          lg: 36,
          xl: 38,
        },
        breakpoint
      ),

      paddingHorizontal: getSpacing(
        breakpoint,
        'md'
      ),

      borderRadius: getResponsiveValue(
        {
          xs: 16,
          sm: 17,
          md: 18,
          lg: 18,
          xl: 19,
        },
        breakpoint
      ),

      backgroundColor: '#F1F5F9',

      borderWidth: 1,
      borderColor: '#E2E8F0',

      justifyContent: 'center',
      alignItems: 'center',

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, background-color 0.15s ease' as any,
          }
        : {}),
    },

    statusChipActive: {
      backgroundColor: BRAND_NAVY,
      borderColor: BRAND_NAVY,
    },

    statusChipText: {
      fontSize: getFontSize(
        breakpoint,
        'sm'
      ),

      fontWeight: '600',

      color: TEXT_MUTED,
    },

    statusChipTextActive: {
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

    sectionGroup: {
      marginBottom: getSpacing(
        breakpoint,
        'md'
      ),
    },

    sectionHeading: {
      fontSize: getFontSize(
        breakpoint,
        'xl'
      ),

      fontWeight: '800',

      color: '#0E5A6B',

      marginBottom: getSpacing(
        breakpoint,
        'sm'
      ),
    },

    tableWrapper: {
      width: getResponsiveValue(
        {
          xs: '48%',
          sm: '31.5%',
          md: '23.5%',
          lg: '18.8%',
          xl: '15.5%',
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

      minHeight: 54,

      borderRadius: getBorderRadius(
        breakpoint,
        'md'
      ),

      justifyContent: 'center',
      alignItems: 'center',

      borderWidth: 1,
      borderColor: '#E5E7EB',

      paddingHorizontal: getSpacing(
        breakpoint,
        'md'
      ),

      paddingVertical: moderateScale(12, 0.5, breakpoint),

      gap: moderateScale(2, 0.5, breakpoint),

      backgroundColor: BG_SURFACE,

      shadowColor: '#0F172A',
      shadowRadius: moderateScale(
        4,
        0.5,
        breakpoint
      ),

      shadowOffset: {
        width: 0,
        height: moderateScale(
          1,
          0.5,
          breakpoint
        ),
      },

      shadowOpacity: 0.06,

      elevation: 1,

      overflow: 'visible',

      ...(Platform.OS === 'web'
        ? {
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease' as any,
          }
        : {}),
    },

    // --------------------------------------------------------
    // MINI TABLE CARD
    // --------------------------------------------------------

    tableCardTopRow: {
      flexDirection: 'row',

      justifyContent: 'space-between',

      alignItems: 'center',

      width: '100%',
    },

    statusDot: {
      width: moderateScale(8, 0.5, breakpoint),
      height: moderateScale(8, 0.5, breakpoint),
      borderRadius: moderateScale(4, 0.5, breakpoint),
    },

    // --------------------------------------------------------
    // BILL
    // --------------------------------------------------------

    unpaidBillIndicator: {
      flexDirection: 'row',

      alignItems: 'center',
      alignSelf: 'flex-start',

      gap: moderateScale(
        2,
        0.5,
        breakpoint
      ),

      backgroundColor: '#FFFBEB',

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
      borderColor: '#FDE68A',

      marginTop: moderateScale(
        2,
        0.5,
        breakpoint
      ),
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
    // TABLE NUMBER + STATUS + SEATS
    // --------------------------------------------------------

    tableCardText: {
      flex: 1,

      fontSize: getFontSize(
        breakpoint,
        'lg'
      ),

      lineHeight: getFontSize(
        breakpoint,
        'xl'
      ),

      fontWeight: '800',

      textAlign: 'center',

      color: TEXT_DARK,
    },

    tableStatusText: {
      fontSize: getFontSize(
        breakpoint,
        'md'
      ),

      fontWeight: '700',

      textAlign: 'left',

      color: TEXT_DARK,
    },

    tableSeatsRow: {
      flexDirection: 'row',

      alignItems: 'center',

      gap: moderateScale(
        3,
        0.5,
        breakpoint
      ),

      width: '100%',
    },

    tableSeatsText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: TEXT_MUTED,

      fontWeight: '500',
    },

    tableOrdersText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: TEXT_MUTED,

      fontWeight: '700',
    },

    tableExtraText: {
      fontSize: getFontSize(
        breakpoint,
        'xs'
      ),

      color: TEXT_MUTED,

      fontWeight: '600',

      marginTop: moderateScale(
        2,
        0.5,
        breakpoint
      ),
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