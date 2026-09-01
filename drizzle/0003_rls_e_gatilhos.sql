-- Nex Envios — trancar o PostgREST e manter os contadores em dia.
--
-- A aplicação fala com o Postgres pelo papel dono (DATABASE_URL), que ignora
-- RLS. Ligar RLS aqui não serve para o app: serve para o Supabase. As chaves
-- `anon` e `publishable` são públicas por natureza, e sem política nenhuma
-- criada para esses papéis, toda leitura via PostgREST volta vazia.
--
-- Se um dia isso mudar (app usando supabase-js), é aqui que as políticas
-- entram — e não em código de aplicação.

DO $$
DECLARE
  t text;
  papeis text[] := ARRAY[]::text[];
BEGIN
  /*
   * `anon` e `authenticated` são papéis do Supabase e não existem num Postgres
   * comum. Revogar deles sem conferir derruba a migration inteira em qualquer
   * banco local com "role does not exist" — e o desenvolvedor perde meia hora
   * atrás de um erro que não é dele.
   */
  FOREACH t IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = t) THEN
      papeis := papeis || t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'organizations','users','sessions','password_tokens','credit_ledger',
    'channel_prices','audit_log','system_settings','contacts','contact_lists',
    'contact_list_members','import_jobs','channel_configs','whatsapp_instances',
    'campaigns','dispatches','message_templates','saved_dispatches',
    'inbound_messages','api_keys','webhook_tokens'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF array_length(papeis, 1) > 0 THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE %I FROM %s',
        t,
        (SELECT string_agg(quote_ident(p), ', ') FROM unnest(papeis) AS p)
      );
    END IF;
  END LOOP;
END $$;

-- O dono da tabela sofre FORCE RLS. Sem esta política o próprio app pararia.
-- Ela não afeta anon/authenticated: `current_user` para eles nunca é o dono.
DO $$
DECLARE t text; dono text;
BEGIN
  -- O dono real da tabela, não `current_user`: no Supabase a migration pode
  -- rodar por um papel diferente do que virou dono no CREATE TABLE.
  SELECT tableowner INTO dono FROM pg_tables
   WHERE tablename = 'organizations' AND schemaname = 'public';
  FOREACH t IN ARRAY ARRAY[
    'organizations','users','sessions','password_tokens','credit_ledger',
    'channel_prices','audit_log','system_settings','contacts','contact_lists',
    'contact_list_members','import_jobs','channel_configs','whatsapp_instances',
    'campaigns','dispatches','message_templates','saved_dispatches',
    'inbound_messages','api_keys','webhook_tokens'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_total ON %I', t);
    EXECUTE format(
      'CREATE POLICY app_total ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
      t, dono
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────── contadores que a tela lê

CREATE OR REPLACE FUNCTION tocar_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','users','contacts','contact_lists','channel_configs',
    'whatsapp_instances','campaigns','dispatches','message_templates','saved_dispatches'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION tocar_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- Tamanho da lista sem COUNT por render.
CREATE OR REPLACE FUNCTION contar_lista() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE contact_lists SET total = total + 1 WHERE id = NEW.list_id;
    RETURN NEW;
  ELSE
    UPDATE contact_lists SET total = GREATEST(total - 1, 0) WHERE id = OLD.list_id;
    RETURN OLD;
  END IF;
END $$;

DROP TRIGGER IF EXISTS contact_list_members_conta ON contact_list_members;
CREATE TRIGGER contact_list_members_conta
  AFTER INSERT OR DELETE ON contact_list_members
  FOR EACH ROW EXECUTE FUNCTION contar_lista();

-- Os números da campanha (enviados, entregues, falhas) precisam estar certos
-- na hora em que a tela abre. Um SUM sobre milhões de linhas por render não
-- serve; o gatilho paga o custo uma vez, na transição de estado.
CREATE OR REPLACE FUNCTION contar_campanha() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  d_pend int := 0; d_env int := 0; d_entr int := 0;
  d_lido int := 0; d_resp int := 0; d_falh int := 0;
BEGIN
  IF NEW.campaign_id IS NULL OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pendente'   THEN d_pend := -1;
    WHEN 'enviado'    THEN d_env  := -1;
    WHEN 'entregue'   THEN d_entr := -1;
    WHEN 'lido'       THEN d_lido := -1;
    WHEN 'respondido' THEN d_resp := -1;
    WHEN 'falhou'     THEN d_falh := -1;
    ELSE NULL;
  END CASE;

  CASE NEW.status
    WHEN 'pendente'   THEN d_pend := d_pend + 1;
    WHEN 'enviado'    THEN d_env  := d_env  + 1;
    WHEN 'entregue'   THEN d_entr := d_entr + 1;
    WHEN 'lido'       THEN d_lido := d_lido + 1;
    WHEN 'respondido' THEN d_resp := d_resp + 1;
    WHEN 'falhou'     THEN d_falh := d_falh + 1;
    ELSE NULL;
  END CASE;

  UPDATE campaigns
     SET pending   = GREATEST(pending   + d_pend, 0),
         sent      = GREATEST(sent      + d_env,  0),
         delivered = GREATEST(delivered + d_entr, 0),
         read      = GREATEST(read      + d_lido, 0),
         replied   = GREATEST(replied   + d_resp, 0),
         failed    = GREATEST(failed    + d_falh, 0),
         updated_at = now()
   WHERE id = NEW.campaign_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dispatches_conta ON dispatches;
CREATE TRIGGER dispatches_conta
  AFTER UPDATE OF status ON dispatches
  FOR EACH ROW EXECUTE FUNCTION contar_campanha();

-- ───────────────────────────────────────────────── preços de fábrica

INSERT INTO channel_prices (org_id, channel, price) VALUES
  (NULL, 'whatsapp_oficial',     0.3000),
  (NULL, 'whatsapp_nao_oficial', 0.2500),
  (NULL, 'sms',                  0.0700),
  (NULL, 'rcs',                  0.1000),
  (NULL, 'voz',                  0.0900)
ON CONFLICT DO NOTHING;
