# Nex Envios

**Disparos em massa que geram resultado.**

WhatsApp Oficial, WhatsApp API não oficial, SMS, RCS e Torpedo de Voz em uma
operação só — com painel para o cliente e administração para o time Nex.

---

## As três engrenagens

```
┌──────────────────┐    ┌───────────────────┐    ┌────────────────────┐
│  PÚBLICO         │───▶│  MOTOR            │───▶│  CANAIS            │
│                  │    │                   │    │                    │
│ Contatos, listas │    │ Uma linha por     │    │ WhatsApp oficial   │
│ e etiquetas      │    │ destinatário      │    │ WhatsApp Evolution │
│ União e dedupe   │    │ Ritmo + jitter    │    │ SMS                │
│ Barreira de      │    │ Janela de silêncio│    │ RCS                │
│ descadastro      │    │ Rodízio de chip   │    │ Torpedo de voz     │
└──────────────────┘    └───────────────────┘    └────────────────────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │  CRÉDITOS          │
                        │ Razão + saldo      │
                        │ Preço por canal    │
                        └────────────────────┘
```

## Quem enxerga o quê

| Papel | Vê |
|---|---|
| **Administrador Nex** (`superadmin`) | Todos os clientes, consumo global, preços, provedores da plataforma. Pode entrar na conta de um cliente — e tudo que fizer lá fica registrado no nome dele |
| **Suporte Nex** (`suporte`) | Todos os clientes e o acesso de qualquer pessoa: cria login, define senha, troca papel do cliente. Não mexe em crédito, preço, provedor nem cadastro, e não concede papel do time Nex |
| **Administrador da conta** (`admin`) | A própria organização inteira: disparos, base, canais, equipe, chaves de API |
| **Operador** | Cria e acompanha disparos; não mexe em canais nem em equipe |
| **Visualizador** | Só leitura |

## Dar e tirar acesso

Todo login da plataforma — o do time Nex e o de cada cliente — se resolve em
`/admin/usuarios`: uma lista só, com busca por nome, e-mail ou conta e filtro
por conta, papel e situação. `/admin/equipe` é a mesma coisa recortada no time
Nex, e a aba **Acessos** de cada cliente traz as pessoas daquela conta sem sair
da página dela.

Criar um acesso tem dois caminhos, e a diferença importa na prática:

- **Definir a senha agora** — a senha aparece uma vez na tela, com botão de
  copiar, e você entrega por fora. É o caminho de quando o e-mail do cliente não
  chega ou a pessoa precisa entrar naquele minuto.
- **Mandar convite** — nasce sem `password_hash` e a pessoa escolhe a própria
  senha por um link que vale 7 dias e queima no primeiro uso.

As regras que impedem a plataforma de se trancar por fora moram todas em
`src/lib/acessos/servico.ts`, não nas telas:

1. Papel do time Nex só um Administrador Nex concede.
2. Ninguém troca o próprio papel nem se desativa.
3. O último administrador ativo de uma conta não pode ser rebaixado nem
   desativado — a conta ficaria sem dono.
4. Trocar senha ou desativar alguém derruba as sessões abertas na hora.

Cada uma dessas regras tem teste em `tests/acessos.integracao.test.ts`.

## Entrega delegada — Monitor de Envios

Todo canal da Nex é mensagem a mensagem: o motor reserva a linha, manda uma,
marca o resultado. O **Monitor de Envios** funciona ao contrário e por isso é o
único provedor com caminho próprio no código.

| | Canal normal | Monitor de Envios |
|---|---|---|
| O que sai | uma mensagem por vez | a campanha inteira, num POST |
| A base | linhas em `dispatches` | um CSV anexado |
| Quem faz o ritmo | nós (ritmo, jitter, janela) | a plataforma deles |
| Aprovação | nenhuma | fila de análise humana do lado deles |
| Progresso | linha a linha | agregado, por consulta |
| Cobrança | quando cada mensagem sai | pela diferença a cada sincronização |

Consequências que aparecem na tela, e não escondemos:

- A campanha nasce **Aguardando aprovação** e não anda até alguém do outro lado
  liberar. Nada é cobrado enquanto isso.
- Rejeitada, ela vira cancelada com o motivo à vista.
- **Não dá para pausar nem cancelar por aqui.** A API deles não expõe isso, e um
  botão que mudasse só o nosso status faria o cliente achar que parou enquanto as
  mensagens continuassem saindo.
- Os controles de ritmo e janela de silêncio somem do assistente.

O perfil (nome e foto que quem recebe vê) viaja junto da campanha, e são **dois**
— o principal e um reserva, que a equipe deles usa se a Meta reprovar o primeiro.
Os dois são obrigatórios no Monitor desde 01/09/2026.

A frase de descadastro em campanha eleitoral é **deles**, não nossa: com
`politica=true` eles acrescentam a linha que manda responder `2`, e quem escuta
essa resposta é a plataforma deles. Mandar a nossa (`responda SAIR`) ensinaria ao
destinatário uma palavra que ninguém do outro lado processa.

O contrato de cobrança e de estado tem teste em
`tests/monitor.integracao.test.ts`, contra um servidor falso.

## Stack

Next.js 15 App Router · TypeScript · Drizzle ORM · PostgreSQL (Supabase) ·
Tailwind v4 · Zod · Vercel.

**Sem Redis e sem worker**, e isso é uma decisão, não uma limitação aceita a
contragosto — veja [O motor sem fila](#o-motor-sem-fila).

---

## Subir localmente

```bash
cp .env.example .env      # preencha DATABASE_URL, ENCRYPTION_KEY e CRON_SECRET
npm install
npm run db:migrate        # cria o schema
npm run db:seed           # cria a organização Nex e o primeiro superadmin
npm run dev
```

O `db:seed` imprime a senha do administrador **uma única vez**. Guarde.

Para o motor andar em desenvolvimento, chame o batimento à mão:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Next.js em desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:migrate` | Aplica as migrations pendentes |
| `npm run db:seed` | Cria a organização da plataforma e o primeiro superadmin |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |

---

## Deploy

O projeto na Vercel está ligado a este repositório. **Só a `main` constrói**:
o `ignoreCommand` do `vercel.json` cancela qualquer build que não seja de
produção, porque deploy de preview a cada push consome crédito e, sem banco no
ambiente de preview, a aplicação só chega até a tela de entrada.

A semântica do `ignoreCommand` é invertida e confunde: **código 1 constrói,
código 0 pula**. Por isso a linha testa `VERCEL_ENV = production` e sai com 1
nesse caso.

### Variáveis obrigatórias

| Variável | Onde consegue |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Transaction pooler** (porta 6543). Substitua `[YOUR-PASSWORD]` pela senha, codificada para URL |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |

As demais estão comentadas em [`.env.example`](.env.example).

> **Use o pooler, não a conexão direta.** Cada invocação de função abre a sua
> própria conexão; sem o pooler o limite do projeto Supabase estoura no primeiro
> pico. O cliente já vem com `max: 1` e `prepare: false` quando detecta a porta
> 6543 — prepared statement não sobrevive à troca de sessão do PgBouncer em modo
> transação.

### O batimento

`GET /api/cron` é o que faz o motor andar. **Atenção ao intervalo real, não ao
pedido:**

| Agendador | Intervalo | Como ligar |
|---|---|---|
| **cron-job.org / QStash / EasyCron** | 1 min | apontar para `https://SEU-DOMINIO/api/cron` com o cabeçalho `Authorization: Bearer $CRON_SECRET` |
| Vercel Cron (Hobby) | **1×/dia** | já vem no `vercel.json`; basta definir `CRON_SECRET` |
| Vercel Cron (Pro) | 1 min | troque o `schedule` para `* * * * *` |

O cron da Vercel no plano Hobby roda uma vez por dia. Como piso da manutenção
está ótimo; como único agendador de um motor de disparo, não serve — uma
campanha agendada para as 9h sairia quando o cron passasse. **Ligue um
agendador externo de 1 minuto.**

Os dois podem conviver sem risco de envio duplo: quem envia de fato é a reserva
por comparação-e-troca, e duas invocações sobrepostas nunca pegam a mesma linha.

---

## O motor sem fila

A referência deste sistema usava BullMQ + Redis com um worker de pé. Aqui não
há onde deixar um processo rodando: a Vercel só executa função. A troca é
deliberada — **a própria tabela é a fila.**

`dispatches.scheduled_for` diz quando cada linha pode sair. Uma batida periódica
pega o que venceu:

```sql
WITH escolhidas AS (
  SELECT d.id FROM dispatches d JOIN campaigns c ON c.id = d.campaign_id
   WHERE d.status = 'pendente' AND d.scheduled_for <= now() AND c.status = 'enviando'
   ORDER BY d.scheduled_for LIMIT $1
     FOR UPDATE OF d SKIP LOCKED
)
UPDATE dispatches SET status = 'enviando', claimed_at = now(), attempts = attempts + 1
 FROM escolhidas WHERE ...
```

`FOR UPDATE SKIP LOCKED` é o que permite duas batidas concorrentes: a segunda
pula as linhas que a primeira travou em vez de esperar por elas. A transição
para `enviando` é comparação-e-troca, então **duas invocações sobrepostas nunca
enviam a mesma mensagem duas vezes**.

O preço é a granularidade: sem worker, a reação é do tamanho do intervalo do
agendador. Daí a insistência no agendador de 1 minuto.

### Materialização retomável

Uma base de um milhão não cabe no tempo de uma função. A campanha nasce com
`materialized = false` e o motor continua em cada batida, usando o último
telefone como cursor:

```sql
... WHERE NOT opted_out AND phone > $cursor ORDER BY phone LIMIT $fatia
```

O `ORDER BY phone` antes do `LIMIT` não é enfeite: é ele que torna a retomada
correta. Nada se repete e nada se perde se a invocação morrer no meio.

### As guardas que evitam o banimento

O WhatsApp não oficial roda sobre o protocolo do WhatsApp Web. Funciona bem e é
a escolha certa para este custo e esta velocidade, mas **o número pode ser
banido — e um número banido raramente volta.** Por isso:

- **Ritmo por minuto** e **jitter**: dez mil mensagens idênticas saindo em
  sequência perfeita é o padrão que os filtros procuram.
- **Janela de silêncio** em hora local da organização: nada sai de madrugada.
- **Rodízio de chip** com teto diário e intervalo mínimo por instância — o
  aquecimento de um número novo.
- **Disjuntor por canal**: depois de oito falhas seguidas o canal para de ser
  escolhido por dez minutos, em vez de queimar cinquenta mil mensagens contra
  um provedor caído.
- **Descadastro que vale para tudo**: um "PARE" cancela na hora o que ainda não
  saiu para aquele número, em qualquer campanha.

---

## Isolamento entre clientes

Toda consulta de cliente carrega `org_id` — sem exceção, e o `org_id` vem
sempre da sessão, nunca de formulário ou URL. As únicas consultas que
atravessam organizações vivem em `src/db/queries/admin.ts`, e toda função de lá
pressupõe `exigirTimeNex()`.

Dentro da administração há dois níveis. `exigirTimeNex()` deixa entrar
superadmin e suporte — é o portão de leitura. `exigirSuperadmin()` (nas telas)
e `exigirPoderTotal()` (nas ações) trancam o que mexe em dinheiro e na
configuração da plataforma: crédito, preço, provedor, cadastro e status de
cliente. As duas checagens são de servidor; esconder o botão é conforto, não
proteção.

No banco, o RLS está ligado em todas as tabelas **sem política alguma para
`anon` e `authenticated`**. Isso não serve para a aplicação (que conecta com o
papel dono): serve para trancar o PostgREST do Supabase. As chaves publicáveis
são públicas por natureza; sem política, toda leitura por lá volta vazia.

Credenciais de provedor são cifradas em repouso com AES-256-GCM. Um dump do
banco não entrega as chaves de API dos clientes — precisa também da
`ENCRYPTION_KEY`, que só existe no ambiente. A tela recebe `temCredencial:
boolean`, nunca o segredo.

## Layout

```
src/
  app/
    (site)/        landing page
    (publico)/     entrar, recuperar, definir senha
    (app)/         painel do cliente — exige sessão
    (admin)/       administração Nex — exige time Nex
    api/
      cron/        o batimento
      v1/          API pública, autenticada por chave
      retorno/     webhooks de status dos provedores
  components/
    ui/            primitivas (Pad, Botao, Campo, Chip, Tabela, …)
    shell/         casca do painel, navegação
    site/          peças da landing
  db/
    schema/        espelho Drizzle das tabelas
    queries/       consultas de tela, uma por domínio
  lib/
    auth/          sessão em cookie, senha, papéis, convites
    channels/      um adaptador por canal, atrás de uma interface comum
    campanhas/     público, orçamento, ciclo de vida da campanha
    delivery/      o motor e a aritmética de calendário
drizzle/           migrations em SQL puro
docs/              contrato das telas, API pública
```

As migrations são **SQL escrito à mão**. O gerador do drizzle-kit não expressa
gatilho, índice parcial nem política de RLS — e o schema depende dos três. O
schema Drizzle em `src/db/schema/` existe para tipar as consultas e espelha
aquele SQL; se divergirem, o Postgres vence e o `tsc` não avisa.

## Convenções

Português na interface, inglês no banco. Rótulo, rota e mensagem de erro em
pt-BR (`/campanhas`, `/contatos`); tabela e coluna em inglês.

Nenhum dado pessoal em log de aplicação: telefone, nome, e-mail e documento
nunca vão para stdout — só id, contagem, status e categoria de falha.

Copy nomeia o que a pessoa controla, não a implementação: "Conectar número",
não "Criar instância".
