// ============================================================
// ACTION TYPES - Single source of truth for action identifiers
// ============================================================

export const ActionType = {
  TILL: 'till',
  WATER: 'water',
  PLANT: 'plant',
  HARVEST: 'harvest',
  REMOVE_PEST: 'remove_pest',
  APPLY_PESTICIDE: 'apply_pesticide',
  BUY: 'buy',
  BUY_SLOT: 'buy_slot',
  BUY_ANIMAL: 'buy_animal',
  FEED_ANIMAL: 'feed_animal',
  COLLECT_ANIMAL: 'collect_animal',
  SELL: 'sell',
  SELL_ALL: 'sell_all',
};

// --- Seed Definitions ---
// Balanced for ~30 days (30h active play) to reach level 12.
// Key design: XP/min scales with level, profit is sustainable,
// and each unlock feels meaningful.

export const SEEDS = {
  turnip: {
    name: "Turnip",
    xpPerHarvest: 100,
    growTimeMs: 8 * 60_000, // 8 min
    seedsPerPack: 10,
    sellPricePerUnit: 5,
    packCost: 20,
    requiredLevel: 1,
    emoji: "🟡",
  },
  carrot: {
    name: "Carrot",
    xpPerHarvest: 160,
    growTimeMs: 12 * 60_000, // 12 min
    seedsPerPack: 8,
    sellPricePerUnit: 10,
    packCost: 30,
    requiredLevel: 1,
    emoji: "🥕",
  },
  tomato: {
    name: "Tomato",
    xpPerHarvest: 240,
    growTimeMs: 15 * 60_000, // 15 min
    seedsPerPack: 6,
    sellPricePerUnit: 20,
    packCost: 45,
    requiredLevel: 1,
    emoji: "🍅",
  },
  cabbage: {
    name: "Cabbage",
    xpPerHarvest: 600,
    growTimeMs: 30 * 60_000, // 30 min
    seedsPerPack: 5,
    sellPricePerUnit: 50,
    packCost: 80,
    requiredLevel: 2,
    emoji: "🥬",
  },
  potato: {
    name: "Potato",
    xpPerHarvest: 1_000,
    growTimeMs: 45 * 60_000, // 45 min
    seedsPerPack: 4,
    sellPricePerUnit: 80,
    packCost: 120,
    requiredLevel: 3,
    emoji: "🥔",
  },
  rice: {
    name: "Rice",
    xpPerHarvest: 1_600,
    growTimeMs: 60 * 60_000, // 1h
    seedsPerPack: 4,
    sellPricePerUnit: 140,
    packCost: 180,
    requiredLevel: 4,
    emoji: "🌾",
  },
  corn: {
    name: "Corn",
    xpPerHarvest: 2_400,
    growTimeMs: 75 * 60_000, // 1h 15min
    seedsPerPack: 3,
    sellPricePerUnit: 220,
    packCost: 250,
    requiredLevel: 5,
    emoji: "🌽",
  },
  cucumber: {
    name: "Cucumber",
    xpPerHarvest: 3_600,
    growTimeMs: 90 * 60_000, // 1h 30min
    seedsPerPack: 3,
    sellPricePerUnit: 320,
    packCost: 350,
    requiredLevel: 6,
    emoji: "🥒",
  },
  eggplant: {
    name: "Eggplant",
    xpPerHarvest: 5_000,
    growTimeMs: 105 * 60_000, // 1h 45min
    seedsPerPack: 3,
    sellPricePerUnit: 450,
    packCost: 480,
    requiredLevel: 7,
    emoji: "🍆",
  },
  strawberry: {
    name: "Strawberry",
    xpPerHarvest: 7_000,
    growTimeMs: 120 * 60_000, // 2h
    seedsPerPack: 2,
    sellPricePerUnit: 600,
    packCost: 650,
    requiredLevel: 8,
    emoji: "🍓",
  },
  bell_pepper: {
    name: "Bell Pepper",
    xpPerHarvest: 10_000,
    growTimeMs: 150 * 60_000, // 2h 30min
    seedsPerPack: 2,
    sellPricePerUnit: 850,
    packCost: 900,
    requiredLevel: 9,
    emoji: "🫑",
  },
  sunflower: {
    name: "Sunflower",
    xpPerHarvest: 14_000,
    growTimeMs: 180 * 60_000, // 3h
    seedsPerPack: 2,
    sellPricePerUnit: 1_200,
    packCost: 1_200,
    requiredLevel: 10,
    emoji: "🌻",
  },
  watermelon: {
    name: "Watermelon",
    xpPerHarvest: 20_000,
    growTimeMs: 240 * 60_000, // 4h
    seedsPerPack: 2,
    sellPricePerUnit: 1_900,
    packCost: 1_800,
    requiredLevel: 11,
    emoji: "🍉",
  },
  pumpkin: {
    name: "Pumpkin",
    xpPerHarvest: 30_000,
    growTimeMs: 300 * 60_000, // 5h
    seedsPerPack: 2,
    sellPricePerUnit: 3_000,
    packCost: 2_500,
    requiredLevel: 12,
    emoji: "🎃",
  },
  grape: {
    name: "Grape",
    xpPerHarvest: 24_000,
    growTimeMs: 240 * 60_000, // 4h
    seedsPerPack: 2,
    sellPricePerUnit: 2_400,
    packCost: 2_000,
    requiredLevel: 12,
    emoji: "🍇",
  },
};

// --- Animal Definitions ---
// Rebalanced: each animal is a meaningful investment.
// Sheep is now properly gated and rewarding.

export const ANIMALS = {
  chicken: {
    name: "Chicken",
    cost: 3_000,
    growTimeMs: 6 * 60 * 60_000, // 6h to become adult
    productionTimeMs: 60 * 60_000, // 1h per egg
    productId: "egg",
    productName: "Egg",
    productSellPrice: 80,
    productEmoji: "🥚",
    animalEmoji: "🐔",
    requiredLevel: 2,
    xpPerCollect: 30,
  },
  cow: {
    name: "Cow",
    cost: 8_000,
    growTimeMs: 12 * 60 * 60_000, // 12h to become adult
    productionTimeMs: 90 * 60_000, // 1h 30min per milk
    productId: "milk",
    productName: "Milk",
    productSellPrice: 180,
    productEmoji: "🥛",
    animalEmoji: "🐄",
    requiredLevel: 5,
    xpPerCollect: 60,
  },
  sheep: {
    name: "Sheep",
    cost: 25_000,
    growTimeMs: 18 * 60 * 60_000, // 18h to become adult
    productionTimeMs: 2 * 60 * 60_000, // 2h per wool
    productId: "wool",
    productName: "Wool",
    productSellPrice: 350,
    productEmoji: "🧶",
    animalEmoji: "🐑",
    requiredLevel: 9,
    xpPerCollect: 100,
  },
};

// --- Warehouse item definitions (for sell prices / display) ---

export const WAREHOUSE_ITEMS = {};

// Add crops
for (const [id, seed] of Object.entries(SEEDS)) {
  WAREHOUSE_ITEMS[id] = {
    name: seed.name,
    sellPrice: seed.sellPricePerUnit,
    emoji: seed.emoji,
  };
}

// Add animal products
WAREHOUSE_ITEMS.egg = { name: "Egg", sellPrice: 80, emoji: "🥚" };
WAREHOUSE_ITEMS.milk = { name: "Milk", sellPrice: 180, emoji: "🥛" };
WAREHOUSE_ITEMS.wool = { name: "Wool", sellPrice: 350, emoji: "🧶" };

// --- Animal Feed ---

export const FEED_COST = 30;
export const FEED_NAME = "Animal Feed";

// --- Level XP thresholds (cumulative XP needed to reach each level) ---
// Target: ~30 days at 1h/day active play to reach level 12.
// Total XP required: 350,000.

export const XP_PER_LEVEL = [
  0,       // level 1 (starting)
  4_000,   // level 2
  12_000,  // level 3
  30_000,  // level 4
  65_000,  // level 5
  120_000, // level 6
  200_000, // level 7
  310_000, // level 8
  450_000, // level 9
  620_000, // level 10
  830_000, // level 11
  1_100_000, // level 12
];

// --- Slot unlock costs (each slot is more expensive) ---
// Smoother scaling than before.

export function getSlotUnlockCost(currentUnlocked) {
  // Slots 1-6 are free (initial), 7th slot onwards costs gold
  const slotIndex = currentUnlocked - INITIAL_UNLOCKED_SLOTS; // 0-based for paid slots
  return Math.floor(300 * Math.pow(1.3, slotIndex));
}

export const INITIAL_UNLOCKED_SLOTS = 6;

// --- Game Mode ---
// DEV_MODE: everything accelerated for fast demo (max ~5 min cycles)
// PROD_MODE: real timings (hours)

export const GAME_MODE = typeof process !== 'undefined' && process.env?.GAME_MODE === 'dev' ? 'dev' : 'prod';

// --- Game Constants ---

export const MAX_ACTIONS_PER_WAL = 50;
export const MAX_PLAYER_NAME_LENGTH = 64;
export const MIN_PLAYER_NAME_LENGTH = 2;

// --- Mode-dependent config ---

export const DEV_MODE = {
  SYNC_INTERVAL_MS: 5_000,        // sync every 5s
  STARTING_COINS: 5_000,          // generous starting money
  DRY_INTERVAL_MS: 30_000,        // soil dries every 30s
  PEST_CHECK_INTERVAL_MS: 20_000, // pests can appear every 20s
  PEST_HEALTH_DRAIN_PER_MIN: 10,  // fast health drain
  PESTICIDE_DURATION_MS: 60_000,  // pesticide lasts 1 min
  PEST_APPEAR_CHANCE: 0.6,        // 60% chance per check
  SEED_GROW_MULTIPLIER: 0.05,
  SELL_MULTIPLIER: 10,
  BUY_MULTIPLIER: 0.2,
};

export const PROD_MODE = {
  SYNC_INTERVAL_MS: 5_000,
  STARTING_COINS: 3_000,           // increased to help early-game sustainability
  DRY_INTERVAL_MS: 15 * 60_000,    // soil dries every 15 min (was 10)
  PEST_CHECK_INTERVAL_MS: 10 * 60_000, // pests every 10 min (was 15)
  PEST_HEALTH_DRAIN_PER_MIN: 5,    // faster drain (was 2)
  PESTICIDE_DURATION_MS: 30 * 60_000,  // 30 min
  PEST_APPEAR_CHANCE: 0.25,        // 25% chance (was 15%)
  SEED_GROW_MULTIPLIER: 1,
  SELL_MULTIPLIER: 1,
  BUY_MULTIPLIER: 1,
};

export function updateGameMode(mode) {
  if (!mode || (globalThis.GAME_CONFIG && globalThis.GAME_CONFIG.mode === mode)) return;
  globalThis.GAME_CONFIG = mode === 'prod' ? { ...PROD_MODE, mode: 'prod' } : { ...DEV_MODE, mode: 'dev' };
}
updateGameMode(GAME_MODE);

// Active config — set by server init, shared with frontend

export const WATER_XP = 2;
export const TILL_XP = 2;
export const REMOVE_PEST_XP = 2;

// --- Tool Definitions (for display purposes, always available) ---

export const TOOLS = {
  till: {
    name: "Hoe",
    emoji: "🪏",
    description: "Tills the soil for planting",
  },
  water: {
    name: "Watering Can",
    emoji: "🚿",
    description: "Waters plants (+2 XP)",
  },
  remove_pest: {
    name: "Pest Remover",
    emoji: "🐛",
    description: "Removes pests from plants (+2 XP)",
  },
  apply_pesticide: {
    name: "Pesticide",
    emoji: "🧴",
    description: "Prevents pests for 30 min",
  },
  hand: { name: "Hand", emoji: "✋", description: "Harvests ready crops" },
};

// --- All Seeds sorted by required level (for shop display) ---

export const SHOP_SEEDS = Object.values(SEEDS).sort(
  (a, b) => a.requiredLevel - b.requiredLevel,
);

// --- All Animals sorted by required level ---

export const SHOP_ANIMALS = Object.values(ANIMALS).sort(
  (a, b) => a.requiredLevel - b.requiredLevel,
);

export const FARM_ROWS = 6;
export const FARM_COLS = 5;
export const TOTAL_SLOTS = FARM_ROWS * FARM_COLS;
