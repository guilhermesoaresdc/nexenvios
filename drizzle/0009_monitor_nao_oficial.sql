-- O Monitor de Envios é WhatsApp NÃO oficial, e os preços de fábrica estavam errados.
--
-- Duas correções de fato, não de estilo.
--
-- 1. O Monitor entrega por WhatsApp não oficial, não pela Meta Cloud API. Ele
--    entrou como provedor de `whatsapp_oficial`, e isso não era só um rótulo
--    torto: a tela dizia ao cliente "WhatsApp API Oficial" para uma entrega que
--    não é, e o preço cobrado era o do canal oficial. Também explica por que a
--    régua de nome de perfil deles é tão dura — nome reprovado derruba o chip
--    no meio do disparo, que é o comportamento do não oficial, não o da conta
--    oficial verificada.
--
-- 2. Os preços de fábrica (0,12 e 0,04) não eram os praticados: oficial é 0,30
--    e não oficial 0,25. Só mexe em quem ainda está no preço de fábrica — preço
--    que a operação já ajustou à mão fica como está.

-- Preço da plataforma, só se ninguém tiver mexido.
UPDATE channel_prices SET price = 0.3000
 WHERE org_id IS NULL AND channel = 'whatsapp_oficial' AND price = 0.1200;

UPDATE channel_prices SET price = 0.2500
 WHERE org_id IS NULL AND channel = 'whatsapp_nao_oficial' AND price = 0.0400;

-- Os canais já cadastrados mudam de canal junto com o provedor. Sem isto eles
-- ficariam órfãos: `monitor_envios` deixa de ser provedor válido de
-- whatsapp_oficial, e `montarConfig` não reconheceria mais a combinação.
UPDATE channel_configs
   SET channel = 'whatsapp_nao_oficial'
 WHERE provider = 'monitor_envios' AND channel = 'whatsapp_oficial';

-- As campanhas acompanham. `channel` da campanha é o que a tela mostra e o que
-- decide o preço na hora de cobrar; deixá-la em 'whatsapp_oficial' faria o
-- histórico afirmar uma entrega que não aconteceu.
UPDATE campaigns
   SET channel = 'whatsapp_nao_oficial'
 WHERE channel = 'whatsapp_oficial'
   AND config_id IN (SELECT id FROM channel_configs WHERE provider = 'monitor_envios');

-- Idem para as respostas já guardadas do Monitor: elas entram pelo canal da
-- campanha, e ficariam registradas no canal errado.
UPDATE inbound_messages
   SET channel = 'whatsapp_nao_oficial'
 WHERE channel = 'whatsapp_oficial'
   AND raw ? 'campanha'
   AND (raw ->> 'campanha') ~ '^[0-9a-f-]{36}$'
   AND (raw ->> 'campanha')::uuid IN (
     SELECT id FROM campaigns WHERE external_provider = 'monitor_envios'
   );
