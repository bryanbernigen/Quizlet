/**
 * API Integration Tests
 *
 * These tests spin up the Express app against a real SQLite database
 * (temp file per test run), seeding fresh data before each test case.
 *
 * The 'pg' module is mocked to prevent Postgres connection attempts.
 * The vi.mock calls here (at module level) ensure the mocks are registered
 * before any server modules are loaded.
 *
 * Run with: npx vitest run server/test/api.test.js
 */

// ─── Named imports (no default export needed from these) ───────────────────────
import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// ─── Mock pg Pool (must be first, before any server module loads) ──────────────
// The pg Pool is initialized at module load time in db.js.
// Mocking it here prevents ECONNREFUSED errors.
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


// ─── Deterministic crypto mock (tokens + password hashing) ───────────────────────
// Use a monotonic counter so each call gets a UNIQUE value regardless of timing.
let _counter = 0;
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    randomBytes(size) {
      const buf = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buf[i] = ((_counter++) * 37 + 17) % 256;
      }
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
import request from 'supertest';
import app from '../index.js';
import { query, initDb, hashPassword, generateToken } from '../db.js';

// ─── Test DB path ─────────────────────────────────────────────────────────────
const DB_PATH = path.join(os.tmpdir(), `quizlet-test-${process.pid}.db`);

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Reset all tables in correct FK dependency order. */
async function resetDb() {
  await query('PRAGMA foreign_keys = OFF', []);
  for (const t of ['quiz_history', 'sessions', 'cards', 'sets', 'users']) {
    await query(`DELETE FROM ${t}`, []);
  }
  await query('PRAGMA foreign_keys = ON', []);
}

/** Seed two users (regular + admin) and insert their session tokens. */
async function seedUsers() {
  const pw = 'testpassword123';
  const [rh, ah] = await Promise.all([hashPassword(pw), hashPassword(pw)]);
  const r = await query(
    'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, 0) RETURNING id, username, is_admin',
    ['testuser', rh]
  );
  const a = await query(
    'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, 1) RETURNING id, username, is_admin',
    ['adminuser', ah]
  );
  return { regular: r.rows[0], admin: a.rows[0], password: pw };
}

/** Insert a session token directly (bypasses the login endpoint). */
async function tokenFor(userId) {
  const token = generateToken();
  await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}

/** Create a set and return its id. */
async function mkSet(token, name, cards) {
  const r = await request(app)
    .post('/api/sets')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, cards: cards || [{ front: 'f', back: 'b' }] });
  return r.body.id;
}

// ─── Per-test state ───────────────────────────────────────────────────────────
let regularUser;
let adminUser;
let regularToken;
let adminToken;
const TEST_PW = 'testpassword123';

/** Authenticated request helper.
 * supertest API: request(app).METHOD(path).set(header, value).send(body)
 * The .set() call must come AFTER the HTTP method on the SuperTestRequest object.
 * We return a request-like object with a .set() method that adds the header then returns self.
 */
function as(token) {
  const req = request(app);
  // Wrap each HTTP method to inject the Authorization header
  const wrapped = {
    get(path) { return req.get(path).set('Authorization', `Bearer ${token}`); },
    post(path) { return req.post(path).set('Authorization', `Bearer ${token}`); },
    put(path) { return req.put(path).set('Authorization', `Bearer ${token}`); },
    patch(path) { return req.patch(path).set('Authorization', `Bearer ${token}`); },
    delete(path) { return req.delete(path).set('Authorization', `Bearer ${token}`); },
  };
  return wrapped;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
beforeAll(async () => { await initDb(); });

beforeEach(async () => {
  await resetDb();
  const seeded = await seedUsers();
  regularUser = seeded.regular;
  adminUser = seeded.admin;
  // Generate tokens SEQUENTIALLY (not in parallel) so the deterministic mock produces different values.
  // generateToken() is mocked to return the same bytes when called simultaneously (both calls
  // see counter=0), so we must call it one after the other.
  regularToken = await tokenFor(regularUser.id);
  adminToken = await tokenFor(adminUser.id);
});

afterAll(async () => { try { fs.unlinkSync(DB_PATH); } catch {} });

// ============================================================
// AUTH ENDPOINTS
// ============================================================
describe('POST /api/auth/login', () => {
  test('valid credentials → 200 + token + user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: TEST_PW });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.user).toMatchObject({ id: regularUser.id, username: 'testuser', is_admin: 0 });
  });

  test('invalid password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('unknown username → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: TEST_PW });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('missing username → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: TEST_PW });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  test('200 and token is invalidated', async () => {
    const res = await as(regularToken).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');

    const me = await as(regularToken).get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('valid token → 200 + user data', async () => {
    const res = await as(regularToken).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: regularUser.id, username: 'testuser', is_admin: 0 });
    expect(res.body).toHaveProperty('created_at');
  });

  test('no token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('invalid token → 401', async () => {
    const res = await as('invalid-token-xyz').get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// SETS CRUD
// ============================================================
describe('GET /api/sets', () => {
  test('empty → []', async () => {
    const res = await as(regularToken).get('/api/sets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('with data → array with required fields', async () => {
    await mkSet(regularToken, 'Test Set', [{ front: 'a', back: 'b' }]);

    const res = await as(regularToken).get('/api/sets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const s = res.body[0];
    expect(s).toMatchObject({ name: 'Test Set', user_id: regularUser.id });
    expect(s).toHaveProperty('is_shared');
    expect(s).toHaveProperty('copied_count');
    expect(s).toHaveProperty('original_set_id');
    expect(s).toHaveProperty('card_count', 1);
    expect(s).toHaveProperty('id');
  });

  test('only returns sets owned by authenticated user', async () => {
    await mkSet(regularToken, 'My Set', [{ front: 'a', back: 'b' }]);
    await mkSet(adminToken, 'Admin Set', [{ front: 'c', back: 'd' }]);

    const res = await as(regularToken).get('/api/sets');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('My Set');
  });
});

describe('POST /api/sets', () => {
  test('valid data → 201 + id', async () => {
    const res = await as(regularToken).post('/api/sets').send({
      name: 'New Set',
      cards: [{ front: 'hello', back: 'world' }, { front: 'foo', back: 'bar' }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.message).toBe('Set created successfully');
  });

  test('persists so it appears in GET /api/sets', async () => {
    await as(regularToken).post('/api/sets').send({
      name: 'Persisted',
      cards: [{ front: 'p', back: 'q' }],
    });
    const res = await as(regularToken).get('/api/sets');
    expect(res.body.some(s => s.name === 'Persisted')).toBe(true);
  });

  test('missing name → 400', async () => {
    const res = await as(regularToken).post('/api/sets').send({ cards: [{ front: 'a', back: 'b' }] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('missing cards → 400', async () => {
    const res = await as(regularToken).post('/api/sets').send({ name: 'No Cards' });
    expect(res.status).toBe(400);
  });

  test('empty cards → 400', async () => {
    const res = await as(regularToken).post('/api/sets').send({ name: 'Empty', cards: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sets/:id', () => {
  test('owner → 200', async () => {
    const id = await mkSet(regularToken, 'My Set', [{ front: 'a', back: 'b' }]);
    const res = await as(regularToken).get(`/api/sets/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('card_count', 1);
  });

  test('non-existent → 404', async () => {
    const res = await as(regularToken).get('/api/sets/99999');
    expect(res.status).toBe(404);
  });

  test('another user → 404', async () => {
    const adminId = await mkSet(adminToken, 'Admin Private', [{ front: 'x', back: 'y' }]);
    const res = await as(regularToken).get(`/api/sets/${adminId}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sets/:id/cards', () => {
  test('200 + cards array', async () => {
    const id = await mkSet(regularToken, 'Cards Set', [
      { front: 'frontA', back: 'backA' },
      { front: 'frontB', back: 'backB' },
    ]);
    const res = await as(regularToken).get(`/api/sets/${id}/cards`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('front');
    expect(res.body[0]).toHaveProperty('back');
    expect(res.body[0]).toHaveProperty('familiarity', 'unfamiliar');
  });

  test('non-owner → 404', async () => {
    const id = await mkSet(regularToken, 'Private Cards', [{ front: 'a', back: 'b' }]);
    const res = await as(adminToken).get(`/api/sets/${id}/cards`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/sets/:id', () => {
  test('200 + updated set', async () => {
    const id = await mkSet(regularToken, 'Original', [{ front: 'old', back: 'oldb' }]);
    const res = await as(regularToken).put(`/api/sets/${id}`).send({
      name: 'Updated',
      cards: [{ front: 'new', back: 'newb' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Set updated successfully');
  });

  test('persists card update', async () => {
    const id = await mkSet(regularToken, 'Update Test', [{ front: 'old', back: 'oldb' }]);
    await as(regularToken).put(`/api/sets/${id}`).send({
      name: 'Updated',
      cards: [{ front: 'new', back: 'newb' }],
    });
    const cards = await as(regularToken).get(`/api/sets/${id}/cards`);
    expect(cards.body).toHaveLength(1);
    expect(cards.body[0].front).toBe('new');
  });

  test('update with multiple cards uses correct placeholders', async () => {
    const id = await mkSet(regularToken, 'Multi Card', [{ front: 'old', back: 'oldb' }]);
    const res = await as(regularToken).put(`/api/sets/${id}`).send({
      name: 'Multi Update',
      cards: [
        { front: 'card1 front', back: 'card1 back' },
        { front: 'card2 front', back: 'card2 back' },
        { front: 'card3 front', back: 'card3 back' },
      ],
    });
    expect(res.status).toBe(200);
    const cards = await as(regularToken).get(`/api/sets/${id}/cards`);
    expect(cards.body).toHaveLength(3);
    expect(cards.body.map(c => c.front).sort()).toEqual(['card1 front', 'card2 front', 'card3 front']);
  });

  test('missing name → 400', async () => {
    const id = await mkSet(regularToken, 'No Name', [{ front: 'a', back: 'b' }]);
    const res = await as(regularToken).put(`/api/sets/${id}`).send({});
    expect(res.status).toBe(400);
  });

  test('non-existent → 404', async () => {
    const res = await as(regularToken).put('/api/sets/99999').send({ name: 'Fake' });
    expect(res.status).toBe(404);
  });

  test('another user → 403', async () => {
    const adminId = await mkSet(adminToken, 'Admin Set', [{ front: 'x', back: 'y' }]);
    const res = await as(regularToken).put(`/api/sets/${adminId}`).send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  test('new cards default to unfamiliar familiarity', async () => {
    const id = await mkSet(regularToken, 'Defaults', [{ front: 'a', back: 'b' }]);
    await as(regularToken).put(`/api/sets/${id}`).send({
      name: 'Updated',
      cards: [{ front: 'added', back: 'addedb' }],
    });
    const cards = await as(regularToken).get(`/api/sets/${id}/cards`);
    expect(cards.body[0].familiarity).toBe('unfamiliar');
  });
});

describe('DELETE /api/sets/:id', () => {
  test('owner → 200 and removes set', async () => {
    const id = await mkSet(regularToken, 'To Delete', [{ front: 'a', back: 'b' }]);
    const res = await as(regularToken).delete(`/api/sets/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Set deleted');

    const list = await as(regularToken).get('/api/sets');
    expect(list.body).toHaveLength(0);
  });

  test('another user → 403', async () => {
    const adminId = await mkSet(adminToken, 'Admin Deletable', [{ front: 'x', back: 'y' }]);
    const res = await as(regularToken).delete(`/api/sets/${adminId}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// SHARING
// ============================================================
describe('POST /api/sets/:id/share', () => {
  test('enable → 200 + shareUrl + shareToken', async () => {
    const id = await mkSet(regularToken, 'Share Me', [{ front: 'a', back: 'b' }]);
    const res = await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.shareUrl).toMatch(/^\/shared\//);
    expect(res.body.shareToken).toMatch(/^[a-f0-9]{32}$/);
  });

  test('no auth → 401', async () => {
    const id = await mkSet(regularToken, 'Unauth Share', [{ front: 'a', back: 'b' }]);
    const res = await request(app).post(`/api/sets/${id}/share`).send({ enabled: true });
    expect(res.status).toBe(401);
  });

  test('disable → 200 + shareUrl: null', async () => {
    const id = await mkSet(regularToken, 'Toggle Share', [{ front: 'a', back: 'b' }]);
    await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: true });
    const res = await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.shareUrl).toBeNull();
    expect(res.body.shareToken).toBeNull();
  });

  test('updates is_shared on set', async () => {
    const id = await mkSet(regularToken, 'Is Shared Check', [{ front: 'a', back: 'b' }]);
    await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: true });
    const list = await as(regularToken).get('/api/sets');
    expect(list.body[0].is_shared).toBe(true);
  });
});

describe('GET /api/shared/:shareToken', () => {
  test('valid token → 200 + set + cards (anonymous)', async () => {
    const id = await mkSet(regularToken, 'Shared Anon', [{ front: 'sf1', back: 'sb1' }, { front: 'sf2', back: 'sb2' }]);
    const { body: { shareToken } } = await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: true });

    const res = await request(app).get(`/api/shared/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.set).toMatchObject({ name: 'Shared Anon', card_count: 2 });
    expect(res.body.cards).toHaveLength(2);
  });

  test('invalid token → 404', async () => {
    const res = await request(app).get('/api/shared/invalid-token-xyz');
    expect(res.status).toBe(404);
  });

  test('disabled → 404', async () => {
    const id = await mkSet(regularToken, 'Disabled Share', [{ front: 'a', back: 'b' }]);
    const { body: { shareToken } } = await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: true });
    await as(regularToken).post(`/api/sets/${id}/share`).send({ enabled: false });

    const res = await request(app).get(`/api/shared/${shareToken}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/shared/:shareToken/copy', () => {
  let srcId, shareToken;

  beforeEach(async () => {
    srcId = await mkSet(regularToken, 'Copy Source', [{ front: 'cf1', back: 'cb1' }]);
    const r = await as(regularToken).post(`/api/sets/${srcId}/share`).send({ enabled: true });
    shareToken = r.body.shareToken;
  });

  test('auth → 201 + newSetId', async () => {
    const res = await as(adminToken).post(`/api/shared/${shareToken}/copy`);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('newSetId');
  });

  test('no auth → 401', async () => {
    const res = await request(app).post(`/api/shared/${shareToken}/copy`);
    expect(res.status).toBe(401);
  });

  test('copied set has original_set_id reference', async () => {
    const { body: { newSetId } } = await as(adminToken).post(`/api/shared/${shareToken}/copy`);
    const sets = (await as(adminToken).get('/api/sets')).body;
    expect(sets.find(s => s.id === newSetId)?.original_set_id).toBe(srcId);
  });

  test('original set copied_count increments', async () => {
    const before = (await as(regularToken).get('/api/sets')).body[0].copied_count;
    await as(adminToken).post(`/api/shared/${shareToken}/copy`);
    const after = (await as(regularToken).get('/api/sets')).body[0].copied_count;
    expect(after).toBe(before + 1);
  });

  test('copied set contains cards from source', async () => {
    const { body: { newSetId } } = await as(adminToken).post(`/api/shared/${shareToken}/copy`);
    const cards = (await as(adminToken).get(`/api/sets/${newSetId}/cards`)).body;
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('cf1');
  });
});

// ============================================================
// REVIEW & QUIZ
// ============================================================
describe('GET /api/cards/review', () => {
  let setId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Review Set', [
      { front: 'rf1', back: 'rb1' },
      { front: 'rf2', back: 'rb2' },
      { front: 'rf3', back: 'rb3' },
    ]);
  });

  test('with setIds → 200 + cards array', async () => {
    const res = await as(regularToken).get(`/api/cards/review?setIds=${setId}&count=10`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('missing setIds → 400', async () => {
    const res = await as(regularToken).get('/api/cards/review');
    expect(res.status).toBe(400);
  });

  test('unknown set → empty array', async () => {
    const res = await as(regularToken).get('/api/cards/review?setIds=99999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/cards/quiz', () => {
  let setId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Quiz Set', [{ front: 'qf1', back: 'qb1' }, { front: 'qf2', back: 'qb2' }]);
  });

  test('with setIds → 200 + cards array', async () => {
    const res = await as(regularToken).get(`/api/cards/quiz?setIds=${setId}&count=10`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('missing setIds → 400', async () => {
    const res = await as(regularToken).get('/api/cards/quiz');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/cards/:id/familiarity', () => {
  let setId, cardId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Fam Set', [{ front: 'fam1', back: 'fam1b' }]);
    const r = await as(regularToken).get(`/api/sets/${setId}/cards`);
    cardId = r.body[0].id;
  });

  test('200 and updates card', async () => {
    const res = await as(regularToken).post(`/api/cards/${cardId}/familiarity`).send({ familiarity: 'familiar' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Updated');

    const cards = await as(regularToken).get(`/api/sets/${setId}/cards`);
    expect(cards.body[0].familiarity).toBe('familiar');
  });

  test('invalid familiarity → 400', async () => {
    const res = await as(regularToken).post(`/api/cards/${cardId}/familiarity`).send({ familiarity: 'unknown' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/cards/:id/quiz-result', () => {
  let setId, cardId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Quiz Result Set', [{ front: 'qr1', back: 'qr1b' }]);
    const r = await as(regularToken).get(`/api/sets/${setId}/cards`);
    cardId = r.body[0].id;
  });

  test('correct → correct_count increments', async () => {
    await as(regularToken).post(`/api/cards/${cardId}/quiz-result`).send({ isCorrect: true });
    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].correct_count).toBe(1);
  });

  test('incorrect → incorrect_count increments', async () => {
    await as(regularToken).post(`/api/cards/${cardId}/quiz-result`).send({ isCorrect: false });
    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].incorrect_count).toBe(1);
  });

  test('both counts updated independently', async () => {
    await as(regularToken).post(`/api/cards/${cardId}/quiz-result`).send({ isCorrect: true });
    await as(regularToken).post(`/api/cards/${cardId}/quiz-result`).send({ isCorrect: false });
    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].correct_count).toBe(1);
    expect(cards[0].incorrect_count).toBe(1);
  });
});

// ============================================================
// WORD BROWSER & STATS
// ============================================================
describe('GET /api/cards/browse', () => {
  let setId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Browse Set', [
      { front: 'bf1', back: 'bb1' },
      { front: 'bf2', back: 'bb2' },
      { front: 'bf3', back: 'bb3' },
    ]);
    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    await as(regularToken).patch(`/api/cards/${cards[0].id}/familiarity`).send({ familiarity: 'familiar' });
  });

  test('200 + paginated cards', async () => {
    const res = await as(regularToken).get('/api/cards/browse');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(3);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 3, totalPages: 1 });
  });

  test('limit + page params respected', async () => {
    const res = await as(regularToken).get('/api/cards/browse?limit=2&page=1');
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  test('familiarity filter works', async () => {
    const res = await as(regularToken).get('/api/cards/browse?familiarity=familiar');
    expect(res.body.data.every(c => c.familiarity === 'familiar')).toBe(true);
  });

  test('unknown familiarity → empty', async () => {
    const res = await as(regularToken).get('/api/cards/browse?familiarity=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('includes set_name', async () => {
    const res = await as(regularToken).get('/api/cards/browse');
    expect(res.body.data[0]).toHaveProperty('set_name', 'Browse Set');
  });
});

describe('PATCH /api/cards/:id/familiarity', () => {
  let setId, cardId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Patch Fam Set', [{ front: 'pf1', back: 'pb1' }]);
    const r = await as(regularToken).get(`/api/sets/${setId}/cards`);
    cardId = r.body[0].id;
  });

  test('200 and updates card', async () => {
    const res = await as(regularToken).patch(`/api/cards/${cardId}/familiarity`).send({ familiarity: 'neutral' });
    expect(res.status).toBe(200);

    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].familiarity).toBe('neutral');
  });

  test('invalid → 400', async () => {
    const res = await as(regularToken).patch(`/api/cards/${cardId}/familiarity`).send({ familiarity: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('non-existent card → 404', async () => {
    const res = await as(regularToken).patch('/api/cards/99999/familiarity').send({ familiarity: 'familiar' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/stats', () => {
  beforeEach(async () => {
    await mkSet(regularToken, 'Stats Set', [{ front: 'sf1', back: 'sb1' }, { front: 'sf2', back: 'sb2' }]);
  });

  test('200 + stats object', async () => {
    const res = await as(regularToken).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalSets: 1, totalCards: 2 });
    expect(res.body).toHaveProperty('familiarity');
    expect(res.body).toHaveProperty('troubleWords');
  });

  test('no auth → 401', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/export', () => {
  beforeEach(async () => {
    await mkSet(regularToken, 'Export Set', [{ front: 'ef1', back: 'eb1' }]);
  });

  test('200 + JSON blob', async () => {
    const res = await as(regularToken).get('/api/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ version: 1 });
    expect(res.body).toHaveProperty('exportedAt');
    expect(res.body).toHaveProperty('sets');
    expect(Array.isArray(res.body.sets)).toBe(true);
  });

  test('sets contain card data with all fields', async () => {
    const res = await as(regularToken).get('/api/export');
    const set = res.body.sets[0];
    expect(set.name).toBe('Export Set');
    expect(set.cards[0]).toMatchObject({ front: 'ef1', back: 'eb1' });
    expect(set.cards[0]).toHaveProperty('familiarity');
    expect(set.cards[0]).toHaveProperty('correct_count');
    expect(set.cards[0]).toHaveProperty('incorrect_count');
  });
});

describe('POST /api/import', () => {
  test('valid data → 201', async () => {
    const res = await as(regularToken).post('/api/import').send({
      sets: [{ name: 'Imported Set', cards: [{ front: 'i1', back: 'i1b' }, { front: 'i2', back: 'i2b' }] }],
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  test('invalid format → 400', async () => {
    const res = await as(regularToken).post('/api/import').send({ sets: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  test('empty sets → 200', async () => {
    const res = await as(regularToken).post('/api/import').send({ sets: [] });
    expect(res.status).toBe(200);
    expect(res.body.setsCreated).toBe(0);
  });

  test('imported sets appear in GET /api/sets', async () => {
    await as(regularToken).post('/api/import').send({
      sets: [{ name: 'Imported Check', cards: [{ front: 'x', back: 'y' }] }],
    });
    const res = await as(regularToken).get('/api/sets');
    expect(res.body.some(s => s.name === 'Imported Check')).toBe(true);
  });

  test('updates existing sets with same name', async () => {
    await mkSet(regularToken, 'Dup Import', [{ front: 'original', back: 'card' }]);
    const res = await as(regularToken).post('/api/import').send({
      sets: [{ name: 'Dup Import', cards: [{ front: 'imported', back: 'card' }] }],
    });
    expect(res.body.setsCreated).toBe(0);
    expect(res.body.setsUpdated).toBe(1);
  });
});

// ============================================================
// ADMIN
// ============================================================
describe('GET /api/admin/users', () => {
  test('admin → 200 + user list', async () => {
    const res = await as(adminToken).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('non-admin → 403', async () => {
    const res = await as(regularToken).get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  test('no auth → 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/users', () => {
  test('admin → 201 + created user', async () => {
    const res = await as(adminToken).post('/api/admin/users').send({
      username: 'newuser',
      password: 'newpassword123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'newuser', is_admin: 0 });
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('created_at');
  });

  test('create admin user → is_admin: 1', async () => {
    const res = await as(adminToken).post('/api/admin/users').send({
      username: 'newadmin',
      password: 'newpassword123',
      is_admin: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.is_admin).toBe(1);
  });

  test('short password → 400', async () => {
    const res = await as(adminToken).post('/api/admin/users').send({
      username: 'shortpwuser',
      password: '1234567',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/i);
  });

  test('short username → 400', async () => {
    const res = await as(adminToken).post('/api/admin/users').send({
      username: 'ab',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 3 characters/i);
  });

  test('duplicate username → 409', async () => {
    await as(adminToken).post('/api/admin/users').send({ username: 'taken', password: 'password123' });
    const res = await as(adminToken).post('/api/admin/users').send({ username: 'taken', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('non-admin → 403', async () => {
    const res = await as(regularToken).post('/api/admin/users').send({
      username: 'hacker',
      password: 'password123',
    });
    expect(res.status).toBe(403);
  });

  test('newly created user can log in', async () => {
    await as(adminToken).post('/api/admin/users').send({ username: 'logintest', password: 'password123' });
    const login = await request(app).post('/api/auth/login').send({ username: 'logintest', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body).toHaveProperty('token');
  });
});

describe('DELETE /api/admin/users/:id', () => {
  test('delete another user → 200', async () => {
    const { body: { user: { id } } } = await as(adminToken).post('/api/admin/users').send({
      username: 'todelete',
      password: 'password123',
    });
    const res = await as(adminToken).delete(`/api/admin/users/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User deleted');
  });

  test('deleted user cannot log in', async () => {
    const { body: { user: { id } } } = await as(adminToken).post('/api/admin/users').send({
      username: 'todelete2',
      password: 'password123',
    });
    await as(adminToken).delete(`/api/admin/users/${id}`);
    const login = await request(app).post('/api/auth/login').send({ username: 'todelete2', password: 'password123' });
    expect(login.status).toBe(401);
  });

  test('delete self → 403', async () => {
    const res = await as(adminToken).delete(`/api/admin/users/${adminUser.id}`);
    expect(res.status).toBe(403);
  });

  test('non-admin → 403', async () => {
    const { body: { user: { id } } } = await as(adminToken).post('/api/admin/users').send({
      username: 'todelete3',
      password: 'password123',
    });
    const res = await as(regularToken).delete(`/api/admin/users/${id}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// AUTH GUARDS
// ============================================================
describe('Auth guards on mutation endpoints', () => {
  test('GET /api/sets → 401', async () => {
    expect((await request(app).get('/api/sets')).status).toBe(401);
  });
  test('POST /api/sets → 401', async () => {
    expect((await request(app).post('/api/sets').send({ name: 'X', cards: [] })).status).toBe(401);
  });
  test('PUT /api/sets/:id → 401', async () => {
    expect((await request(app).put('/api/sets/1').send({ name: 'X' })).status).toBe(401);
  });
  test('DELETE /api/sets/:id → 401', async () => {
    expect((await request(app).delete('/api/sets/1')).status).toBe(401);
  });
  test('POST /api/sets/:id/share → 401', async () => {
    expect((await request(app).post('/api/sets/1/share').send({ enabled: true })).status).toBe(401);
  });
  test('POST /api/cards/:id/familiarity → 401', async () => {
    expect((await request(app).post('/api/cards/1/familiarity').send({ familiarity: 'familiar' })).status).toBe(401);
  });
  test('POST /api/shared/:shareToken/copy → 401', async () => {
    expect((await request(app).post('/api/shared/abc123/copy')).status).toBe(401);
  });
  test('GET /api/stats → 401', async () => {
    expect((await request(app).get('/api/stats')).status).toBe(401);
  });
  test('GET /api/export → 401', async () => {
    expect((await request(app).get('/api/export')).status).toBe(401);
  });
  test('POST /api/import → 401', async () => {
    expect((await request(app).post('/api/import').send({ sets: [] })).status).toBe(401);
  });
  test('GET /api/cards/browse → 401', async () => {
    expect((await request(app).get('/api/cards/browse')).status).toBe(401);
  });
  test('PATCH /api/cards/:id/familiarity → 401', async () => {
    expect((await request(app).patch('/api/cards/1/familiarity').send({ familiarity: 'familiar' })).status).toBe(401);
  });
  test('GET /api/cards/review → 401', async () => {
    expect((await request(app).get('/api/cards/review?setIds=1')).status).toBe(401);
  });
  test('GET /api/cards/quiz → 401', async () => {
    expect((await request(app).get('/api/cards/quiz?setIds=1')).status).toBe(401);
  });
  test('POST /api/cards/:id/quiz-result → 401', async () => {
    expect((await request(app).post('/api/cards/1/quiz-result').send({ isCorrect: true })).status).toBe(401);
  });
});

describe('Ownership guards', () => {
  test('PUT by non-owner → 403', async () => {
    const adminId = await mkSet(adminToken, 'Admin Set', [{ front: 'a', back: 'b' }]);
    const res = await as(regularToken).put(`/api/sets/${adminId}`).send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  test('DELETE by non-owner → 403', async () => {
    const adminId = await mkSet(adminToken, 'Admin Deletable', [{ front: 'a', back: 'b' }]);
    const res = await as(regularToken).delete(`/api/sets/${adminId}`);
    expect(res.status).toBe(403);
  });

  test('owner can access own set but not others', async () => {
    const myId = await mkSet(regularToken, 'My Private', [{ front: 'a', back: 'b' }]);
    const adminId = await mkSet(adminToken, 'Admin Private', [{ front: 'c', back: 'd' }]);

    expect((await as(regularToken).get(`/api/sets/${myId}`)).status).toBe(200);
    expect((await as(regularToken).get(`/api/sets/${adminId}`)).status).toBe(404);
    expect((await as(adminToken).get(`/api/sets/${adminId}`)).status).toBe(200);
  });
});
