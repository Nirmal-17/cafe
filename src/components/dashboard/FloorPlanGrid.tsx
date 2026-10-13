'use client';

import React, { useMemo, useState, useRef } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { Order, Section, Table, isReservedTable } from '@/services/api';
import { groupTablesBySection } from '@/utils/tableSections';
import { useResponsive, getResponsiveValue } from '@/utils/responsive';
import { isOpenOrder } from '@/utils/openValue';
import { getReservationId, useReservationsRevision } from '@/utils/reservations';
import { COLORS, SectionCard, TABLE_STATUS_COLORS } from './shared';
import { filterTablesByServiceType } from '@/utils/diningArea';
import { Popover } from '@/components/Popover';
import { useRouter } from 'expo-router';

interface FloorPlanGridProps {
  tables: Table[];
  sections?: Section[];
  activeOrders: Order[];
  onChangeTableStatus: (tableId: number, status: string) => Promise<boolean>;
  onSeeAll: () => void;
  // Kept for API compat — Floor Plan is Dine-In only, so this is ignored
  // and delivery/takeaway tables never render here.
  serviceType?: 'dine-in' | 'delivery' | 'takeaway' | 'all';
}

const LEGEND: { status: string; label: string }[] = [
  { status: 'AVAILABLE', label: 'Free' },
  { status: 'RESERVED', label: 'Reserved' },
];

function statusPriority(table: Table): number {
  return isReservedTable(table) ? 1 : 2;
}

export function FloorPlanGrid({
  tables,
  sections,
  activeOrders,
  onChangeTableStatus,
  onSeeAll,
}: FloorPlanGridProps) {
  const { breakpoint } = useResponsive();
  const [popoverTable, setPopoverTable] = useState<Table | null>(null);
  const [popoverAnchorRef, setPopoverAnchorRef] = useState<React.RefObject<View | null> | null>(null);
  const router = useRouter();

  // Re-render the tiles when a RES-#### code is minted or dropped.
  useReservationsRevision();

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

  // Reserve-only: taking an order never changes table status.
  const handleTakeOrder = (table: Table) => {
    const orders = ordersByTable.get(table.id) ?? [];
    closePopover();
    router.push(
      (orders.some(isOpenOrder) ? `/order-details/${table.id}` : `/table/${table.id}`) as any,
    );
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

  // Floor Plan is Dine-In only: it always shows dine-in tables grouped by
  // dining area, no matter which Dine In / Delivery / Takeaway tab is active
  // outside. Delivery / Takeaway ordering still works via the Tables card.
  const visibleTables = useMemo(() => {
    const scoped = filterTablesByServiceType(tables, 'dine-in');
    return [...scoped].sort((a, b) => {
      const diff = statusPriority(a) - statusPriority(b);
      if (diff !== 0) return diff;
      return String(a.tableNumber).localeCompare(String(b.tableNumber), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }, [tables]);

  // Dine-In only: always group by dining area (Indoor / Outdoor / Roof /
  // Cabin / Hall / Garden / Pool / Room) so each area gets its own heading.
  // Names resolve through the sections list — the hosted feed carries no
  // nested section object.
  const groupedTables = useMemo<[string, Table[]][]>(
    () => groupTablesBySection(visibleTables, sections),
    [visibleTables, sections],
  );

  const counts = useMemo(() => {
    const reserved = visibleTables.filter((t) => isReservedTable(t)).length;
    const free = visibleTables.length - reserved;
    return { reserved, free };
  }, [visibleTables]);

  // Dine-in keeps compact tiles: 4 per row on phones so the floor plan
  // fits one screen.
  const cellWidth = getResponsiveValue(
    { xs: '23.5%', sm: '18.8%', md: '15.6%', lg: '13.2%', xl: '11.2%' },
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
            <View style={[styles.summaryDot, { backgroundColor: TABLE_STATUS_COLORS.RESERVED }]} />
            <Text style={styles.summaryText}>{counts.reserved} reserved</Text>
          </View>
          <View style={styles.summaryChip}>
            <View style={[styles.summaryDot, { backgroundColor: TABLE_STATUS_COLORS.AVAILABLE }]} />
            <Text style={styles.summaryText}>{counts.free} free</Text>
          </View>
        </View>

        {groupedTables.map(([sectionName, sectionTables]) => (
          <View key={sectionName} style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>{sectionName}</Text>
            <View style={styles.grid}>
              {sectionTables.map((table) => {
            // Reserve-only: Free (white) or Reserved (solid dark purple).
            const reservedTile = isReservedTable(table);
            const status = reservedTile ? 'RESERVED' : 'AVAILABLE';
            const color = TABLE_STATUS_COLORS[status] || COLORS.primary;
            const darkPurple = TABLE_STATUS_COLORS.RESERVED;
            const tileBackground = reservedTile ? darkPurple : '#FFFFFF';
            const tileBorder = reservedTile ? darkPurple : '#E5E7EB';
            const contentColor = reservedTile ? COLORS.white : COLORS.text;
            const metaColor = reservedTile ? '#EDE9FE' : COLORS.muted;
            const reservationId = reservedTile ? getReservationId(table.id) : null;

            return (
              <View key={table.id} style={[styles.cell, { width: cellWidth }]}>
                <Hoverable
                  ref={setTileRef(table.id)}
                  style={[
                    styles.tile,
                    { backgroundColor: tileBackground, borderColor: tileBorder },
                  ]}
                  onPress={() => handleTablePress(table)}
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
                        { backgroundColor: reservedTile ? COLORS.white : color },
                      ]}
                    />
                  </View>

                  <View style={styles.tileMeta}>
                    <MaterialCommunityIcons
                      name="seat"
                      size={9}
                      color={reservedTile ? '#EDE9FE' : COLORS.muted}
                    />
                    <Text style={[styles.tileMetaText, { color: metaColor }]}>
                      {table.capacity}
                    </Text>
                    <Text
                      style={[
                        styles.tileMetaText,
                        { color: reservedTile ? COLORS.white : color },
                      ]}
                    >
                      {reservedTile ? 'Res.' : 'Free'}
                    </Text>
                  </View>

                  {reservationId ? (
                    <View style={styles.tileTags}>
                      <View
                        style={[
                          styles.tag,
                          { backgroundColor: reservedTile ? COLORS.white : COLORS.primary },
                        ]}
                      >
                        <Text
                          style={[styles.tagText, reservedTile && { color: darkPurple }]}
                          numberOfLines={1}
                        >
                          {reservationId}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </Hoverable>
              </View>
            );
          })}
            </View>
          </View>
        ))}

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
            isReservedTable(popoverTable)
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
                    disabled: isReservedTable(popoverTable),
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
    marginHorizontal: -3,
  },
  sectionGroup: {
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0E5A6B',
    marginBottom: 6,
  },
  cell: {
    paddingHorizontal: 3,
    paddingBottom: 6,
  },
  tile: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 6,
    minHeight: 56,
    justifyContent: 'space-between',
    gap: 2,
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileNumber: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.text,
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexWrap: 'wrap',
  },
  tileMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.muted,
    marginRight: 2,
  },
  tileTags: {
    flexDirection: 'row',
    gap: 4,
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
