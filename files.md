# CafeOS - Project Files & Architecture Breakdown

Welcome to the **CafeOS** full-stack developer documentation. This document outlines the project structure, routing, architecture, and database layout of the CafeOS restaurant ordering and kitchen management application.

---

## 🏗️ System Architecture

CafeOS uses a full-stack, decoupled architecture:
1. **Frontend (Expo Router / React Native Web & Native)**: Universal client application running on iOS, Android, and Web platforms.
2. **Backend (Node.js / Express / Prisma / PostgreSQL)**: Headless REST API routing state updates, printing queue logs, table states, and kitchen display updates.

---

## 📁 Directory Layout Breakdown

```text
/ (Root)
├── package.json              # Main project config & package manager commands
├── app.json                  # Expo config file (slug, splash, entrypoint)
├── tsconfig.json             # TypeScript configuration for static checks
├── files.md                  # This developer architecture breakdown
├── src/                      # Frontend Application Source Code
│   ├── app/                  # Expo file-system based router navigation
│   │   ├── _layout.tsx       # Root layout, theme config, auth guards
│   │   ├── index.tsx         # Main single-screen viewport controller (Home state manager)
│   │   ├── table/            # Table ordering dynamic paths
│   │   │   └── [id].tsx      # Placing a new order on selected Table
│   │   └── order-details/    # Billing & Checkout dynamic paths
│   │       └── [tableId].tsx # Billing history, checkout controls, payment QR
│   ├── components/           # Reusable UI controls and visualizers
│   │   ├── MenuBrowser.tsx   # Modular category-aware card browser
│   │   ├── animated-icon.tsx # Brand visual animations for bootup
│   │   └── screens/          # Screen-level visual components
│   │       ├── MyTableScreen.tsx      # Waiter landing page & table grid
│   │       ├── LoginScreen.tsx     # Session authentication
│   │       ├── MenuScreen.tsx      # Admin/Staff item list view
│   │       ├── PlaceOrderScreen.tsx# Interactive order builder grid
│   │       └── OrdersScreen.tsx    # Live order timeline list
│   ├── services/             # Networking / API layers
│   │   └── api.ts            # Typed REST fetch service for backend requests
│   └── utils/                # General utility modules
│       ├── print.ts          # Thermal printer template engine & simulator
│       └── storage.ts        # Client storage wrappers for persistence
│
└── backend/                  # Server-side application
    ├── package.json          # Node server dependencies
    ├── prisma/               # Schema models & migrations configuration
    │   └── schema.prisma     # Prisma DB configuration schemas
    └── src/                  # Server-side source files
        ├── app.ts            # Entrypoint file, middleware, routes mapping
        ├── controllers/      # API controller functions
        ├── middleware/       # JWT Authentication & Role guards
        ├── routes/           # REST routes definition
        └── services/         # Printing, order flow handlers
```

---

## 📱 Detailed Frontend Layout

### 📍 Router Context (`src/app/`)
* **`_layout.tsx`**: Loads standard fonts (Archivo), provisions active global themes, checks standard storage tokens for JWT validation, and guards standard app states by routing back to `/` if not logged in.
* **`index.tsx`**: The main parent app controller. It manages role navigation (Chef/Waiter/Admin viewports), side drawers, login states, and switches between local states.
* **`table/[id].tsx`**: Dynamically fetches the clicked table state and links to the order creation layout.
* **`order-details/[tableId].tsx`**: Renders bill outlines, payment options (QR codes), and triggers state conversions to standard completion (`COMPLETED`) once paid.

### 🍱 Main Visual Components (`src/components/`)
* **`PlaceOrderScreen.tsx`**: Completely refined for lightning-fast waiter performance. Displays menu items inside a highly localized scrollbox (nested scrolling enabled). Hides distracting retail prices from browse cards so waiters can focus solely on the item name and quantity count.

---

## 🗄️ Database Schema & Models

The relational schema is configured in `/backend/prisma/schema.prisma` with standard PostgreSQL tables:

* **`User`**: Admin, chef, and waiter credentials.
* **`Table`**: Table identifier, layout position, category, and status (`AVAILABLE`, `OCCUPIED`).
* **`MenuCategory`**: Custom sections (e.g. *Appetizers*, *Beverages*).
* **`MenuItem`**: Dishes, descriptions, prices, categories, and inventory availability tags.
* **`Order`**: Order summaries containing ticket states (`PENDING`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`).
* **`OrderItem`**: Relational join mapping a specific dish to an order with count and individual pricing.

---

## 🚀 Running standard Commands

### Frontend Client
To compile or start the web client:
```bash
# Start Client
npx expo start --web

# Export static build assets
npx expo export --platform web
```

### Backend Server
To trigger standard database migrations and start the server:
```bash
cd backend
npm install
npx prisma db push
npm run dev
```
