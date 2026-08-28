-- A campanha grande não cabe numa requisição. Estes campos deixam o motor
-- materializar as linhas de envio em pedaços, entre uma batida e outra.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS materialized boolean NOT NULL DEFAULT true,
  -- Último telefone já materializado. A consulta de público é ordenada por
  -- telefone, então o cursor basta para retomar de onde parou.
  ADD COLUMN IF NOT EXISTS materialize_cursor text,
  -- Onde o calendário parou: a próxima linha continua o ritmo daqui.
  ADD COLUMN IF NOT EXISTS materialize_at timestamptz,
  -- Rótulos das fontes, congelados. A lista pode ser apagada depois; a
  -- pergunta "para quem foi este disparo?" precisa continuar tendo resposta.
  ADD COLUMN IF NOT EXISTS audience_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- O público bateu no teto e foi aparado?
  ADD COLUMN IF NOT EXISTS trimmed boolean NOT NULL DEFAULT false,
  -- Conteúdo eleitoral: a lei 9.504/97 art. 57-G exige a saída explícita.
  ADD COLUMN IF NOT EXISTS eleitoral boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS campaigns_materializar
  ON campaigns (created_at) WHERE NOT materialized;

-- Uma campanha em rascunho ainda não gastou nada; uma materializando já tem
-- linha no banco. O estado precisa aparecer na tela sem inventar rótulo.
DO $$ BEGIN
  ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'preparando' BEFORE 'agendada';
EXCEPTION WHEN others THEN NULL; END $$;
