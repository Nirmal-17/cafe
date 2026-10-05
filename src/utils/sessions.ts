// Per-server-URL login sessions.
// Every backend URL keeps its own token + user + remembered username, so
// switching the server URL switches to that server's own credentials.

import { getStorageItemSync, setStorageItemSync } from '@/utils/storage';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: 'WAITER' | 'CHEF' | 'CASHIER' | 'ADMIN';
  createdAt?: string;
}

export interface StoredSession {
  token: string;
  user: SessionUser;
  /** Username pre-filled the next time this URL is selected. */
  username?: string;
}

const SESSIONS_KEY = 'smart_cafe_sessions';

function readAll(): Record<string, StoredSession> {
  try {
    const raw = getStorageItemSync(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, StoredSession>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, StoredSession>) {
  setStorageItemSync(SESSIONS_KEY, JSON.stringify(all));
}

/** Session saved for this exact server URL (null when never signed in here). */
export function loadSession(url: string): StoredSession | null {
  const session = readAll()[url];
  return session && session.token && session.user ? session : null;
}

export function saveSession(url: string, session: StoredSession) {
  const all = readAll();
  all[url] = session;
  writeAll(all);
}

/** Drop only this URL's session — other servers stay signed in. */
export function clearSession(url: string) {
  const all = readAll();
  if (!(url in all)) return;
  delete all[url];
  writeAll(all);
}

/** Username remembered for this URL (empty string when none). */
export function savedUsername(url: string): string {
  return loadSession(url)?.username || '';
}
