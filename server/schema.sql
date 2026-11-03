-- =====================================================================
-- schema.sql — database design for Haven Desk Collective.
-- COURSE NOTES (Full-Stack Bootcamp, step 4: Authentication)
--
-- Step 3 (Tinker Commons) had tools + reservations. Step 4 adds the
-- two tables every authenticated app needs:
--
--   users    — one row per account. We store a password HASH and a
--              per-user SALT, never the password itself. If this file
--              leaked tomorrow, nobody's password would be in it.
--   sessions — one row per signed-in session. The browser holds only
--              a random TOKEN; the row here is what makes that token
--              mean "this is Maya, signed in until Friday". Signing
--              out DELETES the row, which is what actually ends it.
--
-- bookings.user_id is a FOREIGN KEY to users.id: a booking belongs
-- to an account, and the API only ever shows a user their own rows.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE, -- one account per email, case-insensitive
  password_hash TEXT NOT NULL,        -- scrypt hash (hex), never the password
  salt          TEXT NOT NULL,        -- random per user, so identical passwords hash differently
  plan          TEXT NOT NULL DEFAULT 'payg', -- payg | regular | resident
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,        -- 32 random bytes, hex —unguessable
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL            -- sessions die after 7 days
);

CREATE TABLE IF NOT EXISTS spaces (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL,             -- pod | desk | meeting | studio
  seats    INTEGER NOT NULL,
  price    INTEGER NOT NULL,          -- dollars per hour
  rating   REAL NOT NULL,
  bookings INTEGER NOT NULL DEFAULT 0,
  blurb    TEXT NOT NULL,
  perks    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  ref        TEXT PRIMARY KEY,        -- e.g. 'HD-AB12CD'
  space_id   TEXT NOT NULL REFERENCES spaces(id),
  space_name TEXT NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  date       TEXT NOT NULL,           -- 'YYYY-MM-DD'
  start_hour INTEGER NOT NULL,        -- 8..17 (24h clock)
  hours      INTEGER NOT NULL,        -- 1..4, must end by 18:00
  extras     TEXT NOT NULL DEFAULT '[]', -- JSON array of extra ids
  total      REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_space ON bookings(space_id, date, status);
