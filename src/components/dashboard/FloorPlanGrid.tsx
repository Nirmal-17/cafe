'use client';

import React, { useMemo, useState, useRef } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { Order, Table } from '@/services/api';
import { useResponsive, getResponsiveValue } from '@/utils/responsive';
import { isOpenOrder } from '@/utils/openValue';
import { COLORS, SectionCard, TABLE_STATUS_COLORS } from './shared';
import { Popover } from '@/components/Popover';
import { useRouter } from 'expo-router';
import { homeApi } from '@/services/homeApi';
import { webAlert } from '@/utils/webAlert';

interface FloorPlanGridProps {
  tables: Table[];
  activeOrders: Order[];
  isWaiter: boolean;
  userId?: number;
  getElapsed: (tableId: number) => string;
  onChangeTableStatus: (tableId: number, status: string) => Promise<boolean>;
  onSeeAll: () => void;
}

const LEGEND: { status: string; label: string }[] = [
  { status: 'OCCUPIED', label: 'Occupied' },
  { status: 'PENDING_BILL', label: 'Bill' },
  { status: 'AVAILABLE', label: 'Free' },
  { status: 'RESERVED', label: 'Reserved' },
  { status: 'CLEANING', label: 'Cleaning' },
];

function statusPriority(status: string): number {
  if (status === 'OCCUPIED' || status === 'PENDING_BILL') return 1;
  if (status === 'RESERVED') return 2;
  if (status === 'CLEANING') return 3;
  return 4;
}

export function FloorPlanGrid({
  tables,
  activeOrders,
  isWaiter,
  userId,
  getElapsed,
  onChangeTableStatus,
  onSeeAll,
}: FloorPlanGridProps) {
  const { breakpoint } = useResponsive();
  const [popoverTable, setPopoverTable] = useState<Table | null>(null);
  const [popoverAnchorRef, setPopoverAnchorRef] = useState<React.RefObject<View | null> | null>(null);
  const router = useRouter();

  const tileRefs = useRef<Map<number, React.RefObject<View | null>>>(new Map());

  const handleTablePress = (table: Table) => {
    const ref = tileRefs.current.get(table.id);
    if (ref) {
      setPopoverAnchorRef(ref);
      setPopoverTable(table);
    }
  };

  const setTileRef = (tableId: number) => (node: View | null) => {
    let ref = tileRefs.current.get(tableId);
    if (!ref) {
      ref = { current: null };
      tileRefs.current.set(tableId, ref);
    }
    ref.current = node;
  };

  const closePopover = () => {
    setPopoverTable(null);
    setPopoverAnchorRef(null);
  };

  const ordersByTable = useMemo(() => {
    const map = new Map<number, Order[]>();
    activeOrders.forEach((order) => {
      if (order.tableId === null || order.tableId === undefined) return;
      const list = map.get(order.tableId) ?? [];
      list.push(order);
      map.set(order.tableId, list);
    });
    return map;
  }, [activeOrders]);

  const handleTakeOrder = async (table: Table) => {
    const orders = ordersByTable.get(table.id) ?? [];
    if (orders.some(isOpenOrder)) {
      closePopover();
      router.push(`/order-details/${table.id}` as any);
      return;
    }
    closePopover();
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

  const handleFreeTable = async (table: Table) => {
    closePopover();
    // Optimistic via the parent — paints instantly, rolls back on failure.
    await onChangeTableStatus(table.id, 'AVAILABLE');
  };

  const handleReserve = async (table: Table) => {
    closePopover();
    // Parent applies the change optimistically (instant paint) + reconciles.
    await onChangeTableStatus(table.id, 'RESERVED');
  };

  // Reserved / busy table tap → jump straight to that table's order screen
  const openTableOrder = (table: Table) => {
    const orders = ordersByTable.get(table.id) ?? [];
    const hasOpenOrders = orders.some(isOpenOrder);
    router.push(
      (hasOpenOrders ? `/order-details/${table.id}` : `/table/${table.id}`) as any,
    );
  };

  const visibleTables = useMemo(() => {
    const scoped = tables.filter((table) => {
      if (!isWaiter) return true;
      const status = String(table.status).toUpperCase();
      if (status === 'AVAILABLE' || status === 'RESERVED') return true;
      return (
        table.activeSession?.waiterId != null &&
        String(table.activeSession.waiterId) === String(userId)
      );
    });
    return [...scoped].sort((a, b) => statusPriority(a.status) - statusPriority(b.status));
  }, [tables, isWaiter, userId]);

  const counts = useMemo(() => {
    const occupied = visibleTables.filter(
      (t) => t.status === 'OCCUPIED' || t.status === 'PENDING_BILL',
    ).length;
    const free = visibleTables.filter((t) => t.status === 'AVAILABLE').length;
    const mine = visibleTables.filter(
      (t) =>
        t.activeSession?.waiterId != null &&
        String(t.activeSession.waiterId) === String(userId),
    ).length;
    return { occupied, free, mine };
  }, [visibleTables, userId]);

  const cellWidth = getResponsiveValue(
    { xs: '48.5%', sm: '31.5%', md: '23.5%', lg: '18.8%', xl: '15.6%' },
    breakpoint,
  ) as `${number}%`;

  return (
    <>
      <SectionCard
        icon="view-grid"
        iconColor={COLORS.cyan}
        title="Floor Plan"
        count={visibleTables.length}
        countColor={COLORS.cyan}
        actionLabel="See all"
        onAction={onSeeAll}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <View style={[styles.summaryDot, { backgroundColor: TABLE_STATUS_COLORS.OCCUPIED }]} />
            <Text style={styles.summaryText}>{counts.occupied} occupied</Text>
          </View>
          <View style={styles.summaryChip}>
            <View style={[styles.summaryDot, { backgroundColor: TABLE_STATUS_COLORS.AVAILABLE }]} />
            <Text style={styles.summaryText}>{counts.free} free</Text>
          </View>
          {isWaiter && (
            <View style={styles.summaryChip}>
              <View style={[styles.summaryDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.summaryText}>{counts.mine} mine</Text>
            </View>
          )}
        </View>

        <View style={styles.grid}>
          {visibleTables.map((table) => {
            const reserved =
              table.status === 'RESERVED' || table.is_reserved === true;
            const status =
              reserved && table.status === 'AVAILABLE' ? 'RESERVED' : table.status;
            const color = TABLE_STATUS_COLORS[status] || COLORS.primary;
            const isMine =
              table.activeSession?.waiterId != null &&
              String(table.activeSession.waiterId) === String(userId);
            const busy = table.status === 'OCCUPIED' || table.status === 'PENDING_BILL';
            const purpleTile = reserved || table.status === 'OCCUPIED';
            const purple = TABLE_STATUS_COLORS.RESERVED;
            const tileBackground = purpleTile
              ? purple
              : status === 'AVAILABLE'
                ? COLORS.white
                : color + '12';
            const tileBorder = purpleTile ? purple : color;
            const contentColor = purpleTile ? COLORS.white : COLORS.text;
            const metaColor = purpleTile ? '#EDE9FE' : COLORS.muted;

            const isAvailable = table.status === 'AVAILABLE';

            return (
              <View key={table.id} style={[styles.cell, { width: cellWidth }]}>
                <Hoverable
                  ref={setTileRef(table.id)}
                  style={[
                    styles.tile,
                    { backgroundColor: tileBackground, borderColor: tileBorder },
                  ]}
                  onPress={() => {
                    if (isAvailable || reserved) handleTablePress(table);
                    else if (String(table.status).toUpperCase() !== 'CLEANING')
                      openTableOrder(table);
                  }}
                  hoverOpacity={0.8}
                >
                  <View style={styles.tileTop}>
                    <Text
                      style={[styles.tileNumber, { color: contentColor }]}
                      numberOfLines={1}
                    >
                      {table.tableNumber}
                    </Text>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: purpleTile ? COLORS.white : color },
                      ]}
                    />
                  </View>

                  {busy ? (
                    <View style={styles.tileMeta}>
                      <MaterialCommunityIcons
                        name="clock-outline"
                        size={10}
                        color={purpleTile ? '#EDE9FE' : COLORS.muted}
                      />
                      <Text style={[styles.tileMetaText, { color: metaColor }]}>
                        {getElapsed(table.id)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.tileMeta}>
                      <MaterialCommunityIcons
                        name="seat"
                        size={10}
                        color={purpleTile ? '#EDE9FE' : COLORS.muted}
                      />
                      <Text style={[styles.tileMetaText, { color: metaColor }]}>
                        {table.capacity}
                      </Text>
                      <Text
                        style={[
                          styles.tileMetaText,
                          { color: purpleTile ? COLORS.white : color },
                        ]}
                      >
                        {status === 'AVAILABLE'
                          ? 'Free'
                          : status === 'RESERVED'
                            ? 'Reserved'
                            : 'Clean'}
                      </Text>
                    </View>
                  )}

                  <View style={styles.tileTags}>
                    {table.status === 'PENDING_BILL' && (
                      <View style={[styles.tag, { backgroundColor: TABLE_STATUS_COLORS.PENDING_BILL }]}>
                        <Text style={styles.tagText}>BILL</Text>
                      </View>
                    )}
                    {isMine && (
                      <View
                        style={[
                          styles.tag,
                          purpleTile ? { backgroundColor: COLORS.white } : styles.tagMine,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tagText,
                            purpleTile && { color: purple },
                          ]}
                        >
                          ME
                        </Text>
                      </View>
                    )}
                  </View>
                </Hoverable>
              </View>
            );
          })}
        </View>

        <View style={styles.legend}>
          {LEGEND.map((item) => (
            <View key={item.status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: TABLE_STATUS_COLORS[item.status] }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      {popoverTable && popoverAnchorRef && (
        <Popover
          visible={true}
          anchorRef={popoverAnchorRef}
          onClose={closePopover}
          items={
            popoverTable.status === 'RESERVED' || popoverTable.is_reserved === true
              ? [
                  {
                    label: 'Take Order',
                    icon: 'restaurant',
                    onPress: () => handleTakeOrder(popoverTable),
                  },
                  {
                    label: 'Free Table',
                    icon: 'lock-open',
                    onPress: () => handleFreeTable(popoverTable),
                  },
                ]
              : [
                  {
                    label: 'Take Order',
                    icon: 'restaurant',
                    onPress: () => handleTakeOrder(popoverTable),
                  },
                  {
                    label: 'Reserve Table',
                    icon: 'bookmark-outline',
                    onPress: () => handleReserve(popoverTable),
                    disabled: String(popoverTable.status).toUpperCase() !== 'AVAILABLE',
                  },
                ]
          }
          position="auto"
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
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
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 8,
    minHeight: 78,
    justifyContent: 'space-between',
    gap: 4,
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.text,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexWrap: 'wrap',
  },
  tileMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    marginRight: 2,
  },
  tileTags: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 16,
  },
  tag: {
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tagMine: {
    backgroundColor: COLORS.primary,
  },
  tagText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 0.4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
  },
});
