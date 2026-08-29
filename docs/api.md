# API pública — Nex Envios

Base: `https://SEU-DOMINIO/api/v1`

Toda rota autentica por chave no cabeçalho:

```
Authorization: Bearer nex_live_xxxxxxxx.SEGREDO
```

A chave é criada em **Configurações → API** e aparece **uma única vez**. O
banco guarda só o resumo criptográfico dela; se você perder, gere outra.

## Escopos

Cada chave carrega os escopos que você marcou na criação:

| Escopo | Libera |
|---|---|
| `envios:escrever` | `POST /envios`, `POST /campanhas` |
| `envios:ler` | `GET /envios`, `GET /envios/:id`, `GET /campanhas`, `GET /saldo` |
| `contatos:escrever` | `POST /contatos` |
| `contatos:ler` | `GET /contatos` |

## Erros

Sempre JSON, sempre no mesmo formato:

```json
{ "erro": "Saldo insuficiente.", "codigo": "sem_saldo" }
```

| HTTP | `codigo` | O que houve |
|---|---|---|
| 400 | `json_invalido` | o corpo não é JSON |
| 401 | `nao_autorizado` | chave ausente, inválida ou revogada |
| 402 | `sem_saldo` | crédito insuficiente para o envio |
| 403 | `sem_escopo` / `conta_inativa` | a chave não tem o escopo, ou a conta está suspensa |
| 404 | `nao_encontrado` | o recurso não existe **nesta conta** |
| 409 | `descadastrado` / `sem_canal` | o número pediu para sair, ou não há canal configurado |
| 422 | `corpo_invalido` / `destino_invalido` | campo faltando ou número que não é válido |
| 502 | — | o provedor recusou; o corpo traz `codigo` e `reenviavel` |

Canais aceitos em `canal`: `whatsapp_oficial`, `whatsapp_nao_oficial`, `sms`,
`rcs`, `voz`.

---

## `POST /envios` — uma mensagem, agora

Envia na hora, sem passar pela fila. Debita crédito só se sair.

```bash
curl -X POST https://SEU-DOMINIO/api/v1/envios \
  -H "Authorization: Bearer nex_live_xxxx.SEGREDO" \
  -H "Content-Type: application/json" \
  -d '{
    "canal": "sms",
    "para": "11987654321",
    "mensagem": "Oi! Seu FGTS já pode ser antecipado.",
    "nome": "Maria"
  }'
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `canal` | sim | |
| `para` | sim | qualquer formato brasileiro; normalizamos para E.164 |
| `mensagem` | sim | até 4.000 caracteres |
| `nome` | não | usado nas variáveis e no cadastro do contato |
| `configId` | não | sem ele, usamos o canal padrão da sua conta |
| `mediaUrl` | não | imagem ou vídeo, onde o canal aceita |

**201**
```json
{
  "id": "8f3c…",
  "status": "enviado",
  "canal": "sms",
  "para": "5511987654321",
  "providerMessageId": "abc123",
  "custo": 0.07
}
```

**409** quando o número já pediu para sair. O descadastro vale para a API
também — sem isso ela seria a porta lateral mais fácil para fora da LGPD.

## `GET /envios` — lista

`?limite=50&pular=0` (limite máximo 200).

```json
{
  "envios": [
    { "id": "…", "canal": "sms", "para": "5511…", "status": "entregue",
      "campanhaId": "…", "erro": null, "custo": 0.07,
      "criadoEm": "…", "enviadoEm": "…", "entregueEm": "…" }
  ],
  "limite": 50, "pular": 0
}
```

## `GET /envios/:id` — o estado de um envio

Devolve o mesmo objeto com `tentativas`, `provedor`, `erroCodigo`,
`erroMensagem`, `lidoEm` e `respondidoEm`.

Status possíveis: `pendente`, `enviando`, `enviado`, `entregue`, `lido`,
`respondido`, `falhou`, `cancelado`.

---

## `POST /campanhas` — disparo em massa

```bash
curl -X POST https://SEU-DOMINIO/api/v1/campanhas \
  -H "Authorization: Bearer nex_live_xxxx.SEGREDO" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "FGTS abril",
    "canal": "sms",
    "mensagem": "{Oi|Olá} {{primeiro_nome}}, seu FGTS liberou.",
    "fontes": [{ "tipo": "etiqueta", "chave": "fgts" }],
    "ritmo": 120,
    "janelaInicio": 8,
    "janelaFim": 21
  }'
```

`fontes` soma vários públicos, sem repetir quem está em mais de um:

```json
[{ "tipo": "lista",    "chave": "uuid-da-lista" },
 { "tipo": "etiqueta", "chave": "fgts" },
 { "tipo": "todos" }]
```

| Campo | Padrão | Observação |
|---|---|---|
| `ritmo` | 60 | mensagens por minuto |
| `janelaInicio` / `janelaFim` | 8 / 21 | hora local da sua conta; fora dela nada sai |
| `agendarPara` | agora | ISO 8601 |
| `eleitoral` | `false` | acrescenta a frase de saída exigida pelo art. 57-G da Lei 9.504/97 |
| `mediaUrl` | — | |
| `configId` | canal padrão | |

**201**
```json
{
  "id": "…", "destinatarios": 12480,
  "custoEstimado": 873.6, "aparado": false, "status": "preparando"
}
```

`preparando` significa que as linhas de envio ainda estão sendo criadas —
base grande não cabe numa requisição. Acompanhe por `GET /campanhas`.

**402** quando falta saldo, com quanto falta na mensagem.

### Variáveis na mensagem

`{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`, `{{email}}`, `{{saudacao}}` e
qualquer atributo do contato. Resolvidas por destinatário, no momento em que
a linha é criada.

**Spintax**: `{Oi|Olá|E aí}` sorteia uma opção por mensagem. Serve para que
dez mil mensagens não sejam dez mil cópias idênticas — que é o sinal que os
filtros de operadora e do WhatsApp procuram.

## `GET /campanhas` — lista com o andamento

```json
{
  "campanhas": [
    { "id": "…", "nome": "FGTS abril", "canal": "sms", "status": "enviando",
      "total": 12480, "pendentes": 8200, "enviados": 4200, "entregues": 3900,
      "falhas": 80, "custoEstimado": 873.6, "custoReal": 294,
      "fontes": ["FGTS — março"], "criadaEm": "…", "terminadaEm": null }
  ]
}
```

---

## `POST /contatos` — cria ou atualiza em lote

Até 1.000 por requisição.

```bash
curl -X POST https://SEU-DOMINIO/api/v1/contatos \
  -H "Authorization: Bearer nex_live_xxxx.SEGREDO" \
  -H "Content-Type: application/json" \
  -d '{
    "contatos": [
      { "telefone": "11987654321", "nome": "Maria", "etiquetas": ["fgts"] }
    ],
    "listaId": "uuid-opcional"
  }'
```

**200**
```json
{
  "recebidos": 1, "novos": 1, "atualizados": 0,
  "repetidos": 0, "descadastrados": 0,
  "recusados": [{ "telefone": "119", "motivo": "curto" }]
}
```

`descadastrados` conta quem já tinha pedido para sair. **Eles não são
reativados** — nem aqui, nem pela importação de planilha. Reativar é ato
explícito, feito na tela de contatos.

Motivos de recusa: `vazio`, `curto`, `longo`, `ddd`, `formato`.

## `GET /contatos` — lista

`?limite=50&pular=0&busca=maria&etiqueta=fgts`

---

## `GET /saldo`

```json
{
  "saldo": 2500,
  "limite": 200,
  "disponivel": 2700,
  "precos": {
    "whatsapp_oficial": 0.12, "whatsapp_nao_oficial": 0.04,
    "sms": 0.07, "rcs": 0.1, "voz": 0.09
  },
  "moeda": "BRL"
}
```

O preço do SMS é **por segmento de 160 caracteres**. Um texto mais longo — ou
com um único acento fora da tabela GSM — vira dois ou três segmentos e custa
proporcional. Considere isso ao orçar.

---

## Webhook de retorno

O status de entrega volta para
`https://SEU-DOMINIO/api/retorno/<token>`. O token é criado sozinho por
organização e canal, e o endereço é registrado automaticamente ao conectar um
número de WhatsApp. Para os demais provedores, copie o endereço da tela de
canais e configure no painel deles.

Entendemos três formatos: o da Meta Cloud API
(`entry[].changes[].value.statuses`), o da Evolution (`data.key.id` +
`data.status`) e o genérico (`{ "id": "...", "status": "delivered" }`).

**A rota responde 200 mesmo sem entender o corpo**, desde que o token exista.
Provedor que recebe erro fica reenviando, e vários desligam o webhook depois
de algumas falhas — perder o retorno de entrega é pior do que ignorar um
formato desconhecido.

Uma resposta com **PARE**, **SAIR**, **STOP**, **DESCADASTRAR**, **REMOVER**
ou **CANCELAR** (sozinha, em qualquer caixa, com ou sem acento) descadastra o
número e cancela o que ainda não saiu para ele.
