import 'server-only'
import { and, eq, inArray, sql as raw } from 'drizzle-orm'
import { db, sql } from '@/db'
import { campaigns, channelConfigs, contacts, dispatches, organizations } from '@/db/schema'
import type { Channel } from '@/db/schema/enums'
import { montarCalendario } from '@/lib/delivery/janela'
import { criarLog } from '@/lib/log'
import { compilarMensagem, medirSms } from '@/lib/mensagem'
import {
  conferirFontes,
  contarPublico,
  fatiaDoPublico,
  TETO_DA_BASE,
  type ContagemDoPublico,
  type Fonte,
} from './publico'

const log = criarLog('campanha')

/**
 * O ciclo de vida de uma campanha.
 *
 * Criar é: conferir as fontes, contar o público, orçar, checar saldo, gravar o
 * cabeçalho e começar a materializar uma linha por destinatário. O orçamento
 * acontece ANTES de qualquer linha existir porque o cliente precisa ver
 * "12.480 mensagens, R$ 873,60" e confirmar — um número calculado na hora do
 * envio chegaria tarde demais para ele decidir.
 *
 * A materialização é RETOMÁVEL. Um público de um milhão não cabe no tempo de
 * uma função da Vercel; a campanha nasce com `materialized = false` e o motor
 * continua em cada batida, usando o último telefone como cursor. Nada se perde
 * se a invocação morrer no meio.
 */

/** Linhas por INSERT. Acima disto o Postgres começa a engasgar. */
const LOTE_INSERCAO = 1_000

/** Quanto materializar de uma vez, dentro de um pedido do usuário. */
const FATIA_IMEDIATA = 5_000

/** Quanto materializar por batida do motor. */
export const FATIA_DO_MOTOR = 20_000

/**
 * A frase exigida pelo art. 57-G da Lei 9.504/97 em propaganda eleitoral.
 *
 * Vai colada no fim do texto quando a campanha é declarada eleitoral. Não é
 * opcional e não é configurável: é lei.
 */
export const FRASE_ELEITORAL = 'Para não receber mais, responda SAIR.'

export type DadosDaCampanha = {
  nome: string
  canal: Channel
  configId: string
  corpo: string
  mediaUrl?: string | null
  mediaType?: string | null
  templateName?: string | null
  botoes?: { texto: string; url?: string }[]
  fontes: Fonte[]
  ratePerMinute?: number
  jitterMs?: number
  quietStart?: number
  quietEnd?: number
  eleitoral?: boolean
  /** Nulo = começa assim que ficar pronta. */
  agendarPara?: Date | null
}

export type Orcamento = {
  destinatarios: number
  /** Segmentos de SMS por mensagem — o que multiplica o custo. */
  segmentos: number
  precoUnitario: number
  /** Preço por destinatário, já com os segmentos. */
  precoPorEnvio: number
  total: number
  saldo: number
  limite: number
  cabeNoSaldo: boolean
  publico: ContagemDoPublico
}

/** O preço do canal para esta organização — o dela, ou o padrão da plataforma. */
export async function precoDoCanal(orgId: string, canal: Channel): Promise<number> {
  const [linha] = await sql<{ price: string }[]>`
    SELECT price::text FROM channel_prices
     WHERE channel = ${canal}::channel AND (org_id = ${orgId} OR org_id IS NULL)
     ORDER BY org_id NULLS LAST
     LIMIT 1
  `
  return Number(linha?.price ?? 0)
}

/** O texto como ele vai sair, já com a exigência legal quando for o caso. */
export function textoFinal(corpo: string, eleitoral: boolean): string {
  if (!eleitoral) return corpo
  // Se o texto já oferece a saída, acrescentar de novo é ruído.
  if (/\b(sair|descadastr|remover|pare)\b/i.test(corpo)) return corpo
  return `${corpo.trimEnd()}\n\n${FRASE_ELEITORAL}`
}

export async function orcar(
  orgId: string,
  canal: Channel,
  corpo: string,
  fontes: Fonte[],
  eleitoral = false,
): Promise<Orcamento> {
  const publico = await contarPublico(orgId, fontes)
  const precoUnitario = await precoDoCanal(orgId, canal)

  /*
   * SMS longo custa mais de uma mensagem. Cobrar por linha e não por segmento
   * faria a operação perder dinheiro em toda campanha com texto acima de 160
   * caracteres — e são a maioria.
   */
  const segmentos = canal === 'sms' ? medirSms(textoFinal(corpo, eleitoral)).segmentos : 1
  const precoPorEnvio = precoUnitario * segmentos
  const total = publico.total * precoPorEnvio

  const [org] = await db
    .select({ credits: organizations.credits, creditLimit: organizations.creditLimit })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  const saldo = Number(org?.credits ?? 0)
  const limite = Number(org?.creditLimit ?? 0)

  return {
    destinatarios: publico.total,
    segmentos,
    precoUnitario,
    precoPorEnvio,
    total,
    saldo,
    limite,
    cabeNoSaldo: total <= saldo + limite,
    publico,
  }
}

export type CriacaoDaCampanha =
  | { ok: true; campanhaId: string; destinatarios: number; custo: number; aparado: boolean }
  | { ok: false; erro: string }

export async function criarCampanha(
  orgId: string,
  /** Nulo quando a campanha nasce pela API pública, sem usuário logado. */
  usuarioId: string | null,
  dados: DadosDaCampanha,
): Promise<CriacaoDaCampanha> {
  const [org] = await db
    .select({
      status: organizations.status,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  if (!org) return { ok: false, erro: 'Conta não encontrada.' }
  if (org.status !== 'ativo') {
    return { ok: false, erro: 'Esta conta está suspensa. Fale com a Nex Envios para reativar.' }
  }

  /*
   * O canal precisa ser desta organização ou da plataforma — nunca de outro
   * cliente. Sem esta conferência, um id adivinhado enviaria com a credencial
   * alheia, e a conta errada pagaria a fatura.
   */
  const [canal] = await db
    .select({ id: channelConfigs.id, canal: channelConfigs.channel, ativo: channelConfigs.active })
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.id, dados.configId),
        raw`(${channelConfigs.orgId} = ${orgId}::uuid OR ${channelConfigs.orgId} IS NULL)`,
      ),
    )
    .limit(1)

  if (!canal) return { ok: false, erro: 'O canal escolhido não existe.' }
  if (!canal.ativo) return { ok: false, erro: 'O canal escolhido está desativado.' }
  if (canal.canal !== dados.canal) {
    return { ok: false, erro: 'O canal escolhido não bate com o tipo de disparo.' }
  }

  // Fonte de outra organização é descartada, não recusada em silêncio: o
  // resultado da conferência é o que vale daqui para a frente.
  const fontes = await conferirFontes(orgId, dados.fontes)
  if (fontes.length === 0) {
    return { ok: false, erro: 'Escolha ao menos uma lista, etiqueta ou a base inteira.' }
  }

  const eleitoral = dados.eleitoral ?? false
  const corpo = textoFinal(dados.corpo, eleitoral)
  const orcamento = await orcar(orgId, dados.canal, dados.corpo, fontes, eleitoral)

  if (orcamento.destinatarios === 0) {
    return { ok: false, erro: 'Nenhum destinatário válido no público escolhido.' }
  }
  if (!orcamento.cabeNoSaldo) {
    const falta = (orcamento.total - orcamento.saldo - orcamento.limite).toFixed(2)
    return {
      ok: false,
      erro: `Saldo insuficiente: faltam R$ ${falta.replace('.', ',')} em créditos.`,
    }
  }

  const inicio = dados.agendarPara ?? new Date()
  const ratePerMinute = dados.ratePerMinute ?? 60
  const jitterMs = dados.jitterMs ?? 1500
  const quietStart = dados.quietStart ?? 8
  const quietEnd = dados.quietEnd ?? 21

  const [campanha] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: dados.nome,
      channel: dados.canal,
      configId: dados.configId,
      // Nasce preparando. Quem promove para 'agendada' é a materialização, e
      // quem promove para 'enviando' é o motor — um caminho só para cada
      // transição, sempre.
      status: 'preparando',
      body: corpo,
      mediaUrl: dados.mediaUrl ?? null,
      mediaType: dados.mediaType ?? null,
      templateName: dados.templateName ?? null,
      buttons: dados.botoes ?? [],
      eleitoral,
      audienceKind: fontes.length === 1 ? fontes[0]!.tipo : 'varias',
      audience: fontes as unknown as Record<string, unknown>,
      // O rótulo viaja junto e fica congelado: a lista pode ser apagada, e
      // "para quem foi este disparo?" precisa continuar tendo resposta.
      audienceLabels: fontes.map((f) => f.rotulo),
      trimmed: orcamento.publico.aparado,
      ratePerMinute,
      jitterMs,
      quietStart,
      quietEnd,
      scheduledAt: inicio,
      total: orcamento.destinatarios,
      pending: 0,
      unitPrice: String(orcamento.precoPorEnvio),
      estimatedCost: String(orcamento.total),
      materialized: false,
      materializeAt: inicio,
      createdBy: usuarioId ?? null,
    })
    .returning({ id: campaigns.id })

  if (!campanha) return { ok: false, erro: 'Não foi possível criar a campanha.' }

  /*
   * Materializa o começo agora, dentro do próprio pedido. Para a maioria das
   * campanhas isso resolve tudo e o cliente já vê a fila cheia; para as
   * grandes, adianta o suficiente para o motor começar a mandar na primeira
   * batida em vez de gastá-la só preparando.
   */
  await materializar(campanha.id, FATIA_IMEDIATA)

  log.info('campanha criada', {
    campanha: campanha.id,
    destinatarios: orcamento.destinatarios,
    canal: dados.canal,
  })

  return {
    ok: true,
    campanhaId: campanha.id,
    destinatarios: orcamento.destinatarios,
    custo: orcamento.total,
    aparado: orcamento.publico.aparado,
  }
}

/**
 * Cria (ou continua criando) as linhas de envio de uma campanha.
 *
 * Devolve quantas criou. Zero significa que acabou. Chamável quantas vezes for
 * preciso: o cursor garante que nada se repete e nada se perde.
 */
export async function materializar(campanhaId: string, teto: number): Promise<number> {
  const [campanha] = await db
    .select({
      id: campaigns.id,
      orgId: campaigns.orgId,
      canal: campaigns.channel,
      configId: campaigns.configId,
      corpo: campaigns.body,
      mediaUrl: campaigns.mediaUrl,
      fontes: campaigns.audience,
      cursor: campaigns.materializeCursor,
      materializeAt: campaigns.materializeAt,
      materialized: campaigns.materialized,
      ratePerMinute: campaigns.ratePerMinute,
      jitterMs: campaigns.jitterMs,
      quietStart: campaigns.quietStart,
      quietEnd: campaigns.quietEnd,
      scheduledAt: campaigns.scheduledAt,
      unitPrice: campaigns.unitPrice,
      total: campaigns.total,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campanhaId))
    .limit(1)

  if (!campanha || campanha.materialized) return 0
  // Cancelada no meio da preparação não continua sendo preparada.
  if (campanha.status === 'cancelada') return 0

  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, campanha.orgId))
    .limit(1)

  const timezone = org?.timezone ?? 'America/Sao_Paulo'
  const fontes = (campanha.fontes ?? []) as unknown as Fonte[]

  // Quanto ainda falta para o teto da base — o `total` foi fixado na criação.
  const [jaTem] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM dispatches WHERE campaign_id = ${campanhaId}
  `
  const feitos = jaTem?.n ?? 0
  const faltam = Math.min(campanha.total, TETO_DA_BASE) - feitos
  if (faltam <= 0) {
    await concluirMaterializacao(campanhaId)
    return 0
  }

  const querAgora = Math.min(teto, faltam)
  const destinos = await fatiaDoPublico(campanha.orgId, fontes, querAgora, campanha.cursor)

  if (destinos.length === 0) {
    await concluirMaterializacao(campanhaId)
    return 0
  }

  const inicio = campanha.materializeAt ?? campanha.scheduledAt ?? new Date()
  const calendario = montarCalendario({
    quantidade: destinos.length,
    inicio,
    ratePerMinute: campanha.ratePerMinute,
    jitterMs: campanha.jitterMs,
    timezone,
    quietStart: campanha.quietStart,
    quietEnd: campanha.quietEnd,
  })

  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(inicio),
  )

  for (let i = 0; i < destinos.length; i += LOTE_INSERCAO) {
    const fatia = destinos.slice(i, i + LOTE_INSERCAO)
    await db.insert(dispatches).values(
      fatia.map((destino, j) => ({
        orgId: campanha.orgId,
        campaignId: campanha.id,
        contactId: destino.contactId,
        channel: campanha.canal,
        configId: campanha.configId,
        toAddress: destino.telefone,
        toName: destino.nome,
        /*
         * O corpo é compilado AQUI, por destinatário: cada linha sai do banco
         * já com o nome certo e a variante de spintax sorteada. O motor não
         * precisa saber que variável existe — e um erro de template aparece
         * agora, não no meio do disparo.
         */
        body: compilarMensagem(campanha.corpo, {
          nome: destino.nome,
          telefone: destino.telefone,
          email: destino.email,
          atributos: destino.atributos,
          hora,
        }),
        mediaUrl: campanha.mediaUrl,
        scheduledFor: calendario[i + j] ?? inicio,
        cost: campanha.unitPrice,
      })),
    )
  }

  const ultimo = destinos[destinos.length - 1]!
  const proximoInstante = calendario[calendario.length - 1] ?? inicio

  await db
    .update(campaigns)
    .set({
      materializeCursor: ultimo.telefone,
      materializeAt: new Date(proximoInstante.getTime() + 60_000 / campanha.ratePerMinute),
      pending: raw`${campaigns.pending} + ${destinos.length}`,
    })
    .where(eq(campaigns.id, campanhaId))

  // Fatia menor que o pedido significa que a fonte acabou.
  if (destinos.length < querAgora) await concluirMaterializacao(campanhaId)

  return destinos.length
}

/** Materialização terminada: a campanha passa a valer para o motor. */
async function concluirMaterializacao(campanhaId: string): Promise<void> {
  await db
    .update(campaigns)
    .set({
      materialized: true,
      // O total real pode ser menor que o estimado: alguém pode ter se
      // descadastrado entre a contagem e a materialização.
      total: raw`(SELECT count(*)::int FROM dispatches WHERE campaign_id = ${campanhaId})`,
      status: raw`CASE WHEN ${campaigns.status} = 'preparando' THEN 'agendada'::campaign_status ELSE ${campaigns.status} END`,
    })
    .where(eq(campaigns.id, campanhaId))
}

/** As campanhas que ainda têm linha para criar. Chamada pelo motor. */
export async function materializarPendentes(orcamentoDeLinhas: number): Promise<number> {
  const pendentes = await sql<{ id: string }[]>`
    SELECT id FROM campaigns
     WHERE NOT materialized AND status IN ('preparando', 'agendada', 'enviando')
     ORDER BY created_at
     LIMIT 5
  `

  let criadas = 0
  for (const { id } of pendentes) {
    if (criadas >= orcamentoDeLinhas) break
    criadas += await materializar(id, Math.min(FATIA_DO_MOTOR, orcamentoDeLinhas - criadas))
  }
  return criadas
}

// ───────────────────────────────────────────────────────────── controle

export async function pausar(orgId: string, campanhaId: string): Promise<boolean> {
  const linhas = await db
    .update(campaigns)
    .set({ status: 'pausada', pausedAt: new Date() })
    .where(
      and(
        eq(campaigns.id, campanhaId),
        eq(campaigns.orgId, orgId),
        inArray(campaigns.status, ['preparando', 'agendada', 'enviando']),
      ),
    )
    .returning({ id: campaigns.id })
  return linhas.length > 0
}

/**
 * Retomar empurra o que ficou para trás.
 *
 * Sem isso, uma campanha pausada por duas horas voltaria com dez mil linhas
 * vencidas ao mesmo tempo — e o ritmo por minuto, que existe justamente para
 * não queimar o número, iria para o lixo. O deslocamento preserva o intervalo
 * entre as linhas.
 */
export async function retomar(orgId: string, campanhaId: string): Promise<boolean> {
  const [campanha] = await db
    .select({ pausedAt: campaigns.pausedAt, materialized: campaigns.materialized })
    .from(campaigns)
    .where(
      and(eq(campaigns.id, campanhaId), eq(campaigns.orgId, orgId), eq(campaigns.status, 'pausada')),
    )
    .limit(1)

  if (!campanha) return false

  const paradaMs = campanha.pausedAt ? Date.now() - campanha.pausedAt.getTime() : 0
  if (paradaMs > 0) {
    await sql`
      UPDATE dispatches
         SET scheduled_for = scheduled_for + (${Math.round(paradaMs)} || ' milliseconds')::interval
       WHERE campaign_id = ${campanhaId} AND status = 'pendente'
    `
    await sql`
      UPDATE campaigns
         SET materialize_at = materialize_at + (${Math.round(paradaMs)} || ' milliseconds')::interval
       WHERE id = ${campanhaId} AND materialize_at IS NOT NULL
    `
  }

  await db
    .update(campaigns)
    .set({
      status: campanha.materialized ? 'enviando' : 'preparando',
      pausedAt: null,
    })
    .where(eq(campaigns.id, campanhaId))
  return true
}

/** Cancelar mata o que ainda não saiu. O que já saiu, já foi — e já foi cobrado. */
export async function cancelar(orgId: string, campanhaId: string): Promise<number> {
  const [campanha] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, campanhaId),
        eq(campaigns.orgId, orgId),
        inArray(campaigns.status, ['rascunho', 'preparando', 'agendada', 'enviando', 'pausada']),
      ),
    )
    .limit(1)

  if (!campanha) return 0

  const canceladas = await db
    .update(dispatches)
    .set({ status: 'cancelado' })
    .where(and(eq(dispatches.campaignId, campanhaId), eq(dispatches.status, 'pendente')))
    .returning({ id: dispatches.id })

  await db
    .update(campaigns)
    .set({
      status: 'cancelada',
      finishedAt: new Date(),
      pending: 0,
      // Cancelada não continua sendo preparada.
      materialized: true,
    })
    .where(eq(campaigns.id, campanhaId))

  return canceladas.length
}

/**
 * Descadastro. Vale para a organização inteira e para todos os canais.
 *
 * Continuar mandando depois de um "PARE" é o caminho mais curto para uma
 * denúncia — e, no WhatsApp, para o número ser banido. Por isso o que ainda
 * não saiu para esse número morre junto.
 */
export async function descadastrar(
  orgId: string,
  telefone: string,
  motivo = 'pedido do destinatário',
): Promise<void> {
  await db
    .update(contacts)
    .set({ optedOut: true, optedOutAt: new Date(), optedOutReason: motivo })
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, telefone)))

  await db
    .update(dispatches)
    .set({ status: 'cancelado', errorCode: 'bloqueado_pelo_destino' })
    .where(
      and(
        eq(dispatches.orgId, orgId),
        eq(dispatches.toAddress, telefone),
        eq(dispatches.status, 'pendente'),
      ),
    )
}
