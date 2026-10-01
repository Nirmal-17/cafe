type Listener = (onHold: boolean) => void;

const listeners = new Set<Listener>();

let onHold = false;

export function isBillRequestHold(): boolean {
  return onHold;
}

export function beginBillRequestHold(): void {
  if (onHold) return;
  onHold = true;
  listeners.forEach((listener) => listener(true));
}

export function endBillRequestHold(): void {
  if (!onHold) return;
  onHold = false;
  listeners.forEach((listener) => listener(false));
}

export function subscribeBillRequestHold(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
