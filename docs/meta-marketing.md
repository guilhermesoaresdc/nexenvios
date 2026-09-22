# Métricas de aquisição — Meta

Pixel/dataset público: `1897881374510392`. A integração atua somente na landing `/`.

| Evento | Momento |
| --- | --- |
| PageView | Abertura da landing, após permitir os cookies de marketing |
| ViewContent | Formulário de proposta visível |
| Lead | Mensagem `hediz-fluxo-concluido` enviada pelo iframe do fluxo configurado, inclusive sem aceite de cookies |
| Contact | Clique no link de WhatsApp da landing |

O Lead exige origem, janela do iframe e slug correspondentes. Mensagens repetidas
na mesma montagem não geram novas conversões. O CRM envia a mensagem depois que a
requisição de conclusão retorna. Não há evento Purchase: o site não tem checkout.

Os dois canais usam o mesmo `event_id`: `fbq(trackSingle)` no navegador e
`POST /api/marketing/meta` no servidor. A Meta faz a deduplicação. A API usa IP,
user agent, `_fbp` e `_fbc`; não recebe respostas do formulário nem listas de
contatos. O clique Meta é preservado em `_fbc`, e as UTMs seguem para o formulário.

O token é lido no servidor pelo acesso Postgres existente, em
`vault.decrypted_secrets`, nome `nex_meta_capi_access_token`. Também é possível
usar `META_CAPI_ACCESS_TOKEN` no ambiente. Nunca incluir o valor no repositório,
no log, em `NEXT_PUBLIC_*` ou no HTML. As roles `anon` e `authenticated` não
possuem acesso ao Vault.

Sem aceite, ou após recusa, somente o Lead é enviado pela API de Conversões.
Nesse caso o navegador não carrega o Pixel nem lê/cria `_fbp` ou `_fbc`, e a
rota remove esses identificadores se aparecerem no corpo da requisição. O evento
usa apenas ID aleatório, horário, URL canônica, IP e user agent; não é um envio
anônimo. A atribuição pela Meta pode ser menos precisa sem identificadores de
campanha. PageView, ViewContent e Contact continuam dependendo do aceite.
O aviso de cookies e a Política de Privacidade descrevem esse comportamento.
O botão Cookies reabre a preferência. A integração existente do próprio CRM
dentro do iframe é gerenciada separadamente no CRM.

## Verificação

`npm test -- tests/marketing.test.ts tests/marketing-cliente.test.ts`,
`npm run typecheck`, `npm run lint` e `npm run build`.

No navegador, permitir cookies, abrir o formulário e concluir uma proposta real.
No Gerenciador de Eventos, verificar PageView/ViewContent/Lead no dataset acima.
Para testar a CAPI sem alimentar os relatórios reais, configurar temporariamente
`META_TEST_EVENT_CODE` com o código fornecido pela aba Testar Eventos e removê-lo
ao terminar. Sem esse código, somente testar PageView; não simular leads reais.

Um bloqueador do Pixel ainda permite o envio pelo endpoint do site. Eventos de
navegação dependem do aceite; o Lead funciona sem cookies. A conclusão do formulário depende do sinal no navegador:
se a aba fechar antes de recebê-lo, o Lead pode não ser medido. Esta integração
não altera o backend do CRM nem configura retorno de vendas/offline.
