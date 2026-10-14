'use client';

import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { Order, Section, Table, isReservedTable } from '@/services/api';
import { resolveTableSectionName, groupTablesBySection } from '@/utils/tableSections';
import { useResponsive, getResponsiveValue } from '@/utils/responsive';
import { isOpenOrder } from '@/utils/openValue';
import {
  COLORS,
  SectionCard,
  TABLE_STATUS_COLORS,
} from './shared';
import { useRouter } from 'expo-router';
import { getServiceTypeLabel, ServiceType } from '@/utils/diningArea';

type TableTab = string;

interface TableTabsCardProps {
  tables: Table[];
  sections?: Section[];
  activeOrders: Order[];
  getElapsed: (tableId: number) => string;
  onOrderPress: (order: Order) => void;
  onChangeTableStatus: (tableId: number, status: string) => Promise<boolean>;
  onSeeAll: () => void;
  serviceType?: ServiceType;
}

export function TableTabsCard({
  tables,
  sections,
  activeOrders,
  getElapsed,
  onOrderPress,
  onChangeTableStatus,
  onSeeAll,
  serviceType,
}: TableTabsCardProps) {
  const STATUS_LABELS: Record<string, string> = {
    AVAILABLE: 'Free',
    RESERVED: 'Reserved',
  };

  function tablePriority(table: Table): number {
    return isReservedTable(table) ? 1 : 2;
  }

  const [tab, setTab] = useState<TableTab>('Indoor');
  const [hoveredTab, setHoveredTab] = useState<TableTab | null>(null);
  const [modalTable, setModalTable] = useState<Table | null>(null);
  const { breakpoint } = useResponsive();
  const router = useRouter();

  const handleTablePress = (table: Table) => {
    setModalTable(table);
  };

  const closeModal = () => {
    setModalTable(null);
  };

  const ordersByTable = useMemo(() => {
    const map = new Map<number, Order[]>();
    activeOrders.forEach((order) => {
      if (order.tableId === null || order.tableId === undefined) return;
      const list = map.get(order.tableId) ?? [];
      list.push(order);
      map.set(order.tableId, list);
    });
    map.forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id - b.id,
      ),
    );
    return map;
  }, [activeOrders]);

  // Reserve-only: taking an order never changes table status.
  const handleTakeOrder = (table: Table) => {
    const orders = ordersByTable.get(table.id) ?? [];
    closeModal();
    router.push(
      (orders.some(isOpenOrder) ? `/order-details/${table.id}` : `/table/${table.id}`) as any,
    );
  };

  const handleFreeTable = async (table: Table) => {
    closeModal();
    // Optimistic via the parent — paints instantly, rolls back on failure.
    await onChangeTableStatus(table.id, 'AVAILABLE');
  };

  const handleReserve = async (table: Table) => {
    closeModal();
    // Parent applies the change optimistically (instant paint) + reconciles.
    await onChangeTableStatus(table.id, 'RESERVED');
  };

  // All table records — no per-user scoping (the dashboard shows system-wide state)
  const visibleTables = useMemo(
    () =>
      [...tables].sort((a, b) => {
        const diff = tablePriority(a) - tablePriority(b);
        if (diff !== 0) return diff;
        return String(a.tableNumber).localeCompare(String(b.tableNumber));
      }),
    [tables],
  );

  // Delivery / Takeaway share one service meaning (not areas) — same as
  // My Tables, they keep a single group with no area filter tabs.
  const isServiceView = serviceType === 'delivery' || serviceType === 'takeaway';

  // Area filter tabs: every section present in the current list
  // (Indoor, Roof, Cabin, Hall, Garden, Pool, Room, Outdoor…), in venue order.
  const sectionNames = useMemo(
    () =>
      isServiceView
        ? []
        : groupTablesBySection(visibleTables, sections).map(([name]) => name),
    [visibleTables, sections, isServiceView],
  );

  // Effective tab — derived during render (never setState-in-effect), so a
  // refresh re-selects automatically: stored tab if still present, else the
  // Indoor tab (the main floor), else the first area. Refresh rebuilds the
  // list, so Indoor ends up selected with its tables showing.
  const activeTab = useMemo(() => {
    if (sectionNames.includes(tab)) return tab;
    const indoor = sectionNames.find((n) => n.trim().toLowerCase() === 'indoor');
    return indoor ?? sectionNames[0] ?? tab;
  }, [sectionNames, tab]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    visibleTables.forEach((t) => {
      const key = resolveTableSectionName(t, sections);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [visibleTables, sections]);

  const sectionTabs = useMemo(
    () => sectionNames.map((name) => ({
      key: name,
      label: name,
      count: counts.get(name) ?? 0,
    })),
    [sectionNames, counts, visibleTables.length],
  );

  const tabTables = useMemo(() => {
    // Delivery / Takeaway have no area tabs — show the whole service list.
    if (isServiceView) return visibleTables;
    return visibleTables.filter((t) => resolveTableSectionName(t, sections) === activeTab);
  }, [visibleTables, activeTab, sections, isServiceView]);

  // Service views (Delivery / Takeaway) match My Tables: 3 per row on
  // phones, like the screenshot (D1..D10, Del 1..3).
  const cellWidth = getResponsiveValue(
    isServiceView
      ? { xs: '31.5%', sm: '31.5%', md: '23.5%', lg: '18.8%', xl: '15.6%' }
      : { xs: '48.5%', sm: '31.5%', md: '23.5%', lg: '18.8%', xl: '15.6%' },
    breakpoint,
  ) as `${number}%`;

  // Group the (already filtered + sorted) tables. Dine-in groups by dining
  // area (Indoor / Outdoor / Roof / Cabin / Hall / Garden / Pool / Room) so
  // every floor section gets its own heading. Delivery / Takeaway keep a
  // single group under their own heading — area sub-headings would mislabel
  // them ("Indoor" over T1..T8 in Takeaway). All / Free / Reserved keep the
  // area grouping. Names resolve through the sections list — no nested
  // section on hosted rows.
  // The dashboard also filters from the outside (Dine In / Delivery /
  // Takeaway buttons): when that outer filter is Delivery/Takeaway, the inner
  // ALL/FREE/RESERVED views keep the single service heading too — otherwise
  // the shared fallback tables would render under "Indoor" while Delivery is
  // selected. Matches FloorPlanGrid's outer-filter grouping.
  const groupedTables = useMemo<[string, Table[]][]>(
    () => groupTablesBySection(tabTables, sections),
    [tabTables, sections, serviceType],
  );

  const tabColor = COLORS.primary;

  const emptyText = 'No tables found';

  return (
    <>
      <SectionCard
        icon="table-furniture"
        iconColor={COLORS.orange}
        title="Tables"
        count={tabTables.length}
        countColor={tabColor}
        actionLabel="See all"
        onAction={onSeeAll}
      >
        {/* TABS: All + area filters (Indoor, Roof, Cabin, Hall…), horizontally scrollable */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabsScroll}
        >
          {sectionTabs.map((item) => {
            const isActive = activeTab === item.key;
            const isHovered = hoveredTab === item.key;
            const highlighted = isActive || isHovered;

          return (
            <Hoverable
              key={item.key}
              style={[
                styles.tab,
                highlighted && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
              ]}
              hoverStyle={{ backgroundColor: COLORS.primary, borderColor: COLORS.primary }}
              onPress={() => setTab(item.key)}
              onHoverIn={() => setHoveredTab(item.key)}
              onHoverOut={() => setHoveredTab((cur) => (cur === item.key ? null : cur))}
              hoverOpacity={1}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, highlighted && styles.tabTextActive]}>
                {item.label} ({item.count})
              </Text>
            </Hoverable>
          );
        })}
        </ScrollView>

      {tabTables.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="table-furniture" size={36} color={COLORS.muted} />
          <Text style={styles.emptyStateText}>{emptyText}</Text>
        </View>
      ) : (
        <>
          {groupedTables.map(([sectionName, sectionTables]) => (
            <View key={sectionName} style={styles.sectionGroup}>
              <Text style={styles.sectionHeading}>{sectionName}</Text>
              <View style={styles.grid}>
                {sectionTables.map((table) => {
            // Reserve-only: Reserved (solid purple + white text) or Free (white).
            const reservedTile = isReservedTable(table);
            const status = reservedTile ? 'RESERVED' : 'AVAILABLE';
            const label = STATUS_LABELS[status] || status;
            const tileBackground = reservedTile ? TABLE_STATUS_COLORS.RESERVED : '#FFFFFF';
            const tileBorder = reservedTile ? TABLE_STATUS_COLORS.RESERVED : '#E5E7EB';
            const contentColor = reservedTile ? COLORS.white : '#111827';

            return (
              <View key={table.id} style={[styles.cell, { width: cellWidth }]}>
                <Hoverable
                  style={[styles.tile, { backgroundColor: tileBackground, borderColor: tileBorder }]}
                  onPress={() => handleTablePress(table)}
                  hoverOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${table.tableNumber}, ${label}`}
                >
                  <Text style={[styles.tileNumber, { color: contentColor }]} numberOfLines={1}>
                    {table.tableNumber}
                  </Text>
                </Hoverable>
              </View>
            );
          })}
              </View>
            </View>
          ))}
        </>
      )}
    </SectionCard>

      {modalTable && (
        <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
          <Pressable style={styles.modalOverlay} onPress={closeModal}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <MaterialCommunityIcons name="table-furniture" size={24} color={COLORS.orange} />
                  <Text style={styles.modalTitle}>{modalTable.tableNumber}</Text>
                </View>
                <TouchableOpacity onPress={closeModal} accessibilityRole="button" accessibilityLabel="Close">
                  <MaterialIcons name="close" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubtitle}>
                Section: {resolveTableSectionName(modalTable, sections)}
              </Text>

              <Hoverable
                style={styles.modalPrimaryBtn}
                onPress={() => handleTakeOrder(modalTable)}
                hoverOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Take order for table ${modalTable.tableNumber}`}
              >
                <MaterialIcons name="restaurant" size={20} color={COLORS.white} />
                <Text style={styles.modalPrimaryBtnText}>Take Order</Text>
              </Hoverable>

              <View style={styles.modalDivider} />

              {isReservedTable(modalTable) ? (
                <Hoverable
                  style={styles.modalFreeBtn}
                  onPress={() => handleFreeTable(modalTable)}
                  hoverOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Free table ${modalTable.tableNumber}`}
                >
                  <MaterialIcons name="lock-open" size={20} color={COLORS.white} />
                  <Text style={styles.modalFreeBtnText}>Free Table</Text>
                </Hoverable>
              ) : (
                <>
                  <Text style={styles.modalSectionLabel}>Other Actions:</Text>
                  <Hoverable
                    style={styles.modalReserveBtn}
                    onPress={() => handleReserve(modalTable)}
                    hoverOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Reserve table ${modalTable.tableNumber}`}
                  >
                    <Text style={styles.modalReserveBtnText}>Reserve</Text>
                  </Hoverable>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  /* Tabs — horizontally scrollable area filters */
  tabsScroll: {
    marginBottom: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingRight: 8,
  },
  tab: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },

  /* Compact tile grid */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  sectionGroup: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0E5A6B',
    marginBottom: 8,
  },
  cell: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  tile: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 3,
    boxShadow: '0px 1px 4px rgba(15, 23, 42, 0.14)',
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  tileTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileNumber: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  orderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  orderChipText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.white,
  },
  tileStatus: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tileMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    flexShrink: 1,
  },
  tileFooter: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },

  /* Empty */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  emptyStateText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    textAlign: 'center',
  },

  /* Table action bottom sheet */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    flexShrink: 1,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '500',
    marginBottom: 18,
  },
  modalPrimaryBtn: {
    backgroundColor: COLORS.primary,
    height: 54,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  modalPrimaryBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    marginBottom: 10,
  },
  modalReserveBtn: {
    backgroundColor: '#FEE2E2',
    height: 54,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalReserveBtnText: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: '700',
  },
  modalFreeBtn: {
    backgroundColor: COLORS.green,
    height: 54,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  modalFreeBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default TableTabsCard;
