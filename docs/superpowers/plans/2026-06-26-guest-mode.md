# Guest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-boxed guest mode — visitors start a 1-hour throwaway session with seeded sample content and capped resources, limited to N concurrent guests, with an admin view to monitor and terminate them.

**Architecture:** A guest is a row in the existing `users` table (`is_guest` + `expires_at` columns), so all existing ownership, `ON DELETE CASCADE`, session-auth, and admin-delete machinery is reused. Wiping a guest = deleting its user row. Expired guests are purged lazily (on guest creation, login, and admin list views). TTL and max-concurrent are stored in a new `app_settings` key-value table and are admin-editable.

**Tech Stack:** Node/Express 5, dual driver `better-sqlite3` (dev/test) + `pg` (prod) via `server/db.js`, React 19 + react-router 7 + framer-motion, Vitest + supertest (server) and Vitest + @testing-library/react (client).

## Global Constraints

- **Dual-driver SQL only.** Every query must work under both SQLite and Postgres. Use the existing helpers in `server/index.js`: `now()`, `int(expr)`, `float(expr)`. Booleans bind as `TRUE`/`FALSE` literals (db.js coerces for SQLite). `RETURNING` is supported by the db.js shim.
- **Guest caps are fixed constants** (not settings): `GUEST_MAX_SETS = 5`, `GUEST_MAX_CARDS_PER_SET = 100`.
- **Admin-editable settings:** `guest_ttl_minutes` (default `60`), `guest_max_concurrent` (default `10`). Stored as TEXT in `app_settings`, parsed as positive integers.
- **Token storage key on the client is `koreaquiz_token`** (matches existing `AuthContext`).
- **Tests run with:** `npx vitest run <path>`. Server tests live in `server/test/`, client tests in `src/test/`.
- **Commit after every task** with a `feat:`/`test:` message.
- **No timestamp-format drift:** never store JS `Date().toISOString()` into `expires_at`. Always compute expiry in SQL so it matches the `datetime('now')` / `NOW()` format already used, keeping `expires_at > now()` comparisons valid.

---

## File Structure

**Backend**
- `server/db.js` (modify) — schema migrations for `users.is_guest`, `users.expires_at`, the `app_settings` table + seed, new index; add `getSetting`/`setSetting` helpers.
- `server/guestSeed.js` (create) — hardcoded sample sets + `seedGuestContent(client, userId)`.
- `server/index.js` (modify) — expiry SQL helper, `purgeExpiredGuests()`, `POST /api/auth/guest`, guest caps in set/import write paths, guest-aware logout, `me` payload additions, `GET /api/admin/guests`, `GET/PUT /api/admin/settings`.

**Frontend**
- `src/context/AuthContext.jsx` (modify) — `loginAsGuest()`; user object carries `is_guest`/`expires_at` from `/api/auth/me`.
- `src/pages/LoginPage.jsx` (modify) — "Continue as guest" button + 503 handling.
- `src/components/GuestBanner.jsx` (create) — countdown banner + expiry redirect.
- `src/App.jsx` (modify) — render `<GuestBanner />` when `user?.is_guest`.
- `src/pages/ProfilePage.jsx` (modify) — Active Guests table + settings inputs.

**Tests**
- `server/test/guest.test.js` (create) — all backend guest behavior.
- `src/test/GuestBanner.test.jsx` (create), plus additions to `src/test/LoginPage.test.jsx`.

---

### Task 1: Schema migrations + settings helpers

**Files:**
- Modify: `server/db.js` (both `initDbPostgres` and `initDbSqlite`; add exported helpers near the bottom)
- Test: `server/test/guest.test.js` (create)

**Interfaces:**
- Produces: exported `async getSetting(key, defaultValue)` → `Promise<string>`; exported `async setSetting(key, value)` → `Promise<void>`. New columns `users.is_guest`, `users.expires_at`; table `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`.

- [ ] **Step 1: Write the failing test**

Create `server/test/guest.test.js`. It reuses the same mock/bootstrap preamble as `server/test/api.test.js` (copy the `vi.mock('pg', …)`, the deterministic `crypto` mock, and imports). Start with just the settings test:

```js
// server/test/guest.test.js
import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

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

import path from 'path';
import os from 'os';
import fs from 'fs';
import request from 'supertest';
import app from '../index.js';
import { query, initDb, getSetting, setSetting } from '../db.js';

const DB_PATH = path.join(os.tmpdir(), `quizlet-guest-test-${process.pid}.db`);

async function resetDb() {
  await query('PRAGMA foreign_keys = OFF', []);
  for (const t of ['quiz_history', 'sessions', 'cards', 'sets', 'users']) {
    await query(`DELETE FROM ${t}`, []);
  }
  await query('PRAGMA foreign_keys = ON', []);
}

beforeAll(async () => { await initDb(); });
beforeEach(async () => { await resetDb(); });
afterAll(async () => { try { fs.unlinkSync(DB_PATH); } catch {} });

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/guest.test.js`
Expected: FAIL — `getSetting is not a function` (or import error).

- [ ] **Step 3: Add columns + table + seed in `initDbPostgres`**

In `server/db.js`, inside `initDbPostgres()`, after the existing `sessions.expires_at` migration block (around line 216) add:

```js
  // Guest-mode columns on users
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='users' AND column_name='is_guest') THEN
        ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='users' AND column_name='expires_at') THEN
        ALTER TABLE users ADD COLUMN expires_at TIMESTAMPTZ;
      END IF;
    END $$
  `);

  // Key-value settings store
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('guest_ttl_minutes', '60')
     ON CONFLICT (key) DO NOTHING`
  );
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('guest_max_concurrent', '10')
     ON CONFLICT (key) DO NOTHING`
  );
```

Then add to the Postgres index loop (around line 280):

```js
    'CREATE INDEX IF NOT EXISTS idx_users_is_guest_expires ON users(is_guest, expires_at)',
```

- [ ] **Step 4: Add the same in `initDbSqlite`**

In `initDbSqlite()`, after the `sessions.expires_at` migration block (around line 354) add:

```js
  // Guest-mode columns on users
  const userCols2 = sqliteDb.pragma('table_info(users)').map(c => c.name);
  if (!userCols2.includes('is_guest')) {
    sqliteDb.exec('ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols2.includes('expires_at')) {
    sqliteDb.exec('ALTER TABLE users ADD COLUMN expires_at TEXT');
  }

  // Key-value settings store
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  sqliteDb.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('guest_ttl_minutes', '60')
     ON CONFLICT (key) DO NOTHING`
  ).run();
  sqliteDb.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('guest_max_concurrent', '10')
     ON CONFLICT (key) DO NOTHING`
  ).run();
  sqliteDb.exec('CREATE INDEX IF NOT EXISTS idx_users_is_guest_expires ON users(is_guest, expires_at)');
```

- [ ] **Step 5: Add the `getSetting`/`setSetting` helpers**

At the end of `server/db.js` add:

```js
// ==================== APP SETTINGS ====================

export async function getSetting(key, defaultValue) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows.length > 0 ? rows[0].value : defaultValue;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, String(value)]
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/test/guest.test.js`
Expected: PASS (3 settings tests).

- [ ] **Step 7: Commit**

```bash
git add server/db.js server/test/guest.test.js
git commit -m "feat: app_settings store and guest columns on users"
```

---

### Task 2: Guest seed content module

**Files:**
- Create: `server/guestSeed.js`
- Test: add a `describe('seedGuestContent')` block to `server/test/guest.test.js`

**Interfaces:**
- Consumes: a transaction `client` (from `getClient()`, exposes `.query(text, params)`).
- Produces: `export const GUEST_SEED_SETS` (array of `{ name, cards: [{front, back}] }`); `export async function seedGuestContent(client, userId)` — inserts the seed sets + cards owned by `userId` using the passed client.

- [ ] **Step 1: Write the failing test**

Add to `server/test/guest.test.js`:

```js
import { getClient } from '../db.js';
import { seedGuestContent, GUEST_SEED_SETS } from '../guestSeed.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/guest.test.js`
Expected: FAIL — cannot find module `../guestSeed.js`.

- [ ] **Step 3: Create `server/guestSeed.js`**

```js
// Hardcoded sample content seeded into every new guest account so that
// review/quiz/spelling are immediately usable. Kept small and on-theme
// (Korean ⇄ Indonesian, matching the app).

export const GUEST_SEED_SETS = [
  {
    name: 'Greetings (Demo)',
    cards: [
      { front: '안녕하세요', back: 'Halo / Apa kabar' },
      { front: '감사합니다', back: 'Terima kasih' },
      { front: '죄송합니다', back: 'Maaf' },
      { front: '네', back: 'Ya' },
      { front: '아니요', back: 'Tidak' },
      { front: '안녕히 가세요', back: 'Selamat jalan' },
    ],
  },
  {
    name: 'Numbers 1–5 (Demo)',
    cards: [
      { front: '하나', back: 'Satu' },
      { front: '둘', back: 'Dua' },
      { front: '셋', back: 'Tiga' },
      { front: '넷', back: 'Empat' },
      { front: '다섯', back: 'Lima' },
    ],
  },
];

/**
 * Insert the seed sets and their cards for `userId` using an open
 * transaction `client`. Caller owns BEGIN/COMMIT/ROLLBACK.
 */
export async function seedGuestContent(client, userId) {
  for (const set of GUEST_SEED_SETS) {
    const { rows } = await client.query(
      'INSERT INTO sets (name, user_id) VALUES ($1, $2) RETURNING id',
      [set.name, userId]
    );
    const setId = rows[0].id;
    if (set.cards.length > 0) {
      const placeholders = set.cards
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
        .join(', ');
      const flat = set.cards.flatMap(c => [setId, c.front, c.back]);
      await client.query(
        `INSERT INTO cards (set_id, front, back) VALUES ${placeholders}`,
        flat
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/guest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/guestSeed.js server/test/guest.test.js
git commit -m "feat: guest seed content module"
```

---

### Task 3: `POST /api/auth/guest` + lazy purge + expiry helper

**Files:**
- Modify: `server/index.js` (helpers near top ~line 9; new endpoint after the logout endpoint ~line 85; update `/api/auth/me` ~line 87)
- Test: add `describe('POST /api/auth/guest')` to `server/test/guest.test.js`

**Interfaces:**
- Consumes: `getSetting` (Task 1), `seedGuestContent` (Task 2), existing `getClient`, `generateToken`, `hashPassword`.
- Produces: `async purgeExpiredGuests()` (module-internal); `POST /api/auth/guest` → `201 { token, user: { id, username, is_admin:false, is_guest:true, expires_at } }` or `503 { error }`. Constants `GUEST_MAX_SETS = 5`, `GUEST_MAX_CARDS_PER_SET = 100` exported-internal.

- [ ] **Step 1: Write the failing test**

Add to `server/test/guest.test.js`:

```js
describe('POST /api/auth/guest', () => {
  test('creates a guest with a token, seeded sets, and an expiry', async () => {
    const res = await request(app).post('/api/auth/guest').send({});
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.user.is_guest).toBeTruthy();
    expect(res.body.user.is_admin).toBeFalsy();
    expect(res.body.user.username).toMatch(/^guest_/);
    expect(res.body.user.expires_at).toBeTruthy();

    // Token works and seeded sets are visible.
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
    // Force the existing guest to be expired.
    await query("UPDATE users SET expires_at = datetime('now', '-1 minute') WHERE is_guest = TRUE", []);
    const next = await request(app).post('/api/auth/guest').send({});
    expect(next.status).toBe(201);
    // Only one active guest remains (the expired one was purged).
    const { rows } = await query('SELECT COUNT(*) AS n FROM users WHERE is_guest = TRUE', []);
    expect(Number(rows[0].n)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/guest.test.js`
Expected: FAIL — `POST /api/auth/guest` returns 404.

- [ ] **Step 3: Add helpers + imports near the top of `server/index.js`**

Update the import on line 4 to include the new helpers:

```js
import { query, getClient, initDb, hashPassword, verifyPassword, generateToken, getSetting, setSetting } from './db.js';
import { seedGuestContent } from './guestSeed.js';
```

After the existing `now()/int()/float()` helpers (after line 9) add:

```js
// Guest resource caps (fixed; not admin-editable)
const GUEST_MAX_SETS = 5;
const GUEST_MAX_CARDS_PER_SET = 100;

// Cross-driver "now + N minutes" expression. $idx is the bound minutes param.
const inMinutes = (idx) => process.env.DB_TYPE === 'sqlite'
  ? `datetime('now', '+' || $${idx} || ' minutes')`
  : `(NOW() + ($${idx} || ' minutes')::interval)`;

// Delete guests whose timer has elapsed. The user-row cascade removes their
// sets, cards, quiz_history, and sessions. Called before any guest count.
async function purgeExpiredGuests() {
  await query(`DELETE FROM users WHERE is_guest = TRUE AND expires_at < ${now()}`, []);
}
```

- [ ] **Step 4: Add the endpoint after the logout endpoint (after line 85)**

```js
app.post('/api/auth/guest', async (_req, res) => {
  await purgeExpiredGuests();

  const maxConcurrent = parseInt(await getSetting('guest_max_concurrent', '10'), 10) || 10;
  const { rows: countRows } = await query(
    `SELECT ${int('COUNT(*)')} AS n FROM users WHERE is_guest = TRUE AND expires_at > ${now()}`,
    []
  );
  if (Number(countRows[0].n) >= maxConcurrent) {
    return res.status(503).json({ error: 'Guest spots are full, please try again shortly.' });
  }

  const ttlMinutes = parseInt(await getSetting('guest_ttl_minutes', '60'), 10) || 60;
  const username = `guest_${crypto.randomBytes(3).toString('hex')}`;
  const throwawayHash = await hashPassword(crypto.randomBytes(16).toString('hex'));

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, is_admin, is_guest, expires_at)
       VALUES ($1, $2, FALSE, TRUE, ${inMinutes(3)}) RETURNING id, username, expires_at`,
      [username, throwawayHash, ttlMinutes]
    );
    const guest = rows[0];

    await seedGuestContent(client, guest.id);

    const token = generateToken();
    await client.query(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, ${inMinutes(3)})`,
      [token, guest.id, ttlMinutes]
    );

    await client.query('COMMIT');
    res.status(201).json({
      token,
      user: { id: guest.id, username: guest.username, is_admin: false, is_guest: true, expires_at: guest.expires_at },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
```

- [ ] **Step 5: Add is_guest/expires_at to `/api/auth/me`**

Change the query in `app.get('/api/auth/me', …)` (line ~88) to:

```js
  const { rows } = await query(
    'SELECT id, username, is_admin, is_guest, expires_at, created_at FROM users WHERE id = $1',
    [req.userId]
  );
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/test/guest.test.js`
Expected: PASS (guest creation, cap, purge tests).

- [ ] **Step 7: Run the full server suite (no regressions)**

Run: `npx vitest run server/`
Expected: PASS (existing `api.test.js` still green; `/api/auth/me` now returns extra fields, which existing tests tolerate via `toMatchObject`).

- [ ] **Step 8: Commit**

```bash
git add server/index.js server/test/guest.test.js
git commit -m "feat: POST /api/auth/guest with lazy purge and concurrency cap"
```

---

### Task 4: Guest resource caps in write paths

**Files:**
- Modify: `server/index.js` (`POST /api/sets` ~line 170; `PUT /api/sets/:id` ~line 230; `POST /api/import` ~line 719)
- Test: add `describe('guest resource caps')` to `server/test/guest.test.js`

**Interfaces:**
- Consumes: `GUEST_MAX_SETS`, `GUEST_MAX_CARDS_PER_SET` (Task 3).
- Produces: `async function guestSetCount(userId)` → `{ isGuest: boolean, setCount: number }` helper used by the write paths.

- [ ] **Step 1: Write the failing test**

Add to `server/test/guest.test.js`:

```js
async function newGuestToken() {
  const res = await request(app).post('/api/auth/guest').send({});
  return res.body.token;
}

describe('guest resource caps', () => {
  test('rejects creating more than 5 sets total', async () => {
    const token = await newGuestToken();
    // Guest already has 2 seeded sets; create 3 more to reach 5.
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
    // Seed a normal user + token directly.
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
```

(Add `import { generateToken } from '../db.js';` to the test file's imports if not already present — extend the existing `from '../db.js'` import line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/guest.test.js`
Expected: FAIL — caps not enforced (6th set returns 201, etc.).

- [ ] **Step 3: Add the `guestSetCount` helper**

In `server/index.js`, right after `purgeExpiredGuests()` add:

```js
// Returns whether the user is a guest and how many sets they currently own.
async function guestSetCount(userId) {
  const { rows } = await query(
    `SELECT u.is_guest, ${int('(SELECT COUNT(*) FROM sets WHERE user_id = u.id)')} AS set_count
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  return { isGuest: !!rows[0]?.is_guest, setCount: Number(rows[0]?.set_count || 0) };
}
```

- [ ] **Step 4: Enforce caps in `POST /api/sets`**

In `app.post('/api/sets', …)`, after the existing validation `if (!name || !cards …)` block and before `const client = await getClient();`, insert:

```js
  const { isGuest, setCount } = await guestSetCount(req.userId);
  if (isGuest) {
    if (setCount >= GUEST_MAX_SETS) {
      return res.status(403).json({ error: `Guest accounts are limited to ${GUEST_MAX_SETS} sets.` });
    }
    if (cards.length > GUEST_MAX_CARDS_PER_SET) {
      return res.status(403).json({ error: `Guest sets are limited to ${GUEST_MAX_CARDS_PER_SET} cards.` });
    }
  }
```

- [ ] **Step 5: Enforce the per-set card cap in `PUT /api/sets/:id`**

In `app.put('/api/sets/:id', …)`, after the ownership check (`if (existing[0].user_id !== req.userId)`) and before `const client = await getClient();`, insert:

```js
  if (cards && Array.isArray(cards)) {
    const { isGuest } = await guestSetCount(req.userId);
    if (isGuest && cards.length > GUEST_MAX_CARDS_PER_SET) {
      return res.status(403).json({ error: `Guest sets are limited to ${GUEST_MAX_CARDS_PER_SET} cards.` });
    }
  }
```

- [ ] **Step 6: Enforce caps in `POST /api/import`**

In `app.post('/api/import', …)`, after `const validSets = importedSets.filter(…)` and its `if (validSets.length === 0)` early-return, insert:

```js
  const { isGuest, setCount } = await guestSetCount(req.userId);
  if (isGuest) {
    const tooManyCards = validSets.some(s => s.cards.length > GUEST_MAX_CARDS_PER_SET);
    if (validSets.length > GUEST_MAX_SETS || setCount + validSets.length > GUEST_MAX_SETS || tooManyCards) {
      return res.status(403).json({
        error: `Guest imports are limited to ${GUEST_MAX_SETS} sets and ${GUEST_MAX_CARDS_PER_SET} cards per set.`,
      });
    }
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run server/test/guest.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/index.js server/test/guest.test.js
git commit -m "feat: enforce guest set/card caps in write paths"
```

---

### Task 5: Guest-aware logout

**Files:**
- Modify: `server/index.js` (`POST /api/auth/logout` ~line 81)
- Test: add to `server/test/guest.test.js`

**Interfaces:**
- Produces: logout deletes the whole guest account (frees a slot) instead of only the session, when the caller is a guest.

- [ ] **Step 1: Write the failing test**

Add to `server/test/guest.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/guest.test.js`
Expected: FAIL — user row still present after logout.

- [ ] **Step 3: Update the logout handler**

Replace the body of `app.post('/api/auth/logout', requireAuth, …)` with:

```js
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const { rows } = await query('SELECT is_guest FROM users WHERE id = $1', [req.userId]);
  if (rows[0]?.is_guest) {
    // Guest data is throwaway — delete the account (cascade) to free a slot.
    await query('DELETE FROM users WHERE id = $1', [req.userId]);
  } else {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
  }
  res.json({ message: 'Logged out' });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/test/guest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/test/guest.test.js
git commit -m "feat: deleting guest account on logout frees a slot"
```

---

### Task 6: Admin guests list + settings endpoints

**Files:**
- Modify: `server/index.js` (after the admin user-management endpoints ~line 141)
- Test: add `describe('admin guest management')` to `server/test/guest.test.js`

**Interfaces:**
- Consumes: existing `requireAuth`, `requireAdmin`; `getSetting`/`setSetting`.
- Produces:
  - `GET /api/admin/guests` → `[{ id, username, created_at, expires_at, set_count, card_count }]` (active guests only; purges expired first).
  - `GET /api/admin/settings` → `{ guest_ttl_minutes: number, guest_max_concurrent: number }`.
  - `PUT /api/admin/settings` body `{ guest_ttl_minutes?, guest_max_concurrent? }` → `200 { guest_ttl_minutes, guest_max_concurrent }`; rejects non-positive integers with `400`.
  - Termination reuses the existing `DELETE /api/admin/users/:id`.

- [ ] **Step 1: Write the failing test**

Add to `server/test/guest.test.js` (needs an admin token helper):

```js
import { hashPassword } from '../db.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/guest.test.js`
Expected: FAIL — `/api/admin/guests` and `/api/admin/settings` 404.

- [ ] **Step 3: Add the endpoints after the `DELETE /api/admin/users/:id` handler (~line 141)**

```js
// ==================== ADMIN: GUEST MANAGEMENT ====================

app.get('/api/admin/guests', requireAuth, requireAdmin, async (_req, res) => {
  await purgeExpiredGuests();
  const { rows } = await query(`
    SELECT u.id, u.username, u.created_at, u.expires_at,
      ${int('COUNT(DISTINCT s.id)')} AS set_count,
      ${int('COUNT(c.id)')} AS card_count
    FROM users u
    LEFT JOIN sets s ON s.user_id = u.id
    LEFT JOIN cards c ON c.set_id = s.id
    WHERE u.is_guest = TRUE AND u.expires_at > ${now()}
    GROUP BY u.id, u.username, u.created_at, u.expires_at
    ORDER BY u.expires_at ASC
  `, []);
  res.json(rows.map(r => ({
    id: r.id,
    username: r.username,
    created_at: r.created_at,
    expires_at: r.expires_at,
    set_count: Number(r.set_count),
    card_count: Number(r.card_count),
  })));
});

app.get('/api/admin/settings', requireAuth, requireAdmin, async (_req, res) => {
  res.json({
    guest_ttl_minutes: parseInt(await getSetting('guest_ttl_minutes', '60'), 10),
    guest_max_concurrent: parseInt(await getSetting('guest_max_concurrent', '10'), 10),
  });
});

app.put('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const keys = ['guest_ttl_minutes', 'guest_max_concurrent'];
  for (const key of keys) {
    if (req.body[key] !== undefined) {
      const n = parseInt(req.body[key], 10);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: `${key} must be a positive integer` });
      }
      await setSetting(key, String(n));
    }
  }
  res.json({
    guest_ttl_minutes: parseInt(await getSetting('guest_ttl_minutes', '60'), 10),
    guest_max_concurrent: parseInt(await getSetting('guest_max_concurrent', '10'), 10),
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/test/guest.test.js`
Expected: PASS.

- [ ] **Step 5: Run full server suite**

Run: `npx vitest run server/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/test/guest.test.js
git commit -m "feat: admin guest list and editable guest settings"
```

---

### Task 7: AuthContext `loginAsGuest`

**Files:**
- Modify: `src/context/AuthContext.jsx`
- Test: add to `src/test/auth.test.jsx`

**Interfaces:**
- Produces: `loginAsGuest()` on the auth context — POSTs `/api/auth/guest`, stores token under `koreaquiz_token`, sets `user`/`token`; throws `Error` with the server message on non-OK (e.g. the 503 "full" message). The `user` object from `/api/auth/me` already carries `is_guest`/`expires_at` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `src/test/auth.test.jsx` (it already imports `AuthProvider, useAuth`; add a small harness):

```js
describe('loginAsGuest', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('stores the guest token and sets the user', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'guesttoken', user: { id: 9, username: 'guest_abc', is_guest: true, expires_at: '2099-01-01 00:00:00' } }),
    })

    let auth
    function Harness() { auth = useAuth(); return null }
    render(<MemoryRouter><AuthProvider><Harness /></AuthProvider></MemoryRouter>)
    await waitFor(() => expect(auth).toBeTruthy())

    await act(async () => { await auth.loginAsGuest() })
    expect(localStorage.getItem('koreaquiz_token')).toBe('guesttoken')
    await waitFor(() => expect(auth.user?.is_guest).toBe(true))
  })

  it('throws the server error when guest spots are full', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Guest spots are full, please try again shortly.' }),
    })
    let auth
    function Harness() { auth = useAuth(); return null }
    render(<MemoryRouter><AuthProvider><Harness /></AuthProvider></MemoryRouter>)
    await waitFor(() => expect(auth).toBeTruthy())

    await expect(auth.loginAsGuest()).rejects.toThrow(/full/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/auth.test.jsx`
Expected: FAIL — `auth.loginAsGuest is not a function`.

- [ ] **Step 3: Implement `loginAsGuest`**

In `src/context/AuthContext.jsx`, add after the `login` function (before `logout`):

```js
  const loginAsGuest = async () => {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not start a guest session')

    localStorage.setItem('koreaquiz_token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data
  }
```

Add `loginAsGuest` to the context value:

```js
    <AuthContext.Provider value={{ user, token, login, loginAsGuest, logout, loading }}>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/auth.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context/AuthContext.jsx src/test/auth.test.jsx
git commit -m "feat: loginAsGuest in AuthContext"
```

---

### Task 8: LoginPage "Continue as guest" button

**Files:**
- Modify: `src/pages/LoginPage.jsx`
- Test: add to `src/test/LoginPage.test.jsx` (extend the existing AuthContext mock to include `loginAsGuest`)

**Interfaces:**
- Consumes: `useAuth().loginAsGuest` (Task 7).
- Produces: a button labeled "Try as guest" that calls `loginAsGuest()` and shows the thrown error message (reusing the existing `error` state/markup).

- [ ] **Step 1: Write the failing test**

In `src/test/LoginPage.test.jsx`, extend the mock (add `loginAsGuest`) and add tests:

```js
// add near mockLogin/mockLogout:
const mockLoginAsGuest = vi.fn()
// update the vi.mock('../context/AuthContext', …) useAuth return to include:
//   loginAsGuest: mockLoginAsGuest,

describe('LoginPage — guest mode', () => {
  beforeEach(() => { mockLoginAsGuest.mockReset() })

  it('renders a "Try as guest" button', async () => {
    renderLoginPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /try as guest/i })).toBeInTheDocument())
  })

  it('calls loginAsGuest when clicked', async () => {
    mockLoginAsGuest.mockResolvedValue({})
    const { user } = renderLoginPage()
    await user.click(screen.getByRole('button', { name: /try as guest/i }))
    await waitFor(() => expect(mockLoginAsGuest).toHaveBeenCalledTimes(1))
  })

  it('shows the error when guest spots are full', async () => {
    mockLoginAsGuest.mockRejectedValue(new Error('Guest spots are full, please try again shortly.'))
    const { user } = renderLoginPage()
    await user.click(screen.getByRole('button', { name: /try as guest/i }))
    await waitFor(() => expect(screen.getByText(/full/i)).toBeInTheDocument())
  })
})
```

Update the existing `vi.mock('../context/AuthContext', …)` block so `useAuth` returns `loginAsGuest: mockLoginAsGuest` alongside the existing fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/LoginPage.test.jsx`
Expected: FAIL — no "Try as guest" button.

- [ ] **Step 3: Implement the button in `LoginPage.jsx`**

Pull `loginAsGuest` from the hook (line 12): `const { login, loginAsGuest } = useAuth()`. Add a handler after `handleSubmit`:

```js
  const handleGuest = async () => {
    setError('')
    setLoading(true)
    try {
      await loginAsGuest()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
```

After the `</form>` closing tag, inside the `.glass-card` div, add:

```jsx
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 10 }}>
                or
              </div>
              <button
                type="button"
                onClick={handleGuest}
                disabled={loading}
                className="btn-secondary"
                style={{ width: '100%', padding: '12px 0', fontSize: '0.95rem', opacity: loading ? 0.7 : 1 }}
              >
                👋 Try as guest
              </button>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 8 }}>
                Explore for 1 hour — no signup. Sample sets included; data is cleared afterward.
              </p>
            </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/LoginPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.jsx src/test/LoginPage.test.jsx
git commit -m "feat: Try as guest button on LoginPage"
```

---

### Task 9: Guest countdown banner

**Files:**
- Create: `src/components/GuestBanner.jsx`
- Modify: `src/App.jsx` (render the banner when `user?.is_guest`)
- Test: create `src/test/GuestBanner.test.jsx`

**Interfaces:**
- Consumes: `useAuth().user.expires_at`, `useAuth().logout`.
- Produces: `<GuestBanner />` — shows "Guest session — MM:SS left"; when the remaining time reaches 0, calls `logout()` and navigates to `/`. Returns `null` when the user is not a guest.

- [ ] **Step 1: Write the failing test**

Create `src/test/GuestBanner.test.jsx`:

```js
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockLogout = vi.fn()
let mockUser = null
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => mockNavigate,
}))

import GuestBanner from '../components/GuestBanner'

function renderBanner() {
  return render(<MemoryRouter><GuestBanner /></MemoryRouter>)
}

describe('GuestBanner', () => {
  beforeEach(() => { vi.useFakeTimers(); mockLogout.mockReset(); mockNavigate.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('renders nothing for a non-guest user', () => {
    mockUser = { id: 1, is_guest: false }
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows remaining time for a guest', () => {
    mockUser = { id: 2, is_guest: true, expires_at: new Date(Date.now() + 125000).toISOString() }
    renderBanner()
    expect(screen.getByText(/guest session/i)).toBeInTheDocument()
    expect(screen.getByText(/02:0/)).toBeInTheDocument()
  })

  it('logs out and navigates when the timer hits zero', async () => {
    mockUser = { id: 3, is_guest: true, expires_at: new Date(Date.now() + 1000).toISOString() }
    renderBanner()
    await act(async () => { vi.advanceTimersByTime(2000) })
    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/GuestBanner.test.jsx`
Expected: FAIL — cannot find `../components/GuestBanner`.

- [ ] **Step 3: Implement `GuestBanner.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function remainingMs(expiresAt) {
  // expires_at may be ISO ('…T…Z') or SQL ('YYYY-MM-DD HH:MM:SS' in UTC).
  const normalized = expiresAt.includes('T') ? expiresAt : expiresAt.replace(' ', 'T') + 'Z'
  return new Date(normalized).getTime() - Date.now()
}

export default function GuestBanner() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [ms, setMs] = useState(() => (user?.expires_at ? remainingMs(user.expires_at) : 0))

  useEffect(() => {
    if (!user?.is_guest || !user?.expires_at) return
    const tick = () => setMs(remainingMs(user.expires_at))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [user])

  useEffect(() => {
    if (user?.is_guest && ms <= 0) {
      logout().finally(() => navigate('/'))
    }
  }, [ms, user, logout, navigate])

  if (!user?.is_guest) return null

  const total = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')

  return (
    <div style={{
      background: 'rgba(245, 158, 11, 0.15)',
      borderBottom: '1px solid var(--accent-amber, #f59e0b)',
      color: 'var(--accent-amber, #f59e0b)',
      textAlign: 'center', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600,
    }}>
      👋 Guest session — {mm}:{ss} left · data will be cleared when the timer ends
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/GuestBanner.test.jsx`
Expected: PASS.

- [ ] **Step 5: Render the banner in `App.jsx`**

Add the import near the other imports: `import GuestBanner from './components/GuestBanner'`. Inside `AppContent`'s returned tree, immediately after the opening `<nav className="nav-bar">…</nav>` block closes, add `<GuestBanner />`:

```jsx
      </nav>
      <GuestBanner />
```

- [ ] **Step 6: Run the client suite (no regressions)**

Run: `npx vitest run src/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/GuestBanner.jsx src/App.jsx src/test/GuestBanner.test.jsx
git commit -m "feat: guest countdown banner with auto-logout on expiry"
```

---

### Task 10: Admin Active Guests table + settings UI

**Files:**
- Modify: `src/pages/ProfilePage.jsx`
- Test: add to `src/test/ProfilePage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/guests`, `GET/PUT /api/admin/settings`, existing `DELETE /api/admin/users/:id` (for terminate), via `useApiFetch`.
- Produces: an "Active Guests" section (table of label, started, time-remaining, set/card counts, Terminate button) and a "Guest Settings" form (TTL minutes + max concurrent), both gated behind `user?.is_admin`.

- [ ] **Step 1: Write the failing test**

Inspect `src/test/ProfilePage.test.jsx` for its existing `apiFetch` mock pattern and follow it. Add a test that, with an admin user, the guests endpoint result renders and Terminate calls the delete endpoint:

```js
it('renders active guests and terminates one', async () => {
  // apiFetch mock should return, by URL:
  //   '/api/admin/users'    -> []
  //   '/api/admin/guests'   -> [{ id: 5, username: 'guest_abc', created_at: '...', expires_at: <+30m>, set_count: 2, card_count: 11 }]
  //   '/api/admin/settings' -> { guest_ttl_minutes: 60, guest_max_concurrent: 10 }
  // (extend the existing mock switch in this test file accordingly)
  renderProfileAsAdmin()
  await waitFor(() => expect(screen.getByText('guest_abc')).toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: /terminate/i }))
  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/users/5', expect.objectContaining({ method: 'DELETE' }))
  )
})

it('saves guest settings', async () => {
  renderProfileAsAdmin()
  await waitFor(() => expect(screen.getByLabelText(/guest duration/i)).toBeInTheDocument())
  await userEvent.clear(screen.getByLabelText(/guest duration/i))
  await userEvent.type(screen.getByLabelText(/guest duration/i), '30')
  await userEvent.click(screen.getByRole('button', { name: /save guest settings/i }))
  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/settings', expect.objectContaining({ method: 'PUT' }))
  )
})
```

Match the file's actual mock helper names (`mockApiFetch`, `renderProfileAsAdmin` or equivalent); adapt to whatever the existing tests use.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/ProfilePage.test.jsx`
Expected: FAIL — guest UI not present.

- [ ] **Step 3: Add state + loaders in `ProfilePage.jsx`**

After the existing admin state (around line 23) add:

```js
  const [guests, setGuests] = useState(null)
  const [settings, setSettings] = useState(null)
  const [settingsForm, setSettingsForm] = useState({ guest_ttl_minutes: '', guest_max_concurrent: '' })
  const [settingsStatus, setSettingsStatus] = useState(null)
```

In the existing admin `useEffect` (line ~25), also call the new loaders:

```js
  useEffect(() => {
    if (user?.is_admin) {
      loadUsers()
      loadGuests()
      loadSettings()
    }
  }, [user])
```

Add the loaders + handlers near `loadUsers`:

```js
  const loadGuests = async () => {
    const res = await apiFetch('/api/admin/guests')
    if (res.ok) setGuests(await res.json())
  }

  const loadSettings = async () => {
    const res = await apiFetch('/api/admin/settings')
    if (res.ok) {
      const s = await res.json()
      setSettings(s)
      setSettingsForm({ guest_ttl_minutes: String(s.guest_ttl_minutes), guest_max_concurrent: String(s.guest_max_concurrent) })
    }
  }

  const handleTerminateGuest = async (guestId) => {
    const res = await apiFetch(`/api/admin/users/${guestId}`, { method: 'DELETE' })
    if (res.ok) loadGuests()
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSettingsStatus(null)
    const res = await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        guest_ttl_minutes: Number(settingsForm.guest_ttl_minutes),
        guest_max_concurrent: Number(settingsForm.guest_max_concurrent),
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings(data)
      setSettingsStatus({ type: 'success', message: '✓ Saved' })
      loadGuests()
    } else {
      setSettingsStatus({ type: 'error', message: data.error || 'Save failed' })
    }
  }

  const guestTimeLeft = (expiresAt) => {
    const norm = expiresAt.includes('T') ? expiresAt : expiresAt.replace(' ', 'T') + 'Z'
    const total = Math.max(0, Math.floor((new Date(norm).getTime() - Date.now()) / 1000))
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
```

- [ ] **Step 4: Add the UI**

Inside the `{user?.is_admin && ( … )}` admin region (after the existing user-management block, around line 215+), add a Guest Settings form and an Active Guests table:

```jsx
          <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Guest Settings</h3>
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label" htmlFor="guest_ttl">Guest duration (minutes)</label>
                <input id="guest_ttl" className="form-input" type="number" min="1"
                  value={settingsForm.guest_ttl_minutes}
                  onChange={e => setSettingsForm(f => ({ ...f, guest_ttl_minutes: e.target.value }))} />
              </div>
              <div>
                <label className="form-label" htmlFor="guest_max">Max concurrent guests</label>
                <input id="guest_max" className="form-input" type="number" min="1"
                  value={settingsForm.guest_max_concurrent}
                  onChange={e => setSettingsForm(f => ({ ...f, guest_max_concurrent: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>Save guest settings</button>
            </form>
            {settingsStatus && (
              <div style={{ marginTop: 12, color: settingsStatus.type === 'error' ? 'var(--accent-red)' : 'var(--accent-green, #10b981)' }}>
                {settingsStatus.message}
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
            <h3 style={{ marginBottom: 16 }}>
              Active Guests {guests && `(${guests.length}${settings ? ' / ' + settings.guest_max_concurrent : ''})`}
            </h3>
            {guests && guests.length === 0 && (
              <p style={{ color: 'var(--text-secondary)' }}>No active guests right now.</p>
            )}
            {guests && guests.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <th style={{ padding: '6px 8px' }}>Guest</th>
                      <th style={{ padding: '6px 8px' }}>Started</th>
                      <th style={{ padding: '6px 8px' }}>Time left</th>
                      <th style={{ padding: '6px 8px' }}>Sets</th>
                      <th style={{ padding: '6px 8px' }}>Cards</th>
                      <th style={{ padding: '6px 8px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guests.map(g => (
                      <tr key={g.id} style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.1))' }}>
                        <td style={{ padding: '8px' }}>{g.username}</td>
                        <td style={{ padding: '8px' }}>{new Date(g.created_at.includes('T') ? g.created_at : g.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString()}</td>
                        <td style={{ padding: '8px' }}>{guestTimeLeft(g.expires_at)}</td>
                        <td style={{ padding: '8px' }}>{g.set_count}</td>
                        <td style={{ padding: '8px' }}>{g.card_count}</td>
                        <td style={{ padding: '8px' }}>
                          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                            onClick={() => handleTerminateGuest(g.id)}>Terminate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/ProfilePage.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS (all server + client tests).

- [ ] **Step 7: Commit**

```bash
git add src/pages/ProfilePage.jsx src/test/ProfilePage.test.jsx
git commit -m "feat: admin active-guests table and editable guest settings UI"
```

---

## Self-Review Notes

- **Spec coverage:** temporary-user model + columns (Task 1); seeded sample sets (Task 2); `POST /api/auth/guest` with purge + concurrency cap + 1-hour session (Task 3); 5-set/100-card caps incl. import clamp (Task 4); guest logout frees slot (Task 5); admin guests list with label/started/time-remaining/counts + terminate-via-existing-delete + editable TTL & max (Task 6); `loginAsGuest` (Task 7); "Try as guest" entry (Task 8); countdown banner + expiry lockout (Task 9); admin UI (Task 10). Lazy purge is wired into guest creation (Task 3) and admin list (Task 6); login already runs through the unchanged path and does not strictly need a purge call, but expired guests are caught by both other triggers — matches "lazy only".
- **Known limitation carried from spec:** concurrency cap has a tiny race under Postgres; accepted.
- **Timestamp format:** all `expires_at` writes use SQL `inMinutes()` so comparisons stay valid; client parsing normalizes SQL-format timestamps to UTC ISO.
