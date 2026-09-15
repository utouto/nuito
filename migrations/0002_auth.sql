ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN picture_url TEXT;

CREATE TABLE auth_attempts (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  can_register INTEGER NOT NULL CHECK(can_register IN (0,1)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at);
