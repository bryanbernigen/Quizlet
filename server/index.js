import express from 'express';
import cors from 'cors';
import { query, getClient, initDb, hashPassword, verifyPassword, generateToken } from './db.js';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Initialize DB once on first request (idempotent via CREATE TABLE IF NOT EXISTS)
const dbReady = initDb().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

app.use(async (_req, _res, next) => {
  await dbReady;
  next();
});

// ==================== AUTH MIDDLEWARE ====================

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const { rows } = await query(
    'SELECT user_id FROM sessions WHERE token = $1 AND expires_at > NOW()',
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
  if (!user || !verifyPassword(password, user.password_hash)) {
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

  const hash = hashPassword(password);
  const { rows } = await query(
    'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin, created_at',
    [username, hash, is_admin]
  );
  res.json({ user: rows[0] });
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  await query('DELETE FROM users WHERE id = $1', [targetId]);
  res.json({ message: 'User deleted' });
});

// ==================== SETS (all protected) ====================

app.get('/api/sets', requireAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT s.*,
      COUNT(c.id)::int AS card_count,
      SUM(CASE WHEN c.familiarity = 'familiar' THEN 1 ELSE 0 END)::int AS familiar_count,
      SUM(CASE WHEN c.familiarity = 'neutral' THEN 1 ELSE 0 END)::int AS neutral_count,
      SUM(CASE WHEN c.familiarity = 'unfamiliar' THEN 1 ELSE 0 END)::int AS unfamiliar_count,
      SUM(CASE WHEN c.correct_count > 0 AND c.correct_count >= c.incorrect_count THEN 1 ELSE 0 END)::int AS correct_count,
      SUM(CASE WHEN c.incorrect_count > 0 AND c.correct_count < c.incorrect_count THEN 1 ELSE 0 END)::int AS incorrect_count,
      SUM(CASE WHEN c.correct_count = 0 AND c.incorrect_count = 0 THEN 1 ELSE 0 END)::int AS unattempted_count
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    WHERE s.user_id = $1
    GROUP BY s.id
    ORDER BY s.updated_at DESC, s.created_at DESC
  `, [req.userId]);
  res.json(rows);
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
    for (const card of cards) {
      if (card.front && card.back) {
        await client.query(
          'INSERT INTO cards (set_id, front, back) VALUES ($1, $2, $3)',
          [setId, card.front.trim(), card.back.trim()]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ id: setId, message: 'Set created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/sets/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM sets WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ message: 'Set deleted' });
});

app.put('/api/sets/:id', requireAuth, async (req, res) => {
  const { name, cards } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const { rows: existing } = await query(
    'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (existing.length === 0) {
    return res.status(404).json({ error: 'Set not found' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE sets SET name = $1, updated_at = NOW() WHERE id = $2',
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

      for (const card of cards) {
        if (card.front && card.back) {
          const front = card.front.trim();
          const back = card.back.trim();
          const prev = existingMap.get(`${front}|||${back}`);
          await client.query(
            'INSERT INTO cards (set_id, front, back, familiarity, correct_count, incorrect_count) VALUES ($1, $2, $3, $4, $5, $6)',
            [
              req.params.id, front, back,
              prev ? prev.familiarity : 'unfamiliar',
              prev ? prev.correct_count : 0,
              prev ? prev.incorrect_count : 0,
            ]
          );
        }
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

// ==================== WORD BROWSER ====================

app.get('/api/cards/browse', requireAuth, async (req, res) => {
  const { familiarity } = req.query;
  const params = [req.userId];
  let filterClause = '';

  if (familiarity && ['familiar', 'neutral', 'unfamiliar'].includes(familiarity)) {
    params.push(familiarity);
    filterClause = ` AND c.familiarity = $${params.length}`;
  }

  const { rows } = await query(`
    SELECT c.*, s.name AS set_name
    FROM cards c
    JOIN sets s ON s.id = c.set_id
    WHERE s.user_id = $1${filterClause}
    ORDER BY s.name, c.front
  `, params);
  res.json(rows);
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

// ==================== SHARED CARD FILTER ====================

function filterCards(cards, queryParams) {
  let filtered = cards;

  if (queryParams.familiarity) {
    const allowed = queryParams.familiarity.split(',');
    filtered = filtered.filter(c => allowed.includes(c.familiarity || 'unfamiliar'));
  }

  if (queryParams.attempt) {
    const allowed = queryParams.attempt.split(',');
    filtered = filtered.filter(c => {
      const correct = Number(c.correct_count) || 0;
      const incorrect = Number(c.incorrect_count) || 0;
      if (correct === 0 && incorrect === 0) return allowed.includes('unattempted');
      let match = false;
      if (correct > 0 && allowed.includes('correct')) match = true;
      if (incorrect > 0 && allowed.includes('wrong')) match = true;
      return match;
    });
  }

  return filtered;
}

// ==================== REVIEW ====================

app.get('/api/cards/review', requireAuth, async (req, res) => {
  const { setIds, count = 10 } = req.query;
  if (!setIds) return res.status(400).json({ error: 'setIds required' });

  const ids = setIds.split(',').map(Number);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(`
    SELECT c.* FROM cards c
    JOIN sets s ON s.id = c.set_id
    WHERE c.set_id IN (${placeholders}) AND s.user_id = $${ids.length + 1}
  `, [...ids, req.userId]);

  const filtered = filterCards(rows, req.query);
  const weighted = weightedSample(filtered, parseInt(count));
  res.json(weighted);
});

function weightedSample(cards, count) {
  if (!cards || cards.length === 0) return [];
  const actualCount = Math.min(count, cards.length);
  const selected = [];
  const remaining = [...cards];

  for (let i = 0; i < actualCount; i++) {
    const totalWeight = remaining.reduce((sum, c) => sum + (c.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (let j = 0; j < remaining.length; j++) {
      const weight = remaining[j].weight || 1;
      random -= weight;
      if (random <= 0) {
        selected.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return selected.map(({ weight, ...card }) => card);
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
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(`
    SELECT c.* FROM cards c
    JOIN sets s ON s.id = c.set_id
    WHERE c.set_id IN (${placeholders}) AND s.user_id = $${ids.length + 1}
  `, [...ids, req.userId]);

  const allCards = filterCards(rows, req.query);

  const familiarityWeights = { unfamiliar: 8, neutral: 3, familiar: 1 };
  const NEW_CARD_BONUS = 25;

  const weighted = allCards.map(c => {
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
  const { rows: totalCardsRows } = await query(`
    SELECT COUNT(*)::int AS count FROM cards c
    JOIN sets s ON s.id = c.set_id WHERE s.user_id = $1
  `, [req.userId]);

  const { rows: totalSetsRows } = await query(
    'SELECT COUNT(*)::int AS count FROM sets WHERE user_id = $1',
    [req.userId]
  );

  const { rows: familiarityRows } = await query(`
    SELECT c.familiarity, COUNT(*)::int AS count
    FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE s.user_id = $1
    GROUP BY c.familiarity
  `, [req.userId]);

  const { rows: troubleWords } = await query(`
    SELECT c.front, c.back, c.incorrect_count, c.correct_count,
      CASE
        WHEN c.correct_count = 0 AND c.incorrect_count > 0 THEN c.incorrect_count * 100
        WHEN c.correct_count = 0 THEN 0
        ELSE c.incorrect_count::float / c.correct_count
      END AS trouble_score
    FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE s.user_id = $1 AND c.incorrect_count > 0
    ORDER BY trouble_score DESC
    LIMIT 5
  `, [req.userId]);

  const familiarityMap = { familiar: 0, neutral: 0, unfamiliar: 0 };
  familiarityRows.forEach(f => { familiarityMap[f.familiarity] = f.count; });

  res.json({
    totalCards: totalCardsRows[0].count,
    totalSets: totalSetsRows[0].count,
    familiarity: familiarityMap,
    troubleWords,
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

  const client = await getClient();
  let setsCreated = 0, setsUpdated = 0, cardsCreated = 0, cardsUpdated = 0;

  try {
    await client.query('BEGIN');

    for (const setData of importedSets) {
      if (!setData.name) continue;

      // Upsert set: create or update-timestamp on name collision
      const { rows: setRows } = await client.query(`
        INSERT INTO sets (name, user_id, created_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (name, user_id) DO UPDATE SET updated_at = NOW()
        RETURNING id, (xmax = 0) AS is_new
      `, [setData.name, req.userId, setData.created_at || new Date().toISOString()]);

      const setId = setRows[0].id;
      if (setRows[0].is_new) setsCreated++; else setsUpdated++;

      for (const card of (setData.cards || [])) {
        if (!card.front || !card.back) continue;
        const front = card.front.trim();
        const back = card.back.trim();

        // Upsert card: on collision, keep the higher counts and the imported familiarity
        const { rows: cardRows } = await client.query(`
          INSERT INTO cards (set_id, front, back, familiarity, correct_count, incorrect_count)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (set_id, front, back) DO UPDATE SET
            familiarity = EXCLUDED.familiarity,
            correct_count = GREATEST(EXCLUDED.correct_count, cards.correct_count),
            incorrect_count = GREATEST(EXCLUDED.incorrect_count, cards.incorrect_count)
          RETURNING (xmax = 0) AS is_new
        `, [setId, front, back, card.familiarity || 'unfamiliar', card.correct_count || 0, card.incorrect_count || 0]);

        if (cardRows[0].is_new) cardsCreated++; else cardsUpdated++;
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Import successful', setsCreated, setsUpdated, cardsCreated, cardsUpdated });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Only listen in local development (Vercel handles the port in production)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
