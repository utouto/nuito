CREATE TABLE IF NOT EXISTS invite_attempts (
  id TEXT PRIMARY KEY,
  client_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invite_attempts_client ON invite_attempts(client_hash, created_at);
