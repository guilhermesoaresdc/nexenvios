-- Campanha entregue por uma plataforma de fora: o Monitor de Envios.
--
-- Até aqui todo canal era mensagem a mensagem: o motor reserva a linha, manda
-- uma, marca o resultado. O Monitor funciona ao contrário — recebe a campanha
-- INTEIRA num POST (perfil, copy, mídia e a base como arquivo), passa por uma
-- fila de aprovação humana do lado deles e devolve progresso agregado.
--
-- Por isso a campanha delegada não materializa linha nenhuma em `dispatches`:
-- não temos o que reservar, e inventar uma linha por destinatário só para
-- marcá-la "enviada" a partir de um número agregado seria mentir no histórico.
-- O que temos é o código de acompanhamento e os contadores que o polling traz.

-- O estado que faltava. A campanha existe, foi submetida, e não depende mais
-- de nós: depende de alguém do outro lado aprovar.
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'aguardando' AFTER 'preparando';

ALTER TABLE campaigns
  -- `codigo_acompanhamento` — a chave canônica do lado deles.
  ADD COLUMN IF NOT EXISTS external_code text,
  ADD COLUMN IF NOT EXISTS external_provider text,
  -- aguardando | aprovado | rejeitado | rascunho, como eles devolvem.
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS external_reason text,
  ADD COLUMN IF NOT EXISTS external_synced_at timestamptz,
  -- Quanto já cobramos do cliente. O progresso deles é acumulado; sem guardar
  -- o que já foi debitado, cada sincronização cobraria tudo de novo.
  ADD COLUMN IF NOT EXISTS external_billed integer NOT NULL DEFAULT 0,
  -- O perfil que aparece no WhatsApp de quem recebe. Vai na submissão.
  ADD COLUMN IF NOT EXISTS profile_name text,
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  -- O reserva, para a equipe deles usar se a Meta reprovar o primeiro.
  ADD COLUMN IF NOT EXISTS profile_name_2 text,
  ADD COLUMN IF NOT EXISTS profile_photo_url_2 text;

-- O polling procura por aqui: campanha delegada que ainda não terminou.
CREATE INDEX IF NOT EXISTS campaigns_externas_ix
  ON campaigns (external_synced_at NULLS FIRST)
  WHERE external_code IS NOT NULL
    AND status NOT IN ('concluida', 'cancelada', 'falhou');
