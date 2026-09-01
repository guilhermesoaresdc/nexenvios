import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { contacts, dispatches, inboundMessages } from '@/db/schema'
import type { Channel, DispatchStatus } from '@/db/schema/enums'
import { donoDoToken } from '@/lib/canais/retorno'
import { descadastrar } from '@/lib/campanhas/servico'
import { pediuParaSair } from '@/lib/campanhas/saida'
import { criarLog } from '@/lib/log'
import { normalizarTelefone } from '@/lib/telefone'

/**
 * O webhook de retorno dos provedores.
 *
 * O token na URL identifica a organização e o canal — vai na URL porque é
 * assim que quase todo provedor aceita ser configurado; muitos não mandam
 * cabeçalho nenhum.
 *
 * **Responde 200 sempre que o token existe**, mesmo sem entender o corpo. Um
 * provedor que recebe erro fica reenviando, e vários desligam o webhook depois
 * de N falhas — perder o retorno de entrega é pior do que ignorar um formato
 * desconhecido.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const log = criarLog('retorno')

/** Palavras que descadastram. Sem acento, em qualquer caixa. */

type Atualizacao = { providerMessageId: string; status: DispatchStatus }

/** Normaliza o status do provedor para o nosso vocabulário. */
function traduzirStatus(bruto: string): DispatchStatus | null {
  const s = bruto.toLowerCase()
  if (['delivered', 'delivery_ack', 'entregue', 'received'].includes(s)) return 'entregue'
  if (['read', 'lido', 'played'].includes(s)) return 'lido'
  if (['sent', 'enviado', 'server_ack', 'accepted'].includes(s)) return 'enviado'
  if (['failed', 'undelivered', 'falhou', 'error', 'rejected'].includes(s)) return 'falhou'
  return null
}

type Corpo = Record<string, unknown>

function comoObjeto(v: unknown): Corpo | null {
  return v !== null && typeof v === 'object' ? (v as Corpo) : null
}

/** Extrai atualizações de status e mensagens recebidas dos formatos conhecidos. */
function interpretar(corpo: Corpo): {
  status: Atualizacao[]
  recebidas: { de: string; texto: string | null; providerMessageId: string | null }[]
} {
  const status: Atualizacao[] = []
  const recebidas: { de: string; texto: string | null; providerMessageId: string | null }[] = []

  // ── Meta Cloud API: entry[].changes[].value.{statuses,messages}
  const entry = corpo.entry
  if (Array.isArray(entry)) {
    for (const e of entry) {
      const mudancas = comoObjeto(e)?.changes
      if (!Array.isArray(mudancas)) continue
      for (const c of mudancas) {
        const valor = comoObjeto(comoObjeto(c)?.value)
        if (!valor) continue

        if (Array.isArray(valor.statuses)) {
          for (const s of valor.statuses) {
            const linha = comoObjeto(s)
            const id = typeof linha?.id === 'string' ? linha.id : null
            const bruto = typeof linha?.status === 'string' ? linha.status : null
            const traduzido = bruto ? traduzirStatus(bruto) : null
            if (id && traduzido) status.push({ providerMessageId: id, status: traduzido })
          }
        }

        if (Array.isArray(valor.messages)) {
          for (const m of valor.messages) {
            const linha = comoObjeto(m)
            const de = typeof linha?.from === 'string' ? linha.from : null
            const texto = comoObjeto(linha?.text)?.body
            if (de) {
              recebidas.push({
                de,
                texto: typeof texto === 'string' ? texto : null,
                providerMessageId: typeof linha?.id === 'string' ? linha.id : null,
              })
            }
          }
        }
      }
    }
  }

  // ── Evolution: { event, data: { key: { id, remoteJid, fromMe }, status, message } }
  const dados = comoObjeto(corpo.data)
  if (dados) {
    const chave = comoObjeto(dados.key)
    const id = typeof chave?.id === 'string' ? chave.id : null
    const bruto = typeof dados.status === 'string' ? dados.status : null
    const traduzido = bruto ? traduzirStatus(bruto) : null
    if (id && traduzido) status.push({ providerMessageId: id, status: traduzido })

    const deMim = chave?.fromMe === true
    const remoteJid = typeof chave?.remoteJid === 'string' ? chave.remoteJid : null
    if (!deMim && remoteJid) {
      const msg = comoObjeto(dados.message)
      const texto =
        (typeof msg?.conversation === 'string' ? msg.conversation : null) ??
        (typeof comoObjeto(msg?.extendedTextMessage)?.text === 'string'
          ? (comoObjeto(msg?.extendedTextMessage)!.text as string)
          : null)
      if (texto !== null || dados.messageType) {
        recebidas.push({ de: remoteJid.split('@')[0] ?? remoteJid, texto, providerMessageId: id })
      }
    }
  }

  // ── Genérico: { id, status } ou { messageId, status } no primeiro nível.
  const idSolto =
    (typeof corpo.id === 'string' && corpo.id) ||
    (typeof corpo.messageId === 'string' && corpo.messageId) ||
    (typeof corpo.message_id === 'string' && corpo.message_id) ||
    null
  const statusSolto = typeof corpo.status === 'string' ? traduzirStatus(corpo.status) : null
  if (idSolto && statusSolto) status.push({ providerMessageId: idSolto, status: statusSolto })

  return { status, recebidas }
}

/** Só avança: 'entregue' não volta para 'enviado' se o webhook chegar fora de ordem. */
const ORDEM: Partial<Record<DispatchStatus, number>> = {
  pendente: 0,
  enviando: 1,
  enviado: 2,
  entregue: 3,
  lido: 4,
  respondido: 5,
}

async function aplicarStatus(orgId: string, atualizacoes: Atualizacao[]): Promise<number> {
  if (atualizacoes.length === 0) return 0

  const ids = [...new Set(atualizacoes.map((a) => a.providerMessageId))]
  const linhas = await db
    .select({
      id: dispatches.id,
      providerMessageId: dispatches.providerMessageId,
      status: dispatches.status,
    })
    .from(dispatches)
    .where(and(eq(dispatches.orgId, orgId), inArray(dispatches.providerMessageId, ids)))

  let mudadas = 0
  for (const linha of linhas) {
    const nova = atualizacoes.find((a) => a.providerMessageId === linha.providerMessageId)
    if (!nova) continue

    const atual = ORDEM[linha.status] ?? -1
    const proposta = ORDEM[nova.status] ?? -1
    // Falha é terminal e sempre vale; o resto só avança.
    if (nova.status !== 'falhou' && proposta <= atual) continue

    const agora = new Date()
    await db
      .update(dispatches)
      .set({
        status: nova.status,
        deliveredAt: nova.status === 'entregue' ? agora : undefined,
        readAt: nova.status === 'lido' ? agora : undefined,
        errorCode: nova.status === 'falhou' ? 'provedor_indisponivel' : undefined,
      })
      .where(eq(dispatches.id, linha.id))
    mudadas += 1
  }

  return mudadas
}

async function registrarRecebidas(
  orgId: string,
  canal: Channel,
  recebidas: { de: string; texto: string | null; providerMessageId: string | null }[],
): Promise<number> {
  let descadastros = 0

  for (const r of recebidas) {
    const norm = normalizarTelefone(r.de)
    const telefone = norm.ok ? norm.e164 : r.de

    const [contato] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, telefone)))
      .limit(1)

    // A resposta é casada com o envio original pelo id do provedor, quando ele
    // vem — é o que permite dizer "de qual campanha veio esta resposta".
    let dispatchId: string | null = null
    if (r.providerMessageId) {
      const [envio] = await db
        .select({ id: dispatches.id })
        .from(dispatches)
        .where(
          and(
            eq(dispatches.orgId, orgId),
            eq(dispatches.providerMessageId, r.providerMessageId),
          ),
        )
        .limit(1)
      dispatchId = envio?.id ?? null
    }

    await db.insert(inboundMessages).values({
      orgId,
      channel: canal,
      fromAddress: telefone,
      body: r.texto,
      dispatchId,
      contactId: contato?.id ?? null,
    })

    if (dispatchId) {
      await db
        .update(dispatches)
        .set({ status: 'respondido', repliedAt: new Date() })
        .where(eq(dispatches.id, dispatchId))
    }

    if (norm.ok && pediuParaSair(r.texto ?? '')) {
      await descadastrar(orgId, telefone, 'respondeu pedindo para sair')
      descadastros += 1
    }
  }

  return descadastros
}

async function processar(req: Request, token: string) {
  const dono = await donoDoToken(token)
  // Token desconhecido é a única resposta de erro: qualquer outra faria o
  // provedor desligar o webhook por causa de um formato que não entendemos.
  if (!dono) return Response.json({ erro: 'token desconhecido' }, { status: 404 })

  let corpo: Corpo = {}
  try {
    const bruto = await req.json()
    corpo = comoObjeto(bruto) ?? {}
  } catch {
    return Response.json({ ok: true, ignorado: 'corpo não é JSON' })
  }

  try {
    const { status, recebidas } = interpretar(corpo)
    const mudadas = await aplicarStatus(dono.orgId, status)
    const descadastros = await registrarRecebidas(dono.orgId, dono.canal, recebidas)

    // Nenhum dado pessoal no log: só contagens.
    if (mudadas || recebidas.length) {
      log.info('retorno processado', {
        org: dono.orgId,
        canal: dono.canal,
        status: mudadas,
        recebidas: recebidas.length,
        descadastros,
      })
    }

    return Response.json({ ok: true, status: mudadas, recebidas: recebidas.length })
  } catch (e) {
    log.error('falha ao processar retorno', {
      org: dono.orgId,
      motivo: e instanceof Error ? e.name : 'desconhecido',
    })
    // Mesmo com erro do nosso lado: 200, para o provedor não desligar o
    // webhook. O erro fica no log, para nós.
    return Response.json({ ok: true, ignorado: 'erro interno' })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return processar(req, token)
}

/** Alguns provedores validam o endereço com um GET antes de configurar. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const dono = await donoDoToken(token)
  if (!dono) return Response.json({ erro: 'token desconhecido' }, { status: 404 })
  return Response.json({ ok: true, canal: dono.canal })
}
