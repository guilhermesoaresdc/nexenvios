-- Campanha delegada que não dá para sincronizar precisa desistir em algum ponto.

-- Em produção, uma campanha aceita pelo Monitor passou a responder "Campanha
-- não encontrada." a cada minuto, para sempre. Três efeitos, todos ruins:
--
--  * o canal ficou marcado como quebrado — mas a credencial estava certa, o
--    problema era daquela campanha;
--  * uma requisição por minuto do teto deles (200/hora por IP) gasta à toa;
--  * a campanha nunca sai da fila de sincronização, porque só sai quando muda
--    de status, e ela não muda.
--
-- O contador é o que permite desistir com um motivo escrito, em vez de tentar
-- eternamente ou desistir na primeira falha de rede.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS external_sync_failures integer NOT NULL DEFAULT 0;
