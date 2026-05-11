// ============================================================
// SHARED TYPES - Used by both frontend and backend
// ============================================================

// --- Item & Crop Definitions ---

export type CropId = 'wheat' | 'carrot' | 'tomato' | 'corn' | 'pumpkin' | 'strawberry';
export type ToolId = 'hoe' | 'watering_can' | 'scythe';
export type ItemId = CropId | ToolId | 'fertilizer' | 'gold_egg';

export interface CropDef {
  id: CropId;
  name: string;
  seedPrice: number;
  sellPrice: number;
  growTimeMs: number;       // total time to fully grow
  stages: number;           // visual growth stages
  waterBonus: number;       // speed multiplier when watered (1.0 = no bonus)
  season: 'spring' | 'summer' | 'fall' | 'all';
}

export interface ItemDef {
  id: ItemId;
  name: string;
  buyPrice: number | null;  // null = not buyable
  sellPrice: number | null; // null = not sellable
  stackable: boolean;
  maxStack: number;
}

export interface ShopItem {
  itemId: ItemId;
  price: number;
  stock: number; // -1 = infinite
}

// --- Farm Grid ---

export const FARM_ROWS = 6;
export const FARM_COLS = 8;
export const TOTAL_SLOTS = FARM_ROWS * FARM_COLS;

export type SlotState = 'empty' | 'tilled' | 'planted' | 'ready';

export interface FarmSlot {
  state: SlotState;
  cropId: CropId | null;
  plantedAt: number | null;       // timestamp ms
  wateredAt: number | null;       // timestamp ms
  growthProgress: number;         // 0.0 - 1.0
}

// --- Inventory ---

export interface InventoryItem {
  itemId: ItemId;
  quantity: number;
}

// --- Player State (the canonical state stored on server, mirrored on client) ---

export interface PlayerState {
  playerId: string;
  playerName: string;
  coins: number;
  level: number;
  xp: number;
  energy: number;
  maxEnergy: number;
  farm: FarmSlot[];               // flat array, index = row * FARM_COLS + col
  inventory: InventoryItem[];
  lastTickAt: number;             // last time server processed growth ticks
  createdAt: number;
  version: number;                // monotonically increasing, used for conflict detection
}

// --- Actions (WAL entries) ---

export enum ActionType {
  TILL = 'till',
  PLANT = 'plant',
  WATER = 'water',
  HARVEST = 'harvest',
  BUY = 'buy',
  SELL = 'sell',
  USE_ITEM = 'use_item',
  UPGRADE = 'upgrade',
}

export interface TillAction {
  type: ActionType.TILL;
  slotIndex: number;
  timestamp: number;
}

export interface PlantAction {
  type: ActionType.PLANT;
  slotIndex: number;
  cropId: CropId;
  timestamp: number;
}

export interface WaterAction {
  type: ActionType.WATER;
  slotIndex: number;
  timestamp: number;
}

export interface HarvestAction {
  type: ActionType.HARVEST;
  slotIndex: number;
  timestamp: number;
}

export interface BuyAction {
  type: ActionType.BUY;
  itemId: ItemId;
  quantity: number;
  timestamp: number;
}

export interface SellAction {
  type: ActionType.SELL;
  itemId: ItemId;
  quantity: number;
  timestamp: number;
}

export interface UseItemAction {
  type: ActionType.USE_ITEM;
  itemId: ItemId;
  slotIndex: number;
  timestamp: number;
}

export interface UpgradeAction {
  type: ActionType.UPGRADE;
  upgradeType: 'max_energy' | 'farm_expand';
  timestamp: number;
}

export type GameAction =
  | TillAction
  | PlantAction
  | WaterAction
  | HarvestAction
  | BuyAction
  | SellAction
  | UseItemAction
  | UpgradeAction;

// --- WAL (Write-Ahead Log) ---

export interface WAL {
  // NOTE: playerId is NOT included in client-sent WALs.
  // The server resolves the player identity from the auth token (middleware).
  version: number;           // client's current state version at time of WAL creation
  actions: GameAction[];     // can be empty [] for a "heartbeat" sync to get server state
  createdAt: number;
}

// --- API Request/Response ---

export interface SyncRequest {
  wal: WAL;
}

export interface SyncResponse {
  success: boolean;
  state?: PlayerState;
  error?: string;
  rejectedActions?: { index: number; reason: string }[];
}

export interface AuthRequest {
  playerName: string;
}

export interface AuthResponse {
  success: boolean;
  playerId?: string;
  state?: PlayerState;
  error?: string;
}

export interface GameStateResponse {
  success: boolean;
  state?: PlayerState;
  error?: string;
}