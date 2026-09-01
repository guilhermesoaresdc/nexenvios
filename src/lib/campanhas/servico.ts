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

import { entregarAoMonitor, PROVEDOR as PROVEDOR_EXTERNO } from './externa'

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
  /**
   * O perfil que aparece no WhatsApp de quem recebe.
   *
   * Só o Monitor de Envios usa: lá o perfil viaja junto da campanha, e são
   * dois (o principal e o reserva, para a equipe deles trocar se a Meta
   * reprovar o primeiro). Nos outros canais o perfil é do número, não do
   * disparo, e este campo é ignorado.
   */
  perfil?: { nome: string; fotoUrl: string; nome2: string; fotoUrl2: string } | null
  /** Documento e partido, exigidos pelo Monitor em campanha eleitoral. */
  politica?: { documento: string; partido: string } | null
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
    .select({
      id: channelConfigs.id,
      canal: channelConfigs.channel,
      ativo: channelConfigs.active,
      provedor: channelConfigs.provider,
    })
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
      profileName: dados.perfil?.nome ?? null,
      profilePhotoUrl: dados.perfil?.fotoUrl ?? null,
      profileName2: dados.perfil?.nome2 ?? null,
      profilePhotoUrl2: dados.perfil?.fotoUrl2 ?? null,
      createdBy: usuarioId ?? null,
    })
    .returning({ id: campaigns.id })

  if (!campanha) return { ok: false, erro: 'Não foi possível criar a campanha.' }

  /*
   * Campanha delegada não materializa linha nenhuma.
   *
   * O Monitor de Envios recebe a campanha inteira e entrega por conta própria;
   * não há o que reservar aqui. Criar uma linha por destinatário só para
   * marcá-la "enviada" a partir de um número agregado seria inventar histórico
   * que não temos.
   */
  if (canal.provedor === PROVEDOR_EXTERNO) {
    /*
     * Perfil nulo não é erro: `entregarAoMonitor` cai para o padrão do canal.
     * Quem recusa é a conferência de lá, que sabe se sobrou algum campo vazio
     * depois da queda — aqui a gente ainda não sabe.
     */
    const perfil = dados.perfil ?? null
    /*
     * Campanha eleitoral só sai declarada.
     *
     * Neste canal o corpo vai CRU, sem a nossa frase — porque quem processa a
     * resposta é a plataforma deles, e a palavra que eles escutam é "2". Mas
     * eles só acrescentam essa frase quando a campanha vai com politica=true.
     * Sem a declaração, a mensagem sairia sem NENHUMA saída: art. 57-G
     * descumprido, e R$ 100 de multa por mensagem a quem já pediu para sair.
     *
     * A tela barra antes; esta é a trava que vale para a API pública também.
     */
    if (eleitoral && !dados.politica) {
      await db
        .update(campaigns)
        .set({
          status: 'falhou',
          materialized: true,
          externalReason:
            'Campanha eleitoral pelo Monitor de Envios exige a declaração política (documento do candidato e partido). Sem ela a mensagem sairia sem a frase de descadastro exigida por lei.',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campanha.id))
      return {
        ok: false,
        erro:
          'Campanha eleitoral por este canal exige o CPF ou CNPJ do candidato e o partido — é o que permite acrescentar a frase de descadastro exigida por lei.',
      }
    }

    const entrega = await entregarAoMonitor({
      campanhaId: campanha.id,
      orgId,
      nome: dados.nome,
      canal: dados.canal,
      // Cru: quem acrescenta a frase de descadastro é a plataforma deles, com
      // a palavra que os robôs deles realmente escutam.
      corpo: dados.corpo,
      fontes,
      configId: canal.id,
      perfil,
      mediaUrl: dados.mediaUrl ?? null,
      agendarPara: dados.agendarPara ?? null,
      politica: eleitoral ? (dados.politica ?? null) : null,
    })

    if (!entrega.ok) {
      // A campanha fica registrada como falha em vez de sumir: o cliente
      // precisa ver o que aconteceu com o disparo que ele mandou criar.
      await db
        .update(campaigns)
        .set({
          status: 'falhou',
          // `materialized: true` fecha a porta do motor: sem isso ele
          // materializaria a campanha que acabou de falhar.
          materialized: true,
          externalReason: entrega.erro,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campanha.id))
      return { ok: false, erro: entrega.erro }
    }

    log.info('campanha criada (delegada)', {
      campanha: campanha.id,
      destinatarios: entrega.total,
      canal: dados.canal,
    })

    return {
      ok: true,
      campanhaId: campanha.id,
      destinatarios: entrega.total,
      custo: entrega.total * orcamento.precoPorEnvio,
      aparado: orcamento.publico.aparado,
    }
  }

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
      externalCode: campaigns.externalCode,
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

  /*
   * Campanha delegada nunca vira linha de envio.
   *
   * Quem entrega é a plataforma de fora; materializar aqui criaria uma
   * segunda entrega da mesma mensagem — o cliente pagando duas vezes e o
   * destinatário recebendo duas vezes. A trava é redundante de propósito:
   * os caminhos que gravam a campanha já fecham `materialized`, mas esta é a
   * porta por onde o estrago entraria se algum deles falhasse.
   */
  if (campanha.externalCode) {
    await db
      .update(campaigns)
      .set({ materialized: true, materializeAt: null })
      .where(eq(campaigns.id, campanhaId))
    return 0
  }

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

/**
 * Campanha delegada não pausa nem cancela por aqui.
 *
 * O Monitor de Envios não expõe rota para isso: depois de submetida, a
 * campanha é deles. Um botão que muda só o nosso status daria ao cliente a
 * impressão de que parou — e as mensagens continuariam saindo.
 */
export async function eDelegada(orgId: string, campanhaId: string): Promise<boolean> {
  const [linha] = await db
    .select({ codigo: campaigns.externalCode })
    .from(campaigns)
    .where(and(eq(campaigns.id, campanhaId), eq(campaigns.orgId, orgId)))
    .limit(1)
  return Boolean(linha?.codigo)
}

export async function pausar(orgId: string, campanhaId: string): Promise<boolean> {
  if (await eDelegada(orgId, campanhaId)) return false

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
  if (await eDelegada(orgId, campanhaId)) return -1

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
