import type { Order } from '@/services/api';

export function isOpenOrder(order: Pick<Order, 'status' | 'paymentStatus'>): boolean {
  return order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED';
}

export function sumOpenValue(
  orders: Pick<Order, 'status' | 'paymentStatus' | 'totalAmount'>[],
): number {
  return orders.reduce(
    (sum, order) => (isOpenOrder(order) ? sum + Number(order.totalAmount || 0) : sum),
    0,
  );
}
