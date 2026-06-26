/**
 * Guest Mode integration tests.
 *
 * Mirrors server/test/api.test.js: real SQLite (temp file), pg mocked,
 * deterministic crypto mock so tokens/hashes are stable.
 *
 * Run with: npx vitest run server/test/guest.test.js
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// ─── Mock pg Pool (before any server module loads) ──────────────────────────────
vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(() => ({
      query: vi.fn(),
      connect: vi.fn(() => Promise.resolve({ query: vi.fn(), release: vi.fn() })),
      end: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
    })),
  },
}));

// ─── Deterministic crypto mock ───────────────────────────────────────────────────
let _counter = 0;
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    randomBytes(size) {
      const buf = Buffer.alloc(size);
      for (let i = 0; i < size; i++) buf[i] = ((_counter++) * 37 + 17) % 256;
      return buf;
    },
    scrypt: (password, salt, n, callback) => {
      const derived = Buffer.alloc(64);
      for (let i = 0; i < 64; i++) {
        const p = Buffer.isBuffer(password) ? password[i] || 0 : (password?.charCodeAt?.(i) || 0);
        const s = Buffer.isBuffer(salt) ? salt[i] || 0 : (salt?.charCodeAt?.(i) || 0);
        derived[i] = ((p + s + i * 13) % 256);
      }
      process.nextTick(() => callback(null, derived));
    },
  };
});

// ─── Imports ──────────────────────────────────────────────────────────────────
import path from 'path';
import os from 'os';
import fs from 'fs';

// Use a DB file unique to this test file. Vitest runs test files in parallel
// worker threads that share the config-level DB_PATH; without this override
// guest.test.js and api.test.js would open the same SQLite file and collide.
// process.env is per-worker, so this override does not affect other files.
const DB_PATH = path.join(os.tmpdir(), `quizlet-guest-test-${process.pid}.db`);
process.env.DB_PATH = DB_PATH;
try { fs.unlinkSync(DB_PATH); } catch {}

import request from 'supertest';
import app from '../index.js';
import { query, getClient, initDb, getSetting, setSetting, generateToken, hashPassword } from '../db.js';
import { seedGuestContent, GUEST_SEED_SETS } from '../guestSeed.js';

async function resetDb() {
  await query('PRAGMA foreign_keys = OFF', []);
  for (const t of ['quiz_history', 'sessions', 'cards', 'sets', 'users']) {
    await query(`DELETE FROM ${t}`, []);
  }
  await query('PRAGMA foreign_keys = ON', []);
  // Restore the seeded settings deleted by api.test isolation if they ran first.
  await setSetting('guest_ttl_minutes', '60');
  await setSetting('guest_max_concurrent', '10');
}

async function newGuestToken() {
  const res = await request(app).post('/api/auth/guest').send({});
  return res.body.token;
}

async function adminToken() {
  const hash = await hashPassword('adminpw12345');
  const a = await query(
    "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin1', $1, TRUE) RETURNING id",
    [hash]
  );
  const token = generateToken();
  await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, a.rows[0].id]);
  return { token, id: a.rows[0].id };
}

beforeAll(async () => { await initDb(); });
beforeEach(async () => { await resetDb(); });
afterAll(async () => { try { fs.unlinkSync(DB_PATH); } catch {} });

// ============================================================
describe('app_settings', () => {
  test('getSetting returns the seeded defaults', async () => {
    expect(await getSetting('guest_ttl_minutes', '0')).toBe('60');
    expect(await getSetting('guest_max_concurrent', '0')).toBe('10');
  });

  test('getSetting returns the provided default for unknown keys', async () => {
    expect(await getSetting('does_not_exist', 'fallback')).toBe('fallback');
  });

  test('setSetting upserts a value', async () => {
    await setSetting('guest_ttl_minutes', '30');
    expect(await getSetting('guest_ttl_minutes', '0')).toBe('30');
  });
});

// ============================================================
describe('seedGuestContent', () => {
  test('inserts the seed sets and cards for a user', async () => {
    const { rows } = await query(
      "INSERT INTO users (username, password_hash, is_guest) VALUES ('seedguest', 'x', TRUE) RETURNING id",
      []
    );
    const userId = rows[0].id;

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await seedGuestContent(client, userId);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const { rows: sets } = await query('SELECT * FROM sets WHERE user_id = $1', [userId]);
    expect(sets.length).toBe(GUEST_SEED_SETS.length);
    const { rows: cards } = await query(
      'SELECT c.* FROM cards c JOIN sets s ON s.id = c.set_id WHERE s.user_id = $1',
      [userId]
    );
    const expectedCards = GUEST_SEED_SETS.reduce((n, s) => n + s.cards.length, 0);
    expect(cards.length).toBe(expectedCards);
  });
});

// ============================================================
describe('POST /api/auth/guest', () => {
  test('creates a guest with a token, seeded sets, and an expiry', async () => {
    const res = await request(app).post('/api/auth/guest').send({});
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.user.is_guest).toBeTruthy();
    expect(res.body.user.is_admin).toBeFalsy();
    expect(res.body.user.username).toMatch(/^guest_/);
    expect(res.body.user.expires_at).toBeTruthy();

    const setsRes = await request(app)
      .get('/api/sets')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(setsRes.status).toBe(200);
    expect(setsRes.body.length).toBe(2);
  });

  test('enforces the concurrent-guest cap (503 when full)', async () => {
    await setSetting('guest_max_concurrent', '2');
    await request(app).post('/api/auth/guest').send({});
    await request(app).post('/api/auth/guest').send({});
    const third = await request(app).post('/api/auth/guest').send({});
    expect(third.status).toBe(503);
    expect(third.body.error).toMatch(/full/i);
  });

  test('purges expired guests and frees a slot', async () => {
    await setSetting('guest_max_concurrent', '1');
    await request(app).post('/api/auth/guest').send({});
    await query("UPDATE users SET expires_at = datetime('now', '-1 minute') WHERE is_guest = TRUE", []);
    const next = await request(app).post('/api/auth/guest').send({});
    expect(next.status).toBe(201);
    const { rows } = await query('SELECT COUNT(*) AS n FROM users WHERE is_guest = TRUE', []);
    expect(Number(rows[0].n)).toBe(1);
  });
});

// ============================================================
describe('guest resource caps', () => {
  test('rejects creating more than 5 sets total', async () => {
    const token = await newGuestToken();
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post('/api/sets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Set ${i}`, cards: [{ front: 'a', back: 'b' }] });
      expect(ok.status).toBe(201);
    }
    const sixth = await request(app).post('/api/sets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too many', cards: [{ front: 'a', back: 'b' }] });
    expect(sixth.status).toBe(403);
    expect(sixth.body.error).toMatch(/5 sets/);
  });

  test('rejects creating a set with more than 100 cards', async () => {
    const token = await newGuestToken();
    const cards = Array.from({ length: 101 }, (_, i) => ({ front: `f${i}`, back: `b${i}` }));
    const res = await request(app).post('/api/sets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Big', cards });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/100 cards/);
  });

  test('clamps import to 5 sets / 100 cards per set', async () => {
    const token = await newGuestToken();
    const importSets = Array.from({ length: 8 }, (_, i) => ({
      name: `Imp ${i}`,
      cards: Array.from({ length: 150 }, (_, j) => ({ front: `f${i}-${j}`, back: `b${i}-${j}` })),
    }));
    const res = await request(app).post('/api/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ sets: importSets });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/limited/i);
  });

  test('non-guest users are not capped', async () => {
    const u = await query(
      "INSERT INTO users (username, password_hash) VALUES ('normal', 'x') RETURNING id", []
    );
    const token = generateToken();
    await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, u.rows[0].id]);
    for (let i = 0; i < 7; i++) {
      const r = await request(app).post('/api/sets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `N ${i}`, cards: [{ front: 'a', back: 'b' }] });
      expect(r.status).toBe(201);
    }
  });
});

// ============================================================
describe('guest logout', () => {
  test('deletes the guest account and its data', async () => {
    const res = await request(app).post('/api/auth/guest').send({});
    const token = res.body.token;
    const guestId = res.body.user.id;

    const out = await request(app).post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(200);

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [guestId]);
    expect(rows.length).toBe(0);
    const { rows: sets } = await query('SELECT * FROM sets WHERE user_id = $1', [guestId]);
    expect(sets.length).toBe(0);
  });
});

// ============================================================
describe('admin guest management', () => {
  test('GET /api/admin/guests lists active guests with counts', async () => {
    const { token } = await adminToken();
    const g = await request(app).post('/api/auth/guest').send({});

    const res = await request(app).get('/api/admin/guests')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toMatchObject({ id: g.body.user.id, username: g.body.user.username });
    expect(res.body[0].set_count).toBe(2);
    expect(res.body[0].card_count).toBe(11); // 6 greetings + 5 numbers
    expect(res.body[0].expires_at).toBeTruthy();
  });

  test('terminating a guest via DELETE /api/admin/users/:id wipes their data', async () => {
    const { token } = await adminToken();
    const g = await request(app).post('/api/auth/guest').send({});
    const del = await request(app).delete(`/api/admin/users/${g.body.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [g.body.user.id]);
    expect(rows.length).toBe(0);
  });

  test('GET/PUT /api/admin/settings reads and updates values', async () => {
    const { token } = await adminToken();
    const get1 = await request(app).get('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(get1.body).toMatchObject({ guest_ttl_minutes: 60, guest_max_concurrent: 10 });

    const put = await request(app).put('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ guest_ttl_minutes: 90, guest_max_concurrent: 5 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ guest_ttl_minutes: 90, guest_max_concurrent: 5 });
  });

  test('PUT /api/admin/settings rejects non-positive integers', async () => {
    const { token } = await adminToken();
    const put = await request(app).put('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ guest_ttl_minutes: 0 });
    expect(put.status).toBe(400);
  });
});
