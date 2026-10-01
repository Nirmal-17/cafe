'use client';

import React from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { Order } from '@/services/api';
import { COLORS, SectionCard, formatMoney, STATUS_COLORS } from './shared';

interface RowAction {
  label: string;
  color: string;
  onPress: (order: Order) => Promise<void> | void;
}

interface OrderActionListProps {
  title: string;
  icon: string;
  color: string;
  orders: Order[];
  getElapsed: (tableId: number) => string;
  onOrderPress: (order: Order) => void;
  rowAction?: RowAction;
  busyOrderIds?: number[];
  onViewAll?: () => void;
}

export function OrderActionList({
  title,
  icon,
  color,
  orders,
  getElapsed,
  onOrderPress,
  rowAction,
  busyOrderIds = [],
  onViewAll,
}: OrderActionListProps) {
  const visible = orders.slice(0, 6);

  return (
    <SectionCard
      icon={icon}
      iconColor={color}
      title={title}
      count={orders.length}
      countColor={color}
      actionLabel={orders.length > 6 && onViewAll ? 'View all' : undefined}
      onAction={orders.length > 6 && onViewAll ? onViewAll : undefined}
    >
      {visible.map((order, index) => {
        const busy = busyOrderIds.includes(order.id);
        const statusColor = STATUS_COLORS[order.status] || COLORS.primary;
        return (
          <Hoverable
            key={order.id}
            style={[styles.row, index === visible.length - 1 && styles.rowLast]}
            onPress={() => onOrderPress(order)}
            hoverOpacity={0.75}
            accessibilityRole={rowAction ? 'none' : 'button'}
          >
            <View style={[styles.tableChip, { backgroundColor: color + '16' }]}>
              <Text style={[styles.tableChipText, { color }]}>
                {order.table?.tableNumber || `T${order.tableId}`}
              </Text>
            </View>

            <View style={styles.rowBody}>
              <View style={styles.rowMeta}>
                <Text style={styles.itemsText}>
                  {order.items?.length || 0} item{(order.items?.length || 0) === 1 ? '' : 's'}
                </Text>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{order.status}</Text>
              </View>
              <Text style={styles.rowSub}>
                {formatMoney(order.totalAmount)} · {getElapsed(order.tableId)}
              </Text>
            </View>

            {rowAction ? (
              <Hoverable
                style={[styles.actionBtn, { backgroundColor: rowAction.color }, busy && styles.actionBtnBusy]}
                onPress={() => rowAction.onPress(order)}
                disabled={busy}
                hoverOpacity={0.8}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.actionBtnText}>{rowAction.label}</Text>
                )}
              </Hoverable>
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.muted} />
            )}
          </Hoverable>
        );
      })}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  tableChip: {
    minWidth: 46,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  tableChipText: {
    fontSize: 13,
    fontWeight: '900',
  },
  rowBody: {
    flex: 1,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemsText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  rowSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  actionBtn: {
    minWidth: 74,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  actionBtnBusy: {
    opacity: 0.7,
  },
  actionBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
});
