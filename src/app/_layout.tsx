import { Slot, DarkTheme, DefaultTheme, ThemeProvider, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AlertDialog } from '@/components/AlertDialog';
import { BottomToast } from '@/components/BottomToast';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { getStorageItemSync, initStorageHydration } from '@/utils/storage';
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
  'smart_cafe_token',
  'smart_cafe_user',
  'smart_cafe_base_url',
  'smart_cafe_active_tab',
  'smart_cafe_saved_username',
  'smart_cafe_active_orders',
  'smart_cafe_notifications',
  'smart_cafe_cleared_history',
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
      const token = getStorageItemSync('smart_cafe_token');
      if (token) {
        api.setToken(token);
      }
      const savedBaseUrl = getStorageItemSync('smart_cafe_base_url');
      if (savedBaseUrl && savedBaseUrl.trim()) {
        api.setBaseUrl(savedBaseUrl.trim());
      }
      setStorageReady(true);
    };
    // Never let a stuck AsyncStorage read hold the whole app on the splash
    // screen: unblock after 2s, and apply again if hydration lands later.
    const fallback = setTimeout(applyPersisted, 2000);
    initStorageHydration(PERSISTED_KEYS).then(() => {
      clearTimeout(fallback);
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
    const hasToken = Boolean(getStorageItemSync('smart_cafe_token')) || Boolean(api.getToken());
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
