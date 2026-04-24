# KoreaQuiz

A Korean-Indonesian flashcard and quiz web app for personal vocabulary study. Runs locally with a Node.js backend and React frontend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router 7, Framer Motion, Tailwind CSS 4 |
| Backend | Express 5, Node.js (CommonJS) |
| Database | SQLite via `better-sqlite3` |

---

## Features

### Flashcard Review
- Swipe right → familiar, left → unfamiliar, up → neutral
- Cards weighted so weak cards appear more often
- Flip animation to reveal front/back
- Configurable direction: Korean→Indonesian or Indonesian→Korean

### Spelling Quiz
- Type the answer for each card
- Case-insensitive matching
- Score summary and results table at the end
- Adjustable question direction

### Word Browser
- Search across all cards and sets
- Filter by familiarity (familiar / neutral / unfamiliar)
- Inline recategorize without leaving the page
- Grouped by set

### Set Management
- Bulk import cards using configurable delimiters (default: newline + ` - `)
- Edit set name and cards while preserving progress
- Delete sets with confirmation

### Dashboard & Stats
- Total cards and sets
- Familiarity breakdown with animated progress bars
- Top 5 trouble words (highest incorrect attempt rate)
- Per-set card breakdown

### Data Portability
- Export all data as JSON (full backup)
- Import / merge from a backup file

### Authentication
- Register and login with username + password
- Passwords hashed with `scrypt` (salt:hash format)
- Token-based sessions stored in SQLite

---

## Database Schema

```
users         id, username, password_hash, created_at
sessions      token, user_id, created_at
sets          id, user_id, name, created_at, updated_at
cards         id, set_id, front, back, familiarity, correct_count, incorrect_count
quiz_history  id, card_id, is_correct, created_at
```

`front` = Korean side, `back` = Indonesian side.

---

## Card Weighting Algorithm

Quiz mode selects cards with a combined weight:

```
familiarity weight  : unfamiliar=8, neutral=3, familiar=1
difficulty weight   : new card=25×, never-correct=(incorrect+5), mixed=1+(incorrect/correct)×2
final weight        = familiarity × difficulty
```

Review mode uses equal weights (weight: 1 for all).

---

## Project Structure

```
Quizlet/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx       # Auth (login/register tabs)
│   │   ├── Dashboard.jsx       # Home, stats, set list
│   │   ├── CreateSet.jsx       # Bulk card import
│   │   ├── EditSet.jsx         # Edit existing set
│   │   ├── ReviewMode.jsx      # Swipe flashcard review
│   │   ├── SpellingQuiz.jsx    # Type-answer quiz
│   │   ├── WordBrowser.jsx     # Browse & recategorize cards
│   │   └── ProfilePage.jsx     # Export / import data
│   ├── components/
│   │   ├── SetFilter.jsx       # Search & sort sets
│   │   └── CardFilters.jsx     # Filter cards by familiarity
│   ├── context/
│   │   └── AuthContext.jsx     # Auth state & authenticated fetch wrapper
│   ├── App.jsx                 # Router & nav bar
│   └── index.css               # Tailwind + glass-morphism styles
├── server/
│   ├── index.cjs               # Express API (all routes)
│   └── db.cjs                  # SQLite setup & migrations
├── vite.config.js
├── package.json
└── index.html
```

---

## Setup & Running

**Requirements:** Node.js 18+

```bash
# Install dependencies
npm install

# Start dev server (frontend + backend concurrently)
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Vite proxies `/api/*` to the backend automatically

```bash
# Production build
npm run build
npm run preview
```

The SQLite database (`flashcards.db`) is created automatically on first run.

---

## API Overview

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get session token |
| POST | `/api/auth/logout` | Invalidate token |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/sets` | List sets with card stats |
| POST | `/api/sets` | Create set |
| PUT | `/api/sets/:id` | Update set |
| DELETE | `/api/sets/:id` | Delete set |
| GET | `/api/cards/browse` | Browse all cards (with filter) |
| GET | `/api/cards/review` | Weighted cards for review |
| GET | `/api/cards/quiz` | Weighted cards for quiz |
| PATCH | `/api/cards/:id/familiarity` | Update familiarity |
| POST | `/api/cards/:id/quiz-result` | Record quiz answer |
| GET | `/api/stats` | Familiarity & trouble word stats |
| GET | `/api/export` | Export all data as JSON |
| POST | `/api/import` | Import / merge backup |

All endpoints except `/api/auth/register` and `/api/auth/login` require `Authorization: Bearer <token>`.
