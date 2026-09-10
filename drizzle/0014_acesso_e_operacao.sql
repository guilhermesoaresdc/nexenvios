-- Aplicar antes de publicar o código de autenticação.
CREATE TABLE IF NOT EXISTS auth_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_expiry_ix ON auth_attempts (expires_at);
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_attempts FROM anon, authenticated;
