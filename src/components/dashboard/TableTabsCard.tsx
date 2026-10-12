'use client';

import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
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
import { filterTablesByServiceType, getServiceTypeLabel, ServiceType } from '@/utils/diningArea';

type TableTab = 'ALL' | 'FREE' | 'RESERVED' | 'DINE-IN' | 'DELIVERY' | 'TAKEAWAY';

interface TableTabsCardProps {
  tables: Table[];
  sections?: Section[];
  activeOrders: Order[];
  getElapsed: (tableId: number) => string;
  onOrderPress: (order: Order) => void;
  onChangeTableStatus: (tableId: number, status: string) => Promise<boolean>;
  onSeeAll: () => void;
  serviceType?: ServiceType | 'all';
}

const TABS: { key: TableTab; label: string; color: string }[] = [
  { key: 'ALL', label: 'All', color: COLORS.primary },
  { key: 'FREE', label: 'Free', color: TABLE_STATUS_COLORS.AVAILABLE },
  { key: 'RESERVED', label: 'Reserved', color: TABLE_STATUS_COLORS.RESERVED },
];

const SERVICE_TYPE_TABS: { key: TableTab; label: string; color: string }[] = [
  { key: 'DINE-IN', label: 'Dine-in', color: '#16A34A' },
  { key: 'DELIVERY', label: 'Delivery', color: '#F59E0B' },
  { key: 'TAKEAWAY', label: 'Takeaway', color: '#EF4444' },
];

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Free',
  RESERVED: 'Reserved',
};

function getStatus(table: Table): string {
  return isReservedTable(table) ? 'RESERVED' : 'AVAILABLE';
}

function tablePriority(table: Table): number {
  return isReservedTable(table) ? 1 : 2;
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
  const [tab, setTab] = useState<TableTab>('ALL');
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

  const counts = useMemo(
    () => ({
      all: visibleTables.length,
      free: visibleTables.filter((t) => getStatus(t) === 'AVAILABLE').length,
      reserved: visibleTables.filter((t) => isReservedTable(t)).length,
      // Shared helper, so the counts match what each tab actually displays
      // (Delivery/Takeaway fall back to the shared tables when empty).
      dineIn: filterTablesByServiceType(visibleTables, 'dine-in').length,
      delivery: filterTablesByServiceType(visibleTables, 'delivery').length,
      takeaway: filterTablesByServiceType(visibleTables, 'takeaway').length,
    }),
    [visibleTables],
  );

  const tabTables = useMemo(() => {
    if (tab === 'FREE') return visibleTables.filter((t) => getStatus(t) === 'AVAILABLE');
    if (tab === 'RESERVED') return visibleTables.filter((t) => isReservedTable(t));
    if (tab === 'DINE-IN' || tab === 'DELIVERY' || tab === 'TAKEAWAY') {
      const want: ServiceType =
        tab === 'DINE-IN' ? 'dine-in' : tab === 'DELIVERY' ? 'delivery' : 'takeaway';
      return filterTablesByServiceType(visibleTables, want);
    }
    return visibleTables;
  }, [visibleTables, tab]);

  const cellWidth = getResponsiveValue(
    { xs: '48.5%', sm: '31.5%', md: '23.5%', lg: '18.8%', xl: '15.6%' },
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
    () => {
      if (tab === 'DELIVERY' || tab === 'TAKEAWAY') {
        return tabTables.length > 0
          ? [[getServiceTypeLabel(tab.toLowerCase()), tabTables]]
          : [];
      }
      if (
        (tab === 'ALL' || tab === 'FREE' || tab === 'RESERVED') &&
        (serviceType === 'delivery' || serviceType === 'takeaway')
      ) {
        return tabTables.length > 0
          ? [[getServiceTypeLabel(serviceType), tabTables]]
          : [];
      }
      return groupTablesBySection(tabTables, sections);
    },
    [tabTables, sections, tab, serviceType],
  );

  const tabColor =
    [...TABS, ...SERVICE_TYPE_TABS].find((t) => t.key === tab)?.color || COLORS.primary;

  const emptyText =
    tab === 'FREE'
      ? 'No free tables right now'
      : tab === 'RESERVED'
        ? 'No reserved tables'
        : tab === 'DINE-IN'
          ? 'No dine-in tables'
          : tab === 'DELIVERY'
            ? 'No delivery tables'
            : tab === 'TAKEAWAY'
              ? 'No takeaway tables'
              : 'No tables found';

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
        {/* TABS: ALL / FREE / RESERVED */}
        <View style={styles.tabsRow}>
          {TABS.map((item) => {
            const isActive = tab === item.key;
            const isHovered = hoveredTab === item.key;
            const highlighted = isActive || isHovered;
            const count =
              item.key === 'ALL'
              ? counts.all
              : item.key === 'FREE'
                ? counts.free
                : counts.reserved;

          return (
            <Hoverable
              key={item.key}
              style={[
                styles.tab,
                highlighted && { backgroundColor: item.color, borderColor: item.color },
              ]}
              hoverStyle={{ backgroundColor: item.color, borderColor: item.color }}
              onPress={() => setTab(item.key)}
              onHoverIn={() => setHoveredTab(item.key)}
              onHoverOut={() => setHoveredTab((cur) => (cur === item.key ? null : cur))}
              hoverOpacity={1}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, highlighted && styles.tabTextActive]}>
                {item.label} ({count})
              </Text>
            </Hoverable>
          );
        })}
        </View>

        {/* SERVICE TYPE: DINE-IN / DELIVERY / TAKEAWAY */}
        <View style={styles.tabsRow}>
          {SERVICE_TYPE_TABS.map((item) => {
            const isActive = tab === item.key;
            const isHovered = hoveredTab === item.key;
            const highlighted = isActive || isHovered;
            const count =
              item.key === 'DINE-IN'
                ? counts.dineIn
                : item.key === 'DELIVERY'
                  ? counts.delivery
                  : counts.takeaway;

          return (
            <Hoverable
              key={item.key}
              style={[
                styles.tab,
                highlighted && { backgroundColor: item.color, borderColor: item.color },
              ]}
              hoverStyle={{ backgroundColor: item.color, borderColor: item.color }}
              onPress={() => setTab(isActive ? 'ALL' : item.key)}
              onHoverIn={() => setHoveredTab(item.key)}
              onHoverOut={() => setHoveredTab((cur) => (cur === item.key ? null : cur))}
              hoverOpacity={1}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, highlighted && styles.tabTextActive]}>
                {item.label} ({count})
              </Text>
            </Hoverable>
          );
        })}
      </View>

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
  /* Tabs */
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
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
