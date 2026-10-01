import type {
  ApiResponse,
  CafeSettings,
  DashboardData,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  Section,
  StaffUser,
  Table,
  TableDetail,
} from './api';
import type { NotificationListResponse, ServerNotification } from '@/utils/notifications';

const USERS: StaffUser[] = [
  { id: 2, name: 'Waiter Staff', email: 'waiter@leadingedge.com', role: 'WAITER' },
  { id: 3, name: 'Chef Staff', email: 'chef@leadingedge.com', role: 'CHEF' },
  { id: 4, name: 'Cashier Staff', email: 'cashier@leadingedge.com', role: 'CASHIER' },
];

const SETTINGS: CafeSettings = {
  cafeName: 'Smart Cafe & Bistro',
  address: '123 Leading Edge Blvd, Tech City',
  phone: '+1 (800) 555-CAFE',
  currencySymbol: 'Rs.',
  taxRate: '10',
  serviceChargeRate: '5',
  receiptFooter: 'Thank you for dining at Smart Cafe!',
};

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
const HOUR = 3600 * 1000;

interface DemoState {
  sections: Section[];
  tables: Table[];
  menu: MenuCategory[];
  orders: Order[];
  notifications: ServerNotification[];
  nextOrder: number;
  nextNotification: number;
}

function seedSections(): Section[] {
  const rows: [string, string][] = [
    ['Bar', 'Bar section'],
    ['Cabin', 'Private cabin area'],
    ['Hall', 'Main hall area'],
    ['Indoor', 'Indoor seating area'],
    ['Outdoor', 'Outdoor patio area'],
  ];
  return rows.map(([name, description], i) => ({ id: i + 1, name, description, status: 'ACTIVE' }));
}

function seedTables(): Table[] {
  const rows: [number, string, number, Table['status']][] = [
    [1, 'Bar 1', 4, 'AVAILABLE'],
    [1, 'Bar 2', 2, 'AVAILABLE'],
    [1, 'Bar 3', 2, 'AVAILABLE'],
    [1, 'Bar 4', 4, 'AVAILABLE'],
    [2, 'Cabin 1', 4, 'AVAILABLE'],
    [2, 'Cabin 2', 6, 'AVAILABLE'],
    [3, 'Hall 1', 8, 'AVAILABLE'],
    [3, 'Hall 2', 6, 'AVAILABLE'],
    [3, 'Hall 3', 4, 'AVAILABLE'],
    [4, 'Indoor 1', 4, 'AVAILABLE'],
    [4, 'Indoor 2', 4, 'AVAILABLE'],
    [5, 'Outdoor 1', 4, 'AVAILABLE'],
  ];
  return rows.map(([sectionId, tableNumber, capacity, status], i) => {
    const id = i + 1;
    const section = { id: sectionId, name: SECTION_NAMES[sectionId - 1] };
    return {
      id,
      sectionId,
      tableNumber,
      capacity,
      status,
      createdAt: iso(72 * HOUR),
      section,
      activeSession: null,
    };
  });
}

const SECTION_NAMES = ['Bar', 'Cabin', 'Hall', 'Indoor', 'Outdoor'];

interface SeedItem {
  cat: number;
  name: string;
  description: string;
  price: number;
  image?: string;
}

const SEED_ITEMS: SeedItem[] = [
  { cat: 1, name: 'Chicken Chowmein', description: 'Traditional fried noodles with shredded chicken and fresh vegetables', price: 150, image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400' },
  { cat: 1, name: 'Chicken chilly chowmin', description: 'Spicy chili pan-fried noodles with chicken chunklets', price: 150, image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400' },
  { cat: 1, name: 'soyabin', description: 'Flavorful seasoned soy chunks fried with local herbs', price: 120 },
  { cat: 1, name: 'sukuti chatpate', description: 'Spicy and sour chatpate with local dried meat chunks', price: 180 },
  { cat: 1, name: '123 noodles', description: 'Stir fried instant noodles with fresh veggies', price: 120 },
  { cat: 2, name: 'Plain Omelette', description: 'Two fluffy farm eggs seasoned with salt and pepper', price: 80, image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400' },
  { cat: 2, name: 'Bread Butter', description: 'Toasted bread slices served with fresh butter', price: 60, image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400' },
  { cat: 2, name: 'american o', description: 'Classic Americano espresso shot with hot water', price: 100 },
  { cat: 2, name: 'bread butter and jam', description: 'Crispy toasted bread with fresh butter and mixed fruit jam', price: 90 },
  { cat: 3, name: 'Pork chilly momo', description: 'Dumplings tossed in delicious sweet and spicy chili sauce', price: 220, image: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400' },
  { cat: 3, name: 'Chicken fry momo', description: 'Crispy fried dumplings filled with minced seasoned chicken', price: 180, image: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400' },
  { cat: 3, name: 'Pork Momo', description: 'Steamed local pork dumplings served with tomato sesame pickle', price: 200, image: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400' },
  { cat: 3, name: 'buff chilly momo', description: 'Steamed buffalo meat dumplings tossed in spicy chili sauce', price: 210 },
  { cat: 4, name: 'Khukuri cig', description: 'Khukuri brand cigarette', price: 130 },
  { cat: 4, name: 'shikhar ice', description: 'Shikhar tobacco (ice variant)', price: 120 },
  { cat: 4, name: 'Surya', description: 'Surya matches / smoking accessory', price: 150 },
  { cat: 4, name: 'jameson irish', description: 'Jameson Irish whiskey 30 ml', price: 500 },
  { cat: 4, name: 'royal blue 30ml', description: 'Royal Blue whisky 30 ml', price: 300 },
  { cat: 4, name: 'budweiser big', description: 'Budweiser beer (large)', price: 450 },
  { cat: 4, name: 'budweiser small', description: 'Budweiser beer (small)', price: 300 },
];

function seedMenu(): MenuCategory[] {
  const cats: { id: number; name: string; description: string }[] = [
    { id: 1, name: 'Chowmein', description: 'Chowmein items' },
    { id: 2, name: 'Breakfast', description: 'Breakfast items' },
    { id: 3, name: 'Momo', description: 'Momo items' },
    { id: 4, name: 'Whiskey', description: 'Drinks and Cigarettes' },
  ];
  let itemId = 1;
  const items: MenuItem[] = SEED_ITEMS.map((s) => ({
    id: itemId++,
    categoryId: s.cat,
    name: s.name,
    description: s.description,
    price: s.price,
    image: s.image ?? null,
    available: true,
    category: { id: s.cat, name: cats.find((c) => c.id === s.cat)!.name },
  }));
  return cats.map((c) => {
    const catItems = items.filter((i) => i.categoryId === c.id);
    return { ...c, items: catItems, _count: { items: catItems.length } };
  });
}

function menuItemById(id: number, state: DemoState) {
  for (const cat of state.menu) {
    const found = cat.items?.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}

function totalsFor(items: { price: number; quantity: number }[]) {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  const taxRate = Number(SETTINGS.taxRate) || 0;
  const serviceRate = Number(SETTINGS.serviceChargeRate) || 0;
  const taxAmount = round2((subtotal * taxRate) / 100);
  const serviceCharge = round2((subtotal * serviceRate) / 100);
  return {
    subtotal,
    taxRate,
    taxAmount,
    serviceCharge,
    discount: 0,
    totalAmount: round2(subtotal + taxAmount + serviceCharge),
  };
}

function makeOrder(
  state: DemoState,
  id: number,
  tableId: number,
  waiterId: number,
  status: Order['status'],
  paymentStatus: Order['paymentStatus'],
  specs: { menuItemId: number; quantity: number }[],
  createdAt: string,
  extra: Partial<Order> = {},
): Order {
  const items: OrderItem[] = specs.map((s, idx) => {
    const mi = menuItemById(s.menuItemId, state);
    return {
      id: id * 100 + idx,
      orderId: id,
      menuItemId: s.menuItemId,
      quantity: s.quantity,
      price: mi?.price ?? 0,
      notes: null,
      menuItem: mi,
    };
  });
  const totals = totalsFor(items);
  return {
    id,
    tableId,
    waiterId,
    status,
    paymentStatus,
    billRequested: false,
    customerNotes: null,
    cancelReason: null,
    createdAt,
    updatedAt: createdAt,
    items,
    payments: [],
    ...totals,
    ...extra,
  };
}

function createState(): DemoState {
  return {
    sections: seedSections(),
    tables: seedTables(),
    menu: seedMenu(),
    orders: [],
    notifications: [],
    nextOrder: 1001,
    nextNotification: 101,
  };
}

let STATE: DemoState = createState();

function findTable(id: number) {
  return STATE.tables.find((t) => t.id === id);
}

function hydrate(order: Order): Order {
  return {
    ...order,
    table: findTable(order.tableId),
    waiter: USERS.find((u) => u.id === order.waiterId),
    items: (order.items || []).map((i) => ({ ...i, menuItem: i.menuItemId != null ? menuItemById(i.menuItemId, STATE) : i.menuItem })),
    payments: order.payments || [],
  };
}

function pushNotification(partial: Omit<ServerNotification, 'id' | 'read' | 'readAt' | 'createdAt'>) {
  const n: ServerNotification = {
    ...partial,
    id: STATE.nextNotification++,
    read: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  STATE.notifications = [n, ...STATE.notifications].slice(0, 50);
}

function tableOf(order: Order) {
  return findTable(order.tableId);
}

function releaseTable(tableId: number) {
  const table = findTable(tableId);
  if (!table) return;
  const otherUnpaid = STATE.orders.some(
    (o) => o.tableId === tableId && o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED' && o.status !== 'COMPLETED',
  );
  if (otherUnpaid) return;
  table.status = 'AVAILABLE';
  table.activeSession = null;
}

function buildDashboard(): DashboardData {
  const orders = STATE.orders;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isToday = (d: string) => new Date(d).getTime() >= todayStart.getTime();

  const completed = orders.filter((o) => o.status === 'COMPLETED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

  const totalRevenue = round2(completed.reduce((s, o) => s + Number(o.totalAmount || 0), 0));
  const todayRevenue = round2(completed.filter((o) => isToday(o.createdAt)).reduce((s, o) => s + Number(o.totalAmount || 0), 0));
  const totalDiscounts = round2(completed.reduce((s, o) => s + Number(o.discount || 0), 0));
  const totalTax = round2(completed.reduce((s, o) => s + Number(o.taxAmount || 0), 0));
  const totalServiceCharge = round2(completed.reduce((s, o) => s + Number(o.serviceCharge || 0), 0));
  const totalLosses = round2(cancelled.reduce((s, o) => s + Number(o.subtotal || 0), 0));

  const byMethod = new Map<string, { count: number; total: number }>();
  for (const o of completed) {
    for (const p of o.payments || []) {
      const cur = byMethod.get(p.method) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total = round2(cur.total + Number(p.amount || 0));
      byMethod.set(p.method, cur);
    }
  }

  const daily: { date: string; revenue: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === key && o.status !== 'CANCELLED');
    const revenue = round2(
      dayOrders.filter((o) => o.status === 'COMPLETED').reduce((s, o) => s + Number(o.totalAmount || 0), 0),
    );
    daily.push({ date: key, revenue, orders: dayOrders.length });
  }

  const agg = new Map<string, { name: string; category: string; qty: number; orderCount: number }>();
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    for (const item of o.items || []) {
      const name = item.menuItem?.name || `Item ${item.menuItemId}`;
      const category = item.menuItem?.category?.name || 'Menu';
      const cur = agg.get(name) || { name, category, qty: 0, orderCount: 0 };
      cur.qty += item.quantity;
      cur.orderCount += 1;
      agg.set(name, cur);
    }
  }

  const counts = {
    OCCUPIED: STATE.tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'PENDING_BILL').length,
    AVAILABLE: STATE.tables.filter((t) => t.status === 'AVAILABLE').length,
    RESERVED: STATE.tables.filter((t) => t.status === 'RESERVED').length,
    CLEANING: STATE.tables.filter((t) => t.status === 'CLEANING').length,
  };
  const total = STATE.tables.length;

  return {
    summary: {
      totalOrders: orders.length,
      todayOrders: orders.filter((o) => isToday(o.createdAt)).length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      activeOrders: active.length,
      totalRevenue,
      todayRevenue,
      totalDiscounts,
      totalTax,
      totalServiceCharge,
      totalLosses,
      totalMenuItems: STATE.menu.reduce((s, c) => s + (c.items?.length || 0), 0),
      totalTables: total,
      totalStaff: USERS.length,
      averageOrderValue: completed.length > 0 ? round2(totalRevenue / completed.length) : 0,
    },
    revenueBreakdown: {
      revenue: totalRevenue,
      tax: totalTax,
      serviceCharge: totalServiceCharge,
      discounts: totalDiscounts,
      losses: totalLosses,
    },
    orderStatusDistribution: {
      completed: completed.length,
      cancelled: cancelled.length,
      pending: orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length,
      preparing: orders.filter((o) => o.status === 'PREPARING').length,
      active: active.length,
    },
    paymentMethods: [...byMethod.entries()].map(([method, v]) => ({ method, count: v.count, total: v.total })),
    dailyRevenue: daily,
    topSellingItems: [...agg.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map((a) => ({ name: a.name, category: a.category, totalQuantity: a.qty, orderCount: a.orderCount })),
    tableUtilization: {
      total,
      occupied: counts.OCCUPIED,
      available: counts.AVAILABLE,
      reserved: counts.RESERVED,
      cleaning: counts.CLEANING,
      utilizationRate: total > 0 ? Math.round((counts.OCCUPIED / total) * 100) : 0,
    },
  };
}

function json<T>(data: T, status = 200): ApiResponse<T> {
  return { success: true, data, status };
}

function fail(error: string, status: number): ApiResponse<never> {
  return { success: false, error, status };
}

function parseBody(options?: RequestInit): any {
  if (typeof options?.body !== 'string') return null;
  try {
    return JSON.parse(options.body);
  } catch {
    return null;
  }
}

function notificationsResponse(): NotificationListResponse {
  return {
    notifications: STATE.notifications,
    unreadCount: STATE.notifications.filter((n) => !n.read).length,
  };
}

function orderList(params: URLSearchParams) {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.max(1, parseInt(params.get('limit') || '50', 10) || 50);
  const search = (params.get('search') || '').trim().toLowerCase();
  const status = (params.get('status') || '').toUpperCase();
  const paymentStatus = (params.get('paymentStatus') || '').toUpperCase();
  const tableId = params.get('tableId') ? parseInt(params.get('tableId')!, 10) : undefined;
  const waiterId = params.get('waiterId') ? parseInt(params.get('waiterId')!, 10) : undefined;
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');

  let rows = [...STATE.orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  if (search) {
    rows = rows.filter((o) => {
      const table = tableOf(o);
      const waiter = USERS.find((u) => u.id === o.waiterId);
      return (
        String(o.id) === search ||
        (o.customerNotes || '').toLowerCase().includes(search) ||
        (table?.tableNumber || '').toLowerCase().includes(search) ||
        (waiter?.name || '').toLowerCase().includes(search)
      );
    });
  }
  if (status && ACTIVE_STATUSES.concat(['COMPLETED', 'CANCELLED']).includes(status)) {
    rows = rows.filter((o) => o.status === status);
  }
  if (paymentStatus === 'PAID' || paymentStatus === 'UNPAID') {
    rows = rows.filter((o) => o.paymentStatus === paymentStatus);
  }
  if (tableId) rows = rows.filter((o) => o.tableId === tableId);
  if (waiterId) rows = rows.filter((o) => o.waiterId === waiterId);
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    rows = rows.filter((o) => new Date(o.createdAt).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    rows = rows.filter((o) => new Date(o.createdAt).getTime() <= to);
  }

  const total = rows.length;
  const start = (page - 1) * limit;
  const orders = rows.slice(start, start + limit).map(hydrate);
  return { orders, page, limit, total, hasMore: start + limit < total };
}

export function handleDemoRequest(endpoint: string, options?: RequestInit): ApiResponse<any> | null {
  const [rawPath, rawQuery = ''] = endpoint.split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(rawQuery);
  const method = ((options?.method as string) || 'GET').toUpperCase();
  const body = parseBody(options);

  if (method === 'GET' && path === '/settings') return json(SETTINGS);

  if (method === 'GET' && path === '/sections') {
    return json(
      STATE.sections.map((s) => ({
        ...s,
        _count: { tables: STATE.tables.filter((t) => t.sectionId === s.id).length },
      })),
    );
  }

  if (method === 'GET' && path === '/tables') return json(STATE.tables.map((t) => ({ ...t })));

  const tableMatch = path.match(/^\/tables\/(\d+)$/);
  if (method === 'GET' && tableMatch) {
    const table = findTable(parseInt(tableMatch[1], 10));
    if (!table) return fail('Table not found', 404);
    const detail: TableDetail = {
      ...table,
      orders: STATE.orders.filter((o) => o.tableId === table.id && ACTIVE_STATUSES.includes(o.status)).map(hydrate),
      activeOrders: STATE.orders.filter((o) => o.tableId === table.id && ACTIVE_STATUSES.includes(o.status)).map(hydrate),
    };
    return json(detail);
  }

  const statusMatch = path.match(/^\/tables\/(\d+)\/status$/);
  if (method === 'PATCH' && statusMatch) {
    const table = findTable(parseInt(statusMatch[1], 10));
    if (!table) return fail('Table not found', 404);
    const next = String((body as any)?.status || '').toUpperCase();
    if (!['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'PENDING_BILL'].includes(next)) {
      return fail('Invalid table status', 400);
    }
    table.status = next as Table['status'];
    if (next === 'AVAILABLE' || next === 'CLEANING') {
      table.activeSession = null;
    }
    return json({ ...table });
  }

  const sessionMatch = path.match(/^\/tables\/(\d+)\/session$/);
  if (method === 'POST' && sessionMatch) {
    const table = findTable(parseInt(sessionMatch[1], 10));
    if (!table) return fail('Table not found', 404);
    if (table.status === 'CLEANING') return fail('Table is being cleaned', 409);
    if (!table.activeSession) {
      table.activeSession = {
        id: Date.now(),
        tableId: table.id,
        waiterId: 2,
        openedAt: new Date().toISOString(),
        closedAt: null,
        waiter: { id: 2, name: 'Waiter Staff' },
      };
    }
    if (table.status === 'AVAILABLE' || table.status === 'RESERVED') table.status = 'OCCUPIED';
    return json({ session: table.activeSession, table: { ...table } });
  }

  if (method === 'GET' && path === '/menu') return json(STATE.menu.map((c) => ({ ...c, items: [...(c.items || [])] })));

  if (method === 'GET' && path === '/orders/active') {
    return json(
      STATE.orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(hydrate),
    );
  }

  if (method === 'GET' && path === '/orders') return json(orderList(params));

  const createMatch = path.match(/^\/orders$/);
  if (method === 'POST' && createMatch) {
    const payload = (body || {}) as {
      tableId?: number;
      waiterId?: number;
      customerNotes?: string;
      items?: { menuItemId: number; quantity: number; price?: number }[];
    };
    if (!payload.tableId) return fail('Table is required', 400);
    if (!payload.items || payload.items.length === 0) return fail('Order items are required', 400);
    const badQty = payload.items.some((i) => !Number.isFinite(i.quantity) || i.quantity <= 0);
    if (badQty) return fail('Quantity must be at least 1', 400);
    const unknown = payload.items.find((i) => !menuItemById(i.menuItemId, STATE));
    if (unknown) return fail('Menu item not found', 404);

    const id = STATE.nextOrder++;
    const order = makeOrder(
      STATE,
      id,
      payload.tableId,
      payload.waiterId || 2,
      'PENDING',
      'UNPAID',
      payload.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
      new Date().toISOString(),
      { customerNotes: payload.customerNotes || null },
    );
    STATE.orders.unshift(order);

    const table = findTable(payload.tableId);
    if (table) {
      if (!table.activeSession) {
        table.activeSession = {
          id: Date.now(),
          tableId: table.id,
          waiterId: order.waiterId,
          openedAt: new Date().toISOString(),
          closedAt: null,
          waiter: { id: 2, name: 'Waiter Staff' },
        };
      }
      table.status = 'OCCUPIED';
    }

    pushNotification({
      type: 'order_created',
      title: 'New Order',
      message: `Order #${id} placed for ${table?.tableNumber || `table ${payload.tableId}`}.`,
      orderId: id,
      tableId: payload.tableId,
      tableNumber: table?.tableNumber || null,
      orderStatus: 'PENDING',
    });

    return json(hydrate(order), 201);
  }

  const orderMatch = path.match(/^\/orders\/(\d+)$/);
  if (method === 'GET' && orderMatch) {
    const order = STATE.orders.find((o) => o.id === parseInt(orderMatch[1], 10));
    if (!order) return fail('Order not found', 404);
    return json(hydrate(order));
  }

  const orderStatusMatch = path.match(/^\/orders\/(\d+)\/status$/);
  if (method === 'PATCH' && orderStatusMatch) {
    const order = STATE.orders.find((o) => o.id === parseInt(orderStatusMatch[1], 10));
    if (!order) return fail('Order not found', 404);
    const next = String((body as any)?.status || '').toUpperCase();
    if (!['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'].includes(next)) {
      return fail('Invalid order status', 400);
    }
    order.status = next as Order['status'];
    order.updatedAt = new Date().toISOString();
    if (next === 'COMPLETED') {
      order.paymentStatus = 'PAID';
      releaseTable(order.tableId);
    }
    if (next === 'READY' || next === 'SERVED') {
      pushNotification({
        type: next === 'READY' ? 'order_ready' : 'order_served',
        title: next === 'READY' ? 'Order Ready' : 'Order Served',
        message: `Order #${order.id} is now ${next.toLowerCase()} for ${tableOf(order)?.tableNumber || 'the table'}.`,
        orderId: order.id,
        tableId: order.tableId,
        tableNumber: tableOf(order)?.tableNumber || null,
        orderStatus: next,
      });
    }
    return json(hydrate(order));
  }

  const cancelMatch = path.match(/^\/orders\/(\d+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    const order = STATE.orders.find((o) => o.id === parseInt(cancelMatch[1], 10));
    if (!order) return fail('Order not found', 404);
    if (order.status === 'CANCELLED') return fail('Order is already cancelled', 409);
    order.status = 'CANCELLED';
    order.cancelReason = (body as any)?.reason || 'Cancelled by staff';
    order.cancelledAt = new Date().toISOString();
    order.updatedAt = order.cancelledAt;
    releaseTable(order.tableId);
    return json(hydrate(order));
  }

  const billMatch = path.match(/^\/orders\/(\d+)\/request-bill$/);
  if (method === 'POST' && billMatch) {
    const order = STATE.orders.find((o) => o.id === parseInt(billMatch[1], 10));
    if (!order) return fail('Order not found', 404);
    if (order.status === 'CANCELLED') return fail('Cannot request the bill of a cancelled order', 409);
    order.billRequested = true;
    order.paymentStatus = 'PAID';
    order.status = 'COMPLETED';
    order.updatedAt = new Date().toISOString();
    releaseTable(order.tableId);
    pushNotification({
      type: 'order_paid',
      title: 'Bill Requested',
      message: `Bill requested for order #${order.id} (${tableOf(order)?.tableNumber || 'table'}).`,
      orderId: order.id,
      tableId: order.tableId,
      tableNumber: tableOf(order)?.tableNumber || null,
      orderStatus: 'COMPLETED',
    });
    return json(hydrate(order));
  }

  const printMatch = path.match(/^\/orders\/(\d+)\/print$/);
  if (method === 'POST' && printMatch) {
    const order = STATE.orders.find((o) => o.id === parseInt(printMatch[1], 10));
    if (!order) return fail('Order not found', 404);
    return json({
      message: 'Demo printer is not configured',
      orderId: order.id,
      printer: { configured: false, host: null, port: 0, queueLength: 0, nextJobId: 1 },
    });
  }

  if (method === 'GET' && path === '/notifications') return json(notificationsResponse());

  const markReadMatch = path.match(/^\/notifications\/(\d+)\/read$/);
  if (method === 'PATCH' && markReadMatch) {
    const id = parseInt(markReadMatch[1], 10);
    const n = STATE.notifications.find((x) => x.id === id);
    if (!n) return fail('Notification not found', 404);
    n.read = true;
    n.readAt = new Date().toISOString();
    return json({ id, read: true });
  }

  if (method === 'POST' && path === '/notifications/read-all') {
    const nowIso = new Date().toISOString();
    STATE.notifications.forEach((n) => {
      if (!n.read) {
        n.read = true;
        n.readAt = nowIso;
      }
    });
    return json({ updated: STATE.notifications.length });
  }

  if (method === 'POST' && path === '/notifications/clear-all') {
    const cleared = STATE.notifications.length;
    STATE.notifications = [];
    return json({ cleared });
  }

  const clearMatch = path.match(/^\/notifications\/(\d+)$/);
  if (method === 'DELETE' && clearMatch) {
    const id = parseInt(clearMatch[1], 10);
    STATE.notifications = STATE.notifications.filter((n) => n.id !== id);
    return json({ cleared: true });
  }

  if (method === 'GET' && path === '/printer/status') {
    return json({ configured: false, host: null, port: 0, queueLength: 0, nextJobId: 1 });
  }

  if (method === 'GET' && path === '/dashboard') return json(buildDashboard());

  if (method === 'POST' && path === '/auth/logout') return json({ message: 'Logged out of demo mode' });

  if (method === 'GET' && path === '/auth/me') return json(USERS[0]);

  return null;
}

export function resetDemoData() {
  STATE = createState();
}
