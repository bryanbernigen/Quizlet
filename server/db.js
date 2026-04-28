import pg from 'pg';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_TYPE = process.env.DB_TYPE || 'postgres';

let pool = null;
let sqliteDb = null;

// ==================== DRIVER SETUP ====================

function initPostgres() {
  const { Pool } = pg;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
  });
}

function initSqlite() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'flashcards.db');
  sqliteDb = new Database(dbPath);
  // Enable foreign keys and WAL mode for better concurrency
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
}

// ==================== UNIFIED QUERY API ====================
// Both query() and getClient() return { rows: [...] } to match the pg result shape.

function queryPostgres(text, params) {
  return pool.query(text, params);
}

function querySqlite(text, params) {
  // Convert Postgres $1, $2, ... placeholders to SQLite ? before preparing
  let sqliteText = text;
  if (params && params.length > 0) {
    sqliteText = text.replace(/\$[0-9]+/g, () => '?');
  }
  const stmt = sqliteDb.prepare(sqliteText);
  let result;
  if (text.trim().toUpperCase().startsWith('SELECT')) {
    const rows = stmt.all(...(params || []));
    result = { rows };
  } else {
    const info = stmt.run(...(params || []));
    result = { rows: [], lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  }
  return result;
}

export function query(text, params) {
  if (DB_TYPE === 'sqlite') {
    return querySqlite(text, params);
  }
  return queryPostgres(text, params);
}

// better-sqlite3 transactions use a callback pattern; pg uses explicit BEGIN/COMMIT.
// Wrap sqlite transactions to match pg's client.query('BEGIN') etc.
function getClientSqlite() {
  let inTransaction = false;
  const client = {
    query(text, params) {
      if (text === 'BEGIN') {
        sqliteDb.exec('BEGIN');
        inTransaction = true;
        return { rows: [] };
      }
      if (text === 'COMMIT') {
        sqliteDb.exec('COMMIT');
        inTransaction = false;
        return { rows: [] };
      }
      if (text === 'ROLLBACK') {
        sqliteDb.exec('ROLLBACK');
        inTransaction = false;
        return { rows: [] };
      }
      return querySqlite(text, params);
    },
    release() {
      // No-op for sqlite; transaction is already closed
    },
  };
  return Promise.resolve(client);
}

export async function getClient() {
  if (DB_TYPE === 'sqlite') {
    return getClientSqlite();
  }
  return pool.connect();
}

// ==================== INIT ====================

export async function initDb() {
  if (DB_TYPE === 'sqlite') {
    await initDbSqlite();
  } else {
    await initDbPostgres();
  }
}

async function initDbPostgres() {
  initPostgres();
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      familiarity TEXT NOT NULL DEFAULT 'unfamiliar' CHECK(familiarity IN ('familiar','neutral','unfamiliar')),
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quiz_history (
      id SERIAL PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      is_correct BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add is_admin column to existing deployments that don't have it
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='users' AND column_name='is_admin') THEN
        ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
    END $$
  `);

  // Add expires_at to sessions if missing
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='sessions' AND column_name='expires_at') THEN
        ALTER TABLE sessions ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days';
      END IF;
    END $$
  `);

  // Deduplicate sets: keep the oldest (lowest id) per (name, user_id)
  await query(`
    DELETE FROM sets
    WHERE id NOT IN (SELECT MIN(id) FROM sets GROUP BY name, user_id)
  `);

  // Unique constraint on sets(name, user_id) — prevents duplicate imports
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_set_name_per_user') THEN
        ALTER TABLE sets ADD CONSTRAINT unique_set_name_per_user UNIQUE (name, user_id);
      END IF;
    END $$
  `);

  // Deduplicate cards: keep the oldest per (set_id, front, back)
  await query(`
    DELETE FROM cards
    WHERE id NOT IN (SELECT MIN(id) FROM cards GROUP BY set_id, front, back)
  `);

  // Unique constraint on cards(set_id, front, back) — prevents duplicate cards on import
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_card_per_set') THEN
        ALTER TABLE cards ADD CONSTRAINT unique_card_per_set UNIQUE (set_id, front, back);
      END IF;
    END $$
  `);

  await seedAdminPostgres();
}

async function initDbSqlite() {
  initSqlite();

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
    )
  `);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS sets (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      familiarity TEXT NOT NULL DEFAULT 'unfamiliar' CHECK(familiarity IN ('familiar','neutral','unfamiliar')),
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS quiz_history (
      id INTEGER PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      is_correct INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add is_admin column to existing deployments that don't have it
  const userCols = sqliteDb.pragma('table_info(users)').map(c => c.name);
  if (!userCols.includes('is_admin')) {
    sqliteDb.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }

  // Add expires_at to sessions if missing
  const sessCols = sqliteDb.pragma('table_info(sessions)').map(c => c.name);
  if (!sessCols.includes('expires_at')) {
    sqliteDb.exec("ALTER TABLE sessions ADD COLUMN expires_at TEXT");
    sqliteDb.exec("UPDATE sessions SET expires_at = datetime('now', '+30 days') WHERE expires_at IS NULL");
  }

  // Deduplicate sets: keep the oldest (lowest id) per (name, user_id)
  sqliteDb.exec(`
    DELETE FROM sets
    WHERE id NOT IN (SELECT MIN(id) FROM sets GROUP BY name, user_id)
  `);

  // Unique constraint on sets(name, user_id) — prevents duplicate imports
  const setIndexes = sqliteDb.pragma('index_list(sets)').map(i => i.name);
  if (!setIndexes.includes('unique_set_name_per_user')) {
    sqliteDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_set_name_per_user ON sets(name, user_id)');
  }

  // Deduplicate cards: keep the oldest per (set_id, front, back)
  sqliteDb.exec(`
    DELETE FROM cards
    WHERE id NOT IN (SELECT MIN(id) FROM cards GROUP BY set_id, front, back)
  `);

  // Unique constraint on cards(set_id, front, back) — prevents duplicate cards on import
  const cardIndexes = sqliteDb.pragma('index_list(cards)').map(i => i.name);
  if (!cardIndexes.includes('unique_card_per_set')) {
    sqliteDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_card_per_set ON cards(set_id, front, back)');
  }

  seedAdminSqlite();
}

async function seedAdminPostgres() {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword) {
    const { rows } = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [adminUsername]);
    if (rows.length === 0) {
      const hash = hashPassword(adminPassword);
      await query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, TRUE)',
        [adminUsername, hash]
      );
      console.log(`Admin user "${adminUsername}" created.`);
    } else {
      await query('UPDATE users SET is_admin = TRUE WHERE LOWER(username) = LOWER($1)', [adminUsername]);
    }
  }
}

function seedAdminSqlite() {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword) {
    const existing = sqliteDb.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(adminUsername);
    if (!existing) {
      const hash = hashPassword(adminPassword);
      sqliteDb.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(adminUsername, hash);
      console.log(`Admin user "${adminUsername}" created.`);
    } else {
      sqliteDb.prepare('UPDATE users SET is_admin = 1 WHERE LOWER(username) = LOWER(?)').run(adminUsername);
    }
  }
}

// ==================== PASSWORD & TOKEN ====================

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derivedHash, 'hex'));
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
