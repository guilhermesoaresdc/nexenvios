-- A lista de teste, que fica salva.

-- Testar um disparo exigia refazer o mesmo trabalho toda vez: montar uma
-- planilha com dois ou três números, subir, importar, escolher. Nada disso é
-- do teste — é cerimônia em volta dele. E como dava trabalho, o teste deixava
-- de ser feito, que é o pior resultado possível para um sistema que manda
-- mensagem em nome de outra pessoa.
--
-- Agora uma lista pode ser marcada como a lista de teste: ela aparece primeiro
-- na hora de escolher o público, com etiqueta própria, e sobrevive de um
-- disparo para o outro.

ALTER TABLE contact_lists
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Uma por organização. "A lista de teste" com duas candidatas obrigaria a tela
-- a desempatar por ordem de consulta, que é o tipo de escolha que muda sozinha.
CREATE UNIQUE INDEX IF NOT EXISTS contact_lists_uma_de_teste_ix
  ON contact_lists (org_id) WHERE is_test;
