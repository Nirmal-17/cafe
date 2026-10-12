import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo, useRef , Fragment } from 'react';
import {
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  Platform,
  Pressable,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Order, PaymentMethod, UnpaidBill } from '@/services/api';
import { orderApi } from '@/services/orderApi';
import { Hoverable } from '@/components/Hoverable';
import { webAlert } from '@/utils/webAlert';
import { notifyOrderReady } from '@/utils/orderReadyToast';
import { notifyOrderServed } from '@/utils/orderServedToast';
import { notifyBillRequested } from '@/utils/orderBillToast';
import { playAlertSound } from '@/utils/alertSound';
import { switchMainTab, requestMainRefresh } from '@/utils/mainTab';
import { goBackOrHome } from '@/utils/navigation';
import { useReservationId } from '@/utils/reservations';

const THEME_YELLOW = '#FFD600';
const THEME_ORANGE = '#FF6D00';
const THEME_BLACK = '#0a0a09';
const BRAND_DARK_ORANGE = '#E65100';
const BRAND_BLACK = '#000000';
const BRAND_WHITE = '#FFFFFF';
const COLOR_SUCCESS = '#2E7D32';
const BORDER_COLOR  = '#0eb8a4';
const BG_LIGHT      = '#eff2ef';

export default function OrderDetailsScreen() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const router = useRouter();
  // RES-#### id this table carries while it is reserved / being served.
  const reservationId = useReservationId(Number(tableId));

  // Android hardware back button
  useEffect(() => {
    if (Platform.OS === 'web') return; // BackHandler is Android-only
    const handler = () => { goBackOrHome(); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [router]);

  const [table, setTable]   = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [billActionId, setBillActionId] = useState<number | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);
  // Orders cancelled on this screen are no longer returned by the server
  // (table detail only lists active orders) — keep them so the cancelled /
  // unpaid record stays visible for as long as this screen is open.
  const cancelledLocallyRef = useRef<Map<number, Order>>(new Map());

  // ─── Payment (api.txt §6): QR + cashier checkout ──────────────────────────
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [unpaidBills, setUnpaidBills] = useState<UnpaidBill[] | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  // ─── Fetch real ACTIVE orders for this specific table ───────────────────────
  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // Payment sources (api.txt §6) refresh alongside every load, but in the
      // background: a slow or absent /qr / /cashier route must never delay
      // the order list. Servers that exclude bill-requested orders from the
      // table detail still surface their bill through unpaid-bills.
      Promise.all([api.getQr(), api.getUnpaidBills()])
        .then(([qrRes, billsRes]) => {
          if (qrRes.success && qrRes.data) {
            const url = String(qrRes.data.qrUrl || '').trim();
            setQrUrl(url || null);
          }
          if (billsRes.success && Array.isArray(billsRes.data)) {
            setUnpaidBills(billsRes.data);
          }
        })
        .catch(() => {});

      // Single call: table detail includes active orders for this table
      const tableRes = await orderApi.getTableDetail(Number(tableId));

      if (tableRes.success && tableRes.data) {
        setTable(tableRes.data);
        // Server already filters to this table's active orders
        const serverOrders = ((tableRes.data.orders || tableRes.data.activeOrders) as Order[] | undefined) || [];
        const serverIds = new Set(serverOrders.map((o) => o.id));
        const cancelledExtras = [...cancelledLocallyRef.current.values()].filter((o) => !serverIds.has(o.id));
        setOrders([...serverOrders, ...cancelledExtras]);
      } else {
        setError(tableRes.error || 'Failed to load table');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  // Subscribe to real-time events for this table
  useEffect(() => {
    if (!tableId) return;

    const handleEvent = (event: { type: string; payload: any }) => {
      const tableIdNum = Number(tableId);
      // Only process events relevant to this table
      if (event.payload?.tableId && Number(event.payload.tableId) !== tableIdNum) return;

      if (event.type === 'order.created' || event.type === 'order.status' || event.type === 'order.cancelled') {
        if (event.type === 'order.status' && event.payload?.status === 'READY') {
          notifyOrderReady(event.payload.orderId, api.resolveTableName(tableIdNum));
        }
        if (event.type === 'order.status' && event.payload?.billRequested === true) {
          notifyBillRequested(event.payload.orderId, api.resolveTableName(tableIdNum));
        }
        // Refetch to get fresh data with correct status/items
        fetchData();
      } else if (event.type === 'order.paid') {
        // Order paid - refetch
        fetchData();
      } else if (event.type === 'table.status' || event.type === 'table.session') {
        // Table status/session changed - refetch
        fetchData();
      }
    };

    unsubRef.current = api.subscribeToEvents(handleEvent);
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [tableId, fetchData]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) fetchData(); });
    return () => { mounted = false; };
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  const handleRequestBill = async (order: Order) => {
    playAlertSound();
    setBillActionId(order.id);
    try {
      const response = await orderApi.requestBill(order.id);
      if (!response.success) throw new Error(response.error);
      // Bill request checks the order out: recorded PAID + COMPLETED.
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      await webAlert(
        'Bill Requested',
        'Bill is requested for payment..',
        [{ text: 'OK' }]
      );
      // Table status is reserve-only — resync home now instead of waiting
      // for its next heartbeat.
      requestMainRefresh();
      switchMainTab('orders');
      router.dismissTo('/' as any);
    } catch (err: any) {
      await webAlert('Error', err?.message || 'Could not request the bill. Please try again.');
    } finally {
      setBillActionId(null);
    }
  };

  const handleMarkServed = async (order: Order) => {
    try {
      await orderApi.updateOrderStatus(order.id, 'SERVED');
      notifyOrderServed(order.id, table?.tableNumber);
      await fetchData();
    } catch {
      await webAlert('Error', 'Failed to update order.');
    }
  };

  // ─── Grand Total across all active orders ────────────────────────────────────
  const grandTotal = useMemo(() => {
    return orders.reduce((acc, ord) => {
      if (ord.status === 'CANCELLED') return acc;
      if (ord.items && ord.items.length > 0) {
        return acc + ord.items.reduce((iAcc, it: any) => iAcc + Number(it.price) * Number(it.quantity), 0);
      }
      return acc + Number(ord.totalAmount || 0);
    }, 0);
  }, [orders]);

  // ─── Collect payment (POST /api/cashier/checkout, api.txt §6) ───────────────
  /** Unpaid-bill rows the server attributes to this table. */
  const tableBills = useMemo(
    () =>
      (unpaidBills || []).filter(
        (bill) => bill.tableId !== undefined && Number(bill.tableId) === Number(tableId),
      ),
    [unpaidBills, tableId],
  );

  /**
   * What the customer still owes: the on-screen orders when the detail lists
   * them, otherwise the bills feed (servers may exclude bill-requested orders
   * from the table detail — this screen must still be able to settle them).
   */
  const amountDue = useMemo(() => {
    if (orders.length > 0) return grandTotal;
    return tableBills.reduce((sum, bill) => sum + Number(bill.totalAmount ?? bill.amount ?? 0), 0);
  }, [orders.length, grandTotal, tableBills]);

  /**
   * Unpaid order ids for THIS table. The screen's own table detail is the
   * base; rows from GET /cashier/unpaid-bills fill in anything the detail has
   * not rendered — but only rows that name this table, because an unscoped id
   * could belong to another table and checking it out would settle its bill.
   */
  const collectableOrderIds = (): number[] => {
    const local = orders
      .filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED')
      .map((o) => o.id);
    const serverIds: number[] = [];
    for (const bill of tableBills) {
      if (Array.isArray(bill.orderIds) && bill.orderIds.length > 0) {
        serverIds.push(...bill.orderIds.map(Number));
      } else if (Number.isFinite(Number(bill.id))) {
        serverIds.push(Number(bill.id));
      }
    }
    return [...new Set([...local, ...serverIds])];
  };

  const openCollectPayment = async () => {
    setPayAmount(amountDue > 0 ? String(amountDue) : '');
    setShowPayModal(true);
    // Re-read the authoritative unpaid-bill list — the modal must reflect the
    // server, not a snapshot from screen load.
    const res = await api.getUnpaidBills();
    if (res.success && Array.isArray(res.data)) setUnpaidBills(res.data);
  };

  const handleCollectPayment = async () => {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      await webAlert('Invalid Amount', 'Enter the amount received from the customer.');
      return;
    }
    const orderIds = collectableOrderIds();
    if (orderIds.length === 0) {
      await webAlert('Nothing to Pay', 'This table has no unpaid order.');
      return;
    }
    setPaying(true);
    try {
      const res = await api.cashierCheckout({
        tableId: Number(tableId),
        orderIds,
        paymentMethod: payMethod,
        amountPaid: amount,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || 'The server rejected this checkout');
      }
      setShowPayModal(false);
      const method = res.data.payment?.method || payMethod;
      await webAlert('Payment Successful', `${payAmount} received via ${method}.`, [{ text: 'OK' }]);
      // Home still holds the pre-payment snapshot — resync right away (the
      // checkout settles the bill and frees the table server-side).
      requestMainRefresh();
      switchMainTab('home');
      router.dismissTo('/' as any);
    } catch (err: any) {
      await webAlert('Payment Failed', err?.message || 'Could not complete the checkout. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  // ─── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBackOrHome} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={THEME_ORANGE} />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBackOrHome} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <Hoverable style={styles.retryBtn} onPress={fetchData} hoverOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Hoverable>
        </View>
      </SafeAreaView>
    );
  }

  const tableName = (
    (table?.tableNumber && !table.tableNumber.toLowerCase().startsWith('table '))
      ? table.tableNumber
      : api.resolveTableName(Number(tableId))
  ).toUpperCase();

  return (
    <Fragment>
      <SafeAreaView style={styles.root} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackOrHome} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tableName} — Order Details</Text>
        <TouchableOpacity onPress={fetchData} style={styles.backBtn}>
          <MaterialIcons name="refresh" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[THEME_ORANGE]} />}
      >
        {/* ─── Reservation id for this table ─── */}
        {reservationId ? (
          <View style={styles.reservationBar}>
            <MaterialIcons name="bookmark" size={14} color={THEME_ORANGE} />
            <Text style={styles.reservationBarText}>Reservation {reservationId}</Text>
          </View>
        ) : null}

        {/* ─── Empty State ─── */}
        {orders.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt-text-outline" size={56} color="#CBD5E1" />
            <Text style={styles.emptyStateTitle}>No Active Orders</Text>
            <Text style={styles.emptyStateSubtitle}>This table has no pending orders right now.</Text>
            <Hoverable
              style={styles.addFirstOrderBtn}
              onPress={() => {
                switchMainTab('home');
                router.dismissTo('/' as any);
              }}
              hoverOpacity={0.8}
            >
              <MaterialIcons name="add" size={20} color="#FFF" />
              <Text style={styles.addFirstOrderBtnText}>ADD ORDERS</Text>
            </Hoverable>
          </View>
        )}

        {/* ─── Orders List (Order 1, Order 2, …) ─── */}
        {orders.map((order, idx) => {
          const items = order.items || [];
          const orderTotal = items.reduce((acc, it: any) => acc + Number(it.price) * Number(it.quantity), 0);
          const createdTime = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const lastAddedTime = new Date(order.updatedAt || order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const orderSequence = idx + 1; // Sequential per-table order number

          // Status colour
          const statusColor =
            order.status === 'PENDING'   ? '#CA8A04' :
            order.status === 'PREPARING' ? THEME_ORANGE :
            order.status === 'READY'     ? COLOR_SUCCESS :
            order.status === 'SERVED'    ? '#0284C7' :
            '#94A3B8';

          return (
            <View key={order.id} style={styles.orderCard}>
              {/* Order header */}
              <View style={styles.orderCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.orderNumberBadge}>
                    <Text style={styles.orderNumberBadgeText}>#{orderSequence}</Text>
                  </View>
                  <Text style={styles.orderCardTitle}>Order #{order.id}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
                    <Text style={[styles.statusPillText, { color: statusColor }]}>{order.status}</Text>
                  </View>
                  <Text style={styles.orderCardMeta}>{createdTime}</Text>
                </View>
              </View>

              {/* ─── Items Table ─── */}
              {/* Table header row */}
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 0.6 }]}>S.N.</Text>
                <Text style={[styles.th, { flex: 2.4 }]}>Item Name</Text>
                <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>Qty.</Text>
                <Text style={[styles.th, { flex: 1.0, textAlign: 'right' }]}>Rate</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Time</Text>
              </View>

              {/* Table data rows */}
              {items.map((item: any, iIdx: number) => {
                const itemName = item.menuItem?.name || api.resolveMenuItemName(item.menuItemId || 0);
                const dest = api.getItemDestination(itemName, item.menuItem?.category?.name);
                const isKitchen = dest === 'KITCHEN';

                return (
                  <View
                    key={item.id || iIdx}
                    style={[styles.tableRow, { backgroundColor: iIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }]}
                  >
                    <Text style={[styles.td, { flex: 0.5, fontWeight: '700', color: THEME_ORANGE }]}>{iIdx + 1}</Text>
                    <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[styles.td, { paddingRight: 2 }]} numberOfLines={1}>
                        {itemName}
                      </Text>
                      <View style={{
                        backgroundColor: isKitchen ? '#FEF3C7' : '#E0F2FE',
                        paddingHorizontal: 5,
                        paddingVertical: 1.5,
                        borderRadius: 4,
                      }}>
                        <Text style={{
                          fontSize: 9,
                          fontWeight: '800',
                          color: isKitchen ? '#B45309' : '#0369A1',
                          textTransform: 'uppercase',
                        }}>
                          {isKitchen ? '🍳 Kitchen' : '🍸 Counter'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{Number(item.quantity).toFixed(0)}</Text>
                    <Text style={[styles.td, { flex: 1.0, textAlign: 'right' }]}>{Number(item.price).toFixed(0)}</Text>
                    <Text style={[styles.td, { flex: 1.1, textAlign: 'right', fontSize: 11, color: '#94A3B8' }]}>{createdTime}</Text>
                  </View>
                );
              })}

              {['PENDING', 'PREPARING', 'READY'].includes(order.status || '') && (
                <View style={order.status === 'READY' ? styles.readyStateBox : styles.preparingStateBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons
                        name={order.status === 'READY' ? 'check-circle' : 'restaurant-menu'}
                        size={18}
                        color={order.status === 'READY' ? '#059669' : '#EA580C'}
                      />
                      <Text style={order.status === 'READY' ? styles.readyStateText : styles.preparingStateText}>
                        {order.status === 'READY'
                          ? 'Ready for serving'
                          : order.status === 'PREPARING'
                            ? 'Kitchen is preparing this order'
                            : 'Order placed · awaiting kitchen'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.markServedBtn}
                      onPress={() => handleMarkServed(order)}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="done-all" size={14} color="#FFFFFF" />
                      <Text style={styles.markServedBtnText}>Mark Served</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {order.status === 'SERVED' && (
                <View style={styles.servedStateBox}>
                  <MaterialIcons name="done-all" size={16} color="#0284C7" />
                  <Text style={styles.servedStateText}>Items served to table</Text>
                </View>
              )}

              {order.status === 'CANCELLED' && (
                <View style={styles.cancelledStateBox}>
                  <MaterialIcons name="cancel" size={16} color="#DC2626" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cancelledStateText}>This order was cancelled · UNPAID</Text>
                    {order.cancelReason ? (
                      <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Reason: {order.cancelReason}</Text>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>CANCELLED</Text>
                  </View>
                </View>
              )}

              {/* Order subtotal */}
              <View style={styles.orderSubtotalRow}>
                <View>
                  <Text style={styles.orderSubtotalLabel}>Total</Text>
                  <Text style={styles.orderUpdatedTime}>Last item added {lastAddedTime}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {order.paymentStatus === 'PAID' && (
                    <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A' }}>PAID</Text>
                    </View>
                  )}
                  <Text style={styles.orderSubtotalAmount}>Rs. {orderTotal.toFixed(2)}</Text>
                </View>
              </View>

              {order.customerNotes ? (
                <View style={styles.notesRow}>
                  <MaterialIcons name="notes" size={14} color="#64748B" />
                  <Text style={styles.notesText}>Note: {order.customerNotes}</Text>
                </View>
              ) : null}

              <View style={styles.orderActions}>
                {order.status === 'SERVED' && (
                  <Hoverable
                    style={[styles.secondaryActionBtn, order.paymentStatus === 'PAID' && styles.requestedActionBtn]}
                    onPress={() => handleRequestBill(order)}
                    disabled={billActionId === order.id || order.paymentStatus === 'PAID'}
                    hoverOpacity={0.8}
                  >
                    <MaterialIcons
                      name={order.paymentStatus === 'PAID' ? 'check-circle' : 'request-page'}
                      size={22}
                      color={order.paymentStatus === 'PAID' ? COLOR_SUCCESS : THEME_ORANGE}
                    />
                    <Text style={[styles.secondaryActionText, order.paymentStatus === 'PAID' && { color: COLOR_SUCCESS }]}>
                      {order.paymentStatus === 'PAID' ? 'Paid' : 'Request Bill'}
                    </Text>
                  </Hoverable>
                )}
              </View>
            </View>
          );
        })}

        {/* ─── Grand Total row ─── */}
        {orders.length > 0 && (
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalAmount}>Rs. {grandTotal.toFixed(2)}</Text>
          </View>
        )}

        {/* ─── Payment (QR + Collect Payment) — shown while anything is owed ─── */}
        {(orders.length > 0 || tableBills.length > 0) && (
          <View style={styles.payCard}>
            <View style={styles.payHeader}>
              <MaterialIcons name="payment" size={18} color={THEME_ORANGE} />
              <Text style={styles.payTitle}>Payment</Text>
            </View>
            <View style={styles.payBody}>
              {qrUrl ? (
                <View style={styles.qrBox}>
                  <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
                  <Text style={styles.qrCaption}>Scan to pay</Text>
                </View>
              ) : null}
              <View style={styles.payActions}>
                <Text style={styles.payHint}>
                  {qrUrl
                    ? 'Show the QR to the customer, or collect cash/card at the counter.'
                    : 'Settle the bill for this table and free it.'}
                </Text>
                <Hoverable
                  style={[styles.collectBtn, paying && { opacity: 0.6 }]}
                  onPress={openCollectPayment}
                  disabled={paying}
                  hoverOpacity={0.85}
                >
                  <MaterialIcons name="point-of-sale" size={20} color="#FFFFFF" />
                  <Text style={styles.collectBtnText}>Collect Payment</Text>
                </Hoverable>
              </View>
            </View>
          </View>
        )}

        {/* ─── Add Order Button ─── */}
            <Hoverable
              style={styles.addFirstOrderBtn}
              onPress={() => {
                switchMainTab('home');
                router.dismissTo('/' as any);
              }}
              hoverOpacity={0.8}
            >
              <MaterialIcons name="add" size={20} color="#FFF" />
              <Text style={styles.addFirstOrderBtnText}>ADD ORDERS</Text>
            </Hoverable>

      </ScrollView>
    </SafeAreaView>

    {/* ─── COLLECT PAYMENT MODAL ─── */}
    <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setShowPayModal(false)}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Collect Payment</Text>
            <TouchableOpacity onPress={() => setShowPayModal(false)} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalLabel}>Amount received</Text>
          <TextInput
            style={styles.amountInput}
            value={payAmount}
            onChangeText={setPayAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#94A3B8"
            editable={!paying}
          />
          <Text style={styles.modalDue}>
            Amount due: Rs. {amountDue.toFixed(2)}
          </Text>

          <Text style={styles.modalLabel}>Payment method</Text>
          <View style={styles.methodRow}>
            {(['CASH', 'CARD', 'UPI', 'QR'] as PaymentMethod[]).map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.methodChip, payMethod === method && styles.methodChipActive]}
                onPress={() => setPayMethod(method)}
                disabled={paying}
                activeOpacity={0.8}
              >
                <Text style={[styles.methodChipText, payMethod === method && styles.methodChipTextActive]}>
                  {method}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Hoverable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => setShowPayModal(false)}
              disabled={paying}
              hoverOpacity={0.8}
            >
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </Hoverable>
            <Hoverable
              style={[styles.modalBtn, styles.modalBtnPay, paying && { opacity: 0.6 }]}
              onPress={handleCollectPayment}
              disabled={paying}
              hoverOpacity={0.85}
            >
              {paying
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.modalBtnPayText}>Confirm Payment</Text>}
            </Hoverable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG_LIGHT },
  header:       { height: 56, backgroundColor: THEME_ORANGE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, elevation: 3 },
  backBtn:      { padding: 4 },
  headerTitle:  { color: '#FFFFFF', fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText:  { marginTop: 12, fontSize: 14, color: '#64748B' },
  errorText:    { marginTop: 12, fontSize: 15, color: '#EF4444', textAlign: 'center' },
  retryBtn:     { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: THEME_ORANGE, borderRadius: 8 },
  retryBtnText: { color: '#FFF', fontWeight: '700' },

  reservationBar: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  reservationBarText: { color: '#9A3412', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  scroll:       { flex: 1 },
  scrollContent:{ padding: 16, paddingBottom: 40 },

  // Empty state
  emptyState:         { alignItems: 'center', paddingVertical: 48 },
  emptyStateTitle:    { fontSize: 18, fontWeight: '800', color: '#334155', marginTop: 12 },
  emptyStateSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  addFirstOrderBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME_ORANGE, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, marginTop: 20 },
  addFirstOrderBtnText:{ color: '#FFF', fontSize: 14, fontWeight: '800' },

  // Order card
  orderCard:       { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: BORDER_COLOR, marginBottom: 14, overflow: 'hidden', elevation: 1 },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: BG_LIGHT, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  orderNumberBadge: { backgroundColor: THEME_ORANGE, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  orderNumberBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  orderCardTitle:  { fontSize: 13, fontWeight: '700', color: '#64748B' },
  orderCardMeta:   { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  statusPill:      { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  statusPillText:  { fontSize: 10, fontWeight: '800' },

  // Items table inside each order card
  tableHeader: { flexDirection: 'row', backgroundColor: THEME_ORANGE, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  th:          { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  tableRow:    { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  td:          { fontSize: 12, color: '#0F172A' },

  orderSubtotalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: '#EFF6FF', borderTopWidth: 1, borderTopColor: BORDER_COLOR },
  orderSubtotalLabel: { fontSize: 13, fontWeight: '700', color: THEME_ORANGE },
  orderUpdatedTime: { fontSize: 10, color: '#64748B', fontWeight: '600', marginTop: 2 },
  orderSubtotalAmount:{ fontSize: 14, fontWeight: '900', color: THEME_ORANGE },

  orderActions: { flexDirection: 'row', gap: 6, padding: 10, paddingTop: 0 },
  secondaryActionBtn: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#BFDBFE', borderRadius: 10, paddingHorizontal: 12 },
  requestedActionBtn: { backgroundColor: '#EFF6FF' },
  secondaryActionText: { color: THEME_ORANGE, fontSize: 16, fontWeight: '800' },

  notesRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingBottom: 8 },
  notesText: { fontSize: 11, color: '#64748B', fontStyle: 'italic', flex: 1 },

  // Grand total bar
  grandTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: THEME_ORANGE, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 14 },
  grandTotalLabel: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  grandTotalAmount:{ fontSize: 18, fontWeight: '900', color: '#FFFFFF' },

  // Payment card (QR + Collect Payment)
  payCard:        { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: BORDER_COLOR, marginBottom: 14, overflow: 'hidden', elevation: 1 },
  payHeader:      { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: BG_LIGHT, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  payTitle:       { fontSize: 13, fontWeight: '800', color: THEME_ORANGE },
  payBody:        { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'center' },
  qrBox:          { alignItems: 'center', gap: 4 },
  qrImage:        { width: 120, height: 120, borderRadius: 8, backgroundColor: '#FFFFFF' },
  qrCaption:      { fontSize: 10, fontWeight: '700', color: '#64748B' },
  payActions:     { flex: 1, gap: 8 },
  payHint:        { fontSize: 12, color: '#64748B', lineHeight: 17 },
  collectBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLOR_SUCCESS, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  collectBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Collect payment modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalCard:        { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18 },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle:       { fontSize: 17, fontWeight: '900', color: '#0F172A' },
  modalLabel:       { fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginTop: 8 },
  amountInput:      { borderWidth: 1.5, borderColor: BORDER_COLOR, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, fontWeight: '800', color: '#0F172A', backgroundColor: '#F8FAFC', marginTop: 6 },
  modalDue:         { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 4 },
  methodRow:        { flexDirection: 'row', gap: 8, marginTop: 6 },
  methodChip:       { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER_COLOR, backgroundColor: '#FFFFFF' },
  methodChipActive: { backgroundColor: THEME_ORANGE, borderColor: THEME_ORANGE },
  methodChipText:   { fontSize: 13, fontWeight: '800', color: '#64748B' },
  methodChipTextActive: { color: '#FFFFFF' },
  modalActions:     { flexDirection: 'row', gap: 8, marginTop: 18 },
  modalBtn:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10 },
  modalBtnCancel:   { backgroundColor: '#F1F5F9' },
  modalBtnCancelText: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  modalBtnPay:      { backgroundColor: COLOR_SUCCESS },
  modalBtnPayText:  { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },

  // Clear Out button (under Grand Total)

  // Add Order button
  addOrderBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: THEME_ORANGE, borderRadius: 10, paddingVertical: 12, marginBottom: 14, elevation: 2 },
  addOrderBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Order status lifecycle boxes
  preparingStateBox: {
    backgroundColor: '#FFF7ED',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FED7AA',
    padding: 8,
    paddingHorizontal: 10,
  },
  preparingStateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
  },
  readyStateBox: {
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#BBF7D0',
    padding: 8,
    paddingHorizontal: 10,
  },
  readyStateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  markServedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 4,
  },
  markServedBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  servedStateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#BAE6FD',
    padding: 8,
    paddingHorizontal: 10,
  },
  servedStateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  cancelledStateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FECACA',
    padding: 8,
    paddingHorizontal: 10,
  },
  cancelledStateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
});
