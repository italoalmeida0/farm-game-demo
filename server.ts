// ============================================================
// FARM GAME BACKEND SERVER (Bun)
// - Account creation with username/password
// - Stores player states in-memory Map
// - Processes WAL batches from clients
// - Validates actions using shared validation
// - Returns authoritative state
// - PERSISTENCE: write-through per player (awaited)
// ============================================================

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateAndApplyWAL, createDefaultPlayerState, validatePlayerName, applyGrowthTicks } from './shared/validation';
import type { PlayerState, WAL, SyncRequest, SyncResponse, GameStateResponse } from './shared/types';

// ============================================================
// CONFIGURATION
// ============================================================

/** Set to true when behind a reverse proxy (nginx, cloudflare, etc.) */
const TRUST_PROXY = false;

/** Allowed CORS origins. Use ['*'] for dev. In production, list specific origins. */
const ALLOWED_ORIGINS: string[] = ['*'];

/** Enable debug/hacker page and extra logging */
const ENABLE_DEBUG = process.env.ENABLE_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================
// PERSISTENCE - Write-through per player (immediate, awaited)
// ============================================================
const DATA_DIR = join(import.meta.dir, 'data');
const PLAYERS_DIR = join(DATA_DIR, 'players');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(PLAYERS_DIR)) mkdirSync(PLAYERS_DIR, { recursive: true });

/**
 * Save a single player state to disk (async, awaited before response).
 */
async function savePlayer(playerId: string, state: PlayerState): Promise<void> {
  const filePath = join(PLAYERS_DIR, playerId + '.json');
  try {
    await Bun.write(filePath, JSON.stringify(state));
  } catch (err: any) {
    console.error('[PERSIST] Failed to save player ' + playerId + ':', err.message);
  }
}

/**
 * Save accounts to disk (async, awaited before response).
 */
async function saveAccounts(): Promise<void> {
  const obj: Record<string, any> = {};
  for (const [key, val] of accounts) {
    obj[key] = val;
  }
  try {
    await Bun.write(ACCOUNTS_FILE, JSON.stringify(obj));
  } catch (err: any) {
    console.error('[PERSIST] Failed to save accounts:', err.message);
  }
}

/**
 * Boot: restore all state from per-player files + accounts
 */
async function bootRestore() {
  // Restore accounts
  if (existsSync(ACCOUNTS_FILE)) {
    try {
      const raw = await Bun.file(ACCOUNTS_FILE).text();
      const data = JSON.parse(raw);
      for (const [key, val] of Object.entries(data)) {
        accounts.set(key, val as any);
      }
      console.log('[BOOT] Restored ' + accounts.size + ' accounts');
    } catch (err) {
      console.error('[BOOT] Failed to load accounts:', err);
    }
  }

  // Restore players from individual files
  try {
    const files = readdirSync(PLAYERS_DIR).filter((f: string) => f.endsWith('.json'));
    let loaded = 0;
    for (const file of files) {
      try {
        const raw = await Bun.file(join(PLAYERS_DIR, file)).text();
        const state = JSON.parse(raw) as PlayerState;
        if (state.playerId) {
          players.set(state.playerId, state);
          loaded++;
        }
      } catch (err) {
        console.error('[BOOT] Failed to load player file ' + file + ':', err);
      }
    }
    console.log('[BOOT] Restored ' + loaded + ' players from ' + files.length + ' files');
  } catch (err) {
    console.error('[BOOT] Failed to read players directory:', err);
  }
}

// ============================================================
// IN-MEMORY STORES
// ============================================================
const players: Map<string, PlayerState> = new Map();
const accounts: Map<string, { username: string; passwordHash: string; playerId: string }> = new Map();
const sessions: Map<string, { playerId: string; createdAt: number }> = new Map();
const locks: Map<string, number> = new Map(); // value = timestamp of lock acquisition

// --- Brute-force lockout per account ---
const loginAttempts: Map<string, { count: number; firstAttemptAt: number; lockedUntil: number }> = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// --- Rate limiting per IP ---
const rateLimits: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 200;

// --- Registration rate limiting per IP ---
const regRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
const REG_RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const REG_RATE_LIMIT_MAX = 3; // 3 registrations per IP per 10 minutes

// --- Lock TTL ---
const LOCK_TTL_MS = 10_000; // 10 seconds

// --- Session expiry ---
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Password minimum length ---
const MIN_PASSWORD_LENGTH = 6;

// --- Max body sizes ---
const MAX_BODY_AUTH = 1024;      // 1KB for auth endpoints
const MAX_BODY_SYNC = 65536;     // 64KB for sync endpoint

// ============================================================
// PERIODIC CLEANUP
// ============================================================

/** Clean up expired sessions every 5 minutes */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_EXPIRY_MS) {
      sessions.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CLEANUP] Removed ${cleaned} expired sessions`);
  }
}, 5 * 60 * 1000);

/** Clean up stale login attempt tracking every 5 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.firstAttemptAt > LOGIN_WINDOW_MS && now > entry.lockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/** Clean up stale rate limit entries every minute */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) {
      rateLimits.delete(ip);
    }
  }
  for (const [ip, entry] of regRateLimits) {
    if (now > entry.resetAt) {
      regRateLimits.delete(ip);
    }
  }
}, 60 * 1000);

// ============================================================
// PASSWORD HASHING (PBKDF2 with SHA-256, 100k iterations)
// ============================================================

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 32;
const PBKDF2_HASH_BYTES = 32;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  // Bun supports btoa
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Hash password with PBKDF2 (new format: pbkdf2:iterations:salt_b64:hash_b64)
 */
async function hashPasswordPBKDF2(password: string, salt?: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const saltBytes = salt || crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );

  const hashBytes = new Uint8Array(hashBits);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64(saltBytes)}:${toBase64(hashBytes)}`;
}

/**
 * Verify password against legacy SHA-256 hash (format: salt_hex:sha256_hex)
 */
async function verifyPasswordLegacy(password: string, stored: string): Promise<boolean> {
  const [salt] = stored.split(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const computed = salt + ':' + bytesToHex(new Uint8Array(hash));
  return computed === stored;
}

/**
 * Verify password against PBKDF2 hash (format: pbkdf2:iterations:salt_b64:hash_b64)
 */
async function verifyPasswordPBKDF2(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = parseInt(parts[1], 10);
  const saltBytes = fromBase64(parts[2]);
  const expectedHash = fromBase64(parts[3]);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    expectedHash.length * 8
  );

  const computedHash = new Uint8Array(hashBits);

  // Constant-time comparison
  if (computedHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}

/**
 * Verify password and detect format automatically.
 * Returns { valid, needsRehash } — if needsRehash is true, caller should re-store with PBKDF2.
 */
async function verifyPassword(password: string, stored: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (stored.startsWith('pbkdf2:')) {
    const valid = await verifyPasswordPBKDF2(password, stored);
    return { valid, needsRehash: false };
  }

  // Legacy format (salt_hex:sha256_hex)
  const valid = await verifyPasswordLegacy(password, stored);
  return { valid, needsRehash: valid }; // rehash on successful legacy verification
}

// ============================================================
// HELPERS
// ============================================================

function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(req: Request): string {
  if (TRUST_PROXY) {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'local';
  }
  // When not trusting proxy headers, use a fallback
  return 'local';
}

function getPlayerFromAuth(authHeader: string | null): PlayerState | null {
  if (!authHeader) return null;

  // Fix #10: Strict Authorization header validation
  // Must start with exactly "Bearer " (capital B, single space)
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7); // length of "Bearer "
  // Token must be non-empty and not literal "null"/"undefined"
  if (!token || token === 'null' || token === 'undefined') return null;
  // Token must not contain whitespace (tabs, newlines, double spaces)
  if (/\s/.test(token)) return null;

  const session = sessions.get(token);
  if (!session) return null;
  // Check session expiry
  if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
    sessions.delete(token);
    return null;
  }
  const state = players.get(session.playerId);
  if (state) {
    applyGrowthTicks(state, Date.now());
  }
  return state || null;
}

/**
 * Check if an account is locked out due to brute-force attempts.
 * Returns { locked: true, retryAfterMs } or { locked: false }.
 */
function checkBruteForce(username: string): { locked: boolean; retryAfterMs?: number } {
  const entry = loginAttempts.get(username);
  if (!entry) return { locked: false };

  const now = Date.now();

  // Check if currently locked out
  if (now < entry.lockedUntil) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now };
  }

  // Check if window expired — reset
  if (now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(username);
    return { locked: false };
  }

  return { locked: false };
}

/**
 * Record a failed login attempt. Returns true if account just got locked.
 */
function recordFailedLogin(username: string): boolean {
  const now = Date.now();
  let entry = loginAttempts.get(username);

  if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    entry = { count: 1, firstAttemptAt: now, lockedUntil: 0 };
    loginAttempts.set(username, entry);
    return false;
  }

  entry.count++;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return true;
  }
  return false;
}

/** Clear failed login attempts on successful login */
function clearFailedLogins(username: string): void {
  loginAttempts.delete(username);
}

// ============================================================
// CORS & RESPONSE HELPERS
// ============================================================

function getCorsOrigin(origin: string | null): string {
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Don't echo back an unauthorized origin
  return ALLOWED_ORIGINS[0] || '';
}

function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(origin || null),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function jsonResp(data: any, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

// ============================================================
// RATE LIMITING
// ============================================================

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimits.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

/**
 * Check registration rate limit (stricter: 3 per IP per 10 minutes).
 * Returns true if allowed, false if rate limited.
 */
function checkRegRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = regRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + REG_RATE_LIMIT_WINDOW };
    regRateLimits.set(ip, entry);
  }
  entry.count++;
  return entry.count <= REG_RATE_LIMIT_MAX;
}

// ============================================================
// REQUEST BODY VALIDATION HELPERS
// ============================================================

/**
 * Validate Content-Type is application/json for POST endpoints.
 * Returns a 415 Response if invalid, null if valid.
 */
function validateContentType(req: Request, origin: string | null): Response | null {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResp({ error: 'Unsupported media type' }, 415, origin);
  }
  return null;
}

/**
 * Validate Content-Length is within limit.
 * Returns a 413 Response if too large, null if OK.
 */
function validateContentLength(req: Request, maxSize: number, origin: string | null): Response | null {
  const contentLengthStr = req.headers.get('content-length');
  if (contentLengthStr) {
    const contentLength = parseInt(contentLengthStr, 10);
    if (!isNaN(contentLength) && contentLength > maxSize) {
      return jsonResp({ error: 'Payload too large' }, 413, origin);
    }
  }
  return null;
}

/**
 * Parse and validate JSON body. Returns { data, error }.
 * - Rejects empty/missing body
 * - Rejects non-object types (null, array, string, number)
 * - Rejects malformed JSON
 */
async function parseJsonBody(req: Request): Promise<{ data: any | null; error: Response | null }> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { data: null, error: jsonResp({ error: 'Failed to read body' }, 400) };
  }

  // Empty body check
  if (!text || text.trim().length === 0) {
    return { data: null, error: jsonResp({ error: 'Request body is required' }, 400) };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { data: null, error: jsonResp({ error: 'Invalid JSON' }, 400) };
  }

  // Must be a plain object (not null, not array, not string, not number)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: null, error: jsonResp({ error: 'Request body must be a JSON object' }, 400) };
  }

  return { data: parsed, error: null };
}

// ============================================================
// LOCK HELPERS (with TTL)
// ============================================================

/** Acquire a lock. Returns true if acquired, false if already held (and not expired). */
function acquireLock(playerId: string): boolean {
  const now = Date.now();
  const existing = locks.get(playerId);
  if (existing !== undefined) {
    // Check if lock has expired
    if (now - existing > LOCK_TTL_MS) {
      locks.delete(playerId);
      // Fall through to acquire
    } else {
      return false; // lock is still valid
    }
  }
  locks.set(playerId, now);
  return true;
}

function releaseLock(playerId: string): void {
  locks.delete(playerId);
}

// ============================================================
// REQUEST HANDLER
// ============================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const origin = req.headers.get('origin');
  const ip = getClientIp(req);

  // --- Fix #1: Block path traversal ---
  if (path.includes('..')) {
    return jsonResp({ error: 'Bad request' }, 400, origin);
  }

  // --- Fix #1: Block data directory access ---
  if (path === '/data' || path.startsWith('/data/')) {
    return jsonResp({ error: 'Not found' }, 404, origin);
  }

  // --- Fix #1: Block access to anything outside frontend (source code, config, etc.) ---
  // Only allow /frontend/ paths for static files, and only specific ones
  if (path.startsWith('/frontend/') || path.startsWith('/shared/') || path.startsWith('/node_modules/') || path.startsWith('/security-tests/')) {
    return jsonResp({ error: 'Not found' }, 404, origin);
  }

  // --- CORS preflight ---
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // --- Fix #11: Health endpoint (no auth, no rate limit, GET only) ---
  if (path === '/api/health') {
    if (method !== 'GET') {
      return jsonResp({ error: 'Method not allowed' }, 405, origin);
    }
    return jsonResp({ status: 'ok' }, 200, origin);
  }

  // --- Rate limiting (everything except health and OPTIONS) ---
  if (!checkRateLimit(ip)) {
    return jsonResp({ error: 'Rate limit exceeded' }, 429, origin);
  }

  try {
    // ============================================================
    // API ROUTES — Exact path matching required (#13)
    // ============================================================

    if (path.startsWith('/api/')) {

      // --- Register account (POST only) ---
      if (path === '/api/register') {
        // Fix #2: Method enforcement
        if (method !== 'POST') {
          return jsonResp({ error: 'Method not allowed' }, 405, origin);
        }

        // Fix #3: Content-Type validation
        const ctErr = validateContentType(req, origin);
        if (ctErr) return ctErr;

        // Fix #4: Body size limit (1KB for auth endpoints)
        const clErr = validateContentLength(req, MAX_BODY_AUTH, origin);
        if (clErr) return clErr;

        // Fix #9: Registration rate limiting
        if (!checkRegRateLimit(ip)) {
          return jsonResp({ error: 'Too many registrations. Try again later.' }, 429, origin);
        }

        // Fix #5 & #6: Parse and validate body (empty check + type check)
        const { data: body, error: bodyErr } = await parseJsonBody(req);
        if (bodyErr) return bodyErr;

        const { username, password } = body;

        if (!username || !password) {
          return jsonResp({ success: false, error: 'Username and password required' }, 400, origin);
        }
        if (typeof username !== 'string' || typeof password !== 'string') {
          return jsonResp({ success: false, error: 'Invalid input types' }, 400, origin);
        }

        // Fix #7: Trim username before validation and use trimmed value
        const trimmedUsername = username.trim();
        const nameValidation = validatePlayerName(trimmedUsername);
        if (!nameValidation.valid) {
          return jsonResp({ success: false, error: nameValidation.reason }, 400, origin);
        }

        const trimmed = trimmedUsername.toLowerCase();

        // Fix #8: Duplicate username prevention
        if (accounts.has(trimmed)) {
          return jsonResp({ success: false, error: 'Username already taken' }, 409, origin);
        }

        // Fix #12: Password minimum length (6 characters)
        if (password.length < MIN_PASSWORD_LENGTH) {
          return jsonResp({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400, origin);
        }

        const playerId = generatePlayerId();
        const now = Date.now();
        const state = createDefaultPlayerState(playerId, trimmedUsername, now);
        players.set(playerId, state);

        const passwordHash = await hashPasswordPBKDF2(password);
        accounts.set(trimmed, { username: trimmed, passwordHash, playerId });

        const token = generateSessionToken();
        sessions.set(token, { playerId, createdAt: Date.now() });

        // Await persistence before responding
        await Promise.all([
          savePlayer(playerId, state),
          saveAccounts(),
        ]);

        return jsonResp({
          success: true,
          token,
          state,
        }, 200, origin);
      }

      // --- Login (POST only) ---
      if (path === '/api/login') {
        // Fix #2: Method enforcement
        if (method !== 'POST') {
          return jsonResp({ error: 'Method not allowed' }, 405, origin);
        }

        // Fix #3: Content-Type validation
        const ctErr = validateContentType(req, origin);
        if (ctErr) return ctErr;

        // Fix #4: Body size limit
        const clErr = validateContentLength(req, MAX_BODY_AUTH, origin);
        if (clErr) return clErr;

        // Fix #5 & #6: Parse and validate body
        const { data: body, error: bodyErr } = await parseJsonBody(req);
        if (bodyErr) return bodyErr;

        const { username, password, token } = body;

        // Token-based reconnect
        if (token) {
          if (typeof token !== 'string') {
            return jsonResp({ success: false, error: 'Invalid token format' }, 400, origin);
          }
          const session = sessions.get(token);
          if (!session) {
            return jsonResp({ success: false, error: 'Invalid or expired session' }, 401, origin);
          }
          if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
            sessions.delete(token);
            return jsonResp({ success: false, error: 'Session expired' }, 401, origin);
          }
          const state = players.get(session.playerId);
          if (!state) {
            return jsonResp({ success: false, error: 'Player not found' }, 401, origin);
          }
          applyGrowthTicks(state, Date.now());
          return jsonResp({ success: true, state, token }, 200, origin);
        }

        // Username/password login
        if (!username || !password) {
          return jsonResp({ success: false, error: 'Username and password required' }, 400, origin);
        }
        if (typeof username !== 'string' || typeof password !== 'string') {
          return jsonResp({ success: false, error: 'Invalid input types' }, 400, origin);
        }

        const trimmed = username.trim().toLowerCase();

        // Check brute-force lockout
        const lockout = checkBruteForce(trimmed);
        if (lockout.locked) {
          const retryAfterSec = Math.ceil((lockout.retryAfterMs || 0) / 1000);
          return jsonResp({
            success: false,
            error: `Account locked due to too many failed attempts. Try again in ${retryAfterSec} seconds.`,
          }, 429, origin);
        }

        const account = accounts.get(trimmed);
        if (!account) {
          recordFailedLogin(trimmed);
          return jsonResp({ success: false, error: 'Invalid username or password' }, 401, origin);
        }

        const { valid, needsRehash } = await verifyPassword(password, account.passwordHash);
        if (!valid) {
          const justLocked = recordFailedLogin(trimmed);
          if (justLocked) {
            console.warn(`[SECURITY] Account "${trimmed}" locked after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
          }
          return jsonResp({ success: false, error: 'Invalid username or password' }, 401, origin);
        }

        // Successful login — clear failed attempts
        clearFailedLogins(trimmed);

        // Re-hash with PBKDF2 if this was a legacy SHA-256 hash
        if (needsRehash) {
          account.passwordHash = await hashPasswordPBKDF2(password);
          await saveAccounts();
        }

        const state = players.get(account.playerId)!;
        applyGrowthTicks(state, Date.now());

        const newToken = generateSessionToken();
        sessions.set(newToken, { playerId: account.playerId, createdAt: Date.now() });

        return jsonResp({ success: true, state, token: newToken }, 200, origin);
      }

      // --- Get game state (GET only) ---
      if (path === '/api/state') {
        // Fix #2: Method enforcement
        if (method !== 'GET') {
          return jsonResp({ error: 'Method not allowed' }, 405, origin);
        }

        const state = getPlayerFromAuth(req.headers.get('authorization'));
        if (!state) {
          return jsonResp({ success: false, error: 'Unauthorized' }, 401, origin);
        }
        return jsonResp({ success: true, state }, 200, origin);
      }

      // --- Sync WAL (POST only) ---
      if (path === '/api/sync') {
        // Fix #2: Method enforcement
        if (method !== 'POST') {
          return jsonResp({ error: 'Method not allowed' }, 405, origin);
        }

        // Fix #3: Content-Type validation
        const ctErr = validateContentType(req, origin);
        if (ctErr) return ctErr;

        // Fix #4: Body size limit (64KB for sync)
        const clErr = validateContentLength(req, MAX_BODY_SYNC, origin);
        if (clErr) return clErr;

        const authHeader = req.headers.get('authorization');
        const state = getPlayerFromAuth(authHeader);
        if (!state) {
          return jsonResp({ success: false, error: 'Unauthorized' }, 401, origin);
        }

        // Fix #5 & #6: Parse and validate body
        const { data: body, error: bodyErr } = await parseJsonBody(req);
        if (bodyErr) return bodyErr;

        const wal: WAL = body.wal;

        if (!wal || !wal.actions || !Array.isArray(wal.actions)) {
          return jsonResp({ success: false, error: 'Invalid WAL structure' }, 400, origin);
        }

        // Lock check with TTL
        if (!acquireLock(state.playerId)) {
          return jsonResp({ success: false, error: 'State locked, try again' } as SyncResponse, 423, origin);
        }

        try {
          const currentState = players.get(state.playerId)!;
          applyGrowthTicks(currentState, Date.now());

          const result = validateAndApplyWAL(currentState, wal, Date.now());
          players.set(state.playerId, result.state);

          // Await persistence before responding
          await savePlayer(state.playerId, result.state);

          const response: SyncResponse = {
            success: true,
            state: result.state,
            rejectedActions: result.rejectedActions.length > 0 ? result.rejectedActions : undefined,
          };

          return jsonResp(response, 200, origin);
        } finally {
          releaseLock(state.playerId);
        }
      }

      // --- Shop (GET only) ---
      if (path === '/api/shop') {
        // Fix #2: Method enforcement
        if (method !== 'GET') {
          return jsonResp({ error: 'Method not allowed' }, 405, origin);
        }

        const state = getPlayerFromAuth(req.headers.get('authorization'));
        if (!state) {
          return jsonResp({ success: false, error: 'Unauthorized' }, 401, origin);
        }
        const { SHOP_ITEMS } = await import('./shared/gameData');
        return jsonResp({ success: true, items: SHOP_ITEMS }, 200, origin);
      }

      // --- Fix #13: Any other /api/ path → 404 ---
      return jsonResp({ error: 'Not found' }, 404, origin);
    }

    // ============================================================
    // STATIC FILE SERVING — Exact match only (#1, #13)
    // ============================================================

    // Serve index.html for root
    if (path === '/' || path === '/index.html') {
      const file = Bun.file('./frontend/index.html');
      return new Response(file, { headers: { 'Content-Type': 'text/html' } });
    }

    // Hacker page (gated behind debug flag)
    if (path === '/hacker' || path === '/hacker.html') {
      if (!ENABLE_DEBUG) {
        return jsonResp({ error: 'Not found' }, 404, origin);
      }
      const file = Bun.file('./frontend/hacker.html');
      return new Response(file, { headers: { 'Content-Type': 'text/html' } });
    }

    // --- Everything else → 404 ---
    return jsonResp({ error: 'Not found' }, 404, origin);

  } catch (err: any) {
    console.error('Server error:', err);
    return jsonResp({ error: 'Internal server error' }, 500, origin);
  }
}

// ============================================================
// BOOT & START
// ============================================================

await bootRestore();

const port = 3456;
console.log(`🌾 Farm Game Server running on http://localhost:${port}`);
console.log(`   🎮 Game:       http://localhost:${port}/`);
if (ENABLE_DEBUG) {
  console.log(`   💀 Hacker:     http://localhost:${port}/hacker`);
}
console.log(`   ❤️  Health:     http://localhost:${port}/api/health`);
console.log(`   💾 Persistence: write-through per player (${PLAYERS_DIR})`);
console.log(`   🔒 Security:   PBKDF2 hashing, brute-force lockout, lock TTL, awaited persistence`);
console.log(`   🛡️  Hardened:   path traversal blocked, method enforcement, body validation, rate limiting`);
console.log(`   🌐 Proxy trust: ${TRUST_PROXY}, CORS: ${ALLOWED_ORIGINS.join(',')}`);

export default {
  port,
  fetch: handleRequest,
};