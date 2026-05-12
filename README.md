# 🌾 Harvesting Happily — Farm Game

An idle/progressive farm game running 100% in the browser, powered by a **Bun** backend with JSON file persistence. Plant, care, harvest, raise animals, and sell products to level up and unlock new items.

---

## 📁 Project Structure

```
.
├── server.js              # Bun HTTP server (auth + sync logic)
├── index.html             # SPA client (HTML + CSS + vanilla JS)
├── shared/
│   ├── gameData.js        # Game data: seeds, animals, XP tables, modes
│   └── validation.js      # Action validation, WAL, default player state
├── data/
│   ├── accounts.json      # Credentials (PBKDF2 hashed)
│   └── players/           # Player states (one .json file per player)
│       └── player_*.json
```

---

## 🎮 How the Game Works

### Objective
Manage a farm: plant crops, handle irrigation and pests, raise animals in the barn, and sell everything in the warehouse to earn coins and experience (XP).

### Core Mechanics

| Mechanic | Description |
|----------|-------------|
| **Farm (5×6 = 30 slots)** | Each slot can be empty, tilled, planted, or ready to harvest. |
| **Seeds** | Bought in **packs**. Each pack contains N seeds (e.g. 4 turnip seeds). Planting consumes 1 pack; harvesting consumes 1 seed from the pack. When the pack runs out, the slot resets to empty. |
| **Growth** | Each crop has a grow time. **Dry** soil pauses growth. |
| **Watering** | Soil dries periodically; watering with 🚿 resumes growth and gives +2 XP. |
| **Pests** | Can appear on crops (chance per cycle). Pests drain **health**, reducing XP and sell price. Removing pests gives +2 XP. |
| **Pesticide** | Can be applied to slots to prevent pests for a duration. |
| **Barn (Animals)** | Buy chickens, cows, and sheep. They grow from baby → adult, then produce eggs, milk, or wool when fed. |
| **Feeding** | Adult animals need **feed** (bought in the shop) to start producing. |
| **Warehouse** | Stores crops and animal products. You can sell items individually or **sell all at once**. |
| **Levels** | Earn XP to level up. New seeds and animals are unlocked as your level increases. |
| **Slot Unlocking** | 6 initial slots are free; additional slots cost increasingly more gold. |

### Game Modes

The game supports two modes via the `GAME_MODE` environment variable:

| | **Dev** (`dev`) | **Prod** (`prod`) |
|---|---|---|
| Starting coins | 5,000 | 100 |
| Growth speed | **×20 faster** (multiplier 0.05) | Real time (×1) |
| Sell prices | **×10** | ×1 |
| Buy prices | **×0.2** (80% off) | ×1 |
| Soil dries | Every 30s | Every 10 min |
| Pests | 60% chance every 20s | 15% chance every 15 min |
| Client sync | Every 5s | Every 5s |

> **Dev mode** is ideal for testing and fast demos without waiting hours.

---

## 🏗️ Backend Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │  index.html  │───▶│ Local Sim    │───▶│ WAL Buffer (actions[])   │   │
│  │  (SPA UI)    │    │ (growth,     │    │ Pending actions to sync  │   │
│  └──────────────┘    │  animals)    │    └──────────────────────────┘   │
│                      └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ POST /api/sync  { wal: actions[] }
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              SERVER (Bun)                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │ HTTP Handler │───▶│ Auth +       │───▶│ Player Lock (TTL 10s)    │   │
│  │ server.js    │    │ Sessions     │    │ Prevents race conditions │   │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘   │
│         │                                           │                    │
│         ▼                                           ▼                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │ Growth Ticks │◀───│ WAL Validator│◀───│ shared/validation.js     │   │
│  │ applyGrowth  │    │ validateAnd  │    │ Business rules + state   │   │
│  │ Ticks()      │    │ ApplyWAL()   │    │ mutations                │   │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘   │
│         │                                           │                    │
│         └───────────────────────────────────────────┘                    │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Write-Through Persistence                                        │    │
│  │  • data/players/*.json  → player states                          │    │
│  │  • data/accounts.json   → PBKDF2 password hashes                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Server: `server.js` (Bun)

The backend is a simple, stateful HTTP server using Bun's native API (`Bun.serve` via `export default { port, fetch }`).

#### Responsibilities

1. **Authentication & Sessions**
   - Registration and login with **PBKDF2** password hashing (100k iterations, SHA-256).
   - Session tokens are 32-byte hex strings (valid for 24h).
   - Token-based reconnection without re-entering password.
   - Brute-force protection: 15-minute lockout after 5 failed attempts.

2. **Persistence**
   - **Accounts**: `data/accounts.json` — map of username → `{ passwordHash, playerId }`.
   - **Players**: `data/players/player_<id>.json` — full player state.
   - **Write-through**: every mutation is immediately saved to disk via `Bun.write`.
   - **Boot restore**: on startup, the server loads all accounts and players into memory.

3. **WAL-based Sync**
   - The client accumulates actions locally and sends them in batches (`POST /api/sync`) as a **WAL (Write-Ahead Log)**.
   - The server validates each action in order, enforcing business rules (enough money? required level? valid slot?).
   - Rejected actions are returned to the client, which discards them.
   - Timestamp validation: prevents future actions, stale actions (>120s), and out-of-order actions.
   - **Per-player lock**: a TTL lock prevents race conditions during sync.

4. **Growth Ticks**
   - `applyGrowthTicks(state, now, isServer=true)` runs on the server on every sync.
   - Computes: soil drying, pests (deterministic RNG), health drain, crop growth, animal maturation, and product readiness.

5. **Static Files**
   - `GET /` → [`index.html`](index.html:1)
   - `GET /shared/gameData.js` and `/shared/validation.js` → shared ES modules imported by the frontend.

#### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/stats` | Server stats (memory, players, sessions) |
| `POST` | `/api/register` | Create account; returns token + initial state |
| `POST` | `/api/login` | Login with username/password or reconnect with token |
| `GET` | `/api/state` | Returns current state for the authenticated player |
| `POST` | `/api/sync` | Sends WAL for server-side validation and application |

---

## 🔒 Sync Architecture & Anti-Cheat Security

### Why the Sync is Secure

The client **never sends the final state** (e.g. "I now have 9999 coins"). Instead, it only sends **actions** (e.g. "I bought a seed", "I harvested a tomato"). The server is the **single source of truth** and recalculates everything from scratch.

```
NORMAL PLAYER FLOW                           HACKER ATTEMPT
─────────────────────                       ───────────────

Player clicks "Buy Seed"                   Hacker edits localStorage
    │                                            │
    ▼                                            ▼
Client applies locally                       Client state is fake
    │                                            │
    ▼                                            ▼
WAL buffer: {BUY tomato, qty:1}              WAL buffer: {BUY pumpkin, qty:999}
    │                                            │
    └──────────────┐                           └──────────────┐
                   │                                          │
                   ▼                                          ▼
            ┌────────────┐                            ┌────────────┐
            │  SERVER    │                            │  SERVER    │
            │            │                            │            │
            │ 1. Apply growth ticks                  │ 1. Apply growth ticks
            │ 2. Validate: coins >= cost?   ──YES──▶ │ 2. Validate: coins >= cost?
            │ 3. Deduct coins, add item                │ 3. 999 × 400 = 360000 > 5000
            │ 4. Save to disk                        │ 4. REJECT ❌
            │                                          │    "Not enough coins"
            │                                          │
            │ 200 OK { state }                         │ 200 OK { state, rejectedActions }
            │                                          │
            └────────────┘                            └────────────┘
                   │                                          │
                   ▼                                          ▼
            Client replaces local                      Client replaces local
            state with server state                    state with server state
            (hacker's fake coins are wiped!)           (hacker's fake buy is ignored!)
```

### Validation Layers for Every Action

When the server receives a `BUY` action, for example, it goes through multiple validation layers:

```
                    ┌─────────────────┐
                    │  ACTION ARRIVES │
                    │   IN THE WAL    │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  1. TIMESTAMP VALIDATION │
              │  • Not in future (>10s)  │
              │  • Not too old (<120s)   │
              │  • Monotonically rising  │
              └────────────┬─────────────┘
                           │
              ┌────────────┴─────────────┐
              │ INVALID ◀────────────────┤
              └────────────┬─────────────┘
                           │ VALID
                           ▼
              ┌──────────────────────────┐
              │  2. PLAYER LOCK          │
              │  Acquire lock (TTL 10s)  │
              │  Prevents parallel syncs │
              └────────────┬─────────────┘
                           │
              ┌────────────┴─────────────┐
              │ LOCKED ◀─────────────────┤
              └────────────┬─────────────┘
                           │ ACQUIRED
                           ▼
              ┌──────────────────────────┐
              │  3. BUSINESS RULES       │
              │  Based on action type:   │
              └────────────┬─────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │  BUY    │      │ PLANT   │      │ HARVEST │
    │         │      │         │      │         │
    │ Enough  │      │ Has     │      │ Slot is │
    │ coins?  │      │ seeds?  │      │ ready?  │
    │ Level   │      │ Tilled? │      │         │
    │ ok?     │      │ Watered?│      │         │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                │                │
    ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
    │ NO ◀────┤      │ NO ◀────┤      │ NO ◀────┤
    └────┬────┘      └────┬────┘      └────┬────┘
         │ YES            │ YES            │ YES
         ▼                ▼                ▼
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ APPLY:  │      │ APPLY:  │      │ APPLY:  │
    │ -coins  │      │ -seed   │      │ +crop   │
    │ +item   │      │ +plant  │      │ +XP     │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  4. SAVE TO DISK         │
              │  write-through per player│
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │  5. RELEASE LOCK         │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │  6. RETURN UPDATED STATE │
              └──────────────────────────┘
```

### What Happens if a Hacker Tries...

| Attack | Server Defense |
|--------|---------------|
| **"Buy item without enough money"** | Server recalculates total cost and checks `state.coins >= totalCost`. Rejects if insufficient. |
| **Buy level-locked item** | Every seed/animal has a `requiredLevel`. Server checks `state.level` before applying. |
| **Replay another player's actions** | The WAL is processed within the authenticated player's state via Bearer token. No cross-player mixing. |
| **Replay old actions** | Timestamps must be monotonically increasing within the WAL and cannot be older than 120s. |
| **Send future-dated actions** | Future timestamps beyond 10s tolerance are rejected. |
| **Edit local state (coins, XP)** | Local state is **overwritten** by the server on every sync. DevTools edits do not persist. |
| **Parallel sync (race condition)** | A TTL lock per `playerId` ensures only one sync is processed at a time. |
| **Send a huge WAL** | Maximum 50 actions per WAL; exceeding this rejects the entire WAL. |
| **Path traversal** (`../../../etc/passwd`) | Paths containing `..` are blocked before any processing. |
| **Brute-force password** | 5 failed attempts = 15-minute lockout per username. |

### Deterministic Pest RNG

Pests do not use raw `Math.random()`, which could diverge between client and server. Instead, they use a deterministic hash:

```javascript
const hash = (slotIndex * 31 + cycle * 17 + plantedAt) % 100;
if (hash < PEST_APPEAR_CHANCE * 100) spawnPest();
```

This ensures the server and client (when importing `validation.js`) compute **exactly the same pests** for the same state, preventing desync.

---

## 🔄 Detailed WAL Sync Flow

```
CLIENT                                              SERVER
─────────────────────────────────────────────────────────────────────────

User clicks (plant, water, harvest...)
    │
    ▼
┌─────────────┐
│ Apply local │  ← Instant visual feedback
│ (optimistic)│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ WAL Buffer  │  ← Accumulates actions
│ [action1,   │
│  action2,   │
│  ...]       │
└──────┬──────┘
       │
       │ Every 5 seconds (or on demand)
       │ POST /api/sync
       │ { wal: { actions: [...], createdAt: ts } }
       └──────────────────────────────────────────────▶
                                                       │
                                                       ▼
                                              ┌─────────────┐
                                              │ Acquire Lock│
                                              │ playerId    │
                                              └──────┬──────┘
                                                     │
                                            ┌────────┴────────┐
                                            │ LOCKED ◀────────┤
                                            └────────┬────────┘
                                                     │ FREE
                                                     ▼
                                              ┌─────────────┐
                                              │ applyGrowth │
                                              │ Ticks(state)│
                                              │ (server)    │
                                              └──────┬──────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │ validateAnd │
                                              │ ApplyWAL()  │
                                              │             │
                                              │ For each    │
                                              │ action:     │
                                              │ 1. Validate │
                                              │    timestamp│
                                              │ 2. Validate │
                                              │    business │
                                              │    rules    │
                                              │ 3. Apply or │
                                              │    reject   │
                                              └──────┬──────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │ Save Player │
                                              │ to Disk     │
                                              │ (write-thru)│
                                              └──────┬──────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │ Release Lock│
                                              └──────┬──────┘
                                                     │
       ◀─────────────────────────────────────────────┘
       │ 200 OK
       │ { state, rejectedActions[] }
       │
       ▼
┌─────────────┐
│ Replace     │  ← Local state overwritten by server
│ local state │    (the source of truth)
│ with server │
│ state       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Remove      │  ← Accepted actions removed from buffer
│ accepted    │    Rejected actions logged to console
│ from WAL    │
└─────────────┘
```

---

## 🚀 How to Run

### Prerequisites
- [Bun](https://bun.sh) installed.

### Production (default mode)

```bash
bun server.js
```

Server starts at [`http://localhost:3456`](http://localhost:3456).

### Development Mode (accelerated timers)

**PowerShell:**
```powershell
$env:GAME_MODE="dev"
bun server.js
```

**Bash / Linux / macOS:**
```bash
GAME_MODE=dev bun server.js
```

**Windows CMD:**
```cmd
set GAME_MODE=dev
bun server.js
```

> In dev mode the console shows: `Mode: DEV (fast demo: accelerated timers, 5k coins, high pest chance)`.

---

## 💾 Persistence

Data is automatically saved to:
- `data/accounts.json` — accounts
- `data/players/*.json` — player states

To **reset everything**, simply delete the `data/` folder (or specific files inside it) and restart the server.

---

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh) (native JavaScript/TypeScript, web-compatible APIs)
- **Frontend**: HTML5 + CSS3 + Vanilla JS (no frameworks)
- **Database**: JSON files on the filesystem (zero external dependencies)
- **Auth**: PBKDF2 via Web Crypto API
- **Protocol**: HTTP/1.1 with JSON, CORS enabled

---

## 📝 Notes

- The game is designed to be **lag-resilient**: the client simulates growth locally and syncs via WAL; the server is the source of truth.
- Pests use a **deterministic RNG** based on a hash of slot index + cycle + plant time, ensuring consistency between server and client.
- There is no WebSocket — all communication is HTTP polling every 5 seconds (or on-demand when the player performs actions).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the conditions in the [LICENSE](LICENSE) file.
