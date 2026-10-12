import { setStorageItemSync } from '@/utils/storage';

export type MainTab = 'home' | 'dashboard' | 'menu' | 'orders' | 'profile' | 'history' | 'notifications';

type Listener = (tab: MainTab) => void;

const listeners = new Set<Listener>();

/**
 * Switch the main screen (index route) to a given tab.
 * Works even when the requesting screen is pushed on top of the main screen:
 * mounted listeners switch immediately, and the persisted value covers the
 * case where the main screen has to be mounted fresh.
 */
export function switchMainTab(tab: MainTab): void {
  setStorageItemSync('smart_cafe_active_tab', tab);
  listeners.forEach((listener) => listener(tab));
}

export function subscribeMainTabSwitch(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type RefreshListener = () => void;

const refreshListeners = new Set<RefreshListener>();

/**
 * Ask the main screen to resync with the server right now — used after a
 * write from a pushed screen (bill request, cashier checkout) whose effect on
 * tables/orders must show up immediately instead of on the next heartbeat.
 */
export function requestMainRefresh(): void {
  refreshListeners.forEach((listener) => listener());
}

export function subscribeMainRefresh(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}
