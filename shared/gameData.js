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

export const SEEDS = {
  turnip: {
    
    name: "Turnip",
    xpPerHarvest: 6,
    growTimeMs: 5 * 60_000, // 5 min
    seedsPerPack: 4,
    sellPricePerUnit: 6,
    packCost: 10,
    requiredLevel: 1,
    emoji: "🟡",
  },
  carrot: {
    
    name: "Carrot",
    xpPerHarvest: 5,
    growTimeMs: 8 * 60_000, // 8 min
    seedsPerPack: 3,
    sellPricePerUnit: 10,
    packCost: 12,
    requiredLevel: 1,
    emoji: "🥕",
  },
  tomato: {
    
    name: "Tomato",
    xpPerHarvest: 8,
    growTimeMs: 12 * 60_000, // 12 min
    seedsPerPack: 3,
    sellPricePerUnit: 15,
    packCost: 15,
    requiredLevel: 1,
    emoji: "🍅",
  },
  cabbage: {
    
    name: "Cabbage",
    xpPerHarvest: 35,
    growTimeMs: 30 * 60_000, // 30 min
    seedsPerPack: 3,
    sellPricePerUnit: 45,
    packCost: 30,
    requiredLevel: 2,
    emoji: "🥬",
  },
  potato: {
    
    name: "Potato",
    xpPerHarvest: 40,
    growTimeMs: 45 * 60_000, // 45 min
    seedsPerPack: 3,
    sellPricePerUnit: 85,
    packCost: 60,
    requiredLevel: 3,
    emoji: "🥔",
  },
  rice: {
    
    name: "Rice",
    xpPerHarvest: 55,
    growTimeMs: 60 * 60_000, // 1h
    seedsPerPack: 3,
    sellPricePerUnit: 155,
    packCost: 100,
    requiredLevel: 4,
    emoji: "🌾",
  },
  cucumber: {
    
    name: "Cucumber",
    xpPerHarvest: 90,
    growTimeMs: 90 * 60_000, // 1h30min
    seedsPerPack: 2,
    sellPricePerUnit: 350,
    packCost: 160,
    requiredLevel: 5,
    emoji: "🥒",
  },
  strawberry: {
    
    name: "Strawberry",
    xpPerHarvest: 110,
    growTimeMs: 105 * 60_000, // 1h45min
    seedsPerPack: 2,
    sellPricePerUnit: 440,
    packCost: 180,
    requiredLevel: 6,
    emoji: "🍓",
  },
  sunflower: {
    
    name: "Sunflower",
    xpPerHarvest: 130,
    growTimeMs: 120 * 60_000, // 2h
    seedsPerPack: 2,
    sellPricePerUnit: 620,
    packCost: 240,
    requiredLevel: 7,
    emoji: "🌻",
  },
  pumpkin: {
    
    name: "Pumpkin",
    xpPerHarvest: 220,
    growTimeMs: 240 * 60_000, // 4h
    seedsPerPack: 2,
    sellPricePerUnit: 1600,
    packCost: 400,
    requiredLevel: 9,
    emoji: "🎃",
  },
  corn: {
    
    name: "Corn",
    xpPerHarvest: 70,
    growTimeMs: 70 * 60_000, // 1h10min
    seedsPerPack: 3,
    sellPricePerUnit: 200,
    packCost: 120,
    requiredLevel: 4,
    emoji: "🌽",
  },
  eggplant: {
    
    name: "Eggplant",
    xpPerHarvest: 100,
    growTimeMs: 95 * 60_000, // 1h35min
    seedsPerPack: 2,
    sellPricePerUnit: 380,
    packCost: 170,
    requiredLevel: 5,
    emoji: "🍆",
  },
  bell_pepper: {
    
    name: "Bell Pepper",
    xpPerHarvest: 120,
    growTimeMs: 110 * 60_000, // 1h50min
    seedsPerPack: 2,
    sellPricePerUnit: 500,
    packCost: 210,
    requiredLevel: 6,
    emoji: "🫑",
  },
  watermelon: {
    
    name: "Watermelon",
    xpPerHarvest: 180,
    growTimeMs: 180 * 60_000, // 3h
    seedsPerPack: 2,
    sellPricePerUnit: 1000,
    packCost: 300,
    requiredLevel: 8,
    emoji: "🍉",
  },
  grape: {
    
    name: "Grape",
    xpPerHarvest: 200,
    growTimeMs: 210 * 60_000, // 3h30min
    seedsPerPack: 2,
    sellPricePerUnit: 1300,
    packCost: 350,
    requiredLevel: 9,
    emoji: "🍇",
  },
};

// --- Animal Definitions ---

export const ANIMALS = {
  chicken: {
    
    name: "Chicken",
    cost: 500,
    growTimeMs: 2 * 60 * 60_000, // 2h to become adult
    productionTimeMs: 5 * 60_000, // 5min per egg
    productId: "egg",
    productName: "Egg",
    productSellPrice: 25,
    productEmoji: "🥚",
    animalEmoji: "🐔",
    requiredLevel: 1,
    xpPerCollect: 10,
  },
  cow: {
    
    name: "Cow",
    cost: 1500,
    growTimeMs: 4 * 60 * 60_000, // 4h to become adult
    productionTimeMs: 6 * 60_000, // 6min per milk
    productId: "milk",
    productName: "Milk",
    productSellPrice: 50,
    productEmoji: "🥛",
    animalEmoji: "🐄",
    requiredLevel: 2,
    xpPerCollect: 20,
  },
  sheep: {
    
    name: "Sheep",
    cost: 3500,
    growTimeMs: 6 * 60 * 60_000, // 6h to become adult
    productionTimeMs: 7 * 60_000, // 7min per wool
    productId: "wool",
    productName: "Wool",
    productSellPrice: 70,
    productEmoji: "🧶",
    animalEmoji: "🐑",
    requiredLevel: 8,
    xpPerCollect: 30,
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
WAREHOUSE_ITEMS.egg = { name: "Egg", sellPrice: 25, emoji: "🥚" };
WAREHOUSE_ITEMS.milk = { name: "Milk", sellPrice: 50, emoji: "🥛" };
WAREHOUSE_ITEMS.wool = { name: "Wool", sellPrice: 70, emoji: "🧶" };

// --- Animal Feed ---

export const FEED_COST = 20;
export const FEED_NAME = "Animal Feed";

// --- Level XP thresholds (cumulative XP needed to reach each level) ---

export const XP_PER_LEVEL = [
  0, // level 1 (starting)
  100, // level 2
  300, // level 3
  600, // level 4
  1100, // level 5
  1800, // level 6
  2800, // level 7
  4200, // level 8
  6000, // level 9
  8500, // level 10
  12000, // level 11
  17000, // level 12
];

// --- Slot unlock costs (each slot is more expensive) ---

export function getSlotUnlockCost(currentUnlocked) {
  // Base cost starts at 100 and increases proportionally
  // Slots 1-6 are free (initial), 7th slot onwards costs gold
  const slotIndex = currentUnlocked - INITIAL_UNLOCKED_SLOTS; // 0-based for paid slots
  return Math.floor(200 * Math.pow(1.4, slotIndex));
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
  SYNC_INTERVAL_MS: 5_000,        // sync every 3s
  STARTING_COINS: 5000,            // generous starting money
  DRY_INTERVAL_MS: 30_000,         // soil dries every 30s
  PEST_CHECK_INTERVAL_MS: 20_000,  // pests can appear every 20s
  PEST_HEALTH_DRAIN_PER_MIN: 10,   // fast health drain
  PESTICIDE_DURATION_MS: 60_000,   // pesticide lasts 1 min
  PEST_APPEAR_CHANCE: 0.6,         // 60% chance per check
  SEED_GROW_MULTIPLIER: 0.05,
  SELL_MULTIPLIER: 10,
  BUY_MULTIPLIER: 0.2,
};

export const PROD_MODE = {
  SYNC_INTERVAL_MS: 5_000,
  STARTING_COINS: 100,
  DRY_INTERVAL_MS: 10 * 60_000,    // soil dries every 10 min
  PEST_CHECK_INTERVAL_MS: 15 * 60_000, // pests every 15 min
  PEST_HEALTH_DRAIN_PER_MIN: 2,
  PESTICIDE_DURATION_MS: 30 * 60_000,  // 30 min
  PEST_APPEAR_CHANCE: 0.15,            // 15% chance
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