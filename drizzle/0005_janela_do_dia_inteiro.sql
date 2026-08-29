-- A janela de silêncio "sem janela".
--
-- `dentroDaJanela` trata início igual ao fim como "o dia inteiro", e 0→24 como
-- a mesma coisa. A restrição original só aceitava o fim entre 1 e 24, então
-- 0→0 — que o código considera válido — era recusado pelo banco com erro de
-- constraint no meio da criação da campanha.
--
-- Duas formas de dizer "sempre" continuam existindo porque as duas são
-- naturais de digitar; o que muda é o banco parar de recusar uma delas.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_janela;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_janela
  CHECK (quiet_start BETWEEN 0 AND 23 AND quiet_end BETWEEN 0 AND 24);
