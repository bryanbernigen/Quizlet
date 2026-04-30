import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import { query, getClient, initDb, hashPassword, verifyPassword, generateToken } from './db.js';

// Cross-driver SQL snippets
const now = () => process.env.DB_TYPE === 'sqlite' ? "datetime('now')" : 'NOW()';
const int = (expr) => process.env.DB_TYPE === 'sqlite' ? expr : `${expr}::int`;
const float = (expr) => process.env.DB_TYPE === 'sqlite' ? expr : `${expr}::float`;

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
// Note: response compression is handled automatically by Vercel CDN (gzip/brotli)

// Initialize DB once on startup (runs in background, doesn't block requests)
// Skip initialization in test environment — tests control DB lifecycle directly.
if (process.env.NODE_ENV !== 'test') {
  initDb().catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

// ==================== AUTH MIDDLEWARE ====================

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const { rows } = await query(
    `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > ${now()}`,
    [token]
  );
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.userId = rows[0].user_id;
  next();
}

async function requireAdmin(req, res, next) {
  const { rows } = await query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==================== AUTH ENDPOINTS ====================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { rows } = await query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken();
  await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, user.id]);

  res.json({ token, user: { id: user.id, username: user.username, is_admin: user.is_admin } });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await query('DELETE FROM sessions WHERE token = $1', [token]);
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT id, username, is_admin, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// ==================== ADMIN: USER MANAGEMENT ====================

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await query(
    'SELECT id, username, is_admin, created_at FROM users ORDER BY created_at'
  );
  res.json(rows);
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, is_admin = false } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { rows: existing } = await query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await hashPassword(password);
  const { rows } = await query(
    'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin',
    [username, hash, is_admin]
  );
  const { rows: [user] } = await query('SELECT id, username, is_admin, created_at FROM users WHERE id = $1', [rows[0].id]);
  res.status(201).json({ user });
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.userId) {
    return res.status(403).json({ error: 'Cannot delete your own account' });
  }
  await query('DELETE FROM users WHERE id = $1', [targetId]);
  res.json({ message: 'User deleted' });
});

// ==================== SETS (all protected) ====================

app.get('/api/sets', requireAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT s.*,
      ${int('COUNT(c.id)')} AS card_count,
      ${int("SUM(CASE WHEN c.familiarity = 'familiar' THEN 1 ELSE 0 END)")} AS familiar_count,
      ${int("SUM(CASE WHEN c.familiarity = 'neutral' THEN 1 ELSE 0 END)")} AS neutral_count,
      ${int("SUM(CASE WHEN c.familiarity = 'unfamiliar' THEN 1 ELSE 0 END)")} AS unfamiliar_count,
      ${int('SUM(CASE WHEN c.correct_count > 0 AND c.correct_count >= c.incorrect_count THEN 1 ELSE 0 END)')} AS correct_count,
      ${int('SUM(CASE WHEN c.incorrect_count > 0 AND c.correct_count < c.incorrect_count THEN 1 ELSE 0 END)')} AS incorrect_count,
      ${int('SUM(CASE WHEN c.correct_count = 0 AND c.incorrect_count = 0 THEN 1 ELSE 0 END)')} AS unattempted_count
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    WHERE s.user_id = $1
    GROUP BY s.id
    ORDER BY s.updated_at DESC, s.created_at DESC
  `, [req.userId]);
  res.json(rows.map(s => ({
    ...s,
    is_shared: !!s.is_shared,
    share_token: s.share_token || null,
    copied_count: s.copied_count || 0,
    original_set_id: s.original_set_id || null,
  })));
});

app.post('/api/sets', requireAuth, async (req, res) => {
  const { name, cards } = req.body;
  if (!name || !cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'Name and cards array are required' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO sets (name, user_id) VALUES ($1, $2) RETURNING id',
      [name, req.userId]
    );
    const setId = rows[0].id;
    const validCards = cards.filter(c => c.front && c.back);
    if (validCards.length > 0) {
      const placeholders = validCards.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const flatParams = validCards.flatMap(c => [setId, c.front.trim(), c.back.trim()]);
      await client.query(
        `INSERT INTO cards (set_id, front, back) VALUES ${placeholders}`,
        flatParams
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: setId, message: 'Set created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/sets/:id', requireAuth, async (req, res) => {
  const { rows: existing } = await query(
    'SELECT id FROM sets WHERE id = $1',
    [req.params.id]
  );
  if (existing.length === 0) {
    return res.status(404).json({ error: 'Set not found' });
  }
  if (existing.length > 0) {
    const { rows: ownerRows } = await query(
      'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (ownerRows.length === 0) {
      return res.status(404).json({ error: 'Set not found' });
    }
  }
  const { rows } = await query(
    `SELECT s.*, ${int('COUNT(c.id)')} AS card_count FROM sets s LEFT JOIN cards c ON c.set_id = s.id WHERE s.id = $1 GROUP BY s.id`,
    [req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/sets/:id', requireAuth, async (req, res) => {
  const { rows: existing } = await query(
    'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (existing.length === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await query('DELETE FROM sets WHERE id = $1', [req.params.id]);
  res.json({ message: 'Set deleted' });
});

app.put('/api/sets/:id', requireAuth, async (req, res) => {
  const { name, cards } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const { rows: existing } = await query(
    'SELECT id FROM sets WHERE id = $1',
    [req.params.id]
  );
  if (existing.length === 0) {
    return res.status(404).json({ error: 'Set not found' });
  }
  if (existing.length > 0) {
    const { rows: ownerRows } = await query(
      'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (ownerRows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE sets SET name = $1, updated_at = ${now()} WHERE id = $2`,
      [name, req.params.id]
    );

    if (cards && Array.isArray(cards)) {
      const { rows: existingCards } = await client.query(
        'SELECT * FROM cards WHERE set_id = $1',
        [req.params.id]
      );
      const existingMap = new Map();
      existingCards.forEach(c => existingMap.set(`${c.front}|||${c.back}`, c));

      await client.query('DELETE FROM cards WHERE set_id = $1', [req.params.id]);

      const validCards = cards.filter(c => c.front && c.back);
      if (validCards.length > 0) {
        const placeholders = validCards.map((_, i) =>
          `($1, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        ).join(', ');
        const flatParams = validCards.flatMap(c => {
          const front = c.front.trim();
          const back = c.back.trim();
          const prev = existingMap.get(`${front}|||${back}`);
          return [
            req.params.id, front, back,
            prev ? prev.familiarity : 'unfamiliar',
            prev ? prev.correct_count : 0,
            prev ? prev.incorrect_count : 0,
          ];
        });
        await client.query(
          `INSERT INTO cards (set_id, front, back, familiarity, correct_count, incorrect_count) VALUES ${placeholders}`,
          flatParams
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Set updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/sets/:id/cards', requireAuth, async (req, res) => {
  const { rows: setRows } = await query(
    'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (setRows.length === 0) return res.status(404).json({ error: 'Set not found' });

  const { rows } = await query('SELECT * FROM cards WHERE set_id = $1', [req.params.id]);
  res.json(rows);
});

// ==================== SHARING ====================

// Toggle sharing for a set (owner only)
app.post('/api/sets/:id/share', requireAuth, async (req, res) => {
  const { enabled } = req.body;
  const { rows: existing } = await query(
    'SELECT id, share_token, is_shared FROM sets WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (existing.length === 0) return res.status(404).json({ error: 'Set not found' });

  const set = existing[0];
  if (enabled) {
    const token = set.share_token || crypto.randomBytes(16).toString('hex');
    await query(
      'UPDATE sets SET share_token = $1, is_shared = TRUE WHERE id = $2',
      [token, req.params.id]
    );
    res.json({ shareUrl: `/shared/${token}`, shareToken: token });
  } else {
    await query(
      'UPDATE sets SET share_token = NULL, is_shared = FALSE WHERE id = $1',
      [req.params.id]
    );
    res.json({ shareUrl: null, shareToken: null });
  }
});

// View a shared set (anonymous access)
app.get('/api/shared/:shareToken', async (req, res) => {
  const { rows: setRows } = await query(
    'SELECT id, name, user_id, copied_count, created_at FROM sets WHERE share_token = $1 AND is_shared = TRUE',
    [req.params.shareToken]
  );
  if (setRows.length === 0) return res.status(404).json({ error: 'Set not found or sharing has been revoked' });

  const set = setRows[0];
  const { rows: cards } = await query(
    'SELECT id, front, back FROM cards WHERE set_id = $1',
    [set.id]
  );

  res.json({
    set: { id: set.id, name: set.name, card_count: cards.length, created_at: set.created_at },
    cards,
  });
});

// Copy a shared set to the current user's account
app.post('/api/shared/:shareToken/copy', requireAuth, async (req, res) => {
  const { rows: sourceSet } = await query(
    'SELECT id, name, is_shared FROM sets WHERE share_token = $1 AND is_shared = TRUE',
    [req.params.shareToken]
  );
  if (sourceSet.length === 0) return res.status(404).json({ error: 'Set not found or sharing has been revoked' });

  const source = sourceSet[0];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'INSERT INTO sets (name, user_id, original_set_id) VALUES ($1, $2, $3) RETURNING id',
      [source.name, req.userId, source.id]
    );
    const newSetId = rows[0].id;

    const { rows: sourceCards } = await client.query(
      'SELECT front, back FROM cards WHERE set_id = $1',
      [source.id]
    );

    if (sourceCards.length > 0) {
      const placeholders = sourceCards.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const flatParams = sourceCards.flatMap(c => [newSetId, c.front, c.back]);
      await client.query(
        `INSERT INTO cards (set_id, front, back) VALUES ${placeholders}`,
        flatParams
      );
    }

    await client.query(
      'UPDATE sets SET copied_count = copied_count + 1 WHERE id = $1',
      [source.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ newSetId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ==================== WORD BROWSER ====================

app.get('/api/cards/browse', requireAuth, async (req, res) => {
  const { familiarity, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * pageLimit;
  const params = [req.userId];
  let filterClause = '';

  // If a familiarity filter is provided but is not valid, return empty results.
  // This prevents loose SQLite type coercion from returning unintended results.
  if (familiarity !== undefined && !['familiar', 'neutral', 'unfamiliar'].includes(familiarity)) {
    return res.json({ data: [], pagination: { page: pageNum, limit: pageLimit, total: 0, totalPages: 0 } });
  }

  if (familiarity && ['familiar', 'neutral', 'unfamiliar'].includes(familiarity)) {
    params.push(familiarity);
    filterClause = ` AND c.familiarity = $${params.length}`;
  }

  const baseQuery = `
    FROM cards c
    JOIN sets s ON s.id = c.set_id
    WHERE s.user_id = $1${filterClause}
  `;

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total ${baseQuery}`,
    params
  );
  const total = Number(countRows[0]?.total) || 0;

  const { rows } = await query(`
    SELECT c.*, s.name AS set_name
    ${baseQuery}
    ORDER BY s.name, c.front
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, pageLimit, offset]);

  res.json({
    data: rows,
    pagination: {
      page: pageNum,
      limit: pageLimit,
      total,
      totalPages: Math.ceil(total / pageLimit),
    },
  });
});

app.patch('/api/cards/:id/familiarity', requireAuth, async (req, res) => {
  const { familiarity } = req.body;
  if (!['familiar', 'neutral', 'unfamiliar'].includes(familiarity)) {
    return res.status(400).json({ error: 'Invalid familiarity value' });
  }
  const { rows } = await query(`
    SELECT c.id FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE c.id = $1 AND s.user_id = $2
  `, [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Card not found' });

  await query('UPDATE cards SET familiarity = $1 WHERE id = $2', [familiarity, req.params.id]);
  res.json({ message: 'Updated' });
});

// ==================== REVIEW ====================

function buildCardFilters(queryParams, params) {
  const conditions = [];
  if (queryParams.familiarity) {
    const allowed = queryParams.familiarity.split(',');
    const placeholders = allowed.map((_, i) => {
      params.push(_);
      return `$${params.length}`;
    }).join(', ');
    conditions.push(`c.familiarity IN (${placeholders})`);
  }
  if (queryParams.attempt) {
    const allowed = queryParams.attempt.split(',');
    if (allowed.includes('unattempted')) {
      conditions.push('(c.correct_count = 0 AND c.incorrect_count = 0)');
    }
    if (allowed.includes('correct')) {
      conditions.push('(c.correct_count > 0)');
    }
    if (allowed.includes('wrong')) {
      conditions.push('(c.incorrect_count > 0)');
    }
  }
  return conditions.length > 0 ? ` AND (${conditions.join(' OR ')})` : '';
}

app.get('/api/cards/review', requireAuth, async (req, res) => {
  const { setIds, count = 10 } = req.query;
  if (!setIds) return res.status(400).json({ error: 'setIds required' });

  const ids = setIds.split(',').map(Number);
  const baseParams = [...ids, req.userId];
  const filterClause = buildCardFilters(req.query, baseParams);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(`
    SELECT c.* FROM cards c
    JOIN sets s ON s.id = c.set_id
    WHERE c.set_id IN (${placeholders}) AND s.user_id = $${ids.length + 1}${filterClause}
  `, baseParams);

  const weighted = weightedSample(rows, parseInt(count));
  res.json(weighted);
});

function weightedSample(cards, count) {
  if (!cards || cards.length === 0) return [];
  const actualCount = Math.min(count, cards.length);
  const selected = [];
  const remaining = cards.map((c, i) => ({ ...c, _idx: i }));

  for (let i = 0; i < actualCount; i++) {
    const totalWeight = remaining.reduce((sum, c) => sum + (c.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (let j = 0; j < remaining.length; j++) {
      const weight = remaining[j].weight || 1;
      random -= weight;
      if (random <= 0) {
        const { _idx, weight: _, ...card } = remaining[j];
        selected.push(card);
        remaining[j] = remaining[remaining.length - 1];
        remaining.pop();
        break;
      }
    }
  }

  return selected;
}

app.post('/api/cards/:id/familiarity', requireAuth, async (req, res) => {
  const { familiarity } = req.body;
  if (!['familiar', 'neutral', 'unfamiliar'].includes(familiarity)) {
    return res.status(400).json({ error: 'Invalid familiarity value' });
  }
  await query('UPDATE cards SET familiarity = $1 WHERE id = $2', [familiarity, req.params.id]);
  res.json({ message: 'Updated' });
});

// ==================== QUIZ ====================

app.get('/api/cards/quiz', requireAuth, async (req, res) => {
  const { setIds, count = 10 } = req.query;
  if (!setIds) return res.status(400).json({ error: 'setIds required' });

  const ids = setIds.split(',').map(Number);
  const baseParams = [...ids, req.userId];
  const filterClause = buildCardFilters(req.query, baseParams);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(`
    SELECT c.* FROM cards c
    JOIN sets s ON s.id = c.set_id
    WHERE c.set_id IN (${placeholders}) AND s.user_id = $${ids.length + 1}${filterClause}
  `, baseParams);

  const familiarityWeights = { unfamiliar: 8, neutral: 3, familiar: 1 };
  const NEW_CARD_BONUS = 25;

  const weighted = rows.map(c => {
    const fam = c.familiarity || 'unfamiliar';
    const famWeight = familiarityWeights[fam] || 8;
    const correct = Number(c.correct_count) || 0;
    const incorrect = Number(c.incorrect_count) || 0;
    const totalAttempts = correct + incorrect;

    let diffWeight = 1;
    if (totalAttempts === 0) {
      diffWeight = NEW_CARD_BONUS;
    } else if (incorrect > 0 && correct === 0) {
      diffWeight = incorrect + 5;
    } else if (incorrect > 0) {
      diffWeight = 1 + (incorrect / correct) * 2;
    }

    const finalWeight = famWeight * diffWeight;
    return { ...c, weight: isNaN(finalWeight) ? 1 : finalWeight };
  });

  const selected = weightedSample(weighted, parseInt(count));
  res.json(selected);
});

app.post('/api/cards/:id/quiz-result', requireAuth, async (req, res) => {
  const { isCorrect } = req.body;

  if (isCorrect) {
    await query('UPDATE cards SET correct_count = correct_count + 1 WHERE id = $1', [req.params.id]);
  } else {
    await query('UPDATE cards SET incorrect_count = incorrect_count + 1 WHERE id = $1', [req.params.id]);
  }

  await query(
    'INSERT INTO quiz_history (card_id, is_correct) VALUES ($1, $2)',
    [req.params.id, Boolean(isCorrect)]
  );
  res.json({ message: 'Result recorded' });
});

// ==================== STATS ====================

app.get('/api/stats', requireAuth, async (req, res) => {
  const summaryRows = await query(`
    SELECT
      ${int('COUNT(DISTINCT s.id)')} AS total_sets,
      ${int('COUNT(c.id)')} AS total_cards,
      COALESCE(SUM(CASE WHEN c.familiarity = 'familiar' THEN 1 ELSE 0 END), 0) AS familiar_count,
      COALESCE(SUM(CASE WHEN c.familiarity = 'neutral' THEN 1 ELSE 0 END), 0) AS neutral_count,
      COALESCE(SUM(CASE WHEN c.familiarity = 'unfamiliar' OR c.familiarity IS NULL THEN 1 ELSE 0 END), 0) AS unfamiliar_count
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    WHERE s.user_id = $1
  `, [req.userId]);

  const summary = summaryRows.rows[0] || { total_sets: 0, total_cards: 0, familiar_count: 0, neutral_count: 0, unfamiliar_count: 0 };

  const troubleRows = await query(`
    SELECT c.front, c.back, c.incorrect_count, c.correct_count,
      CASE
        WHEN c.correct_count = 0 AND c.incorrect_count > 0 THEN c.incorrect_count * 100
        WHEN c.correct_count = 0 THEN 0
        ELSE ${float('c.incorrect_count')} / c.correct_count
      END AS trouble_score
    FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE s.user_id = $1 AND c.incorrect_count > 0
    ORDER BY trouble_score DESC
    LIMIT 5
  `, [req.userId]);

  res.json({
    totalCards: Number(summary.total_cards),
    totalSets: Number(summary.total_sets),
    familiarity: {
      familiar: Number(summary.familiar_count),
      neutral: Number(summary.neutral_count),
      unfamiliar: Number(summary.unfamiliar_count),
    },
    troubleWords: troubleRows.rows.map(r => ({ front: r.front, back: r.back, incorrect_count: r.incorrect_count, correct_count: r.correct_count })),
  });
});

// ==================== EXPORT / IMPORT ====================

app.get('/api/export', requireAuth, async (req, res) => {
  const { rows: sets } = await query('SELECT * FROM sets WHERE user_id = $1', [req.userId]);
  const { rows: allCards } = await query(`
    SELECT c.* FROM cards c JOIN sets s ON s.id = c.set_id WHERE s.user_id = $1
  `, [req.userId]);

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sets: sets.map(s => ({
      name: s.name,
      created_at: s.created_at,
      updated_at: s.updated_at,
      cards: allCards
        .filter(c => c.set_id === s.id)
        .map(c => ({
          front: c.front,
          back: c.back,
          familiarity: c.familiarity,
          correct_count: c.correct_count,
          incorrect_count: c.incorrect_count,
        })),
    })),
  };

  res.setHeader('Content-Disposition', 'attachment; filename=koreaquiz-backup.json');
  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

app.post('/api/import', requireAuth, async (req, res) => {
  const { sets: importedSets } = req.body;
  if (!importedSets || !Array.isArray(importedSets)) {
    return res.status(400).json({ error: 'Invalid import format. Expected { sets: [...] }' });
  }

  const validSets = importedSets.filter(s => s.name && s.cards && s.cards.length > 0);
  if (validSets.length === 0) {
    return res.json({ message: 'Import successful', setsCreated: 0, setsUpdated: 0, cardsCreated: 0, cardsUpdated: 0 });
  }

  const setNames = validSets.map(s => s.name);
  const setNamePlaceholders = setNames.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: existingSets } = await query(
    `SELECT id, name FROM sets WHERE name IN (${setNamePlaceholders}) AND user_id = $${setNames.length + 1}`,
    [...setNames, req.userId]
  );
  const setMap = new Map(existingSets.map(s => [s.name, s.id]));
  const newSets = [];
  const nowVal = now();

  for (const setData of validSets) {
    if (setMap.has(setData.name)) {
      const setId = typeof setMap.get(setData.name) === 'number' ? setMap.get(setData.name) : setMap.get(setData.name).id;
      await query(`UPDATE sets SET updated_at = ${nowVal} WHERE id = $1`, [setId]);
      setMap.set(setData.name, { id: setId, isUpdate: true });
    } else {
      const insResult = await query(
        `INSERT INTO sets (name, user_id, created_at, updated_at) VALUES ($1, $2, ${nowVal}, ${nowVal}) RETURNING id`,
        [setData.name, req.userId]
      );
      const newId = insResult.lastInsertRowid;
      // For SQLite, fetch the actual id from the inserted row
      const { rows: [{ id: fetchedId }] } = await query('SELECT id FROM sets WHERE rowid = $1', [newId]);
      setMap.set(setData.name, { id: fetchedId, isUpdate: false });
      newSets.push(setData.name);
    }
  }

  const setIds = [...setMap.values()].map(v => v.id);
  const idPlaceholders = setIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: existingCards } = await query(
    `SELECT id, set_id, front, back, correct_count, incorrect_count FROM cards WHERE set_id IN (${idPlaceholders})`,
    setIds
  );
  const cardMap = new Map(existingCards.map(c => [`${c.set_id}|${c.front}|${c.back}`, c]));

  const cardsToInsert = [];
  const cardsToUpdate = [];

  for (const setData of validSets) {
    const setId = setMap.get(setData.name).id;
    for (const card of setData.cards) {
      if (!card.front || !card.back) continue;
      const front = card.front.trim();
      const back = card.back.trim();
      const key = `${setId}|${front}|${back}`;
      const familiarity = card.familiarity || 'unfamiliar';
      const correct = card.correct_count || 0;
      const incorrect = card.incorrect_count || 0;
      const existing = cardMap.get(key);
      if (existing) {
        cardsToUpdate.push({
          id: existing.id,
          familiarity,
          correct: Math.max(correct, existing.correct_count),
          incorrect: Math.max(incorrect, existing.incorrect_count),
        });
      } else {
        cardsToInsert.push({ setId, front, back, familiarity, correct, incorrect });
      }
    }
  }

  // Batch insert new cards
  if (cardsToInsert.length > 0) {
    const placeholders = cardsToInsert.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ');
    const flatParams = cardsToInsert.flatMap(c => [c.setId, c.front, c.back, c.familiarity, c.correct, c.incorrect]);
    await query(`INSERT INTO cards (set_id, front, back, familiarity, correct_count, incorrect_count) VALUES ${placeholders}`, flatParams);
  }

  // Batch update existing cards
  if (cardsToUpdate.length > 0) {
    for (const card of cardsToUpdate) {
      await query(
        'UPDATE cards SET familiarity = $1, correct_count = $2, incorrect_count = $3 WHERE id = $4',
        [card.familiarity, card.correct, card.incorrect, card.id]
      );
    }
  }

  res.json({
    message: 'Import successful',
    setsCreated: newSets.length,
    setsUpdated: setNames.length - newSets.length,
    cardsCreated: cardsToInsert.length,
    cardsUpdated: cardsToUpdate.length,
  });
});

// Only listen in local development (Vercel handles the port in production)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
