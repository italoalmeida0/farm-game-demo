// ============================================================
// SHARED VALIDATION - Imported by both backend (Bun) and frontend
// This is the single source of truth for action validation
// ============================================================

import {
  ActionType,
  type GameAction,
  type PlayerState,
  type FarmSlot,
  type WAL,
  type CropId,
  type ItemId,
  FARM_COLS,
  TOTAL_SLOTS,
} from './types';
import {
  CROPS,
  ITEMS,
  SHOP_ITEMS,
  ENERGY_COSTS,
  UPGRADE_COSTS,
  XP_PER_LEVEL,
  MAX_ACTIONS_PER_WAL,
  MAX_PLAYER_NAME_LENGTH,
  MIN_PLAYER_NAME_LENGTH,
} from './gameData';

// --- Validation Result ---

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface WALValidationResult {
  valid: boolean;
  state: PlayerState;
  rejectedActions: { index: number; reason: string }[];
  walRejected?: boolean; // true when the entire WAL is rejected (not just individual actions)
}

// --- Timestamp Config ---

/** Max allowed clock skew between client and server (ms) */
const MAX_CLOCK_SKEW_MS = 30_000; // 30 seconds

/** Max age of an action timestamp (reject if too old) */
const MAX_ACTION_AGE_MS = 120_000; // 2 minutes

/** Future timestamp tolerance */
const FUTURE_TOLERANCE_MS = 10_000; // 10 seconds into future is ok (network delay)

// --- Helpers ---

export function getSlotIndex(row: number, col: number): number {
  return row * FARM_COLS + col;
}

export function getRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / FARM_COLS), col: index % FARM_COLS };
}

function isValidSlotIndex(index: number): boolean {
  return index >= 0 && index < TOTAL_SLOTS;
}

function isCropId(id: string): id is CropId {
  return id in CROPS;
}

function isItemId(id: string): id is ItemId {
  return id in ITEMS;
}

// --- Inventory helpers (mutate state!) ---

function getInventoryItem(state: PlayerState, itemId: ItemId) {
  return state.inventory.find(i => i.itemId === itemId);
}

function addItem(state: PlayerState, itemId: ItemId, quantity: number): boolean {
  const item = ITEMS[itemId];
  if (!item) return false;
  
  let existing = getInventoryItem(state, itemId);
  if (existing) {
    if (existing.quantity + quantity > item.maxStack) return false;
    existing.quantity += quantity;
  } else {
    state.inventory.push({ itemId, quantity });
  }
  return true;
}

function removeItem(state: PlayerState, itemId: ItemId, quantity: number): boolean {
  const existing = getInventoryItem(state, itemId);
  if (!existing || existing.quantity < quantity) return false;
  existing.quantity -= quantity;
  if (existing.quantity === 0) {
    state.inventory = state.inventory.filter(i => i.itemId !== itemId);
  }
  return true;
}

function hasItem(state: PlayerState, itemId: ItemId, quantity: number = 1): boolean {
  const existing = getInventoryItem(state, itemId);
  return !!existing && existing.quantity >= quantity;
}

function hasTool(state: PlayerState, toolId: ItemId): boolean {
  return hasItem(state, toolId, 1);
}

// --- Player name validation ---

export function validatePlayerName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, reason: 'Name is required' };
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_PLAYER_NAME_LENGTH) {
    return { valid: false, reason: `Name must be at least ${MIN_PLAYER_NAME_LENGTH} characters` };
  }
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    return { valid: false, reason: `Name must be at most ${MAX_PLAYER_NAME_LENGTH} characters` };
  }
  if (!/^[a-zA-Z0-9_ ]+$/.test(trimmed)) {
    return { valid: false, reason: 'Name can only contain letters, numbers, spaces, and underscores' };
  }
  return { valid: true };
}

// --- Growth tick: advance crop growth based on elapsed time ---

export function applyGrowthTicks(state: PlayerState, now: number): void {
  const elapsed = now - state.lastTickAt;
  if (elapsed <= 0) return;

  for (let i = 0; i < state.farm.length; i++) {
    const slot = state.farm[i];
    if (slot.state === 'planted' && slot.cropId && slot.plantedAt !== null) {
      const crop = CROPS[slot.cropId];
      if (!crop) continue;

      // Recalculate from scratch for accuracy
      let timeSincePlant = now - slot.plantedAt;
      if (slot.wateredAt !== null && slot.wateredAt > slot.plantedAt) {
        // Split into pre-water and post-water segments
        const waterDuration = now - slot.wateredAt;
        const preWaterDuration = slot.wateredAt - slot.plantedAt;
        timeSincePlant = preWaterDuration + waterDuration * crop.waterBonus;
      }
      
      slot.growthProgress = Math.min(1.0, timeSincePlant / crop.growTimeMs);
      
      if (slot.growthProgress >= 1.0) {
        slot.state = 'ready';
      }
    }
  }

  // Energy regeneration
  const secondsPassed = Math.floor(elapsed / 1000);
  const energyRegen = Math.floor(secondsPassed / 5); // 1 energy every 5 seconds
  if (energyRegen > 0) {
    state.energy = Math.min(state.maxEnergy, state.energy + energyRegen);
  }

  state.lastTickAt = now;
}

// --- XP / Level helpers ---

function addXP(state: PlayerState, amount: number): void {
  state.xp += amount;
  while (state.level < XP_PER_LEVEL.length && state.xp >= XP_PER_LEVEL[state.level]) {
    state.level++;
  }
}

// --- Timestamp validation ---

/**
 * Validates a client action timestamp against server time.
 * Returns { valid, reason, sanitizedTimestamp }.
 * 
 * Rules:
 * 1. Must be a positive number (not 0, not negative, not NaN)
 * 2. Cannot be in the future beyond FUTURE_TOLERANCE_MS
 * 3. Cannot be older than MAX_ACTION_AGE_MS
 * 4. Must be within MAX_CLOCK_SKEW_MS of serverNow
 * 
 * On the backend, `serverNow` = Date.now() at time of request processing.
 * On the frontend, `serverNow` = Date.now() at time of local validation.
 * 
 * CRITICAL: For state-changing timestamps (plantedAt, wateredAt),
 * the server should use its OWN timestamp, not the client's.
 * The client timestamp is only used for ordering and rate-limiting checks.
 */
export function validateTimestamp(
  actionTimestamp: number,
  serverNow: number,
  lastAcceptedTimestamp: number | null
): { valid: boolean; reason?: string } {
  // Must be a valid positive number
  if (typeof actionTimestamp !== 'number' || isNaN(actionTimestamp) || actionTimestamp <= 0) {
    return { valid: false, reason: 'Invalid timestamp: must be a positive number' };
  }

  // Cannot be in the future beyond tolerance
  if (actionTimestamp > serverNow + FUTURE_TOLERANCE_MS) {
    return { valid: false, reason: `Timestamp is in the future (${Math.floor((actionTimestamp - serverNow) / 1000)}s ahead)` };
  }

  // Cannot be too old
  const age = serverNow - actionTimestamp;
  if (age > MAX_ACTION_AGE_MS) {
    return { valid: false, reason: `Timestamp is too old (${Math.floor(age / 1000)}s ago, max ${MAX_ACTION_AGE_MS / 1000}s)` };
  }

  // Actions within a WAL must be monotonically non-decreasing
  if (lastAcceptedTimestamp !== null && actionTimestamp < lastAcceptedTimestamp) {
    return { valid: false, reason: `Timestamp goes backwards (current: ${actionTimestamp}, previous: ${lastAcceptedTimestamp})` };
  }

  return { valid: true };
}

// --- Single action validation & application ---
// `serverNow` is the authoritative server time. For plantedAt/wateredAt,
// we use serverNow instead of the client-provided timestamp to prevent time manipulation.

function validateAndApplyAction(
  state: PlayerState,
  action: GameAction,
  serverNow: number,
  clientTimestamp: number
): ValidationResult {
  // For state-changing fields, always use serverNow
  // clientTimestamp is only used for ordering/rate-limit validation (done by caller)

  switch (action.type) {
    case ActionType.TILL: {
      if (!hasTool(state, 'hoe')) return { valid: false, reason: 'No hoe in inventory' };
      if (!isValidSlotIndex(action.slotIndex)) return { valid: false, reason: 'Invalid slot index' };
      if (state.energy < ENERGY_COSTS.till) return { valid: false, reason: 'Not enough energy' };
      
      const slot = state.farm[action.slotIndex];
      if (slot.state !== 'empty') return { valid: false, reason: 'Slot is not empty' };

      // Apply
      slot.state = 'tilled';
      slot.cropId = null;
      slot.plantedAt = null;
      slot.wateredAt = null;
      slot.growthProgress = 0;
      state.energy -= ENERGY_COSTS.till;
      addXP(state, 2);
      return { valid: true };
    }

    case ActionType.PLANT: {
      if (!isValidSlotIndex(action.slotIndex)) return { valid: false, reason: 'Invalid slot index' };
      if (!isCropId(action.cropId)) return { valid: false, reason: 'Invalid crop id' };
      if (state.energy < ENERGY_COSTS.plant) return { valid: false, reason: 'Not enough energy' };
      if (!hasItem(state, action.cropId, 1)) return { valid: false, reason: 'No seeds for this crop' };

      const slot = state.farm[action.slotIndex];
      if (slot.state !== 'tilled') return { valid: false, reason: 'Slot is not tilled' };

      // Apply - use serverNow for plantedAt, NOT client timestamp
      removeItem(state, action.cropId, 1);
      slot.state = 'planted';
      slot.cropId = action.cropId;
      slot.plantedAt = serverNow;  // SERVER TIME, not client
      slot.wateredAt = null;
      slot.growthProgress = 0;
      state.energy -= ENERGY_COSTS.plant;
      addXP(state, 5);
      return { valid: true };
    }

    case ActionType.WATER: {
      if (!hasTool(state, 'watering_can')) return { valid: false, reason: 'No watering can in inventory' };
      if (!isValidSlotIndex(action.slotIndex)) return { valid: false, reason: 'Invalid slot index' };
      if (state.energy < ENERGY_COSTS.water) return { valid: false, reason: 'Not enough energy' };

      const slot = state.farm[action.slotIndex];
      if (slot.state !== 'planted') return { valid: false, reason: 'Slot is not planted' };
      // Watering cooldown uses SERVER time
      if (slot.wateredAt !== null && (serverNow - slot.wateredAt) < 30_000) {
        return { valid: false, reason: 'Already watered recently' };
      }

      // Apply - use serverNow for wateredAt
      slot.wateredAt = serverNow;  // SERVER TIME, not client
      state.energy -= ENERGY_COSTS.water;
      addXP(state, 1);
      return { valid: true };
    }

    case ActionType.HARVEST: {
      if (!hasTool(state, 'scythe')) return { valid: false, reason: 'No scythe in inventory' };
      if (!isValidSlotIndex(action.slotIndex)) return { valid: false, reason: 'Invalid slot index' };
      if (state.energy < ENERGY_COSTS.harvest) return { valid: false, reason: 'Not enough energy' };

      const slot = state.farm[action.slotIndex];
      if (slot.state !== 'ready' || !slot.cropId) return { valid: false, reason: 'Crop is not ready' };

      // Apply
      addItem(state, slot.cropId, 1);
      slot.state = 'empty';
      slot.cropId = null;
      slot.plantedAt = null;
      slot.wateredAt = null;
      slot.growthProgress = 0;
      state.energy -= ENERGY_COSTS.harvest;
      addXP(state, 10);
      return { valid: true };
    }

    case ActionType.BUY: {
      if (!isItemId(action.itemId)) return { valid: false, reason: 'Invalid item id' };
      if (action.quantity <= 0 || action.quantity > 99) return { valid: false, reason: 'Invalid quantity' };

      const shopItem = SHOP_ITEMS.find(s => s.itemId === action.itemId);
      if (!shopItem) return { valid: false, reason: 'Item not available in shop' };

      const totalCost = shopItem.price * action.quantity;
      if (state.coins < totalCost) return { valid: false, reason: 'Not enough coins' };

      const itemDef = ITEMS[action.itemId];
      const existing = getInventoryItem(state, action.itemId);
      if (existing && existing.quantity + action.quantity > itemDef.maxStack) {
        return { valid: false, reason: 'Inventory stack full' };
      }

      // Apply
      state.coins -= totalCost;
      addItem(state, action.itemId, action.quantity);
      addXP(state, 1 * action.quantity);
      return { valid: true };
    }

    case ActionType.SELL: {
      if (!isItemId(action.itemId)) return { valid: false, reason: 'Invalid item id' };
      if (action.quantity <= 0) return { valid: false, reason: 'Invalid quantity' };
      if (action.quantity > 999) return { valid: false, reason: 'Quantity exceeds maximum stack size' };

      const itemDef = ITEMS[action.itemId];
      if (!itemDef.sellPrice) return { valid: false, reason: 'Item cannot be sold' };
      if (!hasItem(state, action.itemId, action.quantity)) return { valid: false, reason: 'Not enough items' };

      // Apply
      removeItem(state, action.itemId, action.quantity);
      state.coins += itemDef.sellPrice * action.quantity;
      addXP(state, 1 * action.quantity);
      return { valid: true };
    }

    case ActionType.USE_ITEM: {
      if (!isItemId(action.itemId)) return { valid: false, reason: 'Invalid item id' };
      if (!isValidSlotIndex(action.slotIndex)) return { valid: false, reason: 'Invalid slot index' };
      if (state.energy < ENERGY_COSTS.use_item) return { valid: false, reason: 'Not enough energy' };
      if (!hasItem(state, action.itemId, 1)) return { valid: false, reason: 'Item not in inventory' };

      const slot = state.farm[action.slotIndex];
      
      // Fertilizer: instantly advance growth by 50%
      if (action.itemId === 'fertilizer') {
        if (slot.state !== 'planted') return { valid: false, reason: 'Slot is not planted' };
        removeItem(state, 'fertilizer', 1);
        slot.growthProgress = Math.min(1.0, slot.growthProgress + 0.5);
        if (slot.growthProgress >= 1.0) slot.state = 'ready';
        state.energy -= ENERGY_COSTS.use_item;
        addXP(state, 3);
        return { valid: true };
      }

      return { valid: false, reason: 'Cannot use this item on a farm slot' };
    }

    case ActionType.UPGRADE: {
      if (action.upgradeType === 'max_energy') {
        const currentTier = Math.floor((state.maxEnergy - 100) / 50);
        if (currentTier >= UPGRADE_COSTS.max_energy.length) {
          return { valid: false, reason: 'Max energy fully upgraded' };
        }
        const cost = UPGRADE_COSTS.max_energy[currentTier];
        if (state.coins < cost) return { valid: false, reason: 'Not enough coins' };
        
        state.coins -= cost;
        state.maxEnergy += 50;
        state.energy = state.maxEnergy; // refill on upgrade
        addXP(state, 20);
        return { valid: true };
      }

      return { valid: false, reason: 'Unknown upgrade type' };
    }

    default:
      return { valid: false, reason: 'Unknown action type' };
  }
}

// --- WAL Validation (process a batch of actions against state) ---

export function validateAndApplyWAL(
  currentState: PlayerState,
  wal: WAL,
  serverNow: number
): WALValidationResult {
  // Create a deep copy of state to apply actions on
  const state: PlayerState = JSON.parse(JSON.stringify(currentState));
  const rejectedActions: { index: number; reason: string }[] = [];

  // Apply growth ticks first (using server time)
  applyGrowthTicks(state, serverNow);

  // Reject oversized WALs instead of silently truncating
  if (wal.actions.length > MAX_ACTIONS_PER_WAL) {
    return {
      valid: false,
      state,
      rejectedActions: [{ index: -1, reason: `WAL too large: ${wal.actions.length} actions (max ${MAX_ACTIONS_PER_WAL})` }],
      walRejected: true,
    };
  }

  const actions = wal.actions;

  // Validate WAL-level timestamp
  if (typeof wal.createdAt !== 'number' || isNaN(wal.createdAt)) {
    return {
      valid: false,
      state,
      rejectedActions: [{ index: -1, reason: 'WAL createdAt is invalid' }],
      walRejected: true,
    };
  }
  if (wal.createdAt > serverNow + FUTURE_TOLERANCE_MS) {
    return {
      valid: false,
      state,
      rejectedActions: [{ index: -1, reason: 'WAL createdAt is in the future' }],
      walRejected: true,
    };
  }

  // Track last accepted action timestamp for monotonic ordering
  let lastAcceptedTimestamp: number | null = null;

  // Process each action sequentially
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // --- COMPREHENSIVE TIMESTAMP AUDITING ---

    // 1. Check if action has a timestamp at all
    if (typeof action.timestamp !== 'number' || isNaN(action.timestamp)) {
      rejectedActions.push({ index: i, reason: 'Missing or invalid timestamp' });
      continue;
    }

    // 2. Check timestamp is a positive integer (ms)
    if (action.timestamp <= 0 || !Number.isFinite(action.timestamp)) {
      rejectedActions.push({ index: i, reason: 'Timestamp must be a positive finite number' });
      continue;
    }

    // 3. Check timestamp is not in the future
    if (action.timestamp > serverNow + FUTURE_TOLERANCE_MS) {
      rejectedActions.push({ 
        index: i, 
        reason: `Future timestamp: ${Math.floor((action.timestamp - serverNow) / 1000)}s ahead of server` 
      });
      continue;
    }

    // 4. Check timestamp is not too old
    const age = serverNow - action.timestamp;
    if (age > MAX_ACTION_AGE_MS) {
      rejectedActions.push({ 
        index: i, 
        reason: `Stale timestamp: ${Math.floor(age / 1000)}s old (max ${MAX_ACTION_AGE_MS / 1000}s)` 
      });
      continue;
    }

    // 5. Monotonic ordering: actions must not go backwards in time
    if (lastAcceptedTimestamp !== null && action.timestamp < lastAcceptedTimestamp) {
      rejectedActions.push({ 
        index: i, 
        reason: `Out-of-order timestamp: ${action.timestamp} < previous ${lastAcceptedTimestamp}` 
      });
      continue;
    }

    // 6. Validate the action itself (resources, state, etc.)
    const result = validateAndApplyAction(state, action, serverNow, action.timestamp);
    if (!result.valid) {
      rejectedActions.push({ index: i, reason: result.reason! });
    } else {
      lastAcceptedTimestamp = action.timestamp;
    }
  }

  // Increment version
  state.version++;

  return {
    valid: rejectedActions.length === 0,
    state,
    rejectedActions,
  };
}

// --- Create default player state ---

export function createDefaultPlayerState(playerId: string, playerName: string, now: number): PlayerState {
  const farm: FarmSlot[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    farm.push({
      state: 'empty',
      cropId: null,
      plantedAt: null,
      wateredAt: null,
      growthProgress: 0,
    });
  }

  return {
    playerId,
    playerName,
    coins: 100,
    level: 1,
    xp: 0,
    energy: 100,
    maxEnergy: 100,
    farm,
    inventory: [
      { itemId: 'hoe', quantity: 1 },
      { itemId: 'watering_can', quantity: 1 },
      { itemId: 'scythe', quantity: 1 },
      { itemId: 'wheat', quantity: 5 },  // starting seeds
    ],
    lastTickAt: now,
    createdAt: now,
    version: 1,
  };
}