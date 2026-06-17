# Edit & Navigate Cards While Reviewing — Design

Date: 2026-06-17

## Summary

Add two capabilities to Review Mode (`src/pages/ReviewMode.jsx`):

1. **Inline card editing** — an edit (✏️) button on the flashcard lets the owner edit
   the card's front/back text in place and save it. No save means no change.
2. **Prev/next navigation** — left (◀ back) and right (▶ skip) arrows let the user
   move between cards in the session to recover from a misclicked swipe.

Editing is **owner-only** (logged-in users reviewing their own sets); shared and
anonymous reviews remain read-only. Scope is limited to editing front/back text —
no card deletion and no manual familiarity picker.

## Backend

### New endpoint: `PATCH /api/cards/:id`

Add to `server/index.js`, modeled on the existing `PATCH /api/cards/:id/familiarity`.

```js
app.patch('/api/cards/:id', requireAuth, async (req, res) => {
  const { front, back } = req.body
  if (!front?.trim() || !back?.trim())
    return res.status(400).json({ error: 'Front and back are required' })

  // Ownership check via JOIN — 404 if the card is not in one of the user's sets.
  const { rows } = await query(`
    SELECT c.id FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE c.id = $1 AND s.user_id = $2
  `, [req.params.id, req.userId])
  if (rows.length === 0) return res.status(404).json({ error: 'Card not found' })

  await query('UPDATE cards SET front = $1, back = $2 WHERE id = $3',
    [front.trim(), back.trim(), req.params.id])
  res.json({ message: 'Updated' })
})
```

**Why a dedicated endpoint** rather than reusing `PUT /api/sets/:id`: review only loads a
sampled subset of a set's cards, so the full card list isn't available to re-send.
Updating a single card **in place by ID also preserves its familiarity and quiz stats**
automatically — unlike the set-replace path in `PUT /api/sets/:id`, which re-matches stats
by exact front+back text.

Owner-only behavior comes for free from the `JOIN sets ... WHERE s.user_id = req.userId`
check: a non-owner gets 404, an unauthenticated request gets 401 via `requireAuth`.

## Frontend — `src/pages/ReviewMode.jsx`

### Inline editing

- New state: `editing` (bool), `editFront` (string), `editBack` (string),
  `editSaving` (bool), `editError` (string).
- A small ✏️ button positioned top-right of the flashcard (mirroring the `set_name`
  badge top-left). Rendered only when `user && !isShared`.
- Clicking ✏️ calls `stopPropagation` (so the card does not flip) and enters edit mode:
  seeds `editFront`/`editBack` from the card's **real** `front`/`back` (not the
  display-swapped `getFront`/`getBack` values, so editing is unambiguous regardless of the
  "Show First" toggle), and replaces the card faces with two labeled text inputs plus
  **Save** and **Cancel** buttons.
- While editing: drag is disabled, the rate buttons are disabled, and the nav arrows are
  disabled — nothing can advance or change the card mid-edit.
- **Save** → `PATCH /api/cards/:id` with the trimmed front/back. On success, update that
  card object inside the local `cards` array (so the new text shows immediately) and exit
  edit mode. On failure, show `editError` and stay in edit mode.
- **Cancel** → discard edits and exit edit mode.

### Prev/next navigation

Two arrow buttons (◀ ▶) flanking the flashcard. They are **navigation-only** and never
POST familiarity:

- **◀ Back**: `currentIndex--` to view the previous card. Disabled at index 0.
- **▶ Skip/forward**: `currentIndex++` without recording a rating for the current card.
  Disabled at the last card.
- Navigating resets flip state (`setIsFlipped(false)`) and exits edit mode. Transitions
  animate via the existing `AnimatePresence` keyed on `currentIndex`.
- The three swipe/rate buttons and drag still record familiarity and advance, as today.

### Correct tally with per-card ratings

Replace the running `results` counter with a per-card rating record so re-rating after
navigating back does not double-count:

- New state `ratings`: a map of `cardIndex → familiarity` for cards rated this session.
- Rating a card sets `ratings[currentIndex] = familiarity` (replacing any prior value for
  that index) and POSTs to the server as today (the server familiarity is overwritten
  correctly on each rating).
- The end-screen tally (familiar / neutral / unfamiliar) is **derived by counting the
  values in `ratings`** — each card contributes exactly once, at its final rating.
- Skipped (never-rated) cards are absent from the map and are not counted.
- "Review Again" / restart and a fresh `startReview` clear `ratings`.
- Completion still triggers when the **last** card is rated (`currentIndex === length - 1`);
  the derived tally is shown on the completion screen.

## Testing

### Server — `server/test/api.test.js`

Following the `PATCH /api/cards/:id/familiarity` test patterns:

- Owner updates a card → 200, and a subsequent read shows the new front/back.
- Missing/blank `front` or `back` → 400.
- Non-owner updating another user's card → 404.
- Unauthenticated request → 401.
- (Sanity) familiarity/stats on the updated card are unchanged after a text edit.

### Frontend — `src/test/ReviewMode.test.jsx`

- Edit button is shown for an owner review and hidden for a shared review.
- Clicking edit shows front/back inputs; the card does not flip.
- Save calls `PATCH /api/cards/:id` and the displayed card text updates.
- Cancel reverts without calling the API.
- Back/forward arrows move between cards; arrows are disabled at the boundaries.
- Going back to a rated card and re-rating it produces a correct (non-double-counted)
  tally on the completion screen.

## Out of scope

- Deleting cards during review.
- A manual familiarity picker separate from text editing.
- Editing cards in shared or anonymous (logged-out) reviews.
