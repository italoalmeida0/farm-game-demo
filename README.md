# 🌾 Happy Harvest - Farm Game

A complete **offline-first** farm game built with a **server-authoritative** architecture using **WAL (Write-Ahead Log)** synchronization. The backend runs on [Bun](https://bun.sh) and the frontend is a single-file HTML/CSS/JS application.

---

## 🏗️ Architecture & Stack

### Runtime & Framework

| Component | Technology | Why |
|---|---|---|
| **Backend Runtime** | [Bun](https://bun.sh) | Fast all-in-one JavaScript/TypeScript runtime with native `fetch`, file I/O (`Bun.write`/`Bun.file`), and Web Crypto API. Eliminates the need for Express, Node.js, or npm dependencies. |
| **Frontend** | Single-file HTML + CSS + JS | Zero build step — the browser loads `index.html` directly. Game logic is inlined. |
| **Shared Code** | TypeScript (`shared/` directory) | Types, game data, and validation logic are shared between backend (Bun) and frontend (inlined at build time). Single source of truth. |
| **Persistence** | JSON files on disk | Write-through per-player files (`data/players/{id}.json`) + accounts file (`data/accounts.json`). No database needed for this scale. |
| **Protocol** | HTTP REST (JSON) | `POST /api/sync` for WAL batches, `POST /api/register` & `POST /api/login` for auth, `GET /api/state` for state refresh. |

### Why This Stack?

- **Zero dependencies** — No `node_modules`, no `npm install`, no build tools. Just `bun run server.ts`.
- **Single binary deployment** — Bun handles HTTP server, file I/O, and crypto natively.
- **Offline-first gameplay** — The game works immediately in the browser; sync happens in the background.
- **Shared validation** — The same `validation.ts` runs on both client and server, catching cheaters early.

---

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                    │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │  Game    │  │  Local   │  │   WAL Buffer          │  │
│  │  Engine  │──│  State   │──│   (action queue)       │  │
│  │ (render) │  │ (RAM)    │  │                        │  │
│  └──────────┘  └──────────┘  └─────────┬──────────────┘  │
│       ▲              ▲                  │                 │
│       │              │                  │ Every ~5s       │
│       │    Shared Validation            ▼                 │
│       │    (validation.ts)     ┌────────────────────┐    │
│       │              ▲        │   Sync Engine       │    │
│       │              │        │   POST /api/sync    │    │
│       │              │        └────────┬────────────┘    │
└───────┼──────────────┼─────────────────┼─────────────────┘
        │              │                 │
        │              │    HTTP JSON    │
        │              │                 ▼
┌───────┼──────────────┼───────────────────────────────────┐
│       │       Shared │   Validation   BACKEND (Bun)      │
│       │       (same  │   (validation.ts)                 │
│       │        file) │                                   │
│       │              │   ┌──────────────────────────┐    │
│       │              │   │   In-Memory State Map    │    │
│       │              ├───│   Map<playerId, State>   │    │
│       │              │   └──────────────────────────┘    │
│       │              │   ┌──────────────────────────┐    │
│       │              │   │   WAL Processor          │    │
│       │              └───│   (lock → growth ticks   │    │
│       │                  │    → validate → apply     │    │
│       │                  │    → persist → respond)   │    │
│       │                  └──────────────────────────┘    │
│       │              ┌──────────────────────────────┐    │
│       └──────────────│   Write-Through Persistence  │    │
│                      │   data/players/{id}.json     │    │
│                      └──────────────────────────────┘    │
└───────────────────────────────────────────────────────────┘
```

---

## 🔄 How the Game Works

### 1. Registration & Authentication

Players create accounts with **username + password**. The server:

1. Validates the username (2-64 chars, alphanumeric + spaces + underscores)
2. Hashes the password with **PBKDF2** (SHA-256, 100,000 iterations, 32-byte random salt)
3. Creates a default [`PlayerState`](shared/types.ts:62) with 100 coins, 100 energy, and starter tools/seeds
4. Generates a cryptographically random 64-char hex **session token**
5. Persists everything to disk immediately (write-through)
6. Returns `{ token, state }` to the client

On subsequent visits, the client sends the stored token to **reconnect** without re-entering credentials. Sessions expire after **24 hours**.

### 2. Offline-First Gameplay

Once authenticated, the frontend receives the **full game state** from the server. This state lives in browser RAM with the exact same structure as the backend's [`PlayerState`](shared/types.ts:62).

Every player action (till, plant, water, harvest, buy, sell, upgrade):

1. **Validates locally** using the shared [`validation.ts`](shared/validation.ts) logic
2. **Applies to local state** immediately — the UI updates instantly, no server round-trip
3. **Appends to WAL buffer** — a queue of actions waiting to be synced

This means the game feels instant even on slow connections.

### 3. WAL Synchronization (every ~5 seconds)

The frontend syncs with the server every 5 seconds via [`POST /api/sync`](server.ts:808):

```
Frontend                              Backend
   │                                    │
   │  ── POST /api/sync ──────────────► │
   │     Authorization: Bearer TOKEN    │
   │     { wal: { version, actions[] } }│
   │                                    │── Extract playerId from auth token (NOT from body)
   │                                    │── Acquire per-player lock (10s TTL)
   │                                    │── Apply growth ticks (crop progress + energy regen)
   │                                    │── Validate each action timestamp (monotonic, not stale, not future)
   │                                    │── Validate each action logic (resources, slot state, tools)
   │                                    │── Apply valid actions to state
   │                                    │── Increment state version
   │                                    │── Persist to disk (write-through)
   │                                    │── Release lock
   │  ◄── { state: PlayerState } ────── │
   │                                    │
   │── Replace local state with         │
   │   authoritative server state       │
   │── Flush synced WAL buffer          │
   │── Continue accumulating new        │
   │   actions in fresh buffer          │
```

If the WAL has **no actions** (empty `[]`), it acts as a **heartbeat** — the server still processes growth ticks and returns updated state. This keeps crops growing and energy regenerating even when the player is idle.

### 4. Concurrent WAL Protection

- While a sync request is in-flight, new actions accumulate in a **second WAL buffer**
- Server uses a **per-player lock** ([`acquireLock()`](server.ts:550)) with a 10-second TTL to prevent concurrent processing
- If the player is locked (HTTP 423), the frontend retries with unsent actions
- After lock release, the frontend merges both buffers for the next sync

### 5. Shared Validation — Single Source of Truth

[`shared/validation.ts`](shared/validation.ts) is imported by **both** the backend (Bun) and inlined in the frontend. It provides:

- **Slot validity** — is the farm slot in the correct state for the action?
- **Energy costs** — does the player have enough energy?
- **Item existence** — does the player own the required tool/seeds?
- **Inventory management** — stack limits, quantity checks
- **Growth calculations** — crop progress based on elapsed time + water bonus
- **Timestamp validation** — actions can't be from the future, too old, or out of order
- **WAL size limits** — max 50 actions per sync batch

The frontend validates before applying locally → catches 99% of issues client-side.
The server validates authoritatively → catches tampered clients.

---

## 🎮 Game Mechanics

### Starting State

| Resource | Value |
|---|---|
| Coins | 100 🪙 |
| Energy | 100 / 100 ⚡ |
| Farm Grid | 6 rows × 8 columns (48 slots) |
| Starter Inventory | 1 Hoe, 1 Watering Can, 1 Scythe, 5 Wheat Seeds |

### Farm Lifecycle

Each farm slot follows this state machine:

```
empty ──(till)──► tilled ──(plant)──► planted ──(grow)──► ready ──(harvest)──► empty
                       ──(water)──►  (faster growth)       │
                       ──(fertilize)──►  (+50% progress)   │
```

### Crops

| Crop | Seed Price | Sell Price | Grow Time | Water Bonus | Season |
|---|---|---|---|---|---|
| 🌾 Wheat | 5🪙 | 12🪙 | 30s | 1.5× speed | All |
| 🥕 Carrot | 8🪙 | 18🪙 | 45s | 1.3× speed | Spring |
| 🍅 Tomato | 12🪙 | 28🪙 | 60s | 1.4× speed | Summer |
| 🌽 Corn | 15🪙 | 35🪙 | 90s | 1.2× speed | Summer |
| 🎃 Pumpkin | 20🪙 | 50🪙 | 120s | 1.3× speed | Fall |
| 🍓 Strawberry | 25🪙 | 60🪙 | 150s | 1.6× speed | Spring |

**Watering** speeds up growth by the crop's water bonus multiplier. Watering has a 30-second cooldown per slot.

### Tools & Items

| Item | Buy Price | Sell Price | Energy Cost |
|---|---|---|---|
| 🪓 Hoe | 50🪙 | 25🪙 | 5⚡ per use |
| 💧 Watering Can | 75🪙 | 35🪙 | 2⚡ per use |
| 🫳 Scythe | 100🪙 | 50🪙 | 4⚡ per use |
| 🧪 Fertilizer | 30🪙 | 10🪙 | 2⚡ per use |

Tools (Hoe, Watering Can, Scythe) are **non-stackable** (max 1). Fertilizer is stackable up to 50. Using fertilizer on a planted crop instantly advances growth by **50%**.

### Energy System

- Starts at **100/100** ⚡
- Regenerates **1 energy every 5 seconds**
- Can be upgraded in tiers: 100🪙 → 150 max, 200🪙 → 200 max, 400🪙 → 250 max, 800🪙 → 300 max, 1500🪙 → 350 max
- Energy fully refills on each upgrade

### XP & Levels

| Action | XP Gained |
|---|---|
| Till | +2 XP |
| Plant | +5 XP |
| Water | +1 XP |
| Harvest | +10 XP |
| Buy/Sell | +1 XP per item |
| Fertilize | +3 XP |
| Energy Upgrade | +20 XP |

| Level | XP Required | Cumulative |
|---|---|---|
| 1→2 | 100 | 100 |
| 2→3 | 250 | 350 |
| 3→4 | 500 | 850 |
| 4→5 | 850 | 1,700 |
| 5→6 | 1,300 | 3,000 |
| 6→7 | 1,900 | 4,900 |
| 7→8 | 2,700 | 7,600 |
| 8→9 | 3,800 | 11,400 |
| 9→10 | 5,200 | 16,600 |

---

## 🔒 Security & Anti-Cheat

| Protection | Implementation |
|---|---|
| **Server-authoritative state** | Server always returns the final [`PlayerState`](shared/types.ts:62); client state is replaced on every sync |
| **Identity from auth token** | Player identity comes from `Authorization: Bearer TOKEN`, never from the WAL body — prevents impersonation |
| **PBKDF2 password hashing** | 100,000 iterations, SHA-256, 32-byte random salt. Legacy SHA-256 hashes are auto-migrated on login |
| **Brute-force lockout** | 5 failed login attempts → 15-minute account lockout |
| **Per-IP rate limiting** | 200 requests/minute general, 3 registrations/10 minutes |
| **Timestamp validation** | Actions rejected if: future (>10s tolerance), stale (>2min old), or out-of-order within a WAL |
| **Server-side timestamps** | [`plantedAt`](shared/validation.ts:276) and [`wateredAt`](shared/validation.ts:297) use server time, not client time — prevents time manipulation |
| **WAL version tracking** | Client sends its state version; server detects desyncs |
| **Per-player locks** | 10-second TTL lock prevents race conditions from multiple tabs/clients |
| **WAL size limit** | Max 50 actions per sync batch — rejects oversized WALs entirely |
| **Session expiry** | Tokens expire after 24 hours; expired sessions are cleaned every 5 minutes |
| **Path traversal blocking** | `..` in paths and `/data/` access are blocked |
| **Content-Type enforcement** | POST endpoints require `application/json` |
| **Body size limits** | 1KB for auth endpoints, 64KB for sync endpoint |
| **Constant-time comparison** | PBKDF2 hash verification uses constant-time byte comparison to prevent timing attacks |

---

## 📁 File Structure

```
farm-game/
├── shared/                        # Shared between frontend & backend
│   ├── types.ts                   # TypeScript types (PlayerState, Actions, WAL, etc.)
│   ├── gameData.ts                # Game constants (crops, items, shop, costs, XP tables)
│   └── validation.ts              # Validation logic (used by both client and server)
├── frontend/
│   ├── index.html                 # Complete game UI (HTML + CSS + JS)
│   └── hacker.html                # Debug/security testing page (gated behind ENABLE_DEBUG)
├── data/                          # Persistence directory (auto-created)
│   ├── accounts.json              # Username → {passwordHash, playerId} mapping
│   └── players/                   # Per-player state files
│       └── player_{id}.json       # Full PlayerState snapshot
├── server.ts                      # Bun backend server (HTTP, auth, sync, persistence)
├── package.json                   # Project metadata and scripts
└── README.md                      # This file
```

---

## 🚀 Running

### Prerequisites

- [Bun](https://bun.sh) runtime installed (`curl -fsSL https://bun.sh/install | bash`)

### Start the Server

```bash
cd farm-game
bun run server.ts
```

Or with watch mode for development:

```bash
bun run dev
```

### Open the Game

Navigate to **http://localhost:3456** in your browser.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` to disable debug pages and extra logging |
| `ENABLE_DEBUG` | Auto from NODE_ENV | Set to `true` to enable the `/hacker` debug page |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` | Select tool (pointer) |
| `2` | Till (hoe) |
| `3` | Plant |
| `4` | Water |
| `5` | Harvest |
| `6` | Fertilize |

---

## 🔌 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check (no rate limit) |
| `POST` | `/api/register` | No | Create account (username + password) |
| `POST` | `/api/login` | No | Login (username + password) or reconnect (token) |
| `GET` | `/api/state` | Yes | Get current player state |
| `POST` | `/api/sync` | Yes | Submit WAL batch, receive authoritative state |
| `GET` | `/api/shop` | Yes | Get shop items list |
| `GET` | `/` | No | Serve game frontend |
| `GET` | `/hacker` | No | Debug page (only in development mode) |