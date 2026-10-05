// Central API configuration — the single source of truth for the backend Base URL.
// Every request the app makes (login, CRUD, WebSocket events) resolves through
// getBaseUrl() here, so changing the server URL switches the whole app at once.
//
// Base URL resolution (single source — no fallback cascades):
//   1. Explicitly saved value (login screen / Profile -> Configure Server URL)
//   2. EXPO_PUBLIC_API_URL from the environment
//   3. The production CafeOS server (CAFEOS_PRODUCTION_URL below)
// The URL is never hardcoded anywhere else — the login screen and the
// "Configure Server URL" modal both write through setBaseUrl().

import { Platform } from 'react-native';
import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from '@/utils/storage';

/** AsyncStorage/localStorage key holding the user-selected server URL. */
export const BASE_URL_STORAGE_KEY = 'smart_cafe_base_url';

/** Production CafeOS server — the default when no saved/env URL exists. */
export const CAFEOS_PRODUCTION_URL = 'http://localhost:3000';

// ── Loopback handling ───────────────────────────────────────────────────────
// http://localhost:3000 means "this device" — on a phone/emulator that is the
// phone itself, never the computer running the backend. Every request would
// fail before leaving the device, so on native we swap in the dev machine's
// LAN IP (Metro exposes it as expoConfig.hostUri). Web keeps localhost: it
// runs on the same machine as the backend.

/** Scheme + loopback host of a server URL (port/path not consumed). */
const LOOPBACK_PATTERN = /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?=[:/?#]|$)/i;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/** True when the URL points at the device itself instead of a backend host. */
export function isLoopbackUrl(raw: string): boolean {
  return LOOPBACK_PATTERN.test((raw || '').trim());
}

let devMachineIp: string | null | undefined;

/** Host part of a URI-ish value (exp://1.2.3.4:8081, 1.2.3.4:8081, ...). */
function hostOf(value: string): string {
  return value
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // optional scheme (exp://, http://)
    .split('/')[0]
    .split('?')[0]
    .split(':')[0]
    .replace(/^\[|\]$/g, '');
}

/**
 * LAN IPv4 of the computer running Metro — only known in dev (Expo Go /
 * dev client): @expo/cli writes it into expoConfig.hostUri. Returns null on
 * web, in production builds, and when Metro runs behind a tunnel or an
 * adb-reverse/USB session (hostUri is then localhost or a domain, never an IP).
 *
 * Every candidate is inspected: the first entry is often `localhost:8081`
 * while a later one still carries the real LAN address, and picking only the
 * first used to leave devices dialing localhost for the API too.
 */
export function getDevMachineIp(): string | null {
  if (devMachineIp !== undefined) return devMachineIp;
  if (Platform.OS === 'web') {
    devMachineIp = null;
    return null;
  }
  try {
    // Lazy require: expo-constants is only meaningful for device builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default;
    const candidates: (string | undefined)[] = [
      Constants?.expoConfig?.hostUri, // @expo/cli (dev only)
      Constants?.expoGoConfig?.debuggerHost, // Expo Go manifest
      Constants?.manifest2?.extra?.expoGo?.debuggerHost,
      Constants?.manifest?.debuggerHost, // classic manifest
      Constants?.manifest?.hostUri, // platform manifest
      Constants?.experienceUrl, // exp://<host>:8081
      Constants?.linkingUri, // exp://<host>:8081/--/...
    ];
    const found = candidates
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map(hostOf)
      .find((host) => IPV4_PATTERN.test(host));
    devMachineIp = found ?? null;
  } catch {
    devMachineIp = null;
  }
  return devMachineIp;
}

/**
 * Rewrite a loopback URL to the dev machine's LAN IP (port and path kept).
 * Native only, and only when the IP is known — everything else passes through.
 */
function withReachableHost(url: string): string {
  if (Platform.OS === 'web' || !isLoopbackUrl(url)) return url;
  const ip = getDevMachineIp();
  if (!ip) return url;
  return url.replace(LOOPBACK_PATTERN, `$1${ip}`);
}

/**
 * Why this URL cannot work on this device (null when it can) — used to turn a
 * bare "server unreachable" into an actionable message on the login screen.
 */
export function describeLoopbackIssue(url: string): string | null {
  if (Platform.OS === 'web' || !isLoopbackUrl(url)) return null;
  const ip = getDevMachineIp();
  const suggestion = ip ? `${url.replace(LOOPBACK_PATTERN, `$1${ip}`)}` : 'http://<your-computer-ip>:3000';
  return `${url} points at this device, not the computer running the backend. Use ${suggestion}.`;
}

/**
 * The same URL under the opposite scheme. https:// typed against a plain-HTTP
 * dev backend (or http:// against a TLS host) can never connect, and that
 * failure is indistinguishable from a server that is switched off — probed
 * after the primary URL fails, this turns "unreachable" into a concrete fix.
 */
export function alternateSchemeUrl(url: string): string | null {
  const trimmed = (url || '').trim();
  if (/^https:\/\//i.test(trimmed)) return `http://${trimmed.slice(8)}`;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  return null;
}

function resolveDefaultBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return withReachableHost(envUrl.trim());
  }
  return CAFEOS_PRODUCTION_URL;
}

/** Default server URL — used on first launch and by resetBaseUrl(). */
export const DEFAULT_BASE_URL = resolveDefaultBaseUrl();

export interface BaseUrlValidation {
  ok: boolean;
  /** Normalized URL when ok === true; the URL still in effect when ok === false. */
  url: string;
  /** Why the input was rejected (only present when ok === false). */
  error?: string;
}

/**
 * Adds a scheme when the user typed a bare host. A bare host with an explicit
 * port is a local/dev backend (e.g. 192.168.10.74:3000) speaking plain HTTP —
 * defaulting it to https:// would fail the TLS handshake. Bare domains stay
 * https (the production server).
 */
function withDefaultScheme(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  const hasPort = /^\[[^\]]+\]:\d/.test(raw) || /^[^/\s]+:\d+(?:[/?#]|$)/.test(raw);
  return hasPort ? `http://${raw}` : `https://${raw}`;
}

/** Canonical form of a server URL (scheme kept, no trailing slash or /api). */
export function normalizeBaseUrl(raw: string): string {
  let clean = (raw || '').trim();
  if (!clean) return DEFAULT_BASE_URL;
  clean = withDefaultScheme(clean);
  clean = clean.replace(/\/+$/, '');
  if (clean.endsWith('/api')) {
    clean = clean.substring(0, clean.length - 4);
  }
  return withReachableHost(clean);
}

// ── Active state ─────────────────────────────────────────────────────────────
let currentBaseUrl: string = DEFAULT_BASE_URL;

type BaseUrlListener = (url: string) => void;
const listeners = new Set<BaseUrlListener>();

/** Subscribe to Base URL changes. Returns an unsubscribe function. */
export function onBaseUrlChange(listener: BaseUrlListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyBaseUrlChange() {
  listeners.forEach((listener) => {
    try {
      listener(currentBaseUrl);
    } catch {
      // A misbehaving listener must never break server switching.
    }
  });
}

/**
 * Validate a typed server URL without applying it.
 * Rejects empty input, whitespace, non-http(s) schemes, query/fragment parts
 * and anything the URL parser cannot parse (bad port, no host, ...).
 */
export function validateBaseUrl(raw: string): BaseUrlValidation {
  const fail = (error: string): BaseUrlValidation => ({ ok: false, url: currentBaseUrl, error });
  const trimmed = (raw || '').trim();

  if (!trimmed) return fail('Server URL is required');
  if (/\s/.test(trimmed)) return fail('Server URL cannot contain spaces');
  if (/[?#]/.test(trimmed)) return fail('Server URL cannot contain ?query or #fragment');

  const withScheme = withDefaultScheme(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return fail(`Invalid server URL — example: ${DEFAULT_BASE_URL}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('Only http:// and https:// URLs are supported');
  }
  if (!parsed.hostname) {
    return fail('Server URL is missing a host name — example: https://server1.example.com');
  }
  return { ok: true, url: normalizeBaseUrl(withScheme) };
}

/** The server URL every API request is built from. */
export function getBaseUrl(): string {
  return currentBaseUrl;
}

/**
 * Persist a new server URL (survives app restart). Invalid input leaves the
 * current URL untouched and comes back as { ok: false, error }.
 */
export function setBaseUrl(raw: string): BaseUrlValidation {
  const check = validateBaseUrl(raw);
  if (!check.ok) return check;
  const changed = check.url !== currentBaseUrl;
  currentBaseUrl = check.url;
  setStorageItemSync(BASE_URL_STORAGE_KEY, check.url);
  if (changed) notifyBaseUrlChange();
  return check;
}

/** Forget the saved override and return to the environment/platform default. */
export function resetBaseUrl(): string {
  removeStorageItemSync(BASE_URL_STORAGE_KEY);
  const next = normalizeBaseUrl(DEFAULT_BASE_URL);
  if (next !== currentBaseUrl) {
    currentBaseUrl = next;
    notifyBaseUrlChange();
  }
  return next;
}

function readSavedBaseUrl(): string {
  const saved = getStorageItemSync(BASE_URL_STORAGE_KEY);
  if (!saved || !saved.trim()) return DEFAULT_BASE_URL;
  // A stored value from an older build may no longer be valid — ignore it
  // rather than booting the app into a broken URL.
  const check = validateBaseUrl(saved);
  return check.ok ? check.url : DEFAULT_BASE_URL;
}

// Restore the saved URL (already synchronously available on web; on native it
// lands when _layout hydrates AsyncStorage and calls setBaseUrl again).
currentBaseUrl = normalizeBaseUrl(readSavedBaseUrl());
