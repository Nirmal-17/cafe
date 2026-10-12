import { router } from 'expo-router';

// `router.back()` dispatches GO_BACK, which no navigator handles when the
// current screen is the first in the stack (deep link / page refresh on
// /table/:id or /order-details/:id) — dev-only warning, nothing happens.
export function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
