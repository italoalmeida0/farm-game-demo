// ============================================================
// SHARED VALIDATION - New Farm Game Architecture
// Single source of truth for action validation
// ============================================================

import {
  ActionType,
  SEEDS,
  ANIMALS,
  WAREHOUSE_ITEMS,
  FEED_COST,
  XP_PER_LEVEL,
  MAX_ACTIONS_PER_WAL,
  MAX_PLAYER_NAME_LENGTH,
  MIN_PLAYER_NAME_LENGTH,
  WATER_XP,
  TILL_XP,
  REMOVE_PEST_XP,
  INITIAL_UNLOCKED_SLOTS,
  getSlotUnlockCost,
  FARM_ROWS,
  FARM_COLS,
  TOTAL_SLOTS,
} from "./gameData.js";

// --- Validation Result ---

// --- Timestamp Config ---

const MAX_CLOCK_SKEW_MS = 30_000;
const MAX_ACTION_AGE_MS = 120_000;
const FUTURE_TOLERANCE_MS = 10_000;

// --- Helpers ---

export function getSlotIndex(row, col) {
  return row * FARM_COLS + col;
}

export function getRowCol(index) {
  return { row: Math.floor(index / FARM_COLS), col: index % FARM_COLS };
}

function isValidSlotIndex(index) {
  return index >= 0 && index < TOTAL_SLOTS;
}

function isCropId(id) {
  return id in SEEDS;
}

function isAnimalId(id) {
  return id in ANIMALS;
}

function isItemId(id) {
  return id in WAREHOUSE_ITEMS;
}

// --- Warehouse helpers ---

export function getWarehouseItem(state, itemId) {
  return state.warehouse.find((i) => i.itemId === itemId);
}

export function getWarehouseQty(state, itemId) {
  const item = getWarehouseItem(state, itemId);
  return item ? item.quantity : 0;
}

function addWarehouseItem(state, itemId, quantity) {
  let existing = getWarehouseItem(state, itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    state.warehouse.push({ itemId, quantity });
  }
  return true;
}

function removeWarehouseItem(state, itemId, quantity) {
  const existing = getWarehouseItem(state, itemId);
  if (!existing || existing.quantity < quantity) return false;
  existing.quantity -= quantity;
  if (existing.quantity === 0) {
    state.warehouse = state.warehouse.filter((i) => i.itemId !== itemId);
  }
  return true;
}

export function hasWarehouseItem(state, itemId, quantity = 1) {
  const existing = getWarehouseItem(state, itemId);
  return !!existing && existing.quantity >= quantity;
}

// --- XP / Level helpers ---

function addXP(state, amount) {
  state.xp += amount;
  while (
    state.level < XP_PER_LEVEL.length &&
    state.xp >= XP_PER_LEVEL[state.level]
  ) {
    state.level++;
  }
}

function getLevel(state) {
  return state.level;
}

// --- Growth ticks ---
// isServer=true: full tick (dry, pest generation, health drain, growth, animals)
// isServer=false: frontend-safe tick (growth interpolation, animal status only)
//                 pest/dry state comes from server sync to avoid desync conflicts

export function applyGrowthTicks(state, now, isServer = false) {
  const elapsed = now - state.lastTickAt;
  if (elapsed <= 0) return;

  for (let i = 0; i < state.farm.length; i++) {
    const slot = state.farm[i];
    if (!slot.unlocked) continue;

    if (isServer) {
      // --- Dry logic (SERVER ONLY) ---
      if (slot.lastWateredAt !== null) {
        const timeSinceWater = now - slot.lastWateredAt;
        if (timeSinceWater >= globalThis.GAME_CONFIG.DRY_INTERVAL_MS) {
          slot.isDry = true;
        }
      }

      // --- Pest logic (SERVER ONLY) ---
      if (slot.hasPests && slot.pestStartedAt !== null) {
        // Drain health based on time with pests
        const minutesWithPests = (now - slot.pestStartedAt) / 60_000;
        const healthDrain = Math.floor(
          minutesWithPests * globalThis.GAME_CONFIG.PEST_HEALTH_DRAIN_PER_MIN,
        );
        slot.health = Math.max(0, 100 - healthDrain);
      }

      // Check pesticide expiry (SERVER ONLY)
      if (slot.pesticideUntil !== null && now >= slot.pesticideUntil) {
        slot.pesticideUntil = null;
      }
    }

    // --- Growth logic (both server and frontend for smooth interpolation) ---
    if (slot.state === "planted" && slot.cropId && slot.plantedAt !== null) {
      const crop = SEEDS[slot.cropId];
      if (!crop) continue;

      // Can only grow if NOT dry
      if (!slot.isDry) {
        const timeSincePlant = now - slot.plantedAt;
        slot.growthProgress = Math.min(1.0, timeSincePlant / (crop.growTimeMs * globalThis.GAME_CONFIG.SEED_GROW_MULTIPLIER));

        if (slot.growthProgress >= 1.0) {
          slot.state = "ready";
        }
      }
    }

    if (isServer) {
      // Random pest appearance (SERVER ONLY - only if not protected by pesticide)
      if (
        slot.state === "planted" &&
        !slot.hasPests &&
        slot.pesticideUntil === null
      ) {
        // Check if enough time passed since planting for a pest cycle
        if (slot.plantedAt !== null) {
          const timeSincePlant = now - slot.plantedAt;
          const cycles = Math.floor(timeSincePlant / globalThis.GAME_CONFIG.PEST_CHECK_INTERVAL_MS);
          const lastCycle = Math.floor(
            (now - elapsed - slot.plantedAt) / globalThis.GAME_CONFIG.PEST_CHECK_INTERVAL_MS,
          );

          // For each new cycle that appeared during this elapsed time
          for (let c = lastCycle + 1; c <= cycles; c++) {
            // Simple deterministic "random" based on slot index + cycle + plant time
            const hash = (i * 31 + c * 17 + slot.plantedAt) % 100;
            if (hash < globalThis.GAME_CONFIG.PEST_APPEAR_CHANCE * 100) {
              slot.hasPests = true;
              slot.pestStartedAt = now;
              break;
            }
          }
        }
      }
    }
  }

  // --- Animal ticks (both server and frontend) ---
  const animalIds = ["chicken", "cow", "sheep"];
  for (const animalId of animalIds) {
    const animal = state.animals[animalId];
    if (!animal) continue;

    // Check if baby became adult
    if (!animal.isAdult && now >= animal.boughtAt + (ANIMALS[animalId].growTimeMs * globalThis.GAME_CONFIG.SEED_GROW_MULTIPLIER)) {
      animal.isAdult = true;
    }

    // Check if product is ready
    if (
      animal.isProducing &&
      animal.producingAt !== null &&
      now >= animal.producingAt + (ANIMALS[animalId].productionTimeMs * globalThis.GAME_CONFIG.SEED_GROW_MULTIPLIER)
    ) {
      animal.productReady = true;
      animal.isProducing = false;
    }
  }

  state.lastTickAt = now;
}

// --- Timestamp validation ---

export function validateTimestamp(
  actionTimestamp,
  serverNow,
  lastAcceptedTimestamp,
) {
  if (
    typeof actionTimestamp !== "number" ||
    isNaN(actionTimestamp) ||
    actionTimestamp <= 0
  ) {
    return {
      valid: false,
      reason: "Invalid timestamp: must be a positive number",
    };
  }
  if (actionTimestamp > serverNow + FUTURE_TOLERANCE_MS) {
    return {
      valid: false,
      reason: `Timestamp is in the future (${Math.floor((actionTimestamp - serverNow) / 1000)}s ahead)`,
    };
  }
  const age = serverNow - actionTimestamp;
  if (age > MAX_ACTION_AGE_MS) {
    return {
      valid: false,
      reason: `Timestamp is too old (${Math.floor(age / 1000)}s ago, max ${MAX_ACTION_AGE_MS / 1000}s)`,
    };
  }
  if (
    lastAcceptedTimestamp !== null &&
    actionTimestamp < lastAcceptedTimestamp
  ) {
    return {
      valid: false,
      reason: `Timestamp goes backwards (current: ${actionTimestamp}, previous: ${lastAcceptedTimestamp})`,
    };
  }
  return { valid: true };
}

// --- Single action validation & application ---

export function validateAndApplyAction(state, action, serverNow, _clientTimestamp) {
  switch (action.type) {
    case ActionType.TILL: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      const slot = state.farm[action.slotIndex];
      if (!slot.unlocked) return { valid: false, reason: "Slot not unlocked" };
      if (slot.state !== "empty")
        return {
          valid: false,
          reason: "Slot is not empty (must be empty to till)",
        };
      if (slot.isDry) return { valid: false, reason: "Cannot till dry soil" };

      slot.state = "tilled";
      slot.cropId = null;
      slot.plantedAt = null;
      slot.growthProgress = 0;
      slot.hasPests = false;
      slot.pestStartedAt = null;
      slot.health = 100;
      slot.seedsRemaining = 0;
      slot.seedsTotal = 0;
      slot.pesticideUntil = null;
      addXP(state, TILL_XP);
      return { valid: true };
    }

    case ActionType.WATER: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      const slot = state.farm[action.slotIndex];
      if (!slot.unlocked || !slot.isDry)
        return { valid: false, reason: "Nothing to water here!" };

      slot.lastWateredAt = serverNow;
      slot.isDry = false;
      addXP(state, WATER_XP);
      return { valid: true };
    }

    case ActionType.PLANT: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      if (!isCropId(action.cropId))
        return { valid: false, reason: "Invalid crop id" };

      const seed = SEEDS[action.cropId];
      if (getLevel(state) < seed.requiredLevel)
        return {
          valid: false,
          reason: `Level ${seed.requiredLevel} required to plant ${seed.name}`,
        };

      // Must have seeds in warehouse (seeds are purchased as packs)
      if (!hasWarehouseItem(state, action.cropId, 1))
        return { valid: false, reason: "No seeds in warehouse" };

      const slot = state.farm[action.slotIndex];
      if (!slot.unlocked) return { valid: false, reason: "Slot not unlocked" };
      if (slot.state !== "tilled")
        return { valid: false, reason: "Slot must be tilled first" };
      if (slot.hasPests)
        return { valid: false, reason: "Remove pests before planting" };
      if (slot.isDry)
        return {
          valid: false,
          reason: "Cannot plant on dry soil, water first",
        };

      // Consume one pack of seeds
      removeWarehouseItem(state, action.cropId, 1);

      slot.state = "planted";
      slot.cropId = action.cropId;
      slot.seedsTotal = seed.seedsPerPack;
      slot.seedsRemaining = seed.seedsPerPack;
      slot.plantedAt = serverNow;
      slot.growthProgress = 0;
      slot.health = 100;
      slot.hasPests = false;
      slot.pestStartedAt = null;
      slot.pesticideUntil = null;

      return { valid: true };
    }

    case ActionType.HARVEST: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      const slot = state.farm[action.slotIndex];
      if (!slot.unlocked) return { valid: false, reason: "Slot not unlocked" };
      if (slot.state !== "ready" || !slot.cropId)
        return { valid: false, reason: "Crop is not ready" };

      const crop = SEEDS[slot.cropId];
      // Health affects sell price: 100% health = full price
      const healthMultiplier = slot.health / 100;
      const xpGain = Math.max(
        1,
        Math.floor(crop.xpPerHarvest * healthMultiplier),
      );

      // Add harvested crop to warehouse
      addWarehouseItem(state, slot.cropId, 1);
      addXP(state, xpGain);

      slot.seedsRemaining--;

      if (slot.seedsRemaining <= 0) {
        // Pack exhausted - reset slot completely (needs re-till and water)
        slot.state = "empty";
        slot.cropId = null;
        slot.plantedAt = null;
        slot.growthProgress = 0;
        slot.seedsTotal = 0;
        slot.seedsRemaining = 0;
        slot.isDry = true; // soil becomes dry after full harvest
        slot.hasPests = false;
        slot.pestStartedAt = null;
        slot.health = 100;
        slot.pesticideUntil = null;
      } else {
        // More seeds in pack - restart growth cycle for next seed
        slot.state = "planted";
        slot.plantedAt = serverNow;
        slot.growthProgress = 0;
        slot.health = 100;
        slot.hasPests = false;
        slot.pestStartedAt = null;
        // Note: pesticide persists for remaining seeds if active
      }

      return { valid: true };
    }

    case ActionType.REMOVE_PEST: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      const slot = state.farm[action.slotIndex];
      if (!slot.unlocked) return { valid: false, reason: "Slot not unlocked" };
      if (!slot.hasPests)
        return { valid: false, reason: "No pests on this slot" };

      slot.hasPests = false;
      slot.pestStartedAt = null;
      slot.health = 100; // Instant health restoration
      addXP(state, REMOVE_PEST_XP);
      return { valid: true };
    }

    case ActionType.APPLY_PESTICIDE: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      const slot = state.farm[action.slotIndex];
      if (!slot.unlocked) return { valid: false, reason: "Slot not unlocked" };
      if (slot.state === "empty")
        return { valid: false, reason: "Nothing on this slot" };
      if (slot.hasPests) return { valid: false, reason: "Remove pests first" };

      slot.pesticideUntil = serverNow + globalThis.GAME_CONFIG.PESTICIDE_DURATION_MS;
      return { valid: true };
    }

    case ActionType.BUY: {
      if (action.quantity <= 0 || action.quantity > 99)
        return { valid: false, reason: "Invalid quantity" };

      if (action.itemId === "feed") {
        // Buy animal feed
        const totalCost = (FEED_COST * globalThis.GAME_CONFIG.BUY_MULTIPLIER) * action.quantity;
        if (state.coins < totalCost)
          return { valid: false, reason: "Not enough coins" };
        state.coins -= totalCost;
        state.feed += action.quantity;
        return { valid: true };
      }

      if (!isCropId(action.itemId))
        return { valid: false, reason: "Invalid item id" };
      const seed = SEEDS[action.itemId];
      if (getLevel(state) < seed.requiredLevel)
        return { valid: false, reason: `Level ${seed.requiredLevel} required` };

      const totalCost = (seed.packCost * globalThis.GAME_CONFIG.BUY_MULTIPLIER) * action.quantity;
      if (state.coins < totalCost)
        return { valid: false, reason: "Not enough coins" };

      state.coins -= totalCost;
      addWarehouseItem(state, action.itemId, action.quantity);
      return { valid: true };
    }

    case ActionType.BUY_SLOT: {
      if (!isValidSlotIndex(action.slotIndex))
        return { valid: false, reason: "Invalid slot index" };
      const slot = state.farm[action.slotIndex];
      if (slot.unlocked)
        return { valid: false, reason: "Slot already unlocked" };

      const cost = getSlotUnlockCost(state.unlockedSlots) * globalThis.GAME_CONFIG.BUY_MULTIPLIER;
      if (state.coins < cost)
        return { valid: false, reason: `Not enough coins (need ${cost})` };

      state.coins -= cost;
      slot.unlocked = true;
      state.unlockedSlots++;
      return { valid: true };
    }

    case ActionType.BUY_ANIMAL: {
      if (!isAnimalId(action.animalId))
        return { valid: false, reason: "Invalid animal id" };
      const animalDef = ANIMALS[action.animalId];
      if (getLevel(state) < animalDef.requiredLevel)
        return {
          valid: false,
          reason: `Level ${animalDef.requiredLevel} required`,
        };
      if (state.animals[action.animalId] !== null)
        return { valid: false, reason: "Already have this animal" };
      if (state.coins < (animalDef.cost * globalThis.GAME_CONFIG.BUY_MULTIPLIER))
        return { valid: false, reason: "Not enough coins" };

      state.coins -= (animalDef.cost * globalThis.GAME_CONFIG.BUY_MULTIPLIER);
      state.animals[action.animalId] = {
        type: action.animalId,
        boughtAt: serverNow,
        isAdult: false,
        isProducing: false,
        producingAt: null,
        productReady: false,
      };
      return { valid: true };
    }

    case ActionType.FEED_ANIMAL: {
      if (!isAnimalId(action.animalId))
        return { valid: false, reason: "Invalid animal id" };
      const animal = state.animals[action.animalId];
      if (!animal) return { valid: false, reason: "Animal not purchased" };
      if (!animal.isAdult)
        return { valid: false, reason: "Animal is not yet adult" };
      if (animal.isProducing || animal.productReady)
        return {
          valid: false,
          reason: "Animal is already producing or product is ready",
        };
      if (state.feed < 1) return { valid: false, reason: "No feed available" };

      const animalDef = ANIMALS[action.animalId];
      state.feed -= 1;
      animal.isProducing = true;
      animal.producingAt = serverNow;
      animal.productReady = false;
      return { valid: true };
    }

    case ActionType.COLLECT_ANIMAL: {
      if (!isAnimalId(action.animalId))
        return { valid: false, reason: "Invalid animal id" };
      const animal = state.animals[action.animalId];
      if (!animal) return { valid: false, reason: "Animal not purchased" };
      if (!animal.productReady)
        return { valid: false, reason: "Product not ready yet" };

      const animalDef = ANIMALS[action.animalId];
      addWarehouseItem(state, animalDef.productId, 1);
      addXP(state, animalDef.xpPerCollect);

      animal.productReady = false;
      animal.producingAt = null;
      animal.isProducing = false;
      return { valid: true };
    }

    case ActionType.SELL: {
      if (!isItemId(action.itemId))
        return { valid: false, reason: "Invalid item id" };
      if (action.quantity <= 0)
        return { valid: false, reason: "Invalid quantity" };

      const itemDef = WAREHOUSE_ITEMS[action.itemId];
      if (!itemDef || itemDef.sellPrice <= 0)
        return { valid: false, reason: "Item cannot be sold" };

      if (!hasWarehouseItem(state, action.itemId, action.quantity))
        return { valid: false, reason: "Not enough items in warehouse" };

      removeWarehouseItem(state, action.itemId, action.quantity);
      state.coins += (itemDef.sellPrice * globalThis.GAME_CONFIG.SELL_MULTIPLIER) * action.quantity;
      return { valid: true };
    }

    case ActionType.SELL_ALL: {
      let totalGold = 0;
      for (const item of state.warehouse) {
        const def = WAREHOUSE_ITEMS[item.itemId];
        if (def && def.sellPrice > 0) {
          totalGold += (def.sellPrice * globalThis.GAME_CONFIG.SELL_MULTIPLIER) * item.quantity;
        }
      }
      if (totalGold === 0) return { valid: false, reason: "Nothing to sell" };

      state.coins += totalGold;
      state.warehouse = [];
      return { valid: true };
    }

    default:
      return { valid: false, reason: "Unknown action type" };
  }
}

// --- WAL Validation ---

export function validateAndApplyWAL(currentState, wal, serverNow) {
  const state = JSON.parse(JSON.stringify(currentState));
  const rejectedActions = [];

  applyGrowthTicks(state, serverNow, true); // isServer=true — full tick with pest/dry generation

  if (wal.actions.length > MAX_ACTIONS_PER_WAL) {
    return {
      valid: false,
      state,
      rejectedActions: [
        {
          index: -1,
          reason: `WAL too large: ${wal.actions.length} actions (max ${MAX_ACTIONS_PER_WAL})`,
        },
      ],
      walRejected: true,
    };
  }

  if (typeof wal.createdAt !== "number" || isNaN(wal.createdAt)) {
    return {
      valid: false,
      state,
      rejectedActions: [{ index: -1, reason: "WAL createdAt is invalid" }],
      walRejected: true,
    };
  }
  if (wal.createdAt > serverNow + FUTURE_TOLERANCE_MS) {
    return {
      valid: false,
      state,
      rejectedActions: [
        { index: -1, reason: "WAL createdAt is in the future" },
      ],
      walRejected: true,
    };
  }

  let lastAcceptedTimestamp = null;

  for (let i = 0; i < wal.actions.length; i++) {
    const action = wal.actions[i];

    if (typeof action.timestamp !== "number" || isNaN(action.timestamp)) {
      rejectedActions.push({
        index: i,
        reason: "Missing or invalid timestamp",
      });
      continue;
    }
    if (action.timestamp <= 0 || !Number.isFinite(action.timestamp)) {
      rejectedActions.push({
        index: i,
        reason: "Timestamp must be a positive finite number",
      });
      continue;
    }
    if (action.timestamp > serverNow + FUTURE_TOLERANCE_MS) {
      rejectedActions.push({
        index: i,
        reason: `Future timestamp: ${Math.floor((action.timestamp - serverNow) / 1000)}s ahead`,
      });
      continue;
    }
    const age = serverNow - action.timestamp;
    if (age > MAX_ACTION_AGE_MS) {
      rejectedActions.push({
        index: i,
        reason: `Stale timestamp: ${Math.floor(age / 1000)}s old`,
      });
      continue;
    }
    if (
      lastAcceptedTimestamp !== null &&
      action.timestamp < lastAcceptedTimestamp
    ) {
      rejectedActions.push({
        index: i,
        reason: `Out-of-order timestamp: ${action.timestamp} < previous ${lastAcceptedTimestamp}`,
      });
      continue;
    }

    const result = validateAndApplyAction(
      state,
      action,
      serverNow,
      action.timestamp,
    );
    if (!result.valid) {
      rejectedActions.push({ index: i, reason: result.reason });
    } else {
      lastAcceptedTimestamp = action.timestamp;
    }
  }

  state.version++;

  return {
    valid: rejectedActions.length === 0,
    state,
    rejectedActions,
  };
}

// --- Player name validation ---

export function validatePlayerName(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, reason: "Name is required" };
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_PLAYER_NAME_LENGTH) {
    return {
      valid: false,
      reason: `Name must be at least ${MIN_PLAYER_NAME_LENGTH} characters`,
    };
  }
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    return {
      valid: false,
      reason: `Name must be at most ${MAX_PLAYER_NAME_LENGTH} characters`,
    };
  }
  if (!/^[a-zA-Z0-9_ ]+$/.test(trimmed)) {
    return {
      valid: false,
      reason: "Name can only contain letters, numbers, spaces, and underscores",
    };
  }
  return { valid: true };
}

// --- Create default player state ---

export function createDefaultPlayerState(playerId, playerName, now) {
  const farm = [];
  let slotBalance = INITIAL_UNLOCKED_SLOTS;
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    farm.push({
      state: "empty",
      cropId: null,
      seedsRemaining: 0,
      seedsTotal: 0,
      plantedAt: null,
      growthProgress: 0,
      isDry: false,
      lastWateredAt: null,
      hasPests: false,
      pestStartedAt: null,
      health: 100,
      pesticideUntil: null,
      unlocked: i !== 0 && i !== 1 && i !== 5 && i !== 6 && slotBalance-- > 0, // Unlock initial slots except the very first one to encourage unlocking
    });
  }

  return {
    playerId,
    playerName,
    coins: globalThis.GAME_CONFIG.STARTING_COINS,
    level: 1,
    xp: 0,
    farm,
    animals: {
      chicken: null,
      cow: null,
      sheep: null,
    },
    warehouse: [],
    unlockedSlots: INITIAL_UNLOCKED_SLOTS,
    feed: 0,
    lastTickAt: now,
    createdAt: now,
    version: 1,
  };
}
