# Guest Mode — Design Spec

**Date:** 2026-06-26
**Status:** Approved, ready for implementation planning

## Summary

Add a time-boxed guest mode. A visitor can start a guest session that lasts a
configurable duration (default 1 hour), with pre-seeded sample content and
capped resources. When the timer expires the guest is locked out and their data
is wiped. At most a configurable number of guests (default 10) may be active at
once. Admins can see active guests and terminate any of them.

## Core Model — a guest is a temporary user

A guest is a row in the existing `users` table, not a parallel system. This
reuses all existing machinery: ownership via `user_id`, the
`ON DELETE CASCADE` chain (`users → sets → cards → quiz_history`, and
`users → sessions`), session-based auth, and the admin delete endpoint.

**Wiping a guest's data is `DELETE FROM users WHERE id = <guest>`** — the cascade
removes their sets, cards, quiz history, and sessions automatically.

### Schema additions

Follow the existing dual Postgres/SQLite migration pattern in `server/db.js`
(idempotent `IF NOT EXISTS` column checks).

- `users.is_guest` — BOOLEAN, default FALSE (SQLite: INTEGER default 0)
- `users.expires_at` — TIMESTAMPTZ NULL (SQLite: TEXT NULL). Source of truth for
  the admin countdown and the lazy purge. NULL for normal users.
- New `app_settings` table:
  - `key` TEXT PRIMARY KEY
  - `value` TEXT NOT NULL
  - Seeded on init with `guest_ttl_minutes=60` and `guest_max_concurrent=10`
    (only inserted if absent, so admin edits persist across restarts).
- Index: `idx_users_is_guest_expires ON users(is_guest, expires_at)` to keep the
  purge and concurrency-count queries cheap.

## Becoming a guest — `POST /api/auth/guest` (public, no auth)

1. **Purge expired guests first** (lazy cleanup, frees slots):
   `DELETE FROM users WHERE is_guest = TRUE AND expires_at < now()`.
2. **Check the cap**: count remaining active guests
   (`SELECT COUNT(*) FROM users WHERE is_guest = TRUE AND expires_at > now()`).
   If `>= guest_max_concurrent`, return **503** with
   `{ error: "Guest spots are full, please try again shortly." }`.
3. **Create the guest user**:
   - username: `guest_<6 hex chars>` (this is the admin-facing label/ID)
   - password_hash: a random throwaway hash (guests never log in again)
   - `is_guest = TRUE`, `expires_at = now() + guest_ttl_minutes`
4. **Seed sample content**: insert 1–2 hardcoded Korean-vocab demo sets (defined
   in a small seed module, e.g. `server/guestSeed.js`) owned by the new guest, so
   review/quiz/spelling are immediately usable.
5. **Create a session** with `expires_at = guest expiry`. The existing
   `requireAuth` session check (`expires_at > now()`) then locks the guest out at
   the hour mark with no extra logic.
6. Respond with `{ token, user: { id, username, is_admin: false, is_guest: true, expires_at } }`.

### Guest logout

On logout, if the user is a guest, delete the guest account entirely
(`DELETE FROM users WHERE id = <guest>`) rather than only the session — the data
is throwaway and this frees a concurrency slot immediately.

## Resource limits (server-side, in the write paths)

Enforced with a small `is_guest` lookup in only the endpoints that create data,
so normal-user request paths are unaffected:

- **Max 5 sets total** per guest — checked in `POST /api/sets` and `POST /api/import`.
- **Max 100 cards per set** — checked in `POST /api/sets`, `PUT /api/sets/:id`,
  and `POST /api/import`.
- **Import** is allowed but clamped to the same caps: at most 5 sets, at most
  100 cards per set.

Exceeding a cap returns **403** with a clear, user-facing message
(e.g. `"Guest accounts are limited to 5 sets."`). The frontend surfaces it inline.

Sharing remains enabled for guests; share links simply 404 after the wipe.

## Admin panel (extends the existing `ProfilePage` admin section)

### Endpoints

- `GET /api/admin/guests` (requireAuth + requireAdmin). Purges expired guests
  first, then returns active guests with, per guest:
  - `id`, `username` (label/ID)
  - `created_at` (started-at)
  - `expires_at` (client computes time remaining)
  - `set_count`, `card_count` (single grouped query joining sets/cards)
- **Terminate**: reuse the existing `DELETE /api/admin/users/:id` (cascade wipe;
  already blocks deleting your own account).
- `GET /api/admin/settings` and `PUT /api/admin/settings` (requireAuth +
  requireAdmin): read/update `guest_ttl_minutes` and `guest_max_concurrent`.
  Validate as positive integers.

### UI

- New "Active Guests" table: label, started-at, live client-side countdown
  derived from `expires_at`, set/card counts, and a Terminate button.
- Two number inputs (TTL minutes, max concurrent) wired to the settings endpoints.

## Frontend

- **LoginPage**: a "Continue as guest" button calling a new
  `AuthContext.loginAsGuest()` (POSTs `/api/auth/guest`, stores the token like a
  normal login). Handles the 503 "spots full" response with a friendly message.
- **Guest banner**: a persistent countdown ("Guest session — 47:12 left"). On
  expiry or any `401`, redirect to login with "Your guest session ended."
- The `user` object carries `is_guest` and `expires_at` so the UI can render the
  countdown and surface caps.
- Cap-exceeded (403) errors are shown inline where the user hits them.

## Testing (Vitest + supertest, matching existing suites)

- Guest creation seeds the sample set(s) and returns a working token.
- Cap enforcement: 6th set rejected; 101st card rejected; import clamped.
- Concurrency cap: the 11th concurrent guest gets 503.
- Expiry: an expired guest's token is rejected (existing session check), and the
  next guest creation / login purges the expired row.
- Admin: `GET /api/admin/guests` lists active guests with counts; terminate
  cascades and frees a slot; settings update changes TTL/max behavior.

## Known minor limitation

The concurrency cap has a small race under Postgres: two guests created in the
same instant could both pass the count check and briefly allow an 11th. Stakes
are low, so we accept it rather than add row locking. Revisit only if strictness
is required.
