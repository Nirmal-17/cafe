import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
  AppState,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Hoverable } from '@/components/Hoverable';
import { api, MenuItem, MenuCategory, isRouteMissing } from '@/services/api';
import { orderApi } from '@/services/orderApi';
import { isOfflineOrderId } from '@/utils/offlineOrders';
import { loadSession } from '@/utils/sessions';
import { useResponsive, getSpacing, getFontSize, getBorderRadius, getIconSize, moderateScale, getResponsiveValue, getGridGap } from '@/utils/responsive';
import { webAlert } from '@/utils/webAlert';
import { requestMainRefresh, switchMainTab } from '@/utils/mainTab';
import { notifyPrintProceeded } from '@/utils/printProceededToast';
import { goBackOrHome } from '@/utils/navigation';
import { assignReservationId, useReservationId } from '@/utils/reservations';
import { filterAndOrderMenuItems, CANONICAL_CATEGORIES } from '@/utils/orderedMenuItems';

const THEME_ORANGE = '#FF6D00';
const BRAND_ORANGE = '#FF6D00';
const BORDER_COLOR = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export default function PlaceOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const responsive = useResponsive();
  const { breakpoint, width, height } = responsive;

  // Android hardware back button
  useEffect(() => {
    if (Platform.OS === 'web') return; // BackHandler is Android-only
    const handler = () => { goBackOrHome(); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [router]);

  const [table, setTable]       = useState<any>(null);
  // RES-#### id this table carries while it is reserved / being served.
  const reservationId           = useReservationId(Number(id));
  const [menu, setMenu]         = useState<MenuCategory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState<string>('NPR');

  const [searchQuery, setSearchQuery]           = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [isMenuExpanded, setIsMenuExpanded]     = useState(true);

  const [selectedItems, setSelectedItems] = useState<Map<number, { item: MenuItem; quantity: number }>>(new Map());
  const [submitting, setSubmitting]       = useState(false);
  const [offlineMode, setOfflineMode]     = useState(false);
  const [kitchenNotes, setKitchenNotes]   = useState('');
  const [counterNotes, setCounterNotes]   = useState('');
  const [cashierNotes, setCashierNotes]   = useState('');
  const [remarkTab, setRemarkTab] = useState<'KITCHEN' | 'COUNTER' | 'CASHIER'>('KITCHEN');

  // ─── Fetch table + menu ─────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const { table: tableRes, menu: menuRes, settings: settingsRes } = await orderApi.getPlaceOrderData(Number(id));
      const menuOk = menuRes.success && menuRes.data;
      if (tableRes.success && tableRes.data) {
        setTable(tableRes.data);
        setOfflineMode(tableRes.status === 0);
      } else if (menuOk) {
        // No table API (offline or read-only server) — still let the waiter
        // take the order against the cached floor-plan name. The order itself
        // is saved on this device (see handleSubmitOrder).
        setTable({
          id: Number(id),
          sectionId: 0,
          tableNumber: api.resolveTableName(Number(id)),
          capacity: 4,
          status: 'AVAILABLE',
        });
        setOfflineMode(true);
      } else {
        setError(tableRes.error || 'Failed to load table');
      }
      if (menuRes.success && menuRes.data) {
        setMenu(menuRes.data);
        // Drop cart lines whose menu item no longer exists on the server
        // or canonical list so they can never be submitted as "Menu item not found".
        const validItems = filterAndOrderMenuItems(menuRes.data.flatMap((c) => (c.items || [])));
        const validIds = new Set(validItems.map((i) => i.id));
        setSelectedItems((prev) => {
          if (prev.size === 0) return prev;
          const next = new Map(prev);
          for (const key of Array.from(prev.keys())) {
            if (!validIds.has(key)) next.delete(key);
          }
          return next.size === prev.size ? prev : next;
        });
      }
      if (settingsRes.success && settingsRes.data) {
        const symbol = settingsRes.data.currencySymbol || 'NPR';
        setCurrencySymbol(symbol === '$' ? 'NPR' : symbol);
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) fetchData(); });
    return () => { mounted = false; };
  }, [fetchData]);

  // Live sync: another device may change this table (status, new order) or the
  // menu (availability) while the pad is open — refetch on those events, and
  // poll regularly in case the event stream is down.
  useEffect(() => {
    if (!id) return;
    const tableIdNum = Number(id);
    const unsubscribe = api.subscribeToEvents((event) => {
      const type = event?.type;
      if (type === 'menu.availability') { fetchData(); return; }
      const payloadTableId = event?.payload?.tableId;
      if (payloadTableId != null && Number(payloadTableId) !== tableIdNum) return;
      if (
        type === 'order.created' ||
        type === 'order.status' ||
        type === 'order.paid' ||
        type === 'order.cancelled' ||
        type === 'table.status' ||
        type === 'table.session'
      ) {
        fetchData();
      }
    });
    const intervalId = setInterval(() => { fetchData(); }, 15000);
    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [id, fetchData]);

  // Refetch as soon as this screen regains focus.
  useEffect(() => {
    if (!id) return;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const onFocus = () => { fetchData(); };
      const onVisibility = () => { if (document.visibilityState === 'visible') fetchData(); };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchData();
    });
    return () => { sub.remove(); };
  }, [id, fetchData]);

  // Dynamic grid metrics: compute column count and card width from actual window
  // dimensions so the menu grid adapts to any screen size.
  const gridMetrics = useMemo(() => {
    const gap = getGridGap(breakpoint);
    const pagePad = getSpacing(breakpoint, 'md') * 2;
    const cardPad = getSpacing(breakpoint, 'sm') * 2;
    const available = Math.max(160, width - pagePad - cardPad);
    const minCard = getResponsiveValue(
      { xs: 104, sm: 110, md: 140, lg: 150, xl: 160 },
      breakpoint,
    );
    const columns = Math.max(2, Math.min(8, Math.floor((available + gap) / (minCard + gap))));
    const cardWidth = Math.floor((available - gap * (columns - 1)) / columns);
    const gridHeight = Math.max(300, Math.min(Math.round(height * 0.48), 560));
    return { columns, cardWidth, gridHeight, gap };
  }, [width, height, breakpoint]);

  // Reserve-only: a reserved table keeps its RES-#### id even when the order
  // pad is opened directly (deep link), without going through Take Order.
  useEffect(() => {
    const status = String((table as { status?: unknown } | null)?.status ?? '').toUpperCase();
    if (status === 'RESERVED' || (table as { is_reserved?: boolean } | null)?.is_reserved === true) {
      assignReservationId(Number(id));
    }
  }, [table, id]);

  // ─── Derived lists ───────────────────────────────────────────────────────────
  const allMenuItems = useMemo(() => {
    const raw = menu.flatMap((c) => c.items || []);
    return filterAndOrderMenuItems(raw);
  }, [menu]);

  const availableCategories = useMemo(() => {
    const categoryIds = new Set(allMenuItems.map((i) => i.categoryId));
    const source = menu && menu.length > 0 ? menu : CANONICAL_CATEGORIES;
    return source.filter((c) => categoryIds.has(c.id));
  }, [menu, allMenuItems]);

  const filteredMenuItems = useMemo(() => {
    // Items the server marks unavailable (api.txt §4 `available`) cannot be
    // ordered — keep them out of the picker instead of failing at submit.
    let items = allMenuItems.filter((i) => i.available !== false);
    if (activeCategoryId !== null) items = items.filter((i) => i.categoryId === activeCategoryId);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (availableCategories.find((c) => c.id === i.categoryId)?.name || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [allMenuItems, activeCategoryId, searchQuery, availableCategories]);

  // ─── Cart helpers ─────────────────────────────────────────────────────────────
  const handleSelectItem = (item: MenuItem) => {
    const m = new Map(selectedItems);
    if (m.has(item.id)) m.set(item.id, { item, quantity: m.get(item.id)!.quantity + 1 });
    else m.set(item.id, { item, quantity: 1 });
    setSelectedItems(m);
  };

  const increment = (itemId: number) => {
    const m = new Map(selectedItems);
    if (m.has(itemId)) { const e = m.get(itemId)!; m.set(itemId, { item: e.item, quantity: e.quantity + 1 }); }
    setSelectedItems(m);
  };

  const decrement = (itemId: number) => {
    const m = new Map(selectedItems);
    if (m.has(itemId)) {
      const e = m.get(itemId)!;
      if (e.quantity > 1) m.set(itemId, { item: e.item, quantity: e.quantity - 1 });
      else m.delete(itemId);
    }
    setSelectedItems(m);
  };

  // ─── Submit order ─────────────────────────────────────────────────────────────
  // Idempotency: one request ID per cart submission — replays (network retries,
  // double taps after failure) can never create a duplicate order server-side.
  const submissionIdRef = useRef<{ cartKey: string; requestId: string } | null>(null);

  const handleSubmitOrder = async () => {
    if (selectedItems.size === 0) {
      webAlert('No Items Selected', 'Please tap on menu items to add them to your order.');
      return;
    }
    setSubmitting(true);
    try {
      const itemsPayload = Array.from(selectedItems.values()).map(({ item, quantity }) => ({
        menuItemId: item.id,
        quantity,
        price: Number(item.price),
      }));
      const combinedNotes = [
        kitchenNotes ? `KITCHEN: ${kitchenNotes}` : '',
        counterNotes ? `COUNTER: ${counterNotes}` : '',
        cashierNotes ? `CASHIER: ${cashierNotes}` : '',
      ].filter(Boolean).join('\n');
      const cartKey = JSON.stringify([Number(id), combinedNotes, itemsPayload]);
      if (submissionIdRef.current?.cartKey !== cartKey) {
        submissionIdRef.current = {
          cartKey,
          requestId: orderApi.generateClientRequestId('order'),
        };
      }
      // api.txt §5: POST /api/orders carries the waiter taking the order —
      // the signed-in staff user is the authority for that id.
      const waiterId = loadSession(api.getBaseUrl())?.user?.id;
      const response = await orderApi.createOrder({
        tableId: Number(id),
        waiterId: typeof waiterId === 'number' ? waiterId : undefined,
        customerNotes: combinedNotes,
        clientRequestId: submissionIdRef.current.requestId,
        items: itemsPayload,
      });
      if (response.success && response.data) {
        submissionIdRef.current = null; // fresh ID for the next cart
        const orderedTableId = Number(id);
        // Order taken → this specific table becomes Reserved (e.g. indoor IN1
        // stays blocked until its bill is requested). Best-effort server PATCH;
        // api.updateTableStatus remembers the flip locally when the host has
        // no such route, so the floor plan still shows Reserved.
        assignReservationId(orderedTableId);
        api.updateTableStatus(orderedTableId, 'RESERVED').catch(() => {});
        setSelectedItems(new Map());
        setKitchenNotes('');
        setCounterNotes('');
        setCashierNotes('');
        // After the order is taken the waiter lands on the Menu tab (menu
        // items list) ready for the next order. dismissTo also drops the
        // place-order screen from the stack, so Back never returns to an
        // emptied cart.
        const goToMenuItems = () => {
          requestMainRefresh();
          switchMainTab('menu');
          router.dismissTo('/' as any);
        };
        // "Yes, print bill" lands on the Dashboard (floor overview) — not
        // the menu — so the waiter sees the updated table status next.
        const goToDashboard = () => {
          requestMainRefresh();
          switchMainTab('dashboard');
          router.dismissTo('/' as any);
        };
        const createdOrder = response.data;
        const tableNumberForToast = table?.tableNumber;
        const savedOffline = isOfflineOrderId((createdOrder as { id?: unknown })?.id);
        if (savedOffline) {
          webAlert('Order Saved (Offline)', 'No order API on this server — the order is saved on this device. You can still print the bill.', [
            {
              text: 'No',
              style: 'cancel',
              onPress: goToMenuItems,
            },
            {
              text: 'Yes',
              onPress: () => {
                notifyPrintProceeded(createdOrder?.id, tableNumberForToast, table?.id);
                goToDashboard();
              },
            },
          ]);
          return;
        }
        webAlert('Print Bill', 'Do you want to print the bill?', [
          {
            text: 'No',
            style: 'cancel',
            onPress: goToMenuItems,
          },
          {
            text: 'Yes',
            onPress: () => {
              notifyPrintProceeded(createdOrder?.id, tableNumberForToast, table?.id);
              goToDashboard();
            },
          },
        ]);
      } else if (response.status === 404 && isRouteMissing(response)) {
        // Read-only server: /orders does not exist there at all, so no menu
        // reload can fix it. Say that plainly and keep the cart intact.
        webAlert(
          'Order Not Sent',
          'This server has no order API, so nothing was sent. Your cart is still here — set the correct server URL in Profile → Configure Server URL, then tap Order Now again.'
        );
      } else if (response.status === 400 || response.status === 404) {
        // The menu on screen no longer matches the backend (item deleted,
        // price changed, stale or demo snapshot). Reload it and let the
        // waiter re-pick — invalid cart lines are pruned by fetchData().
        api.invalidateMenuCache();
        await fetchData();
        webAlert(
          'Menu Updated',
          'The menu has changed on the server, so your order could not be submitted. Please review your cart and tap Order Now again.'
        );
      } else {
        webAlert('Error', response.error || 'Failed to submit order');
      }
    } catch {
      webAlert('Error', 'Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Create responsive styles
  const styles = useMemo(
    () => createStyles(responsive),
    [responsive],
  );

  // ─── Loading / Error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBackOrHome} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading…</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={THEME_ORANGE} />
          <Text style={styles.loadingText}>Loading table…</Text>
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
          <Text style={styles.headerTitle}>Error</Text>
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

  const rawName   = table?.tableNumber || `Table ${id}`;
  const tableName = rawName.toUpperCase();
  const cartList  = Array.from(selectedItems.values());
  const totalCartAmount = cartList.reduce((sum, { item, quantity }) => sum + quantity * Number(item.price || 0), 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackOrHome} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tableName} — Place Order
          </Text>
          {reservationId ? (
            <View style={styles.headerResBadge}>
              <Text style={styles.headerResBadgeText}>{reservationId}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {offlineMode ? (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="cloud-off" size={16} color="#B45309" />
            <Text style={styles.offlineBannerText}>Offline mode — orders are saved on this device without API</Text>
          </View>
        ) : null}
        {/* ─── Search Bar ─── */}
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items…"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={(t) => { setSearchQuery(t); if (t && !isMenuExpanded) setIsMenuExpanded(true); }}
          />
        </View>

        {/* ─── Menu Toggle Accordion ─── */}
        <TouchableOpacity style={styles.accordionHeader} onPress={() => setIsMenuExpanded(!isMenuExpanded)} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="restaurant-menu" size={20} color={THEME_ORANGE} />
            <Text style={styles.accordionTitle}>Browse Menu Items</Text>
            {allMenuItems.length > 0 && (
              <View style={styles.countBadge}><Text style={styles.countBadgeText}>{filteredMenuItems.length}</Text></View>
            )}
          </View>
          <View style={styles.arrowCircle}>
            <MaterialIcons name={isMenuExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={24} color={THEME_ORANGE} />
          </View>
        </TouchableOpacity>

        {/* ─── Collapsible Menu ─── */}
        {isMenuExpanded && (
          <>
            {/* Category Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              <TouchableOpacity
                style={[styles.chip, activeCategoryId === null && styles.chipActive]}
                onPress={() => setActiveCategoryId(null)}
              >
                <Text style={[styles.chipText, activeCategoryId === null && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {availableCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, cat.id === activeCategoryId && styles.chipActive]}
                  onPress={() => setActiveCategoryId(cat.id)}
                >
                  <Text style={[styles.chipText, cat.id === activeCategoryId && styles.chipTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Menu Grid Container with scrolling */}
            <View style={styles.gridCard}>
              <ScrollView 
                nestedScrollEnabled={true} 
                style={styles.gridScroll}
                contentContainerStyle={styles.gridScrollContent}
                showsVerticalScrollIndicator={true}
              >
                <View style={styles.grid}>
                  {filteredMenuItems.map((item) => {
                    const qty = selectedItems.get(item.id)?.quantity || 0;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.menuCard,
                          { width: gridMetrics.cardWidth },
                          qty > 0 && styles.menuCardSelected,
                       ]}
                        onPress={() => handleSelectItem(item)}
                        activeOpacity={0.75}
                      >
                        {qty > 0 && (
                          <View style={styles.qtyBadge}><Text style={styles.qtyBadgeText}>{qty}x</Text></View>
                        )}
                        <Text style={styles.menuCardName} numberOfLines={2}>{item.name}</Text>
                        <View style={styles.menuCardFooter}>
                          <Text style={styles.menuCardPrice} numberOfLines={1}>{Number(item.price).toFixed(2)}</Text>
                          <View style={styles.addBtn}><MaterialIcons name="add" size={16} color="#FFF" /></View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </>
        )}

        {/* ─── Table Orders Section ─── */}
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Table Orders</Text>

        {/* Column headers */}
        <View style={styles.colHeader}>
          <Text style={[styles.colHeaderText, { flex: 2 }]}>Item Name</Text>
          <Text style={[styles.colHeaderText, { flex: 1, textAlign: 'center' }]}>Quantity</Text>
          <Text style={[styles.colHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
        </View>

        {/* Cart rows */}
        <View style={styles.cartBox}>
          {cartList.map(({ item, quantity }) => (
            <View key={item.id} style={styles.cartRow}>
              <Text style={styles.cartName}>{item.name}</Text>
              <View style={styles.qtyControls}>
                <Hoverable style={styles.ctrlBtn} onPress={() => decrement(item.id)} hoverOpacity={0.7}>
                  <Text style={styles.ctrlBtnText}>-</Text>
                </Hoverable>
                <Text style={styles.qtyText}>{quantity}</Text>
                <Hoverable style={styles.ctrlBtn} onPress={() => increment(item.id)} hoverOpacity={0.7}>
                  <Text style={styles.ctrlBtnText}>+</Text>
                </Hoverable>
              </View>
              <Text style={styles.cartAmount}>{currencySymbol} {quantity * Number(item.price)}</Text>
            </View>
          ))}
          {cartList.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartText}>No items added yet</Text>
            </View>
          ) : (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount:</Text>
              <Text style={styles.totalAmount}>{currencySymbol} {totalCartAmount.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* Remarks - Tabs */}
        <View style={styles.remarksSection}>
          <View style={styles.remarkTabs}>
            {(['KITCHEN', 'COUNTER', 'CASHIER'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.remarkTab, remarkTab === tab && styles.remarkTabActive]}
                onPress={() => setRemarkTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.remarkTabText, remarkTab === tab && styles.remarkTabTextActive]}>
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.remarkTable}>
            {remarkTab === 'KITCHEN' && (
              <TextInput
                style={styles.remarkInput}
                multiline
                placeholder="Kitchen instructions (cooking prefs, allergies…)"
                placeholderTextColor="#9CA3AF"
                value={kitchenNotes}
                onChangeText={setKitchenNotes}
              />
            )}
            {remarkTab === 'COUNTER' && (
              <TextInput
                style={styles.remarkInput}
                multiline
                placeholder="Counter notes (pickup time, packaging…)"
                placeholderTextColor="#9CA3AF"
                value={counterNotes}
                onChangeText={setCounterNotes}
              />
            )}
            {remarkTab === 'CASHIER' && (
              <TextInput
                style={styles.remarkInput}
                multiline
                placeholder="Cashier notes (discount, payment method…)"
                placeholderTextColor="#9CA3AF"
                value={cashierNotes}
                onChangeText={setCashierNotes}
              />
            )}
          </View>
        </View>

        </ScrollView>
    <View style={styles.stickyBar}>
      <View style={styles.stickySummary}>
        <Text style={styles.summaryText}>
          {cartList.length} item(s)
        </Text>
        <Text style={styles.summaryAmount}>
          {currencySymbol} {totalCartAmount.toLocaleString()}
        </Text>
      </View>
      <Hoverable
        style={styles.orderNowBtn}
        onPress={handleSubmitOrder}
        disabled={cartList.length === 0}
        hoverOpacity={0.85}
      >
        <Text style={styles.orderNowBtnText}>
          {cartList.length > 0
            ? `Order Now • ${currencySymbol} ${totalCartAmount.toLocaleString()}`
            : 'Order Now'}
        </Text>
      </Hoverable>
    </View>
    </SafeAreaView>
  );
}

const createStyles = (bp: ReturnType<typeof useResponsive>) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#F8FAFC' },
  header:       { height: getResponsiveValue({ xs: 52, sm: 54, md: 56, lg: 60, xl: 64 }, bp.breakpoint), backgroundColor: THEME_ORANGE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: getSpacing(bp.breakpoint, 'md'), elevation: 3 },
  backBtn:      { padding: getSpacing(bp.breakpoint, 'xs') },
  headerTitle:  { color: '#FFFFFF', fontSize: getFontSize(bp.breakpoint, 'lg'), fontWeight: '800' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: getSpacing(bp.breakpoint, 'xs'), paddingHorizontal: getSpacing(bp.breakpoint, 'xs') },
  headerResBadge: { backgroundColor: 'rgba(255,255,255,0.24)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  headerResBadgeText: { color: '#FFFFFF', fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '900', letterSpacing: 0.4 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: getSpacing(bp.breakpoint, 'lg') },
  loadingText:  { marginTop: getSpacing(bp.breakpoint, 'md'), fontSize: getFontSize(bp.breakpoint, 'md'), color: '#64748B' },
  errorText:    { marginTop: getSpacing(bp.breakpoint, 'md'), fontSize: getFontSize(bp.breakpoint, 'lg'), color: '#EF4444', textAlign: 'center' },
  retryBtn:     { marginTop: getSpacing(bp.breakpoint, 'lg'), paddingHorizontal: getSpacing(bp.breakpoint, 'lg'), paddingVertical: getSpacing(bp.breakpoint, 'md'), backgroundColor: THEME_ORANGE, borderRadius: getBorderRadius(bp.breakpoint, 'md') },
  retryBtnText: { color: '#FFF', fontWeight: '700', fontSize: getFontSize(bp.breakpoint, 'md') },

  scroll:       { flex: 1 },
  scrollContent:{ padding: getSpacing(bp.breakpoint, 'md'), paddingBottom: getSpacing(bp.breakpoint, 'xl') + 80 },

  searchBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, paddingHorizontal: getSpacing(bp.breakpoint, 'md'), height: getResponsiveValue({ xs: 40, sm: 42, md: 44, lg: 48, xl: 52 }, bp.breakpoint), marginBottom: getSpacing(bp.breakpoint, 'sm'), gap: getSpacing(bp.breakpoint, 'sm') },
  searchInput:  { flex: 1, fontSize: getFontSize(bp.breakpoint, 'md'), color: '#0F172A' },

  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'sm') },
  accordionTitle:  { fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '800', color: THEME_ORANGE },
  countBadge:      { backgroundColor: '#EFF6FF', paddingHorizontal: getSpacing(bp.breakpoint, 'sm'), paddingVertical: getSpacing(bp.breakpoint, 'xs'), borderRadius: getBorderRadius(bp.breakpoint, 'full') },
  countBadgeText:  { fontSize: getFontSize(bp.breakpoint, 'sm'), fontWeight: '800', color: THEME_ORANGE },
  arrowCircle:     { width: moderateScale(32, 0.5, bp.breakpoint), height: moderateScale(32, 0.5, bp.breakpoint), borderRadius: moderateScale(16, 0.5, bp.breakpoint), backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  chip:          { paddingHorizontal: getSpacing(bp.breakpoint, 'sm'), paddingVertical: getSpacing(bp.breakpoint, 'xs'), borderRadius: getBorderRadius(bp.breakpoint, 'lg'), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER_COLOR, marginRight: getSpacing(bp.breakpoint, 'xs') },
  chipActive:    { backgroundColor: THEME_ORANGE, borderColor: THEME_ORANGE },
  chipText:      { fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '600', color: '#64748B' },
  chipTextActive:{ color: '#FFFFFF', fontWeight: '800' },

  gridCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: getBorderRadius(bp.breakpoint, 'md'), 
    borderWidth: 1, 
    borderColor: BORDER_COLOR, 
    height: getResponsiveValue({ xs: 360, sm: 380, md: 420, lg: 460, xl: 500 }, bp.breakpoint), 
    marginBottom: getSpacing(bp.breakpoint, 'md'),
    overflow: 'hidden'
  },
  gridScroll: {
    flex: 1,
  },
  gridScrollContent: {
    padding: getSpacing(bp.breakpoint, 'sm'),
  },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: getGridGap(bp.breakpoint) },
  menuCard: { 
    flexGrow: 1,
    flexBasis: getResponsiveValue({ xs: '48%', sm: '31.5%', md: '24%', lg: '19%', xl: '15.5%' }, bp.breakpoint),
    minWidth: getResponsiveValue({ xs: 110, sm: 110, md: 140, lg: 160, xl: 170 }, bp.breakpoint),
    maxWidth: getResponsiveValue({ xs: '49%', sm: '32.5%', md: '25%', lg: '20%', xl: '16.5%' }, bp.breakpoint),
    backgroundColor: '#FFFFFF', 
    borderRadius: getBorderRadius(bp.breakpoint, 'sm'), 
    padding: getResponsiveValue({ xs: 6, sm: 6, md: 8, lg: 10, xl: 12 }, bp.breakpoint), 
    borderWidth: 1, 
    borderColor: BORDER_COLOR, 
    minHeight: getResponsiveValue({ xs: 54, sm: 56, md: 58, lg: 62, xl: 66 }, bp.breakpoint), 
    justifyContent: 'space-between', 
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: moderateScale(1, 0.5, bp.breakpoint) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(2, 0.5, bp.breakpoint),
    elevation: 1,
  },
  menuCardSelected: { borderColor: THEME_ORANGE, backgroundColor: '#FFF3E0' },
  qtyBadge:  { position: 'absolute', top: -moderateScale(5, 0.5, bp.breakpoint), right: -moderateScale(5, 0.5, bp.breakpoint), backgroundColor: BRAND_ORANGE, borderRadius: getBorderRadius(bp.breakpoint, 'sm'), paddingHorizontal: moderateScale(6, 0.5, bp.breakpoint), paddingVertical: moderateScale(2, 0.5, bp.breakpoint), zIndex: 10 },
  qtyBadgeText:{ color: '#FFF', fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '800' },
  menuCardName:  { fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '700', color: '#0F172A', lineHeight: getResponsiveValue({ xs: 12, sm: 13, md: 14, lg: 15, xl: 17 }, bp.breakpoint) },
  menuCardFooter:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: getSpacing(bp.breakpoint, 'xs'), gap: 4 },
  menuCardPrice: { fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '800', color: THEME_ORANGE, flexShrink: 1 },
  addBtn:        { backgroundColor: THEME_ORANGE, width: moderateScale(22, 0.5, bp.breakpoint), height: moderateScale(22, 0.5, bp.breakpoint), borderRadius: moderateScale(11, 0.5, bp.breakpoint), alignItems: 'center', justifyContent: 'center' },

  divider:      { height: 1, backgroundColor: BORDER_COLOR, marginVertical: getSpacing(bp.breakpoint, 'md') },
  sectionTitle: { fontSize: getFontSize(bp.breakpoint, 'lg'), fontWeight: '800', color: '#0F172A', marginBottom: getSpacing(bp.breakpoint, 'sm') },

  colHeader:    { flexDirection: 'row', backgroundColor: THEME_ORANGE, borderRadius: getBorderRadius(bp.breakpoint, 'md'), paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'sm') },
  colHeaderText:{ fontSize: getFontSize(bp.breakpoint, 'sm'), fontWeight: '800', color: '#FFFFFF' },

  cartBox:  { backgroundColor: '#FFFFFF', borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, padding: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'md') },
  cartRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: getSpacing(bp.breakpoint, 'sm'), borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cartName: { flex: 2, fontSize: getFontSize(bp.breakpoint, 'sm'), fontWeight: '600', color: '#0F172A' },
  qtyControls:{ flexDirection: 'row', alignItems: 'center', gap: getSpacing(bp.breakpoint, 'sm') },
  ctrlBtn:  { width: moderateScale(36, 0.5, bp.breakpoint), height: moderateScale(36, 0.5, bp.breakpoint), borderRadius: getBorderRadius(bp.breakpoint, 'sm'), backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  ctrlBtnText:{ fontSize: getFontSize(bp.breakpoint, 'xl'), fontWeight: '800', color: '#0F172A' },
  qtyText:  { fontSize: getFontSize(bp.breakpoint, 'xl'), fontWeight: '800', color: '#0F172A', paddingHorizontal: getSpacing(bp.breakpoint, 'sm') },
  cartAmount:{ flex: 1, fontSize: getFontSize(bp.breakpoint, 'sm'), fontWeight: '800', color: THEME_ORANGE, textAlign: 'right' },
  emptyCart: { padding: getSpacing(bp.breakpoint, 'md'), alignItems: 'center' },
  emptyCartText:{ fontSize: getFontSize(bp.breakpoint, 'sm'), color: '#94A3B8' },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: getSpacing(bp.breakpoint, 'md'),
    marginTop: getSpacing(bp.breakpoint, 'sm'),
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
  },
  totalLabel: {
    fontSize: getFontSize(bp.breakpoint, 'md'),
    fontWeight: '800',
    color: '#0F172A',
  },
  totalAmount: {
    fontSize: getFontSize(bp.breakpoint, 'lg'),
    fontWeight: '900',
    color: THEME_ORANGE,
  },

  remarksLabel: { fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '700', color: '#0F172A', marginBottom: getSpacing(bp.breakpoint, 'sm') },
  remarksInput: { backgroundColor: '#FFFFFF', borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, padding: getSpacing(bp.breakpoint, 'md'), height: moderateScale(60, 0.5, bp.breakpoint), textAlignVertical: 'top', fontSize: getFontSize(bp.breakpoint, 'sm'), color: '#0F172A', marginBottom: getSpacing(bp.breakpoint, 'md') },

  remarksSection: { marginBottom: getSpacing(bp.breakpoint, 'md') },
  remarkTabs:     { flexDirection: 'row', gap: getSpacing(bp.breakpoint, 'md'), marginBottom: getSpacing(bp.breakpoint, 'md') },
  remarkTab:      { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: moderateScale(56, 0.5, bp.breakpoint), paddingVertical: getSpacing(bp.breakpoint, 'md'), paddingHorizontal: getSpacing(bp.breakpoint, 'sm'), borderRadius: getBorderRadius(bp.breakpoint, 'md'), backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: BORDER_COLOR },
  remarkTabActive:{ backgroundColor: THEME_ORANGE, borderColor: THEME_ORANGE },
  remarkTabText:  { fontSize: getFontSize(bp.breakpoint, 'md'), fontWeight: '700', color: '#64748B' },
  remarkTabTextActive: { color: '#FFFFFF', fontWeight: '800' },
  remarkTable: { backgroundColor: '#FFFFFF', borderRadius: getBorderRadius(bp.breakpoint, 'md'), borderWidth: 1, borderColor: BORDER_COLOR, padding: getSpacing(bp.breakpoint, 'md') },
  remarkInput: { backgroundColor: '#F8FAFC', borderRadius: getBorderRadius(bp.breakpoint, 'sm'), borderWidth: 1, borderColor: '#E2E8F0', padding: getSpacing(bp.breakpoint, 'md'), height: moderateScale(110, 0.5, bp.breakpoint), textAlignVertical: 'top', fontSize: getFontSize(bp.breakpoint, 'sm'), color: '#0F172A' },

  orderNowBtn:    { backgroundColor: BRAND_ORANGE, borderRadius: getBorderRadius(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'md'), alignItems: 'center', justifyContent: 'center', elevation: 3 },
  orderNowBtnText:{ color: '#FFFFFF', fontSize: getFontSize(bp.breakpoint, 'lg'), fontWeight: '900' },
  disabledBtn:    { opacity: 0.7 },

  stickyBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: BORDER_COLOR, padding: getSpacing(bp.breakpoint, 'md'), zIndex: 10 },
  offlineBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: getBorderRadius(bp.breakpoint, 'md'), paddingHorizontal: getSpacing(bp.breakpoint, 'md'), paddingVertical: getSpacing(bp.breakpoint, 'sm'), marginBottom: getSpacing(bp.breakpoint, 'sm') },
  offlineBannerText: { flex: 1, fontSize: getFontSize(bp.breakpoint, 'xs'), fontWeight: '700', color: '#92400E' },
  stickySummary:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryText:    { fontSize: getFontSize(bp.breakpoint, 'sm'), color: TEXT_MUTED },
  summaryAmount:  { fontSize: getFontSize(bp.breakpoint, 'sm'), color: BRAND_ORANGE },
});
