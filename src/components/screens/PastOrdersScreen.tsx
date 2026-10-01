'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { Order, StaffUser, api } from '@/services/api';
import { orderApi } from '@/services/orderApi';
import { executeOrderPrint } from '@/utils/print';
import {
  clearAllHistory,
  getClearedState,
  isOrderCleared,
  removeOrderFromHistory,
} from '@/utils/clearedHistory';
import { webAlert } from '@/utils/webAlert';

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const COLOR_SUCCESS = '#16A34A';
const COLOR_ERROR = '#D32F2F';
const BG_LIGHT = '#F0F4FF';
const BG_WHITE = '#FFFFFF';
const BORDER_COLOR = '#CBD5E1';
const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

type HistoryStatus = 'ALL' | 'COMPLETED' | 'CANCELLED' | 'SERVED' | 'PAID';

interface PastOrdersScreenProps {
  user: StaffUser | null;
  onBack: () => void;
}

interface GroupedOrders {
  date: string;
  label: string;
  orders: Order[];
  dayTotal: number;
}

function groupOrdersByDate(orders: Order[]): GroupedOrders[] {
  const groups: Record<string, { orders: Order[]; dayTotal: number }> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const order of orders) {
    const d = new Date(order.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { orders: [], dayTotal: 0 };
    groups[key].orders.push(order);
    groups[key].dayTotal += Number(order.totalAmount || 0);
  }

  const result: GroupedOrders[] = [];
  for (const [key, val] of Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))) {
    const d = new Date(key + 'T00:00:00');
    let label = key;
    if (d.getTime() === today.getTime()) label = 'Today';
    else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    result.push({ date: key, label, orders: val.orders, dayTotal: val.dayTotal });
  }
  return result;
}

// PAID bucket: an order is PAID when it was settled (bill requested in order
// details, or an actual payment). CANCELLED orders are always recorded UNPAID.
function isPaidLike(o: Order): boolean {
  if (o.status === 'CANCELLED') return false;
  return o.paymentStatus === 'PAID' || !!o.billRequested;
}

export function PastOrdersScreen({ user, onBack }: PastOrdersScreenProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HistoryStatus>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState<'from' | 'to' | null>(null);
  const [historyCleared, setHistoryCleared] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = user?.id ?? null;

  const fetchOrders = useCallback(async (search?: string, status?: HistoryStatus, from?: string, to?: string) => {
    setLoading(true);
    try {
      const isPaidFilter = status === 'PAID';
      const statusParam = status === 'ALL' || isPaidFilter ? undefined : status;
      const res = await orderApi.getOrders({
        page: 1,
        limit: 10000,
        search: search || undefined,
        status: statusParam,
        waiterId: user?.id,
        dateFrom: from || undefined,
        dateTo: to || undefined,
      });
      if (res.success && res.data) {
        const list = isPaidFilter
          ? res.data.orders.filter(isPaidLike)
          : res.data.orders;
        const uid = user?.id ?? null;
        const visible = list.filter((o) => !isOrderCleared(o, uid));
        setOrders(visible);
        setHistoryCleared(getClearedState(uid).clearedAt !== null && visible.length === 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchOrders();
    });
  }, [fetchOrders]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchOrders(q, statusFilter, dateFrom || undefined, dateTo || undefined);
    }, 400);
  }, [statusFilter, dateFrom, dateTo, fetchOrders]);

  const handleDateFilter = useCallback(() => {
    fetchOrders(searchQuery, statusFilter, dateFrom || undefined, dateTo || undefined);
  }, [searchQuery, statusFilter, dateFrom, dateTo, fetchOrders]);

  const clearDateFilter = useCallback(() => {
    setDateFrom('');
    setDateTo('');
    fetchOrders(searchQuery, statusFilter, undefined, undefined);
  }, [searchQuery, statusFilter, fetchOrders]);

  const handleStatusChange = useCallback((s: HistoryStatus) => {
    setStatusFilter(s);
    fetchOrders(searchQuery, s, dateFrom || undefined, dateTo || undefined);
  }, [searchQuery, dateFrom, dateTo, fetchOrders]);

  const grouped = useMemo(() => groupOrdersByDate(orders), [orders]);

  const stats = useMemo(() => {
    const total = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const paid = orders.filter(isPaidLike).length;
    const unpaid = total - paid;
    return { total, totalRevenue, paid, unpaid };
  }, [orders]);

  const handleClearHistory = () => {
    webAlert(
      'Clear History',
      'Permanently delete all past order receipts from your history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear History',
          style: 'destructive',
          onPress: () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            clearAllHistory(userId);
            setSelectedOrder(null);
            setOrders([]);
            setSearchQuery('');
            setStatusFilter('ALL');
            setDateFrom('');
            setDateTo('');
            setShowDatePicker(null);
            setHistoryCleared(true);
            setLoading(false);
          },
        },
      ]
    );
  };

  const handleClearOrderHistory = (orderId: number) => {
    webAlert(
      'Clear History',
      `Permanently delete Order #${orderId} from your history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear History',
          style: 'destructive',
          onPress: () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            removeOrderFromHistory(orderId, userId);
            const next = orders.filter((o) => o.id !== orderId);
            setSelectedOrder(null);
            setOrders(next);
            if (next.length === 0) {
              setHistoryCleared(getClearedState(userId).clearedAt !== null);
              setSearchQuery('');
              setStatusFilter('ALL');
              setDateFrom('');
              setDateTo('');
              setShowDatePicker(null);
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handlePrintBill = async (orderId: number) => {
    try {
      const order = orders.find(o => o.id === orderId);
      const success = await executeOrderPrint(orderId, order);
      if (success) {
        webAlert('Printing', 'Receipt sent to printer!');
      } else {
        webAlert('Notice', 'Print dialog displayed or sent to print queue.');
      }
    } catch {
      webAlert('Error', 'Failed to connect to printer.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Past Order Receipts</Text>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLOR_SUCCESS }]}>Rs. {stats.totalRevenue.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLOR_SUCCESS }]}>{stats.paid}</Text>
          <Text style={styles.statLabel}>Paid</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: stats.unpaid > 0 ? BRAND_ORANGE : TEXT_MUTED }]}>{stats.unpaid}</Text>
          <Text style={styles.statLabel}>Unpaid</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBarWrapper}>
          <MaterialIcons name="search" size={20} color={TEXT_MUTED} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by order ID or table..."
            placeholderTextColor={TEXT_MUTED}
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <MaterialIcons name="close" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* Clear History */}
        {historyCleared ? (
          <View style={styles.clearHistoryRow}>
            <MaterialIcons name="delete-outline" size={16} color={COLOR_ERROR} />
            <Text style={styles.clearHistoryRowText}>History cleared</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.clearHistoryRow} onPress={handleClearHistory}>
            <MaterialIcons name="delete-outline" size={16} color={COLOR_ERROR} />
            <Text style={styles.clearHistoryRowText}>Clear History</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date Filter */}
      <View style={styles.dateFilterSection}>
        <View style={styles.dateInputRow}>
          <TouchableOpacity
            style={[styles.dateInput, dateFrom && styles.dateInputActive]}
            onPress={() => setShowDatePicker('from')}
          >
            <MaterialIcons name="calendar-today" size={14} color={dateFrom ? BRAND_ORANGE : TEXT_MUTED} />
            <Text style={[styles.dateInputText, dateFrom && styles.dateInputTextActive]}>
              {dateFrom || 'From'}
            </Text>
          </TouchableOpacity>
          <View style={{ marginHorizontal: 4 }}>
            <MaterialIcons name="arrow-forward" size={16} color={TEXT_MUTED} />
          </View>
          <TouchableOpacity
            style={[styles.dateInput, dateTo && styles.dateInputActive]}
            onPress={() => setShowDatePicker('to')}
          >
            <MaterialIcons name="calendar-today" size={14} color={dateTo ? BRAND_ORANGE : TEXT_MUTED} />
            <Text style={[styles.dateInputText, dateTo && styles.dateInputTextActive]}>
              {dateTo || 'To'}
            </Text>
          </TouchableOpacity>
          {!!(dateFrom || dateTo) && (
            <TouchableOpacity onPress={clearDateFilter} style={styles.clearDateBtn}>
              <MaterialIcons name="close" size={16} color={COLOR_ERROR} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Filters */}
      <View style={styles.filterRow}>
        {(['ALL', 'COMPLETED', 'CANCELLED', 'SERVED', 'PAID'] as const).map((s) => {
          const active = statusFilter === s;
          const colors: Record<string, { bg: string; text: string }> = {
            ALL: { bg: '#F3F4F6', text: '#374151' },
            COMPLETED: { bg: '#DCFCE7', text: '#16A34A' },
            CANCELLED: { bg: '#FEE2E2', text: '#DC2626' },
            SERVED: { bg: '#DBEAFE', text: '#2563EB' },
            PAID: { bg: '#DCFCE7', text: '#16A34A' },
          };
          const c = colors[s];
          return (
            <TouchableOpacity
              key={s}
              activeOpacity={0.7}
              onPress={() => handleStatusChange(s)}
              style={[styles.filterChip, {
                backgroundColor: active ? c.bg : '#F3F4F6',
                borderWidth: active ? 1.5 : 0,
                borderColor: active ? c.text : 'transparent',
              }]}
            >
              <Text style={[styles.filterChipText, { color: active ? c.text : '#9CA3AF', fontWeight: active ? '800' : '600' }]}>
                {s === 'PAID' ? 'PAID (all)' : s.charAt(0) + s.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Orders List */}
      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {loading && orders.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={BRAND_ORANGE} />
            <Text style={styles.emptyStateText}>Loading orders...</Text>
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt" size={48} color={TEXT_MUTED} />
            <Text style={styles.emptyStateText}>
              {historyCleared ? 'History cleared' : 'No past orders found'}
            </Text>
            {historyCleared ? (
              <Text style={{ color: TEXT_MUTED, marginTop: 4 }}>All past order receipts have been deleted.</Text>
            ) : (
              !!(searchQuery || dateFrom || dateTo) && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); fetchOrders(undefined, 'ALL', undefined, undefined); }}>
                  <Text style={{ color: BRAND_ORANGE, fontWeight: '600', marginTop: 4 }}>Clear filters</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        ) : (
          grouped.map((group) => (
            <View key={group.date} style={styles.dateGroup}>
              {/* Date Header */}
              <View style={styles.dateGroupHeader}>
                <MaterialIcons name="date-range" size={16} color={BRAND_ORANGE} />
                <Text style={styles.dateGroupLabel}>{group.label}</Text>
                <Text style={styles.dateGroupCount}>{group.orders.length} orders</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.dateGroupTotal}>Rs. {group.dayTotal.toLocaleString()}</Text>
              </View>

              {/* Order Cards */}
              {group.orders.map((order) => {
                const tableName = order.table?.tableNumber || `Table ${order.tableId}`;
                const time = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const statusColors =
                  order.status === 'CANCELLED' ? { bg: '#FEE2E2', text: '#DC2626' } :
                  order.status === 'COMPLETED' ? { bg: '#DCFCE7', text: '#16A34A' } :
                  order.status === 'SERVED' ? { bg: '#DBEAFE', text: '#2563EB' } :
                  { bg: '#F3F4F6', text: '#374151' };
                const paidLike = isPaidLike(order);
                const payBadge =
                  paidLike ? { bg: '#DCFCE7', text: '#16A34A', label: 'PAID' } :
                  { bg: '#FEF3C7', text: '#D97706', label: 'UNPAID' };
                return (
                  <Hoverable
                    key={order.id}
                    style={styles.orderCard}
                    onPress={() => setSelectedOrder(order)}
                    hoverOpacity={0.8}
                  >
                    <View style={styles.orderCardTop}>
                      <View style={styles.orderCardLeft}>
                        <View style={styles.orderCardIcon}>
                          <MaterialCommunityIcons name="receipt" size={20} color={BRAND_ORANGE} />
                        </View>
                        <View>
                          <Text style={styles.orderCardTable}>{tableName}</Text>
                          <Text style={styles.orderCardMeta}>Order #{order.id} · {time}</Text>
                        </View>
                      </View>
                      <Text style={styles.orderCardTotal}>Rs. {Number(order.totalAmount).toLocaleString()}</Text>
                    </View>
                    <View style={styles.orderCardDivider} />
                    <View style={styles.orderCardBottom}>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <View style={[styles.badge, { backgroundColor: statusColors.bg }]}>
                          <Text style={[styles.badgeText, { color: statusColors.text }]}>{order.status}</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: payBadge.bg }]}>
                          <Text style={[styles.badgeText, { color: payBadge.text }]}>{payBadge.label}</Text>
                        </View>
                      </View>
                    </View>
                  </Hoverable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker !== null} transparent animationType="fade" onRequestClose={() => setShowDatePicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(null)}>
          <Pressable style={styles.datePickerModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.datePickerTitle}>{showDatePicker === 'from' ? 'Select Start Date' : 'Select End Date'}</Text>
            <Text style={styles.datePickerHint}>Enter date as YYYY-MM-DD</Text>
            <TextInput
              style={styles.datePickerInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={TEXT_MUTED}
              value={showDatePicker === 'from' ? dateFrom : dateTo}
              onChangeText={(t) => showDatePicker === 'from' ? setDateFrom(t) : setDateTo(t)}
              maxLength={10}
              autoFocus
            />
            <View style={styles.datePickerActions}>
              <TouchableOpacity style={styles.datePickerCancel} onPress={() => setShowDatePicker(null)}>
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.datePickerApply} onPress={() => { setShowDatePicker(null); handleDateFilter(); }}>
                <Text style={styles.datePickerApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Receipt Detail Modal */}
      <Modal visible={selectedOrder !== null} transparent animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
        {selectedOrder && (
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedOrder(null)}>
            <Pressable style={styles.receiptModal} onPress={(e) => e.stopPropagation()}>
              {/* Receipt Header */}
              <View style={styles.receiptHeader}>
                <View style={styles.receiptHeaderTop}>
                  <Text style={styles.receiptTitle}>ORDER #{selectedOrder.id}</Text>
                  <TouchableOpacity onPress={() => setSelectedOrder(null)}>
                    <MaterialIcons name="close" size={22} color={TEXT_MUTED} />
                  </TouchableOpacity>
                </View>
                <View style={styles.receiptBadges}>
                  <View style={[styles.badge, {
                    backgroundColor: selectedOrder.status === 'CANCELLED' ? '#FEE2E2' : selectedOrder.status === 'COMPLETED' ? '#DCFCE7' : '#DBEAFE',
                  }]}>
                    <Text style={[styles.badgeText, {
                      color: selectedOrder.status === 'CANCELLED' ? '#DC2626' : selectedOrder.status === 'COMPLETED' ? '#16A34A' : '#2563EB',
                    }]}>{selectedOrder.status}</Text>
                  </View>
                  <View style={[styles.badge, {
                    backgroundColor: isPaidLike(selectedOrder) ? '#DCFCE7' : '#FEF3C7',
                  }]}>
                    <Text style={[styles.badgeText, {
                      color: isPaidLike(selectedOrder) ? '#16A34A' : '#D97706',
                    }]}>{isPaidLike(selectedOrder) ? 'PAID' : 'UNPAID'}</Text>
                  </View>
                </View>
              </View>

              {/* Paid success banner */}
              {isPaidLike(selectedOrder) && (
                <View style={styles.paidBanner}>
                  <MaterialIcons name="check-circle" size={16} color="#16A34A" />
                  <Text style={styles.paidBannerText}>Bill paid successfully</Text>
                </View>
              )}

              {/* Receipt Meta */}
              <View style={styles.receiptMeta}>
                <View style={styles.receiptMetaRow}>
                  <MaterialIcons name="schedule" size={14} color={TEXT_MUTED} />
                  <Text style={styles.receiptMetaText}>{new Date(selectedOrder.createdAt).toLocaleString()}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <MaterialIcons name="table-restaurant" size={14} color={TEXT_MUTED} />
                  <Text style={styles.receiptMetaText}>Table {selectedOrder.table?.tableNumber || selectedOrder.tableId}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <MaterialIcons name="person" size={14} color={TEXT_MUTED} />
                  <Text style={styles.receiptMetaText}>{selectedOrder.waiter?.name || '—'}</Text>
                </View>
              </View>

              {!!selectedOrder.cancelReason && (
                <View style={styles.receiptCancelBanner}>
                  <MaterialIcons name="cancel" size={14} color="#DC2626" />
                  <Text style={styles.receiptCancelText}>Cancel reason: {selectedOrder.cancelReason}</Text>
                </View>
              )}

              {/* Items */}
              <ScrollView style={styles.receiptItemsScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.receiptItemsHeader}>
                  <Text style={[styles.receiptItemCol, { flex: 1 }]}>ITEM</Text>
                  <Text style={[styles.receiptItemCol, { width: 40, textAlign: 'center' }]}>QTY</Text>
                  <Text style={[styles.receiptItemCol, { width: 80, textAlign: 'right' }]}>AMOUNT</Text>
                </View>
                <View style={styles.receiptDashedLine} />
                {(selectedOrder.items || []).map((oi, i) => (
                  <View key={i} style={styles.receiptItemRow}>
                    <Text style={[styles.receiptItemName, { flex: 1 }]} numberOfLines={1}>
                      {oi.menuItem?.name || api.resolveMenuItemName(oi.menuItemId || 0)}
                    </Text>
                    <Text style={[styles.receiptItemQty, { width: 40, textAlign: 'center' }]}>x{oi.quantity}</Text>
                    <Text style={[styles.receiptItemPrice, { width: 80, textAlign: 'right' }]}>Rs. {Number(oi.price * oi.quantity).toLocaleString()}</Text>
                  </View>
                ))}
                {(!selectedOrder.items || selectedOrder.items.length === 0) && (
                  <Text style={styles.receiptNoItems}>No items recorded</Text>
                )}
              </ScrollView>

              <View style={styles.receiptDashedLine} />

              {/* Totals */}
              <View style={styles.receiptTotals}>
                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>Subtotal</Text>
                  <Text style={styles.receiptTotalValue}>Rs. {Number(selectedOrder.subtotal || 0).toLocaleString()}</Text>
                </View>
                {(selectedOrder.taxAmount || 0) > 0 && (
                  <View style={styles.receiptTotalRow}>
                    <Text style={styles.receiptTotalLabel}>Tax ({selectedOrder.taxRate || 0}%)</Text>
                    <Text style={styles.receiptTotalValue}>Rs. {Number(selectedOrder.taxAmount || 0).toLocaleString()}</Text>
                  </View>
                )}
                {(selectedOrder.serviceCharge || 0) > 0 && (
                  <View style={styles.receiptTotalRow}>
                    <Text style={styles.receiptTotalLabel}>Service Charge</Text>
                    <Text style={styles.receiptTotalValue}>Rs. {Number(selectedOrder.serviceCharge || 0).toLocaleString()}</Text>
                  </View>
                )}
                {(selectedOrder.discount || 0) > 0 && (
                  <View style={styles.receiptTotalRow}>
                    <Text style={[styles.receiptTotalLabel, { color: COLOR_ERROR }]}>Discount</Text>
                    <Text style={[styles.receiptTotalValue, { color: COLOR_ERROR }]}>- Rs. {Number(selectedOrder.discount || 0).toLocaleString()}</Text>
                  </View>
                )}
                <View style={styles.receiptGrandTotal}>
                  <Text style={styles.receiptGrandTotalLabel}>GRAND TOTAL</Text>
                  <Text style={styles.receiptGrandTotalValue}>Rs. {Number(selectedOrder.totalAmount).toLocaleString()}</Text>
                </View>
              </View>

              {/* Payments */}
              {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                <View style={styles.receiptPayments}>
                  <Text style={styles.receiptPaymentsTitle}>Payments</Text>
                  {selectedOrder.payments.map((p, i) => (
                    <View key={i} style={styles.receiptPaymentRow}>
                      <View style={styles.receiptPaymentMethod}>
                        <MaterialIcons name={
                          p.method === 'CASH' ? 'payments' :
                          p.method === 'CARD' ? 'credit-card' :
                          'qr-code-scanner'
                        } size={14} color={TEXT_MUTED} />
                        <Text style={styles.receiptPaymentMethodText}>{p.method}</Text>
                      </View>
                      <Text style={styles.receiptPaymentAmount}>Rs. {Number(p.amount).toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Print Button */}
              <TouchableOpacity style={styles.printBtn} onPress={() => handlePrintBill(selectedOrder.id)}>
                <MaterialIcons name="print" size={18} color="#FFFFFF" />
                <Text style={styles.printBtnText}>Reprint Receipt</Text>
              </TouchableOpacity>

              {/* Clear History Button */}
              <TouchableOpacity style={styles.clearHistoryBtn} onPress={() => handleClearOrderHistory(selectedOrder.id)}>
                <MaterialIcons name="delete-outline" size={18} color={COLOR_ERROR} />
                <Text style={styles.clearHistoryBtnText}>Clear History</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_LIGHT },
  header: { backgroundColor: BRAND_PRIMARY, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  statsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BG_WHITE, marginHorizontal: 16, marginTop: 12, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, borderWidth: 1, borderColor: BORDER_COLOR },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: TEXT_DARK },
  statLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: BORDER_COLOR },
  searchContainer: { backgroundColor: BG_WHITE, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  searchBarWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_DARK, height: '100%' },
  clearHistoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
  clearHistoryRowText: { fontSize: 12, fontWeight: '700', color: COLOR_ERROR },
  clearHistoryRowTextRestore: { fontSize: 12, fontWeight: '700', color: BRAND_ORANGE },
  dateFilterSection: { backgroundColor: BG_WHITE, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  dateInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dateInput: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  dateInputActive: { borderColor: BRAND_ORANGE, backgroundColor: '#FFF7ED' },
  dateInputText: { fontSize: 12, color: TEXT_MUTED, fontWeight: '600' },
  dateInputTextActive: { color: BRAND_ORANGE },
  clearDateBtn: { padding: 4 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  filterChipText: { fontSize: 12 },
  bodyScroll: { flex: 1, backgroundColor: BG_LIGHT },
  bodyContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 90 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  emptyStateText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  dateGroup: { marginBottom: 16 },
  dateGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  dateGroupLabel: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  dateGroupCount: { fontSize: 12, color: TEXT_MUTED },
  dateGroupTotal: { fontSize: 13, fontWeight: '700', color: BRAND_ORANGE },
  orderCard: { backgroundColor: BG_WHITE, borderRadius: 14, borderWidth: 1, borderColor: BORDER_COLOR, padding: 12, marginBottom: 8, shadowColor: BRAND_PRIMARY, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderCardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center' },
  orderCardTable: { fontSize: 15, fontWeight: '800', color: TEXT_DARK },
  orderCardMeta: { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  orderCardTotal: { fontSize: 16, fontWeight: '800', color: COLOR_SUCCESS },
  orderCardDivider: { height: 1, backgroundColor: BORDER_COLOR, marginVertical: 8 },
  orderCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  // Receipt Modal
  receiptModal: { backgroundColor: BG_WHITE, borderRadius: 16, width: '100%', maxHeight: '85%', padding: 0, overflow: 'hidden' },
  receiptHeader: { backgroundColor: BRAND_PRIMARY, padding: 16 },
  receiptHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  receiptTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  receiptBadges: { flexDirection: 'row', gap: 6 },
  receiptMeta: { padding: 16, paddingBottom: 8, gap: 6 },
  receiptMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptMetaText: { fontSize: 12, color: TEXT_MUTED },
  receiptCancelBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEE2E2', padding: 10, marginHorizontal: 16, borderRadius: 8, marginBottom: 8 },
  receiptCancelText: { fontSize: 12, color: '#DC2626', fontWeight: '600', flex: 1 },
  paidBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#BBF7D0', padding: 10, marginHorizontal: 16, borderRadius: 8, marginBottom: 8 },
  paidBannerText: { fontSize: 13, color: '#16A34A', fontWeight: '800' },
  receiptItemsScroll: { maxHeight: 200, paddingHorizontal: 16 },
  receiptItemsHeader: { flexDirection: 'row', paddingVertical: 6 },
  receiptItemCol: { fontSize: 10, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptDashedLine: { height: 1, backgroundColor: BORDER_COLOR, marginHorizontal: 16, marginVertical: 4 },
  receiptItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  receiptItemName: { fontSize: 13, color: TEXT_DARK, fontWeight: '500' },
  receiptItemQty: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  receiptItemPrice: { fontSize: 13, color: TEXT_DARK, fontWeight: '600' },
  receiptNoItems: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', paddingVertical: 16 },
  receiptTotals: { padding: 16, gap: 4 },
  receiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  receiptTotalLabel: { fontSize: 13, color: TEXT_MUTED },
  receiptTotalValue: { fontSize: 13, color: TEXT_DARK, fontWeight: '600' },
  receiptGrandTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER_COLOR },
  receiptGrandTotalLabel: { fontSize: 14, fontWeight: '800', color: TEXT_DARK },
  receiptGrandTotalValue: { fontSize: 20, fontWeight: '900', color: TEXT_DARK },
  receiptPayments: { paddingHorizontal: 16, paddingBottom: 8 },
  receiptPaymentsTitle: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptPaymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  receiptPaymentMethod: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptPaymentMethodText: { fontSize: 12, color: TEXT_MUTED },
  receiptPaymentAmount: { fontSize: 12, color: TEXT_DARK, fontWeight: '600' },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND_ORANGE, marginHorizontal: 16, marginTop: 16, marginBottom: 8, paddingVertical: 12, borderRadius: 10 },
  printBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  clearHistoryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLOR_ERROR, backgroundColor: '#FEF2F2' },
  clearHistoryBtnText: { fontSize: 14, fontWeight: '700', color: COLOR_ERROR },
  // Date Picker
  datePickerModal: { backgroundColor: BG_WHITE, borderRadius: 16, width: '80%', padding: 20 },
  datePickerTitle: { fontSize: 16, fontWeight: '800', color: TEXT_DARK, marginBottom: 4 },
  datePickerHint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 12 },
  datePickerInput: { borderWidth: 1, borderColor: BORDER_COLOR, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: TEXT_DARK, marginBottom: 16 },
  datePickerActions: { flexDirection: 'row', gap: 10 },
  datePickerCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER_COLOR, alignItems: 'center' },
  datePickerCancelText: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  datePickerApply: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: BRAND_ORANGE, alignItems: 'center' },
  datePickerApplyText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
