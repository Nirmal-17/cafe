# CafeOS — Project Context (Phases 0-3 complete, Phase 4 pending)

> STATUS SNAPSHOT — saved 2026-09-10. Read this fully before continuing work.
> IMPORTANT: Read the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo/RN frontend code.

## Project
CafeOS — restaurant POS (waiter + kitchen + cashier) built as Expo SDK 57 / React Native 0.86 / TypeScript frontend (`src/`) + Express/Prisma/SQLite backend (`backend/`, port 3000, also serves the built SPA from `dist/`). Repo: `C:\Users\user\OneDrive\Desktop\cafe\cafe-os-mobile-app-react-native`.

## Remotes / CI
- `github` → https://github.com/Nirmal-17/cafe-os-mobile-app-react-native.git (master tracks this — `git push` works)
- `origin` → GitLab leadingedgesoft (legacy, untouched)
- All phase commits pushed through `f97ac63`. User's own dirty edits to root `package.json`/`package-lock.json` (adds @expo/ngrok, @prisma/client@7 — unused by frontend) are intentionally NEVER committed.

## Completed work (in order)

### Phase 0 — security hardening (commit 90caa8d)
- `backend/.env` holds real JWT_SECRET + SEED_*_PASSWORD (git-ignored, NEVER commit); `.env.example` documents all keys
- `middleware/auth.ts` THROWS at startup if JWT_SECRET missing
- All `/orders`, `/cashier/*`, `/settings`, `/tables`, `/sections`, `/menu` routes behind `authenticateToken`
- express-rate-limit: 5 attempts/15min on `/api/auth/login` (in-memory — restart clears it)
- Frontend demo-token login fallback REMOVED
- `dev.db`, `seed.js*` untracked; `.gitignore` fixed (env, *.db, dist, backend artifacts; assets/ tracked)
- Assets `assets/images/{cafelogo,cafelogobg,leadinglogo,profile}.png` are 1x1 px placeholders (originals never in git) — replace with real branding when available

### Phase 1 — login core + session persistence (commit 1208f82)
- Frontend login: `/api/auth/login`, parses `{success, data:{token, user}}`
- Backend auth.ts: local DB is source of truth; remote login opt-in via `REMOTE_LOGIN_URL` (5s timeout, mirrors unknown users to real DB rows); local password mismatch rejects immediately
- `_layout.tsx` hydrates AsyncStorage (`initStorageHydration(PERSISTED_KEYS)`) BEFORE render — login survives app restart on native; token + saved baseUrl restored into api singleton
- Stray `%5BtableId%5D.tsx` route file deleted
- `orders.ts` create: server-side price verification (DB prices win; unknown item 404; bad qty 400)

### Phase 2 — money & data integrity (commit b9b4549)
- `backend/src/utils/money.ts` — ALL money math in integer paise (toPaise/fromPaise/percentOfPaise/validateDiscountPaise)
- Idempotency: unique `clientRequestId` column on Order + Payment; replays return original (incl. P2002 race catch)
- `payment.ts`: method whitelist CASH/CARD/UPI/QR, discount 0..subtotal, amountPaid >= total, already-paid 409, cancelled 409; interactive tx frees table ONLY when no other UNPAID active orders
- `backend/src/services/printer.ts` — real ESC/POS TCP queue (PRINTER_HOST/PRINTER_PORT/PRINTER_TIMEOUT_MS env; unconfigured = jobs queue safely)
- Frontend: clientRequestId sent from table/[id] (reused per cart until success) + order-details checkout; mock-order fallback in api.createOrder REMOVED

### Phase 3 — server-authoritative table state (commit f97ac63)
- `TableSession` model (openedAt, closedAt; one open per table; history rows)
- `GET /tables` + `/tables/:id` include `activeSession`; `POST /tables/:id/session` (auth, rejects CLEANING); `PATCH /tables/:id/status` closes session when leaving occupied
- Session closes automatically: final payment checkout, order COMPLETED/CANCELLED freeing table, status change. First order auto-opens session
- Guest count fully removed (schema `guest_count` column dropped, API/UI picker, "Guests Seated" KPI) — sessions track occupancy only
- Remote table sync opt-in via `REMOTE_TABLES_URL`, preserves real capacity
- Frontend api.ts SINGLE-URL client: saved URL > EXPO_PUBLIC_API_URL > same-origin(web)/localhost:3000(native). Cascade/multi-host login/mock fallbacks/getExploreMenuDirect ALL REMOVED. New: startTableSession, getPrinterStatus, pingHealth, resetBaseUrl
- index.tsx: client-side tableSessions storage gone; DEFAULT_SCREENSHOT_ORDERS, +5/+18/+8450 fake metrics, fake latency/printer, static notifications all REMOVED (now real/derived)
- MyTableScreen uses `table.activeSession`; real unread badge
- CRITICAL SQLite lesson: inside `prisma.$transaction(async (tx) => ...)` ALL queries must use `tx`, never the global prisma client (lock conflict → "Failed to start table session" 500)

## Dev logins (local DB)
- waiter@leadingedge.com / Wait3rCafe123 (WAITER)
- chef@leadingedge.com / Ch3fCafe123 (CHEF)
- cashier@leadingedge.com / Cash1erCafe123 (CASHIER)
Passwords come from backend/.env SEED_*_PASSWORD (fallback defaults if unset).

## Commands
- Backend dev: `cd backend && npm run dev` (ts-node-dev); build: `npx tsc` → run `node dist/app.js`
- Frontend dev: `npx expo start`; typecheck `npx tsc --noEmit`; lint `npx expo lint` (0 errors, ~31 warnings pre-existing)
- DB: `npx prisma db push --accept-data-loss` then `npx ts-node prisma/seed.ts` (from backend/)
- Verify both typecheck BEFORE any commit; smoke-test on http://localhost:3000 (careless re-login from same IP in tests → 429 rate limit; restart server to clear)
- Test payload gotcha: PowerShell `node -e` mangles `$` — write temp .js scripts instead. Prisma scripts must run with cwd=backend for @prisma/client resolution

## NEXT: Phase 4 — real-time & performance (planned, not started)
1. Replace 5s polling (`index.tsx` fetchData interval) with SSE or Socket.IO (orders/tables/kitchen events); exponential backoff reconnect
2. Abort in-flight requests on unmount / dedupe concurrent fetches (AbortController)
3. Keep KitchenScreen mounted across tab switches (currently unmounts — loses deliveredOrderIds/localStatuses state); replace console.log kitchen notifications with real alerts
4. Persist kitchen local state server-side or storage
5. Server-side pagination + search for `/orders` history (currently full findMany with deep includes)
After Phase 4, roadmap continues: Phase 5 (code quality: central theme, split 1000-line files, kill `as any`, remove root prisma dep, Express 5-safe wildcard, CORS restrict) → Phase 6 (tests Vitest/Supertest, CI, Sentry/Pino logging, PostgreSQL migration, HTTPS/SecureStorage/EAS)
