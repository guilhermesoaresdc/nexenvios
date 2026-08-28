import 'server-only'
import { and, eq, inArray, isNull, lt, lte, or, sql as raw } from 'drizzle-orm'
import { db, sql } from '@/db'
import { campaigns, channelConfigs, creditLedger, dispatches } from '@/db/schema'
import type { Channel } from '@/db/schema/enums'
import { enviarPeloCanal, montarConfig, type Destino, type Resultado } from '@/lib/channels'
import { lerSegredo } from '@/lib/cripto'
import { criarLog } from '@/lib/log'
import { esperaDaRetentativa, MAX_TENTATIVAS } from './janela'

const log = criarLog('motor')

/**
 * O motor de envio, sem fila externa.
 *
 * O Mandafy usava BullMQ + Redis com um worker de pé. Aqui não há onde deixar
 * um processo rodando: a Vercel só executa função. A troca é deliberada — a
 * PRÓPRIA TABELA é a fila. `dispatches.scheduled_for` diz quando cada linha
 * pode sair, e uma batida periódica (`GET /api/cron`) pega o que venceu.
 *
 * Isso funciona porque a transição para 'enviando' é comparação-e-troca: dois
 * processos podem pegar o mesmo lote que só um encontra a linha ainda
 * pendente. Duas batidas simultâneas não enviam duas vezes.
 *
 * O preço é a granularidade: sem worker, a reação é do tamanho do intervalo do
 * agendador. Por isso a documentação insiste num agendador externo de 1 minuto
 * — o cron da Vercel no plano Hobby roda uma vez por dia e serve só de piso.
 */

/** Quantas linhas uma batida tenta enviar. Ajustado ao teto de tempo da função. */
const LOTE_PADRAO = Number(process.env.LOTE_DO_MOTOR ?? 60)

/** Depois disso, uma linha presa em 'enviando' volta para a fila. */
const PRESA_APOS_MS = 5 * 60 * 1000

/** Falhas seguidas antes de o canal ser desligado por um tempo. */
const FALHAS_ATE_DISJUNTOR = 8
const DISJUNTOR_MS = 10 * 60 * 1000

type LinhaParaEnviar = {
  id: string
  orgId: string
  campaignId: string | null
  channel: Channel
  configId: string | null
  instanceId: string | null
  toAddress: string
  toName: string | null
  body: string
  mediaUrl: string | null
  attempts: number
  cost: string
  templateName: string | null
  mediaType: string | null
}

/**
 * Devolve à fila o que ficou preso.
 *
 * Uma função serverless pode morrer no meio do envio — timeout, deploy,
 * instância derrubada. A linha fica em 'enviando' para sempre e a campanha
 * nunca termina. Cinco minutos é folga suficiente para o envio mais lento.
 */
export async function soltarPresas(): Promise<number> {
  const soltas = await db
    .update(dispatches)
    .set({ status: 'pendente', claimedAt: null })
    .where(
      and(
        eq(dispatches.status, 'enviando'),
        lt(dispatches.claimedAt, new Date(Date.now() - PRESA_APOS_MS)),
      ),
    )
    .returning({ id: dispatches.id })

  if (soltas.length > 0) log.warn('linhas presas devolvidas à fila', { total: soltas.length })
  return soltas.length
}

/**
 * Pega um lote e marca como 'enviando' na mesma instrução.
 *
 * `FOR UPDATE SKIP LOCKED` é o que permite duas batidas concorrentes: a
 * segunda pula as linhas que a primeira já travou em vez de esperar por elas.
 */
async function reservarLote(limite: number): Promise<LinhaParaEnviar[]> {
  const linhas = await sql<LinhaParaEnviar[]>`
    WITH escolhidas AS (
      SELECT d.id
        FROM dispatches d
        JOIN campaigns c ON c.id = d.campaign_id
       WHERE d.status = 'pendente'
         AND d.scheduled_for <= now()
         AND c.status = 'enviando'
       ORDER BY d.scheduled_for
       LIMIT ${limite}
         FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE dispatches d
       SET status = 'enviando', claimed_at = now(), attempts = d.attempts + 1
      FROM escolhidas e, campaigns c
     WHERE d.id = e.id AND c.id = d.campaign_id
    RETURNING d.id, d.org_id AS "orgId", d.campaign_id AS "campaignId",
              d.channel, d.config_id AS "configId", d.instance_id AS "instanceId",
              d.to_address AS "toAddress", d.to_name AS "toName", d.body,
              d.media_url AS "mediaUrl", d.attempts, d.cost::text AS cost,
              c.template_name AS "templateName", c.media_type AS "mediaType"
  `
  return linhas
}

type Canal = {
  id: string
  provider: string
  credentials: string | null
  settings: Record<string, unknown>
  brokenUntil: Date | null
}

/** Cache por batida: 60 envios do mesmo canal decifram a credencial uma vez. */
async function carregarCanais(ids: string[]): Promise<Map<string, Canal>> {
  if (ids.length === 0) return new Map()
  const linhas = await db
    .select({
      id: channelConfigs.id,
      provider: channelConfigs.provider,
      credentials: channelConfigs.credentials,
      settings: channelConfigs.settings,
      brokenUntil: channelConfigs.brokenUntil,
    })
    .from(channelConfigs)
    .where(inArray(channelConfigs.id, ids))

  return new Map(
    linhas.map((l) => [
      l.id,
      { ...l, settings: (l.settings ?? {}) as Record<string, unknown> } as Canal,
    ]),
  )
}

/**
 * Escolhe o chip do WhatsApp não oficial para esta linha.
 *
 * Rodízio com três guardas, na ordem em que importam: instância conectada,
 * teto diário não estourado (aquecimento), e intervalo mínimo desde o último
 * envio. Sem os três, um chip novo manda 5 mil no primeiro dia e some.
 */
async function escolherInstancia(orgId: string): Promise<{ id: string; nome: string } | null> {
  const [escolhida] = await sql<{ id: string; nome: string }[]>`
    UPDATE whatsapp_instances w
       SET sent_today = CASE
             WHEN w.counter_day < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 1
             ELSE w.sent_today + 1
           END,
           counter_day = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
           last_sent_at = now()
     WHERE w.id = (
       SELECT i.id FROM whatsapp_instances i
        WHERE i.org_id = ${orgId}
          AND i.active
          AND i.status = 'conectado'
          AND (i.counter_day < (now() AT TIME ZONE 'America/Sao_Paulo')::date
               OR i.sent_today < i.daily_cap)
          AND (i.last_sent_at IS NULL
               OR i.last_sent_at < now() - (i.min_interval_ms || ' milliseconds')::interval)
        ORDER BY i.last_sent_at NULLS FIRST
        LIMIT 1
          FOR UPDATE SKIP LOCKED
     )
    RETURNING w.id, w.instance_name AS nome
  `
  return escolhida ?? null
}

async function registrarFalhaDoCanal(configId: string): Promise<void> {
  await sql`
    UPDATE channel_configs
       SET failure_streak = failure_streak + 1,
           broken_until = CASE
             WHEN failure_streak + 1 >= ${FALHAS_ATE_DISJUNTOR}
             THEN now() + (${DISJUNTOR_MS} || ' milliseconds')::interval
             ELSE broken_until
           END
     WHERE id = ${configId}
  `
}

async function registrarSucessoDoCanal(configId: string): Promise<void> {
  await db
    .update(channelConfigs)
    .set({ failureStreak: 0, brokenUntil: null })
    .where(and(eq(channelConfigs.id, configId), raw`${channelConfigs.failureStreak} > 0`))
}

async function concluir(linha: LinhaParaEnviar, resultado: Resultado): Promise<void> {
  if (resultado.ok) {
    await db
      .update(dispatches)
      .set({
        status: 'enviado',
        sentAt: new Date(),
        provider: resultado.provider,
        providerMessageId: resultado.providerMessageId,
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(dispatches.id, linha.id))

    // O crédito só sai quando a mensagem sai. Campanha cancelada no meio não
    // cobra o que não foi enviado.
    if (Number(linha.cost) > 0) {
      await db.insert(creditLedger).values({
        orgId: linha.orgId,
        kind: 'consumo',
        delta: String(-Number(linha.cost)),
        description: 'Envio',
        campaignId: linha.campaignId,
      })
      if (linha.campaignId) {
        await db
          .update(campaigns)
          .set({ actualCost: raw`${campaigns.actualCost} + ${linha.cost}::numeric` })
          .where(eq(campaigns.id, linha.campaignId))
      }
    }

    if (linha.configId) await registrarSucessoDoCanal(linha.configId)
    return
  }

  const podeTentarDeNovo = resultado.reenviavel && linha.attempts < MAX_TENTATIVAS

  await db
    .update(dispatches)
    .set(
      podeTentarDeNovo
        ? {
            status: 'pendente',
            claimedAt: null,
            scheduledFor: new Date(
              Date.now() + esperaDaRetentativa(linha.attempts, resultado.esperarSegundos),
            ),
            provider: resultado.provider,
            errorCode: resultado.codigo,
            errorMessage: resultado.mensagem.slice(0, 500),
          }
        : {
            status: 'falhou',
            provider: resultado.provider,
            errorCode: resultado.codigo,
            errorMessage: resultado.mensagem.slice(0, 500),
          },
    )
    .where(eq(dispatches.id, linha.id))

  if (linha.configId && resultado.reenviavel) await registrarFalhaDoCanal(linha.configId)
}

/** Uma linha, do começo ao fim. Nunca lança: o lote não pode parar por uma. */
async function enviarUma(linha: LinhaParaEnviar, canais: Map<string, Canal>): Promise<boolean> {
  const canal = linha.configId ? canais.get(linha.configId) : undefined

  if (!canal) {
    await concluir(linha, {
      ok: false,
      provider: 'nenhum',
      codigo: 'sem_credencial',
      mensagem: 'o canal desta campanha não existe mais',
      reenviavel: false,
    })
    return false
  }

  if (canal.brokenUntil && canal.brokenUntil.getTime() > Date.now()) {
    // Disjuntor aberto: devolve à fila em vez de queimar a tentativa.
    await db
      .update(dispatches)
      .set({
        status: 'pendente',
        claimedAt: null,
        attempts: Math.max(linha.attempts - 1, 0),
        scheduledFor: canal.brokenUntil,
        errorCode: 'provedor_indisponivel',
      })
      .where(eq(dispatches.id, linha.id))
    return false
  }

  const credenciais = lerSegredo<Record<string, unknown>>(canal.credentials) ?? {}
  const alvo = montarConfig(linha.channel, canal.provider, { ...canal.settings, ...credenciais })

  if (!alvo) {
    await concluir(linha, {
      ok: false,
      provider: canal.provider,
      codigo: 'sem_credencial',
      mensagem: 'a configuração deste canal não é reconhecida',
      reenviavel: false,
    })
    return false
  }

  let instanciaId = linha.instanceId
  if (alvo.canal === 'whatsapp_nao_oficial' && alvo.provider === 'evolution') {
    const instancia = await escolherInstancia(linha.orgId)
    if (!instancia) {
      // Nenhum chip disponível AGORA não é falha: é esperar. Tenta em 5 min.
      await db
        .update(dispatches)
        .set({
          status: 'pendente',
          claimedAt: null,
          attempts: Math.max(linha.attempts - 1, 0),
          scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
          errorCode: 'instancia_desconectada',
          errorMessage: 'nenhum número conectado e dentro do teto no momento',
        })
        .where(eq(dispatches.id, linha.id))
      return false
    }
    instanciaId = instancia.id
    alvo.config.instancia = instancia.nome
    await db.update(dispatches).set({ instanceId: instancia.id }).where(eq(dispatches.id, linha.id))
  }

  const destino: Destino = {
    para: linha.toAddress,
    nome: linha.toName,
    corpo: linha.body,
    mediaUrl: linha.mediaUrl,
    mediaType: linha.mediaType,
    templateName: linha.templateName,
  }

  let resultado: Resultado
  try {
    resultado = await enviarPeloCanal(destino, alvo)
  } catch (erro) {
    resultado = {
      ok: false,
      provider: canal.provider,
      codigo: 'rede',
      mensagem: erro instanceof Error ? erro.name : 'erro desconhecido',
      reenviavel: true,
    }
  }

  await concluir({ ...linha, instanceId: instanciaId }, resultado)
  return resultado.ok
}

export type ResumoDaBatida = {
  soltas: number
  linhasCriadas: number
  tentados: number
  enviados: number
  falhas: number
  campanhasIniciadas: number
  campanhasConcluidas: number
}

/**
 * Uma batida do motor. É isto que `/api/cron` chama.
 *
 * A ordem importa: soltar presas antes de reservar (senão o lote vem menor do
 * que poderia), iniciar agendadas antes de enviar (senão a campanha que venceu
 * agora espera a próxima batida), e fechar concluídas no fim.
 */
export async function bater(limite = LOTE_PADRAO): Promise<ResumoDaBatida> {
  const soltas = await soltarPresas()

  /*
   * Preparar vem antes de enviar. Uma campanha grande ainda materializando já
   * tem linhas prontas — mandar essas primeiro faria o cliente ver o disparo
   * andar enquanto a base termina de entrar, que é o comportamento certo.
   */
  const { materializarPendentes, FATIA_DO_MOTOR } = await import('@/lib/campanhas/servico')
  const linhasCriadas = await materializarPendentes(FATIA_DO_MOTOR)

  const campanhasIniciadas = await iniciarAgendadas()

  const lote = await reservarLote(limite)
  const canais = await carregarCanais([
    ...new Set(lote.map((l) => l.configId).filter((v): v is string => Boolean(v))),
  ])

  let enviados = 0
  /*
   * Sequencial de propósito. Paralelizar aqui atropelaria o ritmo por minuto
   * que o calendário montou e, no WhatsApp não oficial, o intervalo mínimo
   * por chip — que é justamente o que evita o banimento.
   */
  for (const linha of lote) {
    const ok = await enviarUma(linha, canais)
    if (ok) enviados += 1
  }

  const campanhasConcluidas = await fecharConcluidas()

  return {
    soltas,
    linhasCriadas,
    tentados: lote.length,
    enviados,
    falhas: lote.length - enviados,
    campanhasIniciadas,
    campanhasConcluidas,
  }
}

/** Campanha agendada cuja hora chegou vira 'enviando'. */
export async function iniciarAgendadas(): Promise<number> {
  const iniciadas = await db
    .update(campaigns)
    .set({ status: 'enviando', startedAt: raw`COALESCE(${campaigns.startedAt}, now())` })
    .where(
      and(
        eq(campaigns.status, 'agendada'),
        or(isNull(campaigns.scheduledAt), lte(campaigns.scheduledAt, new Date())),
      ),
    )
    .returning({ id: campaigns.id })
  return iniciadas.length
}

/** Campanha sem nenhuma linha pendente está terminada. */
export async function fecharConcluidas(): Promise<number> {
  const fechadas = await sql<{ id: string }[]>`
    UPDATE campaigns c
       SET status = 'concluida', finished_at = now()
     WHERE c.status = 'enviando'
       AND c.materialized
       AND NOT EXISTS (
         SELECT 1 FROM dispatches d
          WHERE d.campaign_id = c.id
            AND d.status IN ('pendente', 'enviando')
       )
    RETURNING c.id
  `
  return fechadas.length
}

/** Manutenção diária: sessões vencidas, tokens queimados, contadores do dia. */
export async function manutencao(): Promise<{ sessoes: number; tokens: number }> {
  const { limparSessoesVencidas } = await import('@/lib/auth/sessao')
  const sessoes = await limparSessoesVencidas()

  const tokens = await sql<{ id: string }[]>`
    DELETE FROM password_tokens
     WHERE expires_at < now() - interval '30 days'
    RETURNING id
  `

  await sql`
    UPDATE whatsapp_instances
       SET sent_today = 0, counter_day = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     WHERE counter_day < (now() AT TIME ZONE 'America/Sao_Paulo')::date
  `

  return { sessoes, tokens: tokens.length }
}

/** Um envio avulso, fora de campanha (teste da tela e API pública). */
export async function enviarAgora(opcoes: {
  orgId: string
  configId: string
  canal: Channel
  para: string
  nome?: string | null
  corpo: string
  mediaUrl?: string | null
}): Promise<Resultado> {
  const canais = await carregarCanais([opcoes.configId])
  const canal = canais.get(opcoes.configId)
  if (!canal) {
    return {
      ok: false,
      provider: 'nenhum',
      codigo: 'sem_credencial',
      mensagem: 'canal não encontrado',
      reenviavel: false,
    }
  }

  const credenciais = lerSegredo<Record<string, unknown>>(canal.credentials) ?? {}
  const alvo = montarConfig(opcoes.canal, canal.provider, { ...canal.settings, ...credenciais })
  if (!alvo) {
    return {
      ok: false,
      provider: canal.provider,
      codigo: 'sem_credencial',
      mensagem: 'configuração do canal não reconhecida',
      reenviavel: false,
    }
  }

  if (alvo.canal === 'whatsapp_nao_oficial' && alvo.provider === 'evolution') {
    const instancia = await escolherInstancia(opcoes.orgId)
    if (!instancia) {
      return {
        ok: false,
        provider: 'evolution',
        codigo: 'instancia_desconectada',
        mensagem: 'nenhum número conectado no momento',
        reenviavel: false,
      }
    }
    alvo.config.instancia = instancia.nome
  }

  return enviarPeloCanal(
    {
      para: opcoes.para,
      nome: opcoes.nome,
      corpo: opcoes.corpo,
      mediaUrl: opcoes.mediaUrl,
    },
    alvo,
  )
}

export { LOTE_PADRAO }
export type { LinhaParaEnviar }
