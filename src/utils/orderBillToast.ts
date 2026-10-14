import { showBottomToast } from '@/components/BottomToast';

const recentAt = new Map<number, number>();
const DEDUPE_WINDOW_MS = 10000;
const PRUNE_AFTER_MS = 60000;
const MAX_TRACKED = 64;

function formatTableLabel(tableNumber?: string): string | null {
  if (!tableNumber) return null;
  return /^table\s/i.test(tableNumber) ? tableNumber : `Table ${tableNumber}`;
}

export function notifyBillRequested(orderId: number | string | null | undefined, tableNumber?: string, tableId?: number | string | null): void {
  const id = Number(orderId);
  if (!Number.isFinite(id)) return;

  const now = Date.now();
  const last = recentAt.get(id) ?? 0;
  if (now - last < DEDUPE_WINDOW_MS) return;
  recentAt.set(id, now);

  if (recentAt.size > MAX_TRACKED) {
    for (const [key, ts] of recentAt) {
      if (now - ts > PRUNE_AFTER_MS) recentAt.delete(key);
    }
  }

  const tableLabel = formatTableLabel(tableNumber);
  const tid = Number(tableId);
  showBottomToast({
    title: 'Bill Requested',
    message: tableLabel
      ? `${tableLabel} — order #${id} requested the bill`
      : `Order #${id} requested the bill`,
    tone: 'warning',
    notification: {
      type: 'bill_requested',
      orderId: id,
      tableId: Number.isFinite(tid) ? tid : undefined,
      tableNumber,
    },
  });
}
