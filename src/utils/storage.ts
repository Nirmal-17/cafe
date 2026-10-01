import { Platform } from 'react-native';

let AsyncStorageModule: any = null;
try {
  // Safe require for Metro bundler compatibility across environments
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorageModule = require('@react-native-async-storage/async-storage');
  if (AsyncStorageModule && AsyncStorageModule.default) {
    AsyncStorageModule = AsyncStorageModule.default;
  }
} catch {
  // In case async-storage module is missing in local node_modules
}

const isWeb = Platform.OS === 'web';

// Memory fallback cache for synchronous reads on React Native
const memoryCache: Record<string, string> = {};

// Safe synchronous getter
export const getStorageItemSync = (key: string): string | null => {
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // Ignore web storage errors
    }
  }
  return memoryCache[key] || null;
};

// Safe synchronous setter
export const setStorageItemSync = (key: string, value: string): void => {
  memoryCache[key] = value;
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // Ignore web storage errors
    }
  }
  if (AsyncStorageModule && typeof AsyncStorageModule.setItem === 'function') {
    AsyncStorageModule.setItem(key, value).catch(() => {});
  }
};

// Safe synchronous remover
export const removeStorageItemSync = (key: string): void => {
  delete memoryCache[key];
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore web storage errors
    }
  }
  if (AsyncStorageModule && typeof AsyncStorageModule.removeItem === 'function') {
    AsyncStorageModule.removeItem(key).catch(() => {});
  }
};

// Async initial hydration for Expo Go native — parallel reads for faster startup
export const initStorageHydration = async (keys: string[]): Promise<Record<string, string | null>> => {
  if (!AsyncStorageModule || typeof AsyncStorageModule.getItem !== 'function') {
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      result[key] = getStorageItemSync(key);
    }
    return result;
  }

  const results = await Promise.allSettled(
    keys.map(async (key) => {
      try {
        const val = await AsyncStorageModule.getItem(key);
        if (val !== null) {
          memoryCache[key] = val;
        }
        return [key, val] as const;
      } catch {
        return [key, getStorageItemSync(key)] as const;
      }
    })
  );

  const result: Record<string, string | null> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      result[r.value[0]] = r.value[1];
    }
  }
  return result;
};
