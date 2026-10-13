import { Slot, DarkTheme, DefaultTheme, ThemeProvider, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
// Web-only global stylesheet (ignored on native) — larger, styled scrollbars.
import '../scrollbars.css';
import { useColorScheme } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AlertDialog } from '@/components/AlertDialog';
import { BottomToast } from '@/components/BottomToast';
import { useEffect, useRef, useState } from 'react';
import { api, TABLE_STATUS_OVERRIDES_KEY } from '@/services/api';
import { OFFLINE_ORDERS_KEY } from '@/utils/offlineOrders';
import { BILL_REQUESTED_KEY } from '@/utils/billRequested';
import { BASE_URL_STORAGE_KEY } from '@/config/apiConfig';
import { getStorageItemSync, initStorageHydration } from '@/utils/storage';
import { loadSession } from '@/utils/sessions';
import { RESERVATIONS_STORAGE_KEY, primeReservations } from '@/utils/reservations';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';

SplashScreen.preventAutoHideAsync();

// Keys that gate rendering — hydrated from AsyncStorage before first paint on native
const PERSISTED_KEYS = [
  'smart_cafe_sessions',
  BASE_URL_STORAGE_KEY,
  'smart_cafe_active_tab',
  'smart_cafe_active_orders',
  'smart_cafe_notifications',
  'smart_cafe_cleared_history',
  // Local table statuses (read-only feed servers) must survive a restart too,
  // or a freed table would flip back to its feed value on the next launch.
  TABLE_STATUS_OVERRIDES_KEY,
  // Reservation codes must survive a restart or a booked table would lose
  // its RES-#### id on the next launch.
  RESERVATIONS_STORAGE_KEY,
  // Device-saved orders (placed with no order API) must survive a restart.
  OFFLINE_ORDERS_KEY,
  // Bill-requested order ids must survive a restart or the table would
  // reappear in the Order Details list on the next launch.
  BILL_REQUESTED_KEY,
];

export default function Layout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const [splashFinished, setSplashFinished] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
  });
  // A failed font load must never hold the app on the splash screen.
  const fontsReady = fontsLoaded || Boolean(fontError);

  // Hydrate persisted state from AsyncStorage before rendering any route.
  // On native, getStorageItemSync only reads the in-memory cache — without
  // this step a restart looks like a logout and all sessions are lost.
  useEffect(() => {
    let cancelled = false;
    const applyPersisted = () => {
      if (cancelled) return;
      // URL first: the session (token) is looked up per server URL.
      const savedBaseUrl = getStorageItemSync(BASE_URL_STORAGE_KEY);
      if (savedBaseUrl && savedBaseUrl.trim()) {
        api.setBaseUrl(savedBaseUrl.trim());
      }
      const session = loadSession(api.getBaseUrl());
      // Same behaviour on web and native: a saved session keeps the user
      // signed in across refresh/restart with the same activities.
      api.setToken(session?.token ?? null);
      setStorageReady(true);
    };
    // Never let a stuck AsyncStorage read hold the whole app on the splash
    // screen: unblock after 2s, and apply again if hydration lands later.
    const fallback = setTimeout(applyPersisted, 2000);
    initStorageHydration(PERSISTED_KEYS).then(() => {
      clearTimeout(fallback);
      // Codes read from AsyncStorage are invisible to the store until now.
      primeReservations();
      applyPersisted();
    });
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  // Auth guard: unauthenticated users must not access sub-routes.
  // Uses a ref for router to avoid re-triggering this effect on every render,
  // and falls back to the in-memory API token to prevent transient redirect-to-login
  // during navigation transitions.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!storageReady) return;
    // Web and native share the same rule: a saved session or an in-memory
    // token grants access, so the same login sees the same activities.
    const hasToken = Boolean(loadSession(api.getBaseUrl())?.token) || Boolean(api.getToken());
    if (!hasToken && pathname !== '/' && pathname !== '') {
      routerRef.current.replace('/' as any);
    }
  }, [pathname, storageReady]);

  if (!splashFinished || !fontsReady || !storageReady) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay onFinish={() => setSplashFinished(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Slot />
      <BottomToast />
      <AlertDialog />
    </ThemeProvider>
  );
}
