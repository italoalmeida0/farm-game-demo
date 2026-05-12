// ============================================================
// FARM GAME BACKEND SERVER (Bun)
// New Architecture - Seed packs, Animals, Warehouse, Tools
// ============================================================

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateAndApplyWAL, createDefaultPlayerState, validatePlayerName, applyGrowthTicks } from './shared/validation';
import { SEEDS, ANIMALS, WAREHOUSE_ITEMS, FEED_COST, TOOLS, XP_PER_LEVEL, GAME_MODE } from './shared/gameData';


// ============================================================
// CONFIGURATION
// ============================================================

const TRUST_PROXY = false;
const ALLOWED_ORIGINS = ['*'];
const ENABLE_DEBUG = process.env.ENABLE_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================
// PERSISTENCE
// ============================================================
const DATA_DIR = join(import.meta.dir, 'data');
const PLAYERS_DIR = join(DATA_DIR, 'players');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(PLAYERS_DIR)) mkdirSync(PLAYERS_DIR, { recursive: true });

async function savePlayer(playerId, state) {
  const filePath = join(PLAYERS_DIR, playerId + '.json');
  try {
    await Bun.write(filePath, JSON.stringify(state));
  } catch (err) {
    console.error('[PERSIST] Failed to save player ' + playerId + ':', err.message);
  }
}

async function saveAccounts() {
  const obj = {};
  for (const [key, val] of accounts) {
    obj[key] = val;
  }
  try {
    await Bun.write(ACCOUNTS_FILE, JSON.stringify(obj));
  } catch (err) {
    console.error('[PERSIST] Failed to save accounts:', err.message);
  }
}

async function bootRestore() {
  if (existsSync(ACCOUNTS_FILE)) {
    try {
      const raw = await Bun.file(ACCOUNTS_FILE).text();
      const data = JSON.parse(raw);
      for (const [key, val] of Object.entries(data)) {
        accounts.set(key, val );
      }
      console.log('[BOOT] Restored ' + accounts.size + ' accounts');
    } catch (err) {
      console.error('[BOOT] Failed to load accounts:', err);
    }
  }

  try {
    const files = readdirSync(PLAYERS_DIR).filter((f) => f.endsWith('.json'));
    let loaded = 0;
    for (const file of files) {
      try {
        const raw = await Bun.file(join(PLAYERS_DIR, file)).text();
        const state = JSON.parse(raw) ;
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
const players = new Map();
const accounts = new Map();
const sessions = new Map();
const locks = new Map();

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 200;

const regRateLimits = new Map();
const REG_RATE_LIMIT_WINDOW = 10 * 60 * 1000;
const REG_RATE_LIMIT_MAX = 3;

const LOCK_TTL_MS = 10_000;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const MAX_BODY_AUTH = 1024;
const MAX_BODY_SYNC = 65536;

// ============================================================
// PERIODIC CLEANUP
// ============================================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_EXPIRY_MS) {
      sessions.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[CLEANUP] Removed ${cleaned} expired sessions`);
}, 5 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.firstAttemptAt > LOGIN_WINDOW_MS && now > entry.lockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
  for (const [ip, entry] of regRateLimits) {
    if (now > entry.resetAt) regRateLimits.delete(ip);
  }
}, 60 * 1000);

// ============================================================
// PASSWORD HASHING (PBKDF2)
// ============================================================

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 32;
const PBKDF2_HASH_BYTES = 32;

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hashPasswordPBKDF2(password, salt) {
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
      salt: saltBytes ,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );

  const hashBytes = new Uint8Array(hashBits);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64(saltBytes)}:${toBase64(hashBytes)}`;
}

async function verifyPasswordLegacy(password, stored) {
  const [salt] = stored.split(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const computed = salt + ':' + bytesToHex(new Uint8Array(hash));
  return computed === stored;
}

async function verifyPasswordPBKDF2(password, stored) {
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
      salt: saltBytes ,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    expectedHash.length * 8
  );

  const computedHash = new Uint8Array(hashBits);
  if (computedHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}

async function verifyPassword(password, stored) {
  if (stored.startsWith('pbkdf2:')) {
    const valid = await verifyPasswordPBKDF2(password, stored);
    return { valid, needsRehash: false };
  }
  const valid = await verifyPasswordLegacy(password, stored);
  return { valid, needsRehash: valid };
}

// ============================================================
// HELPERS
// ============================================================

function generatePlayerId() {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(req) {
  if (TRUST_PROXY) {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'local';
  }
  return 'local';
}

function getPlayerFromAuth(authHeader) {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token || token === 'null' || token === 'undefined') return null;
  if (/\s/.test(token)) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
    sessions.delete(token);
    return null;
  }
  const state = players.get(session.playerId);
  if (state) {
    applyGrowthTicks(state, Date.now(), true);
  }
  return state || null;
}

function checkBruteForce(username) {
  const entry = loginAttempts.get(username);
  if (!entry) return { locked: false };
  const now = Date.now();
  if (now < entry.lockedUntil) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now };
  }
  if (now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(username);
    return { locked: false };
  }
  return { locked: false };
}

function recordFailedLogin(username) {
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

function clearFailedLogins(username) {
  loginAttempts.delete(username);
}

// ============================================================
// CORS & RESPONSE HELPERS
// ============================================================

function getCorsOrigin(origin) {
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || '';
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(origin || null),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function jsonResp(data, status = 200, origin) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

// ============================================================
// RATE LIMITING
// ============================================================

function checkRateLimit(_ip) { return true; }
function checkRegRateLimit(_ip) { return true; }

// ============================================================
// REQUEST BODY VALIDATION
// ============================================================

function validateContentType(req, origin) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResp({ error: 'Unsupported media type' }, 415, origin);
  }
  return null;
}

function validateContentLength(req, maxSize, origin) {
  const contentLengthStr = req.headers.get('content-length');
  if (contentLengthStr) {
    const contentLength = parseInt(contentLengthStr, 10);
    if (!isNaN(contentLength) && contentLength > maxSize) {
      return jsonResp({ error: 'Payload too large' }, 413, origin);
    }
  }
  return null;
}

async function parseJsonBody(req) {
  let text;
  try {
    text = await req.text();
  } catch {
    return { data: null, error: jsonResp({ error: 'Failed to read body' }, 400) };
  }
  if (!text || text.trim().length === 0) {
    return { data: null, error: jsonResp({ error: 'Request body is required' }, 400) };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { data: null, error: jsonResp({ error: 'Invalid JSON' }, 400) };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: null, error: jsonResp({ error: 'Request body must be a JSON object' }, 400) };
  }
  return { data: parsed, error: null };
}

// ============================================================
// LOCK HELPERS
// ============================================================

function acquireLock(playerId) {
  const now = Date.now();
  const existing = locks.get(playerId);
  if (existing !== undefined) {
    if (now - existing > LOCK_TTL_MS) {
      locks.delete(playerId);
    } else {
      return false;
    }
  }
  locks.set(playerId, now);
  return true;
}

function releaseLock(playerId) {
  locks.delete(playerId);
}

// ============================================================
// REQUEST HANDLER
// ============================================================

async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const origin = req.headers.get('origin');
  const ip = getClientIp(req);

  if (path.includes('..')) return jsonResp({ error: 'Bad request' }, 400, origin);
  if (path === '/data' || path.startsWith('/data/')) return jsonResp({ error: 'Not found' }, 404, origin);

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (path === '/api/health') {
    if (method !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);
    return jsonResp({ status: 'ok' }, 200, origin);
  }

  if (path === '/api/stats') {
    if (method !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);
    const mem = process.memoryUsage();
    return jsonResp({
      players: players.size,
      accounts: accounts.size,
      sessions: sessions.size,
      locks: locks.size,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
      uptime: process.uptime(),
    }, 200, origin);
  }

  if (!checkRateLimit(ip)) return jsonResp({ error: 'Rate limit exceeded' }, 429, origin);

  try {
    if (path.startsWith('/api/')) {

      // --- Register ---
      if (path === '/api/register') {
        if (method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405, origin);
        const ctErr = validateContentType(req, origin);
        if (ctErr) return ctErr;
        const clErr = validateContentLength(req, MAX_BODY_AUTH, origin);
        if (clErr) return clErr;
        if (!checkRegRateLimit(ip)) return jsonResp({ error: 'Too many registrations. Try again later.' }, 429, origin);

        const { data: body, error: bodyErr } = await parseJsonBody(req);
        if (bodyErr) return bodyErr;

        const { username, password } = body;
        if (!username || !password) return jsonResp({ success: false, error: 'Username and password required' }, 400, origin);
        if (typeof username !== 'string' || typeof password !== 'string') return jsonResp({ success: false, error: 'Invalid input types' }, 400, origin);

        const trimmedUsername = username.trim();
        const nameValidation = validatePlayerName(trimmedUsername);
        if (!nameValidation.valid) return jsonResp({ success: false, error: nameValidation.reason }, 400, origin);

        const trimmed = trimmedUsername.toLowerCase();
        if (accounts.has(trimmed)) return jsonResp({ success: false, error: 'Username already taken' }, 409, origin);
        if (password.length < MIN_PASSWORD_LENGTH) return jsonResp({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400, origin);

        let playerId;
        do {
          playerId = generatePlayerId();
        } while (players.has(playerId));
        const now = Date.now();
        const state = createDefaultPlayerState(playerId, trimmedUsername, now);
        players.set(playerId, state);

        const passwordHash = await hashPasswordPBKDF2(password);
        accounts.set(trimmed, { username: trimmed, passwordHash, playerId });

        const token = generateSessionToken();
        sessions.set(token, { playerId, createdAt: Date.now() });

        await Promise.all([savePlayer(playerId, state), saveAccounts()]);

        return jsonResp({ success: true, token, state, mode: GAME_MODE }, 200, origin);
      }

      // --- Login ---
      if (path === '/api/login') {
        if (method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405, origin);
        const ctErr = validateContentType(req, origin);
        if (ctErr) return ctErr;
        const clErr = validateContentLength(req, MAX_BODY_AUTH, origin);
        if (clErr) return clErr;

        const { data: body, error: bodyErr } = await parseJsonBody(req);
        if (bodyErr) return bodyErr;

        const { username, password, token } = body;

        // Token-based reconnect
        if (token) {
          if (typeof token !== 'string') return jsonResp({ success: false, error: 'Invalid token format' }, 400, origin);
          const session = sessions.get(token);
          if (!session) return jsonResp({ success: false, error: 'Invalid or expired session' }, 401, origin);
          if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
            sessions.delete(token);
            return jsonResp({ success: false, error: 'Session expired' }, 401, origin);
          }
          const state = players.get(session.playerId);
          if (!state) return jsonResp({ success: false, error: 'Player not found' }, 401, origin);
          applyGrowthTicks(state, Date.now(), true);
          return jsonResp({ success: true, state, token, mode: GAME_MODE }, 200, origin);
        }

        if (!username || !password) return jsonResp({ success: false, error: 'Username and password required' }, 400, origin);
        if (typeof username !== 'string' || typeof password !== 'string') return jsonResp({ success: false, error: 'Invalid input types' }, 400, origin);

        const trimmed = username.trim().toLowerCase();
        const lockout = checkBruteForce(trimmed);
        if (lockout.locked) {
          const retryAfterSec = Math.ceil((lockout.retryAfterMs || 0) / 1000);
          return jsonResp({ success: false, error: `Account locked due to too many failed attempts. Try again in ${retryAfterSec} seconds.` }, 429, origin);
        }

        const account = accounts.get(trimmed);
        if (!account) {
          recordFailedLogin(trimmed);
          return jsonResp({ success: false, error: 'Invalid username or password' }, 401, origin);
        }

        const { valid, needsRehash } = await verifyPassword(password, account.passwordHash);
        if (!valid) {
          const justLocked = recordFailedLogin(trimmed);
          if (justLocked) console.warn(`[SECURITY] Account "${trimmed}" locked after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
          return jsonResp({ success: false, error: 'Invalid username or password' }, 401, origin);
        }

        clearFailedLogins(trimmed);
        if (needsRehash) {
          account.passwordHash = await hashPasswordPBKDF2(password);
          await saveAccounts();
        }

        const state = players.get(account.playerId);
        applyGrowthTicks(state, Date.now(), true);

        const newToken = generateSessionToken();
        sessions.set(newToken, { playerId: account.playerId, createdAt: Date.now() });

        return jsonResp({ success: true, state, token: newToken, mode: GAME_MODE }, 200, origin);
      }

      // --- Get game state ---
      if (path === '/api/state') {
        if (method !== 'GET') return jsonResp({ error: 'Method not allowed' }, 405, origin);
        const state = getPlayerFromAuth(req.headers.get('authorization'));
        if (!state) return jsonResp({ success: false, error: 'Unauthorized' }, 401, origin);
        return jsonResp({ success: true, state }, 200, origin);
      }

      // --- Sync WAL ---
      if (path === '/api/sync') {
        if (method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405, origin);
        const ctErr = validateContentType(req, origin);
        if (ctErr) return ctErr;
        const clErr = validateContentLength(req, MAX_BODY_SYNC, origin);
        if (clErr) return clErr;

        const authHeader = req.headers.get('authorization');
        const state = getPlayerFromAuth(authHeader);
        if (!state) return jsonResp({ success: false, error: 'Unauthorized' }, 401, origin);

        const { data: body, error: bodyErr } = await parseJsonBody(req);
        if (bodyErr) return bodyErr;

        const wal = body.wal;
        if (!wal || !wal.actions || !Array.isArray(wal.actions)) {
          return jsonResp({ success: false, error: 'Invalid WAL structure' }, 400, origin);
        }

        if (!acquireLock(state.playerId)) {
          return jsonResp({ success: false, error: 'State locked, try again' } , 423, origin);
        }

        try {
          const currentState = players.get(state.playerId);
          applyGrowthTicks(currentState, Date.now(), true);

          const result = validateAndApplyWAL(currentState, wal, Date.now());
          players.set(state.playerId, result.state);

          await savePlayer(state.playerId, result.state);

          const response = {
            success: true,
            state: result.state,
            mode: GAME_MODE,
            rejectedActions: result.rejectedActions.length > 0 ? result.rejectedActions : undefined,
          };

          return jsonResp(response, 200, origin);
        } finally {
          releaseLock(state.playerId);
        }
      }


      return jsonResp({ error: 'Not found' }, 404, origin);
    }

    // --- Static files ---
    if (path === '/' || path === '/index.html') {
      const file = Bun.file('./index.html');
      return new Response(file, { headers: { 'Content-Type': 'text/html' } });
    }

    // Serve shared modules as JS assets (for frontend ES module imports)
    if (path === '/shared/gameData.js' || path === '/shared/validation.js') {
      const filePath = '.' + path;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } });
      }
    }


    return jsonResp({ error: 'Not found' }, 404, origin);

  } catch (err) {
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
console.log(`   ⚙️  Mode:      ${globalThis.GAME_CONFIG.mode.toUpperCase()} ${globalThis.GAME_CONFIG.mode === 'dev' ? '(fast demo: accelerated timers, 5k coins, high pest chance)' : '(production timings)'}`);
console.log(`   🎮 Game:       http://localhost:${port}/`);
console.log(`   ❤️  Health:     http://localhost:${port}/api/health`);
console.log(`   💾 Persistence: write-through per player (${PLAYERS_DIR})`);
console.log(`   🔒 Security:   PBKDF2 hashing, brute-force lockout, lock TTL, awaited persistence`);
console.log(`   🛡️  Hardened:   path traversal blocked, method enforcement, body validation, rate limiting`);
console.log(`   🌐 Proxy trust: ${TRUST_PROXY}, CORS: ${ALLOWED_ORIGINS.join(',')}`);

export default {
  port,
  fetch: handleRequest,
};