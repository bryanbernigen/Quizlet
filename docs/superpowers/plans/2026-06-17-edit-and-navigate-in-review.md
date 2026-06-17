# Edit & Navigate Cards While Reviewing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner edit a card's text in place during Review Mode, and navigate (back/skip) between cards to recover from a misclicked swipe, with a session tally that stays correct.

**Architecture:** Add one owner-only `PATCH /api/cards/:id` endpoint that updates front/back in place (preserving stats). In `src/pages/ReviewMode.jsx`, replace the running results counter with a per-card `ratings` map (derived tally), add ◀/▶ navigation arrows, and add an inline ✏️ edit form on the flashcard.

**Tech Stack:** React 19, framer-motion, react-router-dom, Express 5 + better-sqlite3/pg, Vitest + Testing Library + supertest.

## Global Constraints

- Editing is **owner-only**: the ✏️ button renders only when `user && !isShared`; the API enforces ownership via a `cards JOIN sets WHERE s.user_id` check.
- No card deletion, no manual familiarity picker, no editing in shared/anonymous reviews.
- Card text fields are `front` and `back`; both are required and trimmed.
- Follow existing inline-style + framer-motion patterns already used in `ReviewMode.jsx`. Do not restructure the file.
- Run the full test suite with `npm test` (vitest). Single files: `npx vitest run <path>`.

---

## Task 1: Backend `PATCH /api/cards/:id` endpoint

**Files:**
- Modify: `server/index.js` (add route directly after the existing `PATCH /api/cards/:id/familiarity` handler, around line 486)
- Test: `server/test/api.test.js` (add a new `describe` block after the existing `describe('PATCH /api/cards/:id/familiarity', ...)` block, around line 696)

**Interfaces:**
- Consumes: existing helpers in `server/test/api.test.js` — `as(token)`, `mkSet(token, name, cards)`, `regularToken`, `adminToken`, and the imported `request` + `app`. Existing server helpers `query`, `requireAuth`, `req.userId`.
- Produces: `PATCH /api/cards/:id` accepting JSON body `{ front: string, back: string }`. Returns `200 { message: 'Updated' }` on success; `400 { error }` if front/back missing/blank; `404 { error }` if the card is not owned by the requester; `401` if unauthenticated.

- [ ] **Step 1: Write the failing tests**

Add this block to `server/test/api.test.js` immediately after the closing `});` of the `describe('PATCH /api/cards/:id/familiarity', ...)` block (after line 696):

```js
describe('PATCH /api/cards/:id', () => {
  let setId, cardId;
  beforeEach(async () => {
    setId = await mkSet(regularToken, 'Edit Card Set', [{ front: 'oldFront', back: 'oldBack' }]);
    const r = await as(regularToken).get(`/api/sets/${setId}/cards`);
    cardId = r.body[0].id;
  });

  test('200 and updates front/back', async () => {
    const res = await as(regularToken).patch(`/api/cards/${cardId}`).send({ front: 'newFront', back: 'newBack' });
    expect(res.status).toBe(200);

    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].front).toBe('newFront');
    expect(cards[0].back).toBe('newBack');
  });

  test('trims whitespace', async () => {
    await as(regularToken).patch(`/api/cards/${cardId}`).send({ front: '  spaced  ', back: '  out  ' });
    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].front).toBe('spaced');
    expect(cards[0].back).toBe('out');
  });

  test('preserves familiarity on text edit', async () => {
    await as(regularToken).patch(`/api/cards/${cardId}/familiarity`).send({ familiarity: 'familiar' });
    await as(regularToken).patch(`/api/cards/${cardId}`).send({ front: 'x', back: 'y' });
    const cards = (await as(regularToken).get(`/api/sets/${setId}/cards`)).body;
    expect(cards[0].familiarity).toBe('familiar');
  });

  test('missing front → 400', async () => {
    const res = await as(regularToken).patch(`/api/cards/${cardId}`).send({ back: 'onlyBack' });
    expect(res.status).toBe(400);
  });

  test('blank back → 400', async () => {
    const res = await as(regularToken).patch(`/api/cards/${cardId}`).send({ front: 'f', back: '   ' });
    expect(res.status).toBe(400);
  });

  test('non-owner → 404', async () => {
    const res = await as(adminToken).patch(`/api/cards/${cardId}`).send({ front: 'hijack', back: 'attempt' });
    expect(res.status).toBe(404);
  });

  test('non-existent card → 404', async () => {
    const res = await as(regularToken).patch('/api/cards/99999').send({ front: 'a', back: 'b' });
    expect(res.status).toBe(404);
  });

  test('no token → 401', async () => {
    const res = await request(app).patch(`/api/cards/${cardId}`).send({ front: 'a', back: 'b' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/test/api.test.js -t "PATCH /api/cards/:id$"`
Expected: FAIL — the success/validation tests fail because the route doesn't exist yet (an unknown PATCH route falls through; the 200/400 assertions will not be met). Note the `$` anchor so it does not also match the familiarity describe.

- [ ] **Step 3: Add the endpoint**

In `server/index.js`, add this handler directly after the `PATCH /api/cards/:id/familiarity` handler closes (after line 486):

```js
app.patch('/api/cards/:id', requireAuth, async (req, res) => {
  const { front, back } = req.body;
  if (!front || !front.trim() || !back || !back.trim()) {
    return res.status(400).json({ error: 'Front and back are required' });
  }
  const { rows } = await query(`
    SELECT c.id FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE c.id = $1 AND s.user_id = $2
  `, [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Card not found' });

  await query('UPDATE cards SET front = $1, back = $2 WHERE id = $3',
    [front.trim(), back.trim(), req.params.id]);
  res.json({ message: 'Updated' });
});
```

Note: place it after the more specific `/api/cards/:id/familiarity` route so Express matches the specific path first.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/test/api.test.js -t "PATCH /api/cards/:id$"`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Run the full server test file to confirm no regressions**

Run: `npx vitest run server/test/api.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/test/api.test.js
git commit -m "feat: add PATCH /api/cards/:id to edit card text"
```

---

## Task 2: Per-card ratings tally (derived results)

Replace the incremental `results` counter with a `ratings` map keyed by card index, so re-rating a card (after navigating back, added in Task 3) counts each card exactly once.

**Files:**
- Modify: `src/pages/ReviewMode.jsx`
- Test: `src/test/ReviewMode.test.jsx`

**Interfaces:**
- Consumes: existing `currentIndex`, `cards`, `advanceCard(familiarity)`, completion screen reading `results.familiar/neutral/unfamiliar`.
- Produces: `ratings` state (object `{ [index: number]: 'familiar'|'neutral'|'unfamiliar' }`) and a derived `results` object with the same shape the completion screen already consumes. `advanceCard` records into `ratings` instead of incrementing.

- [ ] **Step 1: Write the failing test**

Add this test inside the top-level `describe('ReviewMode', ...)` block in `src/test/ReviewMode.test.jsx` (e.g. after the `'results screen shows total reviewed count'` test, around line 395). It rates the only card, and the completion tally should read exactly 1 familiar:

```js
it('completion tally counts each rated card once', async () => {
  const user = userEvent.setup()
  mockApiFetch.mockImplementation((url) => {
    if (url === '/api/sets') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
    }
    if (url.startsWith('/api/cards/review')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]) })
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  })

  render(<TestWrapper><ReviewMode /></TestWrapper>)

  await waitFor(() => expect(screen.getByText('Korean Basics')).toBeInTheDocument())
  await user.click(screen.getAllByRole('checkbox')[0])
  await user.click(screen.getByRole('button', { name: /Start Review/i }))
  await waitFor(() => expect(screen.getByText('안녕하세요')).toBeInTheDocument())

  await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

  await waitFor(() => expect(screen.getByText('Review Complete!')).toBeInTheDocument())

  // The "Familiar" stat card value should be exactly 1.
  const familiarLabel = screen.getByText('Familiar')
  const statCard = familiarLabel.closest('.stat-card')
  expect(statCard).toHaveTextContent('1')
})
```

- [ ] **Step 2: Run the test to verify it passes with the OLD code (baseline) — it should already pass**

Run: `npx vitest run src/test/ReviewMode.test.jsx -t "counts each rated card once"`
Expected: PASS — the current incremental counter already yields 1 for a single rating. This test is a regression guard; it must keep passing after the refactor. (If it fails now, the test selector is wrong — fix the test before refactoring.)

- [ ] **Step 3: Refactor to a ratings map + derived results**

In `src/pages/ReviewMode.jsx`:

Replace the results state declaration (line 27):

```js
  const [results, setResults] = useState({ familiar: 0, neutral: 0, unfamiliar: 0 })
```

with:

```js
  const [ratings, setRatings] = useState({}) // { [cardIndex]: 'familiar' | 'neutral' | 'unfamiliar' }
```

Add a derived `results` near the other derived values (e.g. just after `const card = cards[currentIndex]` at line 164):

```js
  const results = { familiar: 0, neutral: 0, unfamiliar: 0 }
  Object.values(ratings).forEach(f => { if (results[f] !== undefined) results[f]++ })
```

In `advanceCard` (line 111), replace:

```js
    setResults(prev => ({ ...prev, [familiarity]: prev[familiarity] + 1 }))
```

with:

```js
    setRatings(prev => ({ ...prev, [currentIndex]: familiarity }))
```

In `startReview` (line 103), replace:

```js
      setResults({ familiar: 0, neutral: 0, unfamiliar: 0 })
```

with:

```js
      setRatings({})
```

- [ ] **Step 4: Run the test and the existing tally tests to verify they pass**

Run: `npx vitest run src/test/ReviewMode.test.jsx`
Expected: PASS (the new test plus all existing tests, including `'results screen shows total reviewed count'`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ReviewMode.jsx src/test/ReviewMode.test.jsx
git commit -m "refactor: derive review tally from per-card ratings map"
```

---

## Task 3: Prev/next navigation arrows

Add ◀ back and ▶ skip buttons flanking the flashcard. Navigation never posts familiarity; it only moves `currentIndex` and resets flip/edit state. Combined with Task 2, re-rating a card after going back keeps the tally correct.

**Files:**
- Modify: `src/pages/ReviewMode.jsx`
- Test: `src/test/ReviewMode.test.jsx`

**Interfaces:**
- Consumes: `currentIndex`, `setCurrentIndex`, `cards`, `setIsFlipped`, `swiping`, and (from Task 4, guarded defensively now) an `editing` flag — declare `editing` state in this task as `const [editing, setEditing] = useState(false)` so the guards work even before the edit UI exists.
- Produces: `goPrev()` and `goNext()` handlers; two buttons with accessible names `◀ Back` and `Skip ▶`. `goPrev` disabled at `currentIndex === 0`; `goNext` disabled at `currentIndex === cards.length - 1`.

- [ ] **Step 1: Write the failing tests**

Use the default 3-card mock (`mockCards`). Add inside `describe('ReviewMode', ...)`:

```js
describe('Navigation arrows', () => {
  const startThreeCardReview = async (user) => {
    render(<TestWrapper><ReviewMode /></TestWrapper>)
    await waitFor(() => expect(screen.getByText('Korean Basics')).toBeInTheDocument())
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: /Start Review/i }))
    await waitFor(() => expect(screen.getByText('안녕하세요')).toBeInTheDocument())
  }

  it('skip (▶) advances without rating, back (◀) returns', async () => {
    const user = userEvent.setup()
    await startThreeCardReview(user)

    await user.click(screen.getByRole('button', { name: 'Skip ▶' }))
    await waitFor(() => expect(screen.getByText('감사합니다')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '◀ Back' }))
    await waitFor(() => expect(screen.getByText('안녕하세요')).toBeInTheDocument())
  })

  it('back is disabled on the first card', async () => {
    const user = userEvent.setup()
    await startThreeCardReview(user)
    expect(screen.getByRole('button', { name: '◀ Back' })).toBeDisabled()
  })

  it('skip is disabled on the last card', async () => {
    const user = userEvent.setup()
    await startThreeCardReview(user)
    await user.click(screen.getByRole('button', { name: 'Skip ▶' }))
    await waitFor(() => expect(screen.getByText('감사합니다')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Skip ▶' }))
    await waitFor(() => expect(screen.getByText('사랑')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Skip ▶' })).toBeDisabled()
  })

  it('skipping does not count toward the tally', async () => {
    const user = userEvent.setup()
    await startThreeCardReview(user)
    // Skip card 1, skip card 2, then rate card 3 familiar → tally should be exactly 1 familiar.
    await user.click(screen.getByRole('button', { name: 'Skip ▶' }))
    await waitFor(() => expect(screen.getByText('감사합니다')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Skip ▶' }))
    await waitFor(() => expect(screen.getByText('사랑')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '✅ Familiar' }))
    await waitFor(() => expect(screen.getByText('Review Complete!')).toBeInTheDocument())
    const statCard = screen.getByText('Familiar').closest('.stat-card')
    expect(statCard).toHaveTextContent('1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/ReviewMode.test.jsx -t "Navigation arrows"`
Expected: FAIL — buttons `◀ Back` / `Skip ▶` are not found.

- [ ] **Step 3: Add the `editing` state and navigation handlers**

In `src/pages/ReviewMode.jsx`, add state near the other `useState` calls (e.g. after line 30 `const [showCard, setShowCard] = useState(true)`):

```js
  const [editing, setEditing] = useState(false)
```

Add the handlers near `advanceCard` (after `handleButtonSwipe`, around line 158):

```js
  const goPrev = () => {
    if (swiping || editing || currentIndex === 0) return
    setIsFlipped(false)
    setEditing(false)
    setCurrentIndex(prev => prev - 1)
  }

  const goNext = () => {
    if (swiping || editing || currentIndex >= cards.length - 1) return
    setIsFlipped(false)
    setEditing(false)
    setCurrentIndex(prev => prev + 1)
  }
```

- [ ] **Step 4: Render the arrows around the flashcard**

In the review screen JSX, wrap the existing `<div className="flashcard-container">` (line 523) with a flex row that places a button on each side. Replace the opening line:

```jsx
      <div className="flashcard-container" style={{ position: 'relative' }}>
```

with:

```jsx
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={goPrev}
          disabled={currentIndex === 0 || editing || swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ padding: '12px 14px', opacity: (currentIndex === 0 || editing || swiping) ? 0.4 : 1 }}
        >
          ◀ Back
        </motion.button>
      <div className="flashcard-container" style={{ position: 'relative' }}>
```

Then find the matching closing `</div>` of `flashcard-container` (line 611, the `</div>` immediately after `</AnimatePresence>`) and replace it with:

```jsx
      </div>
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={goNext}
          disabled={currentIndex >= cards.length - 1 || editing || swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ padding: '12px 14px', opacity: (currentIndex >= cards.length - 1 || editing || swiping) ? 0.4 : 1 }}
        >
          Skip ▶
        </motion.button>
      </div>
```

(The first `</div>` closes `flashcard-container`; the new outer `</div>` closes the flex row.)

- [ ] **Step 5: Run the navigation tests to verify they pass**

Run: `npx vitest run src/test/ReviewMode.test.jsx -t "Navigation arrows"`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full ReviewMode test file**

Run: `npx vitest run src/test/ReviewMode.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReviewMode.jsx src/test/ReviewMode.test.jsx
git commit -m "feat: add prev/next navigation arrows in review"
```

---

## Task 4: Inline card editing (✏️)

Add an owner-only ✏️ button on the flashcard that opens an inline edit form (front/back inputs + Save/Cancel). Save calls `PATCH /api/cards/:id` and updates the displayed card.

**Files:**
- Modify: `src/pages/ReviewMode.jsx`
- Test: `src/test/ReviewMode.test.jsx`

**Interfaces:**
- Consumes: `card`, `currentIndex`, `cards`, `setCards`, `apiFetch`, `user`, `isShared`, `editing`/`setEditing` (from Task 3), and `KoreanFlag`/`IndonesianFlag` (already imported at the top of `ReviewMode.jsx`).
- Produces: edit state `editFront`, `editBack`, `editSaving`, `editError`; handlers `startEdit(e)`, `cancelEdit()`, `saveEdit()`. The ✏️ button (accessible name contains `Edit`) renders only when `user && !isShared && !editing`. The form inputs are seeded from the card's real `front`/`back`.

- [ ] **Step 1: Set up the owner mock and reset, then write failing tests**

First, at the top of `src/test/ReviewMode.test.jsx`, ensure `mockUser.user` resets each test. In the top-level `beforeEach` (around line 88, after `vi.clearAllMocks()`), add:

```js
    mockUser.user = null
```

Add a new describe block inside `describe('ReviewMode', ...)`:

```js
describe('Inline edit', () => {
  const renderReview = async (user) => {
    mockApiFetch.mockImplementation((url, options) => {
      if (url === '/api/sets') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
      }
      if (url.startsWith('/api/cards/review')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCards) })
      }
      if (options?.method === 'PATCH' && /^\/api\/cards\/\d+$/.test(url)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'Updated' }) })
      }
      if (/^\/api\/cards\/\d+\/familiarity$/.test(url)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    render(<TestWrapper><ReviewMode /></TestWrapper>)
    await waitFor(() => expect(screen.getByText('Korean Basics')).toBeInTheDocument())
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: /Start Review/i }))
    await waitFor(() => expect(screen.getByText('안녕하세요')).toBeInTheDocument())
  }

  it('edit button is hidden when no user is logged in', async () => {
    const user = userEvent.setup()
    mockUser.user = null
    await renderReview(user)
    expect(screen.queryByRole('button', { name: /Edit card/i })).not.toBeInTheDocument()
  })

  it('edit button shows for a logged-in owner and opens the form', async () => {
    const user = userEvent.setup()
    mockUser.user = { id: 1, username: 'owner' }
    await renderReview(user)
    await user.click(screen.getByRole('button', { name: /Edit card/i }))
    expect(screen.getByDisplayValue('안녕하세요')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Halo')).toBeInTheDocument()
  })

  it('save calls PATCH and updates the displayed card text', async () => {
    const user = userEvent.setup()
    mockUser.user = { id: 1, username: 'owner' }
    await renderReview(user)
    await user.click(screen.getByRole('button', { name: /Edit card/i }))

    const frontInput = screen.getByDisplayValue('안녕하세요')
    await user.clear(frontInput)
    await user.type(frontInput, '반갑습니다')
    await user.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => expect(screen.getByText('반갑습니다')).toBeInTheDocument())
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/cards/1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('cancel discards changes without calling the API', async () => {
    const user = userEvent.setup()
    mockUser.user = { id: 1, username: 'owner' }
    await renderReview(user)
    await user.click(screen.getByRole('button', { name: /Edit card/i }))

    const frontInput = screen.getByDisplayValue('안녕하세요')
    await user.clear(frontInput)
    await user.type(frontInput, 'throwaway')
    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    await waitFor(() => expect(screen.getByText('안녕하세요')).toBeInTheDocument())
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/api/cards/1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/ReviewMode.test.jsx -t "Inline edit"`
Expected: FAIL — no `Edit card` button / no edit form.

- [ ] **Step 3: Add edit state and handlers**

In `src/pages/ReviewMode.jsx`, add state after the `editing` state from Task 3:

```js
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
```

Add handlers near `goNext` (after the navigation handlers):

```js
  const startEdit = (e) => {
    if (e) e.stopPropagation()
    if (!card) return
    setEditFront(card.front)
    setEditBack(card.back)
    setEditError('')
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editFront.trim() || !editBack.trim()) {
      setEditError('Both fields are required.')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await apiFetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: editFront.trim(), back: editBack.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save')
      const newFront = editFront.trim()
      const newBack = editBack.trim()
      setCards(prev => prev.map((c, i) => i === currentIndex ? { ...c, front: newFront, back: newBack } : c))
      setEditing(false)
    } catch (err) {
      setEditError('Failed to save changes. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }
```

- [ ] **Step 4: Render the ✏️ button and edit form on the card**

In the flashcard JSX, the ✏️ button sits alongside the existing `set_name` badge. Directly after the `set_name` badge block (the `{card.set_name && ( ... )}` block that ends around line 583), add:

```jsx
              {user && !isShared && !editing && (
                <motion.button
                  type="button"
                  aria-label="Edit card"
                  onClick={startEdit}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    position: 'absolute', top: 12, right: 14, zIndex: 10,
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    color: 'var(--accent-purple)', borderRadius: 10,
                    padding: '4px 10px', fontSize: '0.9rem', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ✏️
                </motion.button>
              )}
```

Then make the flip motion div conditional on `!editing`. Wrap the existing flip block — the `<motion.div ... animate={{ rotateY: isFlipped ? 180 : 0 }}>...</motion.div>` (lines 584–602) — in `{!editing ? ( ... ) : ( <editForm/> )}`. Concretely, replace the opening of that block:

```jsx
              <motion.div
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  transformStyle: 'preserve-3d',
                }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 25 }}
              >
```

with:

```jsx
              {editing ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    gap: 12, padding: 24, cursor: 'default',
                  }}
                >
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><KoreanFlag size={16} /> Korean (front)</label>
                    <input
                      className="form-input"
                      value={editFront}
                      onChange={e => setEditFront(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><IndonesianFlag size={16} /> Indonesian (back)</label>
                    <input
                      className="form-input"
                      value={editBack}
                      onChange={e => setEditBack(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  {editError && (
                    <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem', fontWeight: 600 }}>{editError}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button type="button" className="btn-primary" onClick={saveEdit} disabled={editSaving} style={{ padding: '8px 20px', opacity: editSaving ? 0.5 : 1 }}>
                      {editSaving ? '⏳ Saving...' : '💾 Save'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={editSaving} style={{ padding: '8px 20px' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
              <motion.div
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  transformStyle: 'preserve-3d',
                }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 25 }}
              >
```

Then close the conditional: find the matching `</motion.div>` that ends the flip block (after the Back face `</div>`, line 602) and replace that single `</motion.div>` with:

```jsx
              </motion.div>
              )}
```

- [ ] **Step 5: Disable flip and drag while editing**

In the outer flashcard `<motion.div>` (line 526), update the drag and click props so editing disables interaction:

Replace `drag={!swiping}` (line 541) with:

```jsx
              drag={!swiping && !editing}
```

Replace the `onClick` (line 569):

```jsx
              onClick={() => { if (!swiping) setIsFlipped(!isFlipped) }}
```

with:

```jsx
              onClick={() => { if (!swiping && !editing) setIsFlipped(!isFlipped) }}
```

- [ ] **Step 6: Disable the rate buttons while editing**

The three rate buttons (lines 615–644) use `disabled={swiping}`. Update each of the three to `disabled={swiping || editing}` and change each `opacity: swiping ? 0.5 : 1` to `opacity: (swiping || editing) ? 0.5 : 1`.

- [ ] **Step 7: Run the inline edit tests to verify they pass**

Run: `npx vitest run src/test/ReviewMode.test.jsx -t "Inline edit"`
Expected: PASS (4 tests).

- [ ] **Step 8: Run the full ReviewMode test file**

Run: `npx vitest run src/test/ReviewMode.test.jsx`
Expected: PASS (all tests, including Navigation arrows and the tally test).

- [ ] **Step 9: Commit**

```bash
git add src/pages/ReviewMode.jsx src/test/ReviewMode.test.jsx
git commit -m "feat: inline card editing during review"
```

---

## Task 5: Full suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — all server and client tests green.

- [ ] **Step 2: Manual smoke check (optional but recommended)**

Run: `npm run dev`, log in, start a review of your own set:
- Confirm ✏️ appears, opens the form, Save updates the visible text, Cancel reverts.
- Confirm ◀/▶ move between cards; ◀ disabled on card 1, ▶ disabled on last card.
- Confirm ✏️ does NOT appear in a shared-set review (`/review?sharedSet=...`).
- Misclick test: rate a card, press ◀, re-rate it correctly, finish — confirm the completion tally is not inflated.

- [ ] **Step 3: Commit any fixes** (only if Step 1/2 surfaced issues)

```bash
git add -A
git commit -m "fix: address review-edit verification findings"
```
