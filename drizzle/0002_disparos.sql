-- Nex Envios — contatos, canais e o motor de disparo.

-- ────────────────────────────────────────────────────────── contatos

CREATE TABLE IF NOT EXISTS contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- E.164 sem o '+': 5511987654321. Normalizado na entrada, sempre.
  phone       text,
  email       citext,
  name        text,
  external_id text,
  tags        text[] NOT NULL DEFAULT '{}',
  attributes  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Descadastro vale para a organização inteira, em qualquer canal.
  opted_out   boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  opted_out_reason text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_tem_endereco CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_phone ON contacts (org_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_org_idx ON contacts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contacts_nome_trgm ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_tags_idx ON contacts USING gin (tags);

CREATE TABLE IF NOT EXISTS contact_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  -- Denormalizado: a tela de disparo mostra o tamanho de cada lista e um
  -- COUNT por lista a cada render não escala.
  total       integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_lists_org_idx ON contact_lists (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_list_members (
  list_id    uuid NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS contact_list_members_contato ON contact_list_members (contact_id);

-- Importações de planilha: guardar o resultado explica ao cliente por que
-- "subi 10.000 e entraram 8.412".
CREATE TABLE IF NOT EXISTS import_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  list_id    uuid REFERENCES contact_lists(id) ON DELETE SET NULL,
  filename   text,
  total      integer NOT NULL DEFAULT 0,
  imported   integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  invalid    integer NOT NULL DEFAULT 0,
  opted_out  integer NOT NULL DEFAULT 0,
  sample     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_jobs_org_idx ON import_jobs (org_id, created_at DESC);

-- ─────────────────────────────────────────────────────────── canais

-- Credencial de provedor. `credentials` guarda o ciphertext AES-256-GCM —
-- nunca texto puro. org_id nulo = provedor da plataforma, herdado por todos
-- os clientes que não trouxerem o próprio.
CREATE TABLE IF NOT EXISTS channel_configs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  channel     channel NOT NULL,
  provider    text NOT NULL,
  label       text NOT NULL,
  credentials text,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active      boolean NOT NULL DEFAULT true,
  is_default  boolean NOT NULL DEFAULT false,
  -- Disjuntor: depois de N falhas seguidas o canal para de ser escolhido até
  -- esta hora passar. Evita queimar 50 mil mensagens contra um provedor caído.
  broken_until timestamptz,
  failure_streak integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_configs_org_idx ON channel_configs (org_id, channel) WHERE active;
CREATE INDEX IF NOT EXISTS channel_configs_plataforma ON channel_configs (channel) WHERE org_id IS NULL AND active;

-- Números de WhatsApp conectados (API não oficial / Evolution).
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  config_id     uuid REFERENCES channel_configs(id) ON DELETE CASCADE,
  name          text NOT NULL,
  instance_name text NOT NULL,
  phone         text,
  status        instance_status NOT NULL DEFAULT 'desconectado',
  qr_code       text,
  -- Aquecimento: um chip novo não manda 5.000 no primeiro dia sem ser banido.
  daily_cap     integer NOT NULL DEFAULT 300,
  sent_today    integer NOT NULL DEFAULT 0,
  counter_day   date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  min_interval_ms integer NOT NULL DEFAULT 4000,
  last_sent_at  timestamptz,
  last_seen_at  timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, instance_name)
);

CREATE INDEX IF NOT EXISTS whatsapp_instances_org_idx ON whatsapp_instances (org_id) WHERE active;

-- ────────────────────────────────────────────────────────── campanhas

CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  channel     channel NOT NULL,
  config_id   uuid REFERENCES channel_configs(id) ON DELETE SET NULL,
  status      campaign_status NOT NULL DEFAULT 'rascunho',

  -- Conteúdo. `body` aceita variáveis {{nome}} e spintax {a|b}.
  body        text NOT NULL DEFAULT '',
  subject     text,
  media_url   text,
  media_type  text,
  buttons     jsonb NOT NULL DEFAULT '[]'::jsonb,
  template_name text,
  -- Áudio do torpedo de voz / TTS.
  audio_url   text,

  -- Público resolvido na criação; a origem fica registrada para auditoria.
  audience_kind text NOT NULL DEFAULT 'lista',
  audience     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Ritmo (§ do motor). rate_per_minute limita o quanto sai por minuto;
  -- o jitter espalha os envios para não parecer robô.
  rate_per_minute integer NOT NULL DEFAULT 60,
  jitter_ms   integer NOT NULL DEFAULT 1500,
  -- Janela de silêncio em hora local da organização. Fora dela nada sai.
  quiet_start smallint NOT NULL DEFAULT 8,
  quiet_end   smallint NOT NULL DEFAULT 21,

  scheduled_at timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  paused_at    timestamptz,

  total       integer NOT NULL DEFAULT 0,
  pending     integer NOT NULL DEFAULT 0,
  sent        integer NOT NULL DEFAULT 0,
  delivered   integer NOT NULL DEFAULT 0,
  read        integer NOT NULL DEFAULT 0,
  replied     integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0,

  unit_price  numeric(10,4) NOT NULL DEFAULT 0,
  estimated_cost numeric(14,4) NOT NULL DEFAULT 0,
  actual_cost numeric(14,4) NOT NULL DEFAULT 0,

  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT campaigns_janela CHECK (quiet_start BETWEEN 0 AND 23 AND quiet_end BETWEEN 1 AND 24),
  CONSTRAINT campaigns_ritmo  CHECK (rate_per_minute BETWEEN 1 AND 6000)
);

CREATE INDEX IF NOT EXISTS campaigns_org_idx ON campaigns (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status, scheduled_at)
  WHERE status IN ('agendada', 'enviando');

-- Uma linha por destinatário. É a tabela que cresce; tudo aqui é indexado
-- pensando no motor (pegar o que venceu) e no histórico (filtrar por campanha).
CREATE TABLE IF NOT EXISTS dispatches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  channel     channel NOT NULL,
  config_id   uuid REFERENCES channel_configs(id) ON DELETE SET NULL,
  instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE SET NULL,

  to_address  text NOT NULL,
  to_name     text,
  body        text NOT NULL,
  media_url   text,

  status      dispatch_status NOT NULL DEFAULT 'pendente',
  attempts    smallint NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  delivered_at timestamptz,
  read_at     timestamptz,
  replied_at  timestamptz,

  provider    text,
  provider_message_id text,
  error_code  text,
  error_message text,
  cost        numeric(10,4) NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- O índice que o motor usa a cada batida: só as linhas que ainda podem sair.
CREATE INDEX IF NOT EXISTS dispatches_fila
  ON dispatches (scheduled_for) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS dispatches_org_idx ON dispatches (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dispatches_campanha_idx ON dispatches (campaign_id, status);
CREATE INDEX IF NOT EXISTS dispatches_provider_msg
  ON dispatches (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dispatches_destino_idx ON dispatches (org_id, to_address, created_at DESC);
-- Linha travada em 'enviando' por queda de processo: o motor recupera por aqui.
CREATE INDEX IF NOT EXISTS dispatches_presas ON dispatches (claimed_at) WHERE status = 'enviando';

-- ───────────────────────────────────────────── biblioteca e rascunhos

CREATE TABLE IF NOT EXISTS message_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  channel    channel,
  category   text,
  body       text NOT NULL,
  media_url  text,
  buttons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_templates_org_idx ON message_templates (org_id, created_at DESC);

-- Disparo salvo: a campanha inteira congelada antes de existir, para repetir.
CREATE TABLE IF NOT EXISTS saved_dispatches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  channel    channel NOT NULL,
  payload    jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_dispatches_org_idx ON saved_dispatches (org_id, created_at DESC);

-- ─────────────────────────────────────────────── respostas e API

CREATE TABLE IF NOT EXISTS inbound_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel     channel NOT NULL,
  from_address text NOT NULL,
  body        text,
  dispatch_id uuid REFERENCES dispatches(id) ON DELETE SET NULL,
  contact_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  raw         jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_org_idx ON inbound_messages (org_id, received_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  -- Prefixo visível na tela; o segredo só existe como sha256.
  prefix      text NOT NULL UNIQUE,
  key_hash    text NOT NULL,
  scopes      text[] NOT NULL DEFAULT '{envios:escrever,envios:ler}',
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys (org_id) WHERE revoked_at IS NULL;

-- Token curto usado nas URLs de webhook de retorno, por organização e canal.
CREATE TABLE IF NOT EXISTS webhook_tokens (
  token      text PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel    channel NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, channel)
);
