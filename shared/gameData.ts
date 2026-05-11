 // ============================================================
// SHARED GAME DATA - Crop definitions, item catalog, shop
// Imported by both frontend and backend
// ============================================================

import type { CropDef, ItemDef, CropId, ItemId, ShopItem } from './types';

// --- Crop Definitions ---

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    seedPrice: 5,
    sellPrice: 12,
    growTimeMs: 30_000,       // 30 seconds
    stages: 4,
    waterBonus: 1.5,
    season: 'all',
  },
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    seedPrice: 8,
    sellPrice: 18,
    growTimeMs: 45_000,       // 45 seconds
    stages: 4,
    waterBonus: 1.3,
    season: 'spring',
  },
  tomato: {
    id: 'tomato',
    name: 'Tomato',
    seedPrice: 12,
    sellPrice: 28,
    growTimeMs: 60_000,       // 1 minute
    stages: 5,
    waterBonus: 1.4,
    season: 'summer',
  },
  corn: {
    id: 'corn',
    name: 'Corn',
    seedPrice: 15,
    sellPrice: 35,
    growTimeMs: 90_000,       // 1.5 minutes
    stages: 5,
    waterBonus: 1.2,
    season: 'summer',
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    seedPrice: 20,
    sellPrice: 50,
    growTimeMs: 120_000,      // 2 minutes
    stages: 5,
    waterBonus: 1.3,
    season: 'fall',
  },
  strawberry: {
    id: 'strawberry',
    name: 'Strawberry',
    seedPrice: 25,
    sellPrice: 60,
    growTimeMs: 150_000,      // 2.5 minutes
    stages: 6,
    waterBonus: 1.6,
    season: 'spring',
  },
};

// --- Item Definitions ---

export const ITEMS: Record<ItemId, ItemDef> = {
  wheat:       { id: 'wheat',       name: 'Wheat',       buyPrice: null,  sellPrice: 12, stackable: true, maxStack: 999 },
  carrot:      { id: 'carrot',      name: 'Carrot',      buyPrice: null,  sellPrice: 18, stackable: true, maxStack: 999 },
  tomato:      { id: 'tomato',      name: 'Tomato',      buyPrice: null,  sellPrice: 28, stackable: true, maxStack: 999 },
  corn:        { id: 'corn',        name: 'Corn',        buyPrice: null,  sellPrice: 35, stackable: true, maxStack: 999 },
  pumpkin:     { id: 'pumpkin',     name: 'Pumpkin',     buyPrice: null,  sellPrice: 50, stackable: true, maxStack: 999 },
  strawberry:  { id: 'strawberry',  name: 'Strawberry',  buyPrice: null,  sellPrice: 60, stackable: true, maxStack: 999 },
  hoe:         { id: 'hoe',         name: 'Hoe',         buyPrice: 50,    sellPrice: 25, stackable: false, maxStack: 1 },
  watering_can:{ id: 'watering_can',name: 'Watering Can',buyPrice: 75,    sellPrice: 35, stackable: false, maxStack: 1 },
  scythe:      { id: 'scythe',      name: 'Scythe',      buyPrice: 100,   sellPrice: 50, stackable: false, maxStack: 1 },
  fertilizer:  { id: 'fertilizer',  name: 'Fertilizer',  buyPrice: 30,    sellPrice: 10, stackable: true, maxStack: 50 },
  gold_egg:    { id: 'gold_egg',    name: 'Gold Egg',    buyPrice: null,  sellPrice: 200,stackable: true, maxStack: 10 },
};

// --- Shop Inventory ---

export const SHOP_ITEMS: ShopItem[] = [
  { itemId: 'wheat',      price: CROPS.wheat.seedPrice,       stock: -1 },
  { itemId: 'carrot',     price: CROPS.carrot.seedPrice,      stock: -1 },
  { itemId: 'tomato',     price: CROPS.tomato.seedPrice,      stock: -1 },
  { itemId: 'corn',       price: CROPS.corn.seedPrice,        stock: -1 },
  { itemId: 'pumpkin',    price: CROPS.pumpkin.seedPrice,     stock: -1 },
  { itemId: 'strawberry', price: CROPS.strawberry.seedPrice,  stock: -1 },
  { itemId: 'hoe',         price: 50,   stock: -1 },
  { itemId: 'watering_can',price: 75,   stock: -1 },
  { itemId: 'scythe',      price: 100,  stock: -1 },
  { itemId: 'fertilizer',  price: 30,   stock: -1 },
];

// --- Level XP thresholds ---

export const XP_PER_LEVEL: number[] = [
  0,      // level 1
  100,    // level 2
  250,    // level 3
  500,    // level 4
  850,    // level 5
  1300,   // level 6
  1900,   // level 7
  2700,   // level 8
  3800,   // level 9
  5200,   // level 10
];

// --- Upgrade costs ---

export const UPGRADE_COSTS = {
  max_energy: [100, 200, 400, 800, 1500], // per level
  farm_expand: [500, 1500, 4000],          // unlock more rows
} as const;

// --- Energy costs ---

export const ENERGY_COSTS = {
  till: 5,
  plant: 3,
  water: 2,
  harvest: 4,
  use_item: 2,
} as const;

// --- Game constants ---

export const SYNC_INTERVAL_MS = 5_000;    // sync every 5 seconds (heartbeat + WAL flush)
export const MAX_ACTIONS_PER_WAL = 50;    // max actions per sync
export const ENERGY_REGEN_RATE = 1;       // energy per second
export const ENERGY_REGEN_INTERVAL = 5000; // check every 5 seconds
export const STARTING_COINS = 100;
export const STARTING_ENERGY = 50;
export const STARTING_MAX_ENERGY = 100;
export const MAX_PLAYER_NAME_LENGTH = 64;
export const MIN_PLAYER_NAME_LENGTH = 2;