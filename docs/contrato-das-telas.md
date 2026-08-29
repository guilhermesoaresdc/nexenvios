# Contrato das telas — Nex Envios

Referência para quem for escrever uma tela. **Leia antes de criar arquivo.**

## Stack e regras duras

- Next.js 15 App Router, React 19, TypeScript estrito, Tailwind v4, Zod, Drizzle.
- **Server Components por padrão.** `'use client'` só onde há estado, evento ou
  `useActionState`. Página é servidor; o formulário interativo vira um arquivo
  irmão (`formulario.tsx`) marcado como cliente.
- **Português na interface, inglês no banco.** Rótulo, rota e mensagem de erro
  em pt-BR (`/campanhas`, `/contatos`); coluna e tabela em inglês.
- **Nenhum dado pessoal em log.** Telefone, nome, e-mail e documento nunca vão
  para `console`/`criarLog`. Só id, contagem, status e categoria de falha.
- **Toda consulta de cliente carrega `org_id`.** Sem exceção. Use sempre o
  `usuario.orgId` vindo de `exigirUsuario()`, nunca um id que veio do formulário.
- Nada de biblioteca nova sem necessidade real.

## O que já existe (use, não recrie)

### Autenticação — `src/lib/auth/`
```ts
import { exigirUsuario, exigirAdmin, exigirSuperadmin, exigirEscrita } from '@/lib/auth/atual'

const usuario = await exigirUsuario()
// { id, name, email, role, isSuperadmin, isAdmin, isLeitor,
//   orgId, orgName, orgSlug, orgStatus, timezone, credits, personificando }
```
`exigirEscrita(usuario)` lança se o papel for `visualizador` — chame no começo
de toda server action que grava.

### Design system — `src/components/ui/base.tsx`
`Pad`, `PadTitulo`, `Botao`, `BotaoLink`, `Campo`, `Entrada`, `AreaTexto`,
`Selecao`, `Chip`, `Etiqueta`, `Aviso`, `Vazio`, `Tabela`, `Th`, `Td`,
`Numero`, `Barra`.

- `Botao tom="primario|wa|navy|contorno|fantasma|perigo" tamanho="sm|md|lg" bloco`
- `Chip tom="neutro|azul|ciano|verde|ambar|vermelho|navy" pulsando`
- `Aviso tom="info|alerta|erro|ok" titulo=…`
- `Vazio titulo descricao acao icone` — **todo estado vazio diz o que fazer**,
  nunca só "nenhum registro".

### Casca — `src/components/shell/casca.tsx`
`<Titulo titulo descricao acao />` no topo de cada tela. A `Casca` já é aplicada
pelos layouts; a página só renderiza o conteúdo.

Ícones: `src/components/shell/icones.tsx` (`IcPainel`, `IcDisparo`,
`IcCampanhas`, `IcContatos`, `IcHistorico`, `IcCanais`, `IcConfig`,
`IcClientes`, `IcSaldo`, `IcVoltar`, …).

### Formatação — `src/lib/ui.ts`
`cn`, `moeda`, `numero`, `porcento`, `dataHora`, `data`, `quando`, `duracao`,
`apelido`. Telefone: `formatarTelefone` / `normalizarTelefone` em
`src/lib/telefone.ts`.

### Enums e rótulos — `src/db/schema/enums.ts`
`CANAIS`, `CANAL_LABEL`, `CANAL_CURTO`, `CANAL_CODIGO`, `CANAL_PROVEDORES`,
`PROVEDOR_LABEL`, `STATUS_CAMPANHA_LABEL`, `STATUS_ENVIO_LABEL`, `PAPEL_LABEL`.

Canais: `whatsapp_oficial`, `whatsapp_nao_oficial`, `sms`, `rcs`, `voz`.

### Consultas prontas — `src/db/queries/`
- `painel.ts` — `resumoDoPainel`, `serieDoPainel`, `usoPorCanal`, `campanhasEmCurso`
- `campanhas.ts` — `listarCampanhas`, `contarCampanhas`, `verCampanha`,
  `falhasDaCampanha`, `terminoPrevisto`
- `historico.ts` — `listarHistorico`, `contarHistorico`, `historicoEmCsv`, `listarRespostas`
- `contatos.ts` — `listarContatos`, `contarContatos`, `listarListas`,
  `etiquetasEmUso`, `resumoDaBase`, `importacoesRecentes`
- `canais.ts` — `canaisDaOrg`, `numerosDaOrg`
- `admin.ts` — `resumoGeral`, `listarClientes`, `verCliente`, `usuariosDaOrg`,
  `extratoDaOrg`, `consumoPorCliente`, `tabelaDePrecos`, `enviosGlobais`, `auditoria`

Se faltar uma consulta, acrescente no módulo certo — **não** escreva SQL solto
dentro de componente.

### Domínio
- `src/lib/campanhas/servico.ts` — `orcar`, `criarCampanha`, `materializar`,
  `pausar`, `retomar`, `cancelar`, `descadastrar`, `precoDoCanal`, `textoFinal`
- `src/lib/campanhas/publico.ts` — `Fonte`, `contarPublico`, `fatiaDoPublico`,
  `amostraDoPublico`, `conferirFontes`, `TETO_DA_BASE`
- `src/lib/delivery/motor.ts` — `bater`, `enviarAgora`, `manutencao`
- `src/lib/channels/` — `enviarPeloCanal`, `montarConfig`, `canalConfigurado`,
  e a administração da Evolution (`criarInstancia`, `pegarQrCode`,
  `estadoDaInstancia`, `apagarInstancia`)
- `src/lib/mensagem.ts` — `compilarMensagem`, `medirSms`, `resolverSpintax`,
  `contarVariantes`, `variaveisUsadas`, `VARIAVEIS_PADRAO`
- `src/lib/cripto.ts` — `guardarSegredo`, `lerSegredo`, `mascarar`

## Padrões

### Server action
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirUsuario, exigirEscrita } from '@/lib/auth/atual'

const entrada = z.object({ nome: z.string().trim().min(1, 'Informe o nome.') })

export type Estado = { erro?: string; ok?: string } | undefined

export async function salvar(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const dados = entrada.safeParse({ nome: form.get('nome') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  // … sempre filtrando por usuario.orgId
  revalidatePath('/rota')
  return { ok: 'Salvo.' }
}
```

Formulário cliente: `useActionState(salvar, undefined)` + `useFormStatus` para o
estado do botão. Veja `src/app/(publico)/entrar/formulario.tsx`.

### Segredo nunca vai para a tela
A tela recebe `temCredencial: boolean` e `mascarar(valor)`. Nunca o segredo.

### Estado vazio
Sempre `<Vazio>` com um caminho de saída (botão ou link), nunca "sem dados".

### Copy
Nomeie pelo que a pessoa controla, não pela implementação: "Conectar número",
não "Criar instância". Erro diz o que fazer, não só o que houve.

## Verificação obrigatória antes de terminar

```
npx tsc --noEmit     # tem de passar limpo
npx next build       # tem de passar limpo
```

Não invente API que não existe neste documento — confira o arquivo antes.
