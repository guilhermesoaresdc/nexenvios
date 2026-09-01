-- O rascunho do disparo, salvo sozinho.

-- O assistente vivia inteiro na memória do navegador. Fechar a aba, recarregar
-- sem querer, o notebook dormir, a sessão expirar — qualquer um desses jogava
-- fora canal, público, texto, mídia e perfil, e a pessoa recomeçava do zero.
-- Num disparo grande isso é meia hora de trabalho, e o custo real não é o
-- tempo: é a pessoa refazer com pressa e mandar diferente do que pretendia.
--
-- `saved_dispatches` já existia no esquema desde a fundação e nunca foi usada.
-- É exatamente a forma certa — um jsonb com o estado da tela — então em vez de
-- criar tabela nova, esta migration a coloca em uso.

ALTER TABLE saved_dispatches
  -- Um rascunho automático não é a mesma coisa que um disparo salvo de
  -- propósito: ele é sobrescrito sem avisar e sumir depois de criar a campanha
  -- é o comportamento certo. A coluna separa os dois para que salvar um
  -- modelo, mais adiante, não brigue com o autosave.
  ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false,
  -- `channel` era NOT NULL: o rascunho começa antes de escolher o canal.
  ALTER COLUMN channel DROP NOT NULL;

-- Um rascunho automático por pessoa. Duas abas abertas escrevem no mesmo
-- registro — a última ganha, que é o que se espera de rascunho — em vez de
-- deixarem dois pela metade e a tela ter que adivinhar qual retomar.
CREATE UNIQUE INDEX IF NOT EXISTS saved_dispatches_rascunho_ix
  ON saved_dispatches (org_id, created_by) WHERE auto;
