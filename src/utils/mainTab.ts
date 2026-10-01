import { setStorageItemSync } from '@/utils/storage';

export type MainTab = 'home' | 'dashboard' | 'menu' | 'orders' | 'profile' | 'history' | 'kitchen' | 'notifications';

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
