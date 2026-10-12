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
- Frontend api.ts SINGLE-URL client (`src/config/apiConfig.ts`): saved URL > EXPO_PUBLIC_API_URL > production (`https://cafeos.leadingedge.com.np`) — the old same-origin(web)/localhost:3000(native) default made "Reset Default" a no-op whenever the saved URL was localhost. Cascade/multi-host login/mock fallbacks/getExploreMenuDirect ALL REMOVED. New: startTableSession, getPrinterStatus, pingHealth, resetBaseUrl
- index.tsx: client-side tableSessions storage gone; DEFAULT_SCREENSHOT_ORDERS, +5/+18/+8450 fake metrics, fake latency/printer, static notifications all REMOVED (now real/derived)
- MyTableScreen uses `table.activeSession`; real unread badge
- CRITICAL SQLite lesson: inside `prisma.$transaction(async (tx) => ...)` ALL queries must use `tx`, never the global prisma client (lock conflict → "Failed to start table session" 500)

### Phase 3.5 — demo data removed + per-URL logins (2026-10-02, uncommitted)
- ALL offline/demo fallbacks DELETED: `src/services/demoData.ts` (714-line mock backend), `DEMO_ACCOUNTS`, `offlineLogin`/`unreachableLogin`/`demoFallback`, `isOfflineSession()`, `ApiResponse.offline`, root `login.json`, and the "Backend offline — demo login: …" banner. Login now fails honestly on unreachable server / wrong credentials (15s `AbortSignal.timeout` on `/auth/login`).
- NEW `src/utils/sessions.ts`: `{token, user, username}` stored per normalized URL under one `smart_cafe_sessions` map; the ACTIVE session is always the one for `smart_cafe_base_url`. Legacy `smart_cafe_token` / `smart_cafe_user` / `smart_cafe_saved_username` keys removed — existing users sign in once again.
- LoginScreen: Server URL input is HIDDEN by default — triple-tap the brand logo (loginlogo.jpg) to reveal/toggle the card; the typed URL is applied before every login attempt; username prefills per URL (untouched field only); debounced `/health` ping of the typed URL.
- URL switch (`api.setBaseUrl` / `resetBaseUrl`): adopts that URL's own token (or none) and wipes menu/tables/active-order caches; `index.tsx applyServerUrl` re-derives auth state (signed in iff the new URL has a session) and clears notifications + cleared-history. Profile → Configure Server URL and the login screen both use this path.

### Phase 3.6 — api.txt contract integration + ADMIN/WAITER login gate (2026-10-07, uncommitted)
- Frontend targets the documented contract in repo-root `api.txt` (base `https://cafeos.leadingedge.com.np`). The default in `.env` EXPO_PUBLIC_API_URL + `src/config/apiConfig.ts` CAFEOS_PRODUCTION_URL is `https://cafeos.leadingedge.com.np` — the live host serving `/api/menu-item/all`, `/menucategory/all`, `/explore-menu/get-menu` (2026-10-08). Everything was coded to the doc + smoke-tested against the sibling backend instead.
- LOGIN: body `{username, email: username, password}`; after success the role comes from the payload or `GET /auth/me` — ONLY ADMIN/WAITER pass (other or unknown role → 403 "Only Admin and Waiter…", previous token restored, session saved only after the gate).
- api.txt wiring in `src/services/api.ts`: `getMe`, `getSettings` (currency/tax/serviceCharge/printerEnabled normalized to app shape with defaults), `getQr`, `getUnpaidBills`, `cashierCheckout` (clears the local active-order mirror on success). Menu: nested `GET /menu` is primary (`normalizeMenuCategories` fills id/categoryId/price/available); flat feeds only fallback. `startTableSession`/`cancelOrder`/`getOrders` fall back ONLY on route-missing (404/405/HTML/redirect) — never on network error or 500.
- order-details: Payment card (QR image + Collect Payment) + checkout modal (amount, method CASH/CARD/UPI/QR); qr+bills refresh in background on every load; unpaid-bills feed drives payment when table detail excludes bill-requested orders (bills scoped to THIS table only — unscoped ids could settle another table's bill); success → `requestMainRefresh()` → switchMainTab('home') → `router.dismissTo('/')`. `handleRequestBill` also fires requestMainRefresh.
- `table/[id]`: createOrder sends `waiterId`; menu list hides `available === false`. `mainTab.ts` new `requestMainRefresh()/subscribeMainRefresh()` bus; index.tsx subscribes → `fetchData()`.
- FloorPlanGrid: busy tables WITHOUT activeSession stay visible to waiters (servers with no session model would otherwise hide every occupied table — MyTableScreen already had this unassigned escape).
- Smoke-tested vs sibling backend (prisma/dev.db, port 3000, stopped after): login returns role inline ✓, /auth/me ✓, /settings `{}` → defaults ✓, /tables + /tables/:id (`orders` key — order-details reads `orders || activeOrders`) ✓, nested /menu items `{id,price,available,image}` ✓, /orders `{orders,page,limit,total,hasMore}` ✓, /qr + /cashier/unpaid-bills 404 → fallbacks engage ✓ (4/5 rate-limit logins used).
- Verify: `npx tsc --noEmit` clean; `npx expo lint` 0 errors, 31 pre-existing warnings.

## Dev logins (local DB — only against a running backend)
- waiter@leadingedge.com / Wait3rCafe123 (WAITER) - login matches email OR exact
  name, so the full address must be typed (bare "waiter" does not match)
- admin / admin@leadingedge.com / 123@dmin (ADMIN)
Passwords come from backend/.env SEED_*_PASSWORD (fallback defaults if unset).
The trimmed seed creates only those two accounts (the app admits ADMIN/WAITER
only). Backend lives OUTSIDE this repo, at
`C:\Users\user\OneDrive\Desktop\cafe\cafe-os-mobile-app-react-native\backend`,
and must be running for http://localhost:3000 - `cd backend && npm run dev`.

## Login troubleshooting (2026-10-08)
- Two hosts matter: local `http://localhost:3000` (full API, backend must be
  running) and hosted `https://cafeos.leadingedge.com.np` (menu/table feeds plus
  `POST /api/account/login` only - no /auth/me, /settings, /tables, /orders).
- Hosted login returns no role and `/api/auth/me` 404s: `api.login()` admits the
  account as WAITER (least-privileged allowed role) rather than refusing a
  correct password. Servers that DO expose /auth/me still enforce the
  ADMIN/WAITER-only gate, and a failing (non-404) /auth/me is still surfaced.
- Login screen: when the typed URL does not answer it offers a one-tap switch to
  the default live server; `/health` probes treat any HTTP answer (404 included)
  as reachable, so a route-less host is never shown as "offline".

## Commands
- Backend dev: `cd backend && npm run dev` (ts-node-dev); build: `npx tsc` → run `node dist/app.js`
- Frontend dev: `npx expo start`; typecheck `npx tsc --noEmit`; lint `npx expo lint` (0 errors, ~32 warnings pre-existing)
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
