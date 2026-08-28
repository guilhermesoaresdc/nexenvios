-- Nex Envios — fundação: organizações (clientes), usuários, sessões, créditos.
--
-- O banco é o Postgres do Supabase. A aplicação conecta com o papel dono
-- (DATABASE_URL) e o isolamento entre clientes é garantido na camada de
-- consulta: NENHUMA query de cliente roda sem `org_id`. Ver src/db/tenant.ts.
--
-- O RLS é habilitado em todas as tabelas sem política alguma para os papéis
-- `anon` e `authenticated`. Isso tranca o PostgREST do Supabase: mesmo que a
-- chave publicável vaze, não há leitura possível pela API REST.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────── tipos

DO $$ BEGIN
  CREATE TYPE org_status AS ENUM ('ativo', 'suspenso', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- superadmin  = time Nex Envios: enxerga todos os clientes
  -- admin       = dono da conta do cliente
  -- operador    = cria e acompanha disparos
  -- visualizador = só leitura
  CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'operador', 'visualizador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE channel AS ENUM ('whatsapp_oficial', 'whatsapp_nao_oficial', 'sms', 'rcs', 'voz');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM (
    'rascunho', 'agendada', 'enviando', 'pausada', 'concluida', 'cancelada', 'falhou'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dispatch_status AS ENUM (
    'pendente', 'enviando', 'enviado', 'entregue', 'lido', 'respondido', 'falhou', 'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE credit_kind AS ENUM ('recarga', 'consumo', 'estorno', 'ajuste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE instance_status AS ENUM ('desconectado', 'conectando', 'conectado', 'banido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────── organizações

CREATE TABLE IF NOT EXISTS organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         citext NOT NULL UNIQUE,
  document     text,
  contact_name text,
  contact_email citext,
  contact_phone text,
  status       org_status NOT NULL DEFAULT 'ativo',
  timezone     text NOT NULL DEFAULT 'America/Sao_Paulo',
  -- A organização interna do time Nex Envios. Só existe uma.
  is_platform  boolean NOT NULL DEFAULT false,
  -- Saldo em créditos. 1 crédito = 1 real; o preço por canal é definido em
  -- `channel_prices`. Nunca some sozinho: toda mudança passa por credit_ledger.
  credits      numeric(14,4) NOT NULL DEFAULT 0,
  -- Deixar o saldo furar até este limite (crédito de confiança do admin).
  credit_limit numeric(14,4) NOT NULL DEFAULT 0,
  daily_cap    integer,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_platform_unica
  ON organizations ((true)) WHERE is_platform;

-- ────────────────────────────────────────────────────────── usuários

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         citext NOT NULL UNIQUE,
  password_hash text,
  role          user_role NOT NULL DEFAULT 'operador',
  active        boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_org_idx ON users (org_id) WHERE active;

CREATE TABLE IF NOT EXISTS sessions (
  -- sha256 do token; o token cru só existe no cookie do navegador.
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text,
  -- Quando o superadmin "entra como cliente", a sessão dele aponta para a
  -- organização visitada sem trocar a identidade de quem está logado.
  acting_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expira_idx ON sessions (expires_at);

-- Convite e recuperação de senha usam a mesma tabela: os dois são
-- "prove que é você e defina uma senha", com validade diferente.
CREATE TABLE IF NOT EXISTS password_tokens (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('convite', 'recuperacao')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_tokens_user_idx ON password_tokens (user_id);

-- ────────────────────────────────────────────────────────── créditos

CREATE TABLE IF NOT EXISTS credit_ledger (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        credit_kind NOT NULL,
  -- Positivo credita, negativo debita. O saldo em organizations.credits é o
  -- somatório desta coluna — mantido por gatilho para não custar um SUM por tela.
  delta       numeric(14,4) NOT NULL,
  balance_after numeric(14,4),
  description text,
  campaign_id uuid,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_org_idx ON credit_ledger (org_id, created_at DESC);

CREATE OR REPLACE FUNCTION aplicar_credito() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE saldo numeric(14,4);
BEGIN
  UPDATE organizations
     SET credits = credits + NEW.delta, updated_at = now()
   WHERE id = NEW.org_id
   RETURNING credits INTO saldo;
  NEW.balance_after := saldo;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS credit_ledger_aplica ON credit_ledger;
CREATE TRIGGER credit_ledger_aplica
  BEFORE INSERT ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION aplicar_credito();

-- Preço por mensagem, por canal. org_id nulo = tabela padrão da plataforma;
-- uma linha com org_id preenchido sobrescreve o padrão daquele cliente.
CREATE TABLE IF NOT EXISTS channel_prices (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  uuid REFERENCES organizations(id) ON DELETE CASCADE,
  channel channel NOT NULL,
  price   numeric(10,4) NOT NULL CHECK (price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_prices_org_canal
  ON channel_prices (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), channel);

-- ─────────────────────────────────────────────────── auditoria e sistema

CREATE TABLE IF NOT EXISTS audit_log (
  id        bigserial PRIMARY KEY,
  org_id    uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action    text NOT NULL,
  entity    text,
  entity_id text,
  meta      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip        text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
