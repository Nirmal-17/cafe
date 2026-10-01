'use client';

import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { Order, Table } from '@/services/api';
import { useResponsive, getResponsiveValue } from '@/utils/responsive';
import {
  COLORS,
  SectionCard,
  STATUS_COLORS,
  TABLE_STATUS_COLORS,
  formatMoney,
} from './shared';
import { useRouter } from 'expo-router';
import { homeApi } from '@/services/homeApi';
import { webAlert } from '@/utils/webAlert';

type TableTab = 'ALL' | 'FREE' | 'RESERVED';

interface TableTabsCardProps {
  tables: Table[];
  activeOrders: Order[];
  getElapsed: (tableId: number) => string;
  onOrderPress: (order: Order) => void;
  onSeeAll: () => void;
}

const TABS: { key: TableTab; label: string; color: string }[] = [
  { key: 'ALL', label: 'All', color: COLORS.primary },
  { key: 'FREE', label: 'Free', color: TABLE_STATUS_COLORS.AVAILABLE },
  { key: 'RESERVED', label: 'Reserved', color: TABLE_STATUS_COLORS.RESERVED },
];

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Free',
  RESERVED: 'Reserved',
  OCCUPIED: 'Occupied',
  PENDING_BILL: 'Pending Bill',
  CLEANING: 'Cleaning',
};

function getStatus(table: Table): string {
  return String(table.status).toUpperCase();
}

function isReservedTable(table: Table): boolean {
  return getStatus(table) === 'RESERVED' || table.is_reserved === true;
}

function tablePriority(table: Table): number {
  const status = getStatus(table);
  if (status === 'PENDING_BILL') return 1;
  if (status === 'OCCUPIED') return 2;
  if (status === 'RESERVED') return 3;
  if (status === 'AVAILABLE') return 4;
  if (status === 'CLEANING') return 5;
  return 6;
}

export function TableTabsCard({
  tables,
  activeOrders,
  getElapsed,
  onOrderPress,
  onSeeAll,
}: TableTabsCardProps) {
  const [tab, setTab] = useState<TableTab>('ALL');
  const [modalTable, setModalTable] = useState<Table | null>(null);
  const { breakpoint } = useResponsive();
  const router = useRouter();

  const handleTablePress = (table: Table) => {
    setModalTable(table);
  };

  const closeModal = () => {
    setModalTable(null);
  };

  const handleTakeOrder = async (table: Table) => {
    closeModal();
    try {
      const res = await homeApi.startTableSession(table.id);
      if (res.success) {
        router.push(`/table/${table.id}` as any);
      } else {
        webAlert('Error', res.error || 'Failed to start service');
      }
    } catch {
      webAlert('Error', 'Network error — could not start service');
    }
  };

  const handleReserve = async (table: Table) => {
    closeModal();
    try {
      const res = await homeApi.updateTableStatus(table.id, 'RESERVED');
      if (res.success) {
        // Tables will refresh via real-time events
      } else {
        webAlert('Error', res.error || 'Failed to reserve table');
      }
    } catch {
      webAlert('Error', 'Network error');
    }
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
    }),
    [visibleTables],
  );

  const tabTables = useMemo(() => {
    if (tab === 'FREE') return visibleTables.filter((t) => getStatus(t) === 'AVAILABLE');
    if (tab === 'RESERVED') return visibleTables.filter((t) => isReservedTable(t));
    return visibleTables;
  }, [visibleTables, tab]);

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

  // Reserved / busy table tap → jump straight to that table's order screen
  // (order details when it has open orders, place-order screen otherwise)
  const openTableOrder = (table: Table) => {
    const orders = ordersByTable.get(table.id) ?? [];
    const hasOpenOrders = orders.some(
      (o) => o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED',
    );
    router.push(
      (hasOpenOrders ? `/order-details/${table.id}` : `/table/${table.id}`) as any,
    );
  };

  const cellWidth = getResponsiveValue(
    { xs: '48.5%', sm: '31.5%', md: '23.5%', lg: '18.8%', xl: '15.6%' },
    breakpoint,
  ) as `${number}%`;

  const tabColor =
    TABS.find((t) => t.key === tab)?.color || COLORS.primary;

  const emptyText =
    tab === 'FREE'
      ? 'No free tables right now'
      : tab === 'RESERVED'
        ? 'No reserved tables'
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
                isActive && { backgroundColor: item.color, borderColor: item.color },
              ]}
              onPress={() => setTab(item.key)}
              hoverOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
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
        <View style={styles.grid}>
          {tabTables.map((table) => {
            const baseStatus = getStatus(table);
            const reserved = isReservedTable(table);
            const status =
              reserved && baseStatus === 'AVAILABLE' ? 'RESERVED' : baseStatus;
            const color = TABLE_STATUS_COLORS[status] || COLORS.primary;
            const label = STATUS_LABELS[status] || status;
            const orders = ordersByTable.get(table.id) ?? [];
            const openValue = orders
              .filter((o) => o.paymentStatus !== 'PAID')
              .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
            const busy = status === 'OCCUPIED' || status === 'PENDING_BILL';
            const purpleTile = status === 'RESERVED' || status === 'OCCUPIED';
            const freeTile = status === 'AVAILABLE';
            const purple = TABLE_STATUS_COLORS.RESERVED;
            const tileBackground = purpleTile
              ? purple
              : freeTile
                ? COLORS.white
                : color + '12';
            const tileBorder = purpleTile ? purple : COLORS.white;
            const contentColor = purpleTile ? COLORS.white : COLORS.text;
            const metaColor = purpleTile ? '#EDE9FE' : COLORS.muted;

            const footer: string[] = [];
            if (busy) footer.push(getElapsed(table.id));
            if (openValue > 0) footer.push(formatMoney(openValue));

            const targetOrder =
              orders.find((o) => o.paymentStatus !== 'PAID') ?? orders[0];

            const isAvailable = status === 'AVAILABLE';

            return (
              <View key={table.id} style={[styles.cell, { width: cellWidth }]}>
                <Hoverable
                  style={[styles.tile, { backgroundColor: tileBackground, borderColor: tileBorder }]}
                  onPress={() => {
                    if (isAvailable) handleTablePress(table);
                    else if (status !== 'CLEANING') openTableOrder(table);
                  }}
                  hoverOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${table.tableNumber}, ${label}`}
                >
                  <View style={styles.tileTop}>
                    <Text style={[styles.tileNumber, { color: contentColor }]} numberOfLines={1}>
                      {table.tableNumber}
                    </Text>

                    <View style={styles.tileTopRight}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: purpleTile ? COLORS.white : color },
                        ]}
                      />
                      {orders.length > 0 && targetOrder && (
                        <Hoverable
                          style={[
                            styles.orderChip,
                            {
                              backgroundColor:
                                STATUS_COLORS[targetOrder.status] || COLORS.primary,
                            },
                          ]}
                          onPress={() => onOrderPress(targetOrder)}
                          hoverOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`${orders.length} orders for table ${table.tableNumber}`}
                        >
                          <MaterialCommunityIcons
                            name="receipt"
                            size={9}
                            color={COLORS.white}
                          />
                          <Text style={styles.orderChipText}>{orders.length}</Text>
                        </Hoverable>
                      )}
                    </View>
                  </View>

                  <Text style={[styles.tileStatus, { color: contentColor }]} numberOfLines={1}>
                    {label}
                  </Text>

                  <View style={styles.tileMeta}>
                    <MaterialCommunityIcons
                      name="seat"
                      size={10}
                      color={purpleTile ? '#EDE9FE' : COLORS.muted}
                    />
                    <Text style={[styles.tileMetaText, { color: metaColor }]} numberOfLines={1}>
                      {table.capacity} seats
                      {table.section?.name ? ` · ${table.section.name}` : ''}
                    </Text>
                  </View>

                  {footer.length > 0 && (
                    <Text
                      style={[
                        styles.tileFooter,
                        { color: purpleTile ? COLORS.white : COLORS.primary },
                      ]}
                      numberOfLines={1}
                    >
                      {footer.join(' · ')}
                    </Text>
                  )}
                </Hoverable>
              </View>
            );
          })}
        </View>
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
                Section: {modalTable.section?.name || 'Main'}
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
    borderRadius: 15,
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
  cell: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  tile: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    minHeight: 74,
    justifyContent: 'space-between',
    gap: 3,
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
    fontSize: 14,
    fontWeight: '900',
    flexShrink: 1,
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
});

export default TableTabsCard;
