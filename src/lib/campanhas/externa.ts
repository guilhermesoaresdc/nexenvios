import 'server-only'
import { and, eq, isNotNull, notInArray, or, sql as raw } from 'drizzle-orm'
import { db, sql } from '@/db'
import { campaigns, channelConfigs, creditLedger } from '@/db/schema'
import { lerSegredo } from '@/lib/cripto'
import { criarLog } from '@/lib/log'
import {
  conferirSubmissao,
  progressoDaCampanha,
  respostasDaCampanha,
  statusDeAprovacao,
  submeterCampanha,
  type CredencialMonitor,
  type Perfil,
} from '@/lib/channels/monitor'
import { registrarFalhaDoCanal, registrarSucessoDoCanal } from '@/lib/delivery/disjuntor'
import { pediuParaSair } from './saida'
import { descadastrar } from './servico'
import { fatiaDoPublico } from './publico'
import type { Fonte } from './publico'

const log = criarLog('externa')

/**
 * Campanha entregue por uma plataforma de fora.
 *
 * O motor normal reserva linha, manda uma mensagem, marca o resultado. Aqui
 * não existe linha: a campanha inteira vai num POST e o progresso volta
 * agregado. As duas metades deste arquivo são exatamente isso — submeter e
 * sincronizar.
 *
 * O que muda de verdade para o cliente:
 *
 * - **A aprovação não é nossa.** A campanha nasce 'aguardando' e só anda
 *   quando alguém do outro lado libera. Nossos controles de ritmo e janela de
 *   silêncio não valem — quem faz o ritmo é a plataforma deles.
 * - **O crédito sai pelo agregado.** Não sabemos qual mensagem saiu, só
 *   quantas. Cobramos a diferença a cada sincronização, e `external_billed`
 *   guarda o que já foi cobrado — sem ele, cada polling cobraria tudo de novo.
 */

/** O teto de campanhas sincronizadas por batida. Eles limitam 30 req/min. */
const POR_BATIDA = 5

/** Quanto tempo esperar antes de consultar a mesma campanha de novo. */
const INTERVALO_SEGUNDOS = 60

export const PROVEDOR = 'monitor_envios'

export type DadosDaSubmissao = {
  campanhaId: string
  orgId: string
  nome: string
  corpo: string
  fontes: Fonte[]
  configId: string
  /** Nulo cai para o perfil padrão do canal. */
  perfil: Perfil | null
  mediaUrl?: string | null
  agendarPara?: Date | null
  politica?: { documento: string; partido: string } | null
}

function credencialDe(bruto: string | null | undefined): CredencialMonitor | null {
  const segredo = lerSegredo(bruto)
  if (!segredo || typeof segredo !== 'object') return null
  const c = segredo as Record<string, unknown>
  const apiToken = typeof c.apiToken === 'string' ? c.apiToken : ''
  if (!apiToken) return null
  return {
    apiToken,
    perfilNome: typeof c.perfilNome === 'string' ? c.perfilNome : undefined,
    perfilFoto: typeof c.perfilFoto === 'string' ? c.perfilFoto : undefined,
    perfilNome2: typeof c.perfilNome2 === 'string' ? c.perfilNome2 : undefined,
    perfilFoto2: typeof c.perfilFoto2 === 'string' ? c.perfilFoto2 : undefined,
  }
}

/**
 * A base como CSV.
 *
 * O Monitor recebe a lista como arquivo, então o público precisa caber na
 * memória desta requisição. `TETO_DO_MONITOR` existe por isso — e é bem menor
 * que o `TETO_DA_BASE` de `publico.ts`, que limita a campanha inteira: acima disso o
 * arquivo passa dos 25 MB que eles aceitam, e a função de 60s não dá conta de
 * montar e subir. É um limite honesto, avisado na criação, e não uma falha
 * silenciosa no meio do upload.
 */
export const TETO_DO_MONITOR = 200_000

async function montarBase(orgId: string, fontes: Fonte[]): Promise<{ csv: string; total: number }> {
  const linhas: string[] = ['telefone,nome']
  let cursor: string | null = null
  let total = 0

  for (;;) {
    const fatia = await fatiaDoPublico(orgId, fontes, 5_000, cursor)
    if (fatia.length === 0) break

    for (const pessoa of fatia) {
      // Aspas duplas viram duas, como manda o CSV — um nome com vírgula não
      // pode quebrar a coluna do telefone.
      const nome = (pessoa.nome ?? '').replace(/"/g, '""')
      linhas.push(`${pessoa.telefone},"${nome}"`)
    }

    total += fatia.length
    if (total > TETO_DO_MONITOR) {
      throw new Error(
        `Esta base passa de ${TETO_DO_MONITOR.toLocaleString('pt-BR')} contatos, que é o máximo que cabe num envio para o Monitor de Envios. Divida em campanhas menores.`,
      )
    }

    cursor = fatia[fatia.length - 1]?.telefone ?? null
    if (fatia.length < 5_000) break
  }

  return { csv: linhas.join('\n'), total }
}

export type ResultadoDaEntrega =
  | { ok: true; codigo: string; total: number }
  | { ok: false; erro: string }

/** Submete a campanha e deixa ela aguardando a aprovação do outro lado. */
export async function entregarAoMonitor(dados: DadosDaSubmissao): Promise<ResultadoDaEntrega> {
  const [config] = await db
    .select({ credentials: channelConfigs.credentials })
    .from(channelConfigs)
    .where(eq(channelConfigs.id, dados.configId))
    .limit(1)

  const credencial = credencialDe(config?.credentials)
  if (!credencial) {
    return { ok: false, erro: 'O canal do Monitor de Envios está sem token configurado.' }
  }

  let base: { csv: string; total: number }
  try {
    base = await montarBase(dados.orgId, dados.fontes)
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : 'não deu para montar a base' }
  }
  if (base.total === 0) return { ok: false, erro: 'O público escolhido não tem ninguém.' }

  /*
   * O perfil da campanha, ou o padrão do canal.
   *
   * O comentário de `CredencialMonitor` já prometia isso e a promessa era
   * falsa: os quatro campos eram lidos e descartados. É o que torna a API
   * pública utilizável — lá não há tela para digitar o perfil.
   */
  const perfil: Perfil = {
    nome: dados.perfil?.nome || credencial.perfilNome || '',
    fotoUrl: dados.perfil?.fotoUrl || credencial.perfilFoto || '',
    nome2: dados.perfil?.nome2 || credencial.perfilNome2 || '',
    fotoUrl2: dados.perfil?.fotoUrl2 || credencial.perfilFoto2 || '',
  }

  const submissao = {
    nome: dados.nome,
    /*
     * O corpo vai CRU, sem a nossa frase eleitoral.
     *
     * Com `politica=true` eles acrescentam a frase deles, que manda responder
     * "2" — e quem processa a resposta é a plataforma deles. Colar a nossa,
     * que manda responder "SAIR", ensinaria ao destinatário uma palavra que
     * ninguém do outro lado escuta.
     */
    copy: dados.corpo,
    perfil,
    base: { nomeArquivo: `base-${dados.campanhaId}.csv`, conteudo: base.csv },
    mediaUrl: dados.mediaUrl ?? null,
    referencia: dados.campanhaId,
    dataCampanha: dados.agendarPara ?? null,
    politica: dados.politica ?? null,
  }

  const recusa = conferirSubmissao(submissao)
  if (recusa) return { ok: false, erro: recusa }

  const enviado = await submeterCampanha(credencial, submissao)
  if (!enviado.ok) return { ok: false, erro: enviado.erro }

  await db
    .update(campaigns)
    .set({
      status: 'aguardando',
      externalCode: enviado.codigo,
      externalProvider: PROVEDOR,
      externalStatus: 'aguardando',
      externalSyncedAt: new Date(),
      total: base.total,
      pending: base.total,
      materialized: true,
      materializeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, dados.campanhaId))

  log.info('campanha entregue ao Monitor', {
    campanha: dados.campanhaId,
    codigo: enviado.codigo,
    destinatarios: base.total,
  })

  return { ok: true, codigo: enviado.codigo, total: base.total }
}

// ─────────────────────────────────────────────────────────── sincronização

export type ResumoDaSincronizacao = {
  conferidas: number
  aprovadas: number
  rejeitadas: number
  concluidas: number
  cobrado: number
}

/**
 * Traz o andamento das campanhas delegadas.
 *
 * Roda dentro da batida do motor. Poucas por vez de propósito: o limite deles
 * é 30 requisições por minuto por IP, e cada campanha custa até três chamadas.
 */
export async function sincronizarExternas(limite = POR_BATIDA): Promise<ResumoDaSincronizacao> {
  const resumo: ResumoDaSincronizacao = {
    conferidas: 0,
    aprovadas: 0,
    rejeitadas: 0,
    concluidas: 0,
    cobrado: 0,
  }

  const pendentes = await db
    .select({
      id: campaigns.id,
      orgId: campaigns.orgId,
      canal: campaigns.channel,
      codigo: campaigns.externalCode,
      status: campaigns.status,
      externalStatus: campaigns.externalStatus,
      billed: campaigns.externalBilled,
      total: campaigns.total,
      unitPrice: campaigns.unitPrice,
      configId: campaigns.configId,
      credentials: channelConfigs.credentials,
    })
    .from(campaigns)
    .leftJoin(channelConfigs, eq(channelConfigs.id, campaigns.configId))
    .where(
      and(
        isNotNull(campaigns.externalCode),
        notInArray(campaigns.status, ['concluida', 'cancelada', 'falhou']),
        or(
          raw`${campaigns.externalSyncedAt} IS NULL`,
          raw`${campaigns.externalSyncedAt} < now() - interval '${raw.raw(String(INTERVALO_SEGUNDOS))} seconds'`,
        ),
      ),
    )
    .orderBy(raw`${campaigns.externalSyncedAt} NULLS FIRST`)
    .limit(limite)

  for (const campanha of pendentes) {
    if (!campanha.codigo) continue
    const credencial = credencialDe(campanha.credentials)
    if (!credencial) {
      /*
       * Carimba mesmo sem conseguir sincronizar.
       *
       * A ordem é `external_synced_at NULLS FIRST`. Pular sem carimbar fazia
       * a mesma campanha quebrada voltar na frente a cada batida — cinco
       * delas sem credencial legível bastavam para nenhuma outra campanha
       * do sistema ser sincronizada de novo.
       */
      await db
        .update(campaigns)
        .set({ externalSyncedAt: new Date() })
        .where(eq(campaigns.id, campanha.id))
      // Canal sem token legível é canal quebrado, e é o cartão do canal que a
      // operação olha — não este log.
      if (campanha.configId) await registrarFalhaDoCanal(campanha.configId)
      log.warn('campanha delegada sem credencial legível', { campanha: campanha.id })
      continue
    }

    resumo.conferidas += 1
    try {
      await sincronizarUma(campanha, credencial, resumo)
      /*
       * A consulta que deu certo religa o canal.
       *
       * Este é o ÚNICO sinal de saúde que um canal delegado produz. O disjuntor
       * é alimentado pelo envio linha a linha, e campanha delegada não passa
       * por lá — sem estas duas linhas, um token revogado ficava para sempre
       * como canal saudável no /admin/provedores enquanto nenhuma campanha
       * andava.
       */
      if (campanha.configId) await registrarSucessoDoCanal(campanha.configId)
    } catch (erro) {
      // Uma campanha que falha não pode parar as outras. O carimbo de
      // sincronização vai junto para não repetir a mesma no minuto seguinte.
      log.error('não deu para sincronizar', {
        campanha: campanha.id,
        motivo: erro instanceof Error ? erro.message : 'desconhecido',
      })
      await db
        .update(campaigns)
        .set({ externalSyncedAt: new Date() })
        .where(eq(campaigns.id, campanha.id))
      if (campanha.configId) await registrarFalhaDoCanal(campanha.configId)
    }
  }

  return resumo
}

type CampanhaExterna = {
  id: string
  orgId: string
  /** O canal da campanha — a resposta entra registrada no mesmo canal. */
  canal: string
  codigo: string | null
  status: string
  externalStatus: string | null
  billed: number
  total: number
  unitPrice: string
  /** Nulo quando o canal foi apagado — não há disjuntor para alimentar. */
  configId: string | null
}

async function sincronizarUma(
  campanha: CampanhaExterna,
  credencial: CredencialMonitor,
  resumo: ResumoDaSincronizacao,
): Promise<void> {
  const codigo = campanha.codigo!
  const aprovacao = await statusDeAprovacao(credencial, codigo)

  if (aprovacao.status === 'rejeitado') {
    await db
      .update(campaigns)
      .set({
        status: 'cancelada',
        externalStatus: 'rejeitado',
        externalReason: aprovacao.motivoRejeicao,
        externalSyncedAt: new Date(),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campanha.id))
    resumo.rejeitadas += 1
    return
  }

  if (aprovacao.status !== 'aprovado') {
    // Ainda na fila deles. Nada mudou além do carimbo.
    await db
      .update(campaigns)
      .set({ externalStatus: aprovacao.status, externalSyncedAt: new Date() })
      .where(eq(campaigns.id, campanha.id))
    return
  }

  if (campanha.externalStatus !== 'aprovado') resumo.aprovadas += 1

  const progresso = await progressoDaCampanha(credencial, codigo)

  /*
   * Cobra sobre o PROCESSADO (enviadas + recebidas), não sobre `enviadas`.
   *
   * As duas quantidades são disjuntas do lado deles: a mensagem sai de
   * "enviada" ao ser confirmada como recebida. Cobrar por `enviadas` cobraria
   * a menos, e o número encolheria conforme as confirmações chegassem — o
   * débito travaria porque `processadas - billed` daria negativo.
   */
  const teto = campanha.total || progresso.processadas
  const processadas = Math.max(0, Math.min(progresso.processadas, teto))
  const novas = Math.max(0, processadas - campanha.billed)

  // O crédito sai pelo que andou desde a última conferência. `external_billed`
  // é o que impede a próxima sincronização de cobrar tudo outra vez.
  if (novas > 0) {
    const custo = novas * Number(campanha.unitPrice)
    if (custo > 0) {
      await db.insert(creditLedger).values({
        orgId: campanha.orgId,
        kind: 'consumo',
        delta: String(-custo),
        description: `Envio pelo Monitor de Envios (${novas} mensagem(ns))`,
        campaignId: campanha.id,
      })
      await db
        .update(campaigns)
        .set({ actualCost: raw`${campaigns.actualCost} + ${custo}::numeric` })
        .where(eq(campaigns.id, campanha.id))
      resumo.cobrado += custo
    }
  }

  const terminou =
    !aprovacao.emExecucao && (aprovacao.statusExecucao ?? '').toLowerCase().includes('finaliz')

  await db
    .update(campaigns)
    .set({
      status: terminou ? 'concluida' : 'enviando',
      externalStatus: 'aprovado',
      externalSyncedAt: new Date(),
      externalBilled: processadas,
      /*
       * `sent` e `delivered` mapeiam UM PARA UM nos campos deles.
       *
       * A tela calcula `saidos = enviados + entregues`, ou seja, `sent` aqui
       * significa "saiu e ainda não foi confirmado" — exatamente o que
       * `quantidadeEnviada` quer dizer. Gravar o total processado em `sent`
       * faria a soma contar os confirmados duas vezes e "Enviados" passar do
       * total da campanha.
       *
       * A cobrança é que usa a soma, e é por isso que ela mora em
       * `externalBilled` e não é derivada da tela.
       */
      sent: progresso.enviadas,
      delivered: progresso.recebidas,
      pending: Math.max(0, teto - processadas),
      startedAt: raw`COALESCE(${campaigns.startedAt}, now())`,
      finishedAt: terminou ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campanha.id))

  if (terminou) resumo.concluidas += 1

  await guardarRespostas(campanha, credencial, codigo)
}

/**
 * Traz as respostas e as guarda como mensagem recebida.
 *
 * Sem `dispatch_id` — não temos a linha de envio para amarrar. O que amarra é
 * o telefone, que já é como a tela de respostas encontra o contato.
 */
async function guardarRespostas(
  campanha: CampanhaExterna,
  credencial: CredencialMonitor,
  codigo: string,
): Promise<void> {
  const respostas = await respostasDaCampanha(credencial, codigo)
  if (respostas.length === 0) return

  let novas = 0

  for (const resposta of respostas) {
    const telefone = resposta.telefone.replace(/\D/g, '')
    if (!telefone) continue
    const numero = telefone.startsWith('55') ? telefone : `55${telefone}`

    /*
     * Quem pediu para sair, sai — inclusive pelo "2".
     *
     * A frase de descadastro que o Monitor cola em campanha política manda
     * responder "2". Se a gente guardasse a resposta e não descadastrasse,
     * o próximo disparo iria para quem pediu para parar: R$ 100 de multa por
     * mensagem em campanha eleitoral, além de ser o motivo pelo qual a lei
     * existe.
     */
    if (pediuParaSair(resposta.texto, { aceitaNumero2: true })) {
      await descadastrar(campanha.orgId, numero, 'respondeu pedindo para sair (Monitor de Envios)')
    }

    // Sem chave única do lado deles, o par telefone + instante é o que
    // impede a mesma resposta de entrar a cada sincronização.
    const inseridas = await sql`
      INSERT INTO inbound_messages (org_id, channel, from_address, body, contact_id, raw, received_at)
      SELECT ${campanha.orgId}::uuid, ${campanha.canal}::channel, ${numero}, ${resposta.texto},
             (SELECT id FROM contacts WHERE org_id = ${campanha.orgId}::uuid AND phone = ${numero} LIMIT 1),
             ${JSON.stringify({ campanha: campanha.id, codigo })}::jsonb, ${resposta.quando}
       WHERE NOT EXISTS (
         SELECT 1 FROM inbound_messages
          WHERE org_id = ${campanha.orgId}::uuid
            AND from_address = ${numero}
            AND received_at = ${resposta.quando}
       )
      RETURNING id
    `
    novas += inseridas.length
  }

  /*
   * O contador da campanha sobe junto.
   *
   * Sem isto o detalhe mostrava "Respostas 0" enquanto a tela de Respostas
   * listava as mesmas mensagens — duas telas do mesmo produto discordando
   * sobre um número que o cliente usa para medir a campanha. O RETURNING é
   * quem conta: o INSERT é idempotente pelo NOT EXISTS, então a segunda
   * conferência não soma de novo.
   */
  if (novas > 0) {
    await db
      .update(campaigns)
      .set({ replied: raw`${campaigns.replied} + ${novas}` })
      .where(eq(campaigns.id, campanha.id))
  }
}

export type ConferenciaDaCredencial =
  | { ok: true; saldo: number }
  | { ok: false; erro: string }

/**
 * Confere a credencial do Monitor consultando o saldo.
 *
 * É o teste que faz sentido para este provedor. Os outros canais se testam
 * mandando uma mensagem; aqui não existe mensagem avulsa — o que existe é uma
 * consulta barata que só responde com o token certo. Descobrir que o token
 * está errado aqui custa um GET; descobrir na hora do disparo custa a campanha.
 *
 * O erro sobe com a mensagem: "não deu" sem o motivo manda a pessoa adivinhar
 * entre token errado, conta suspensa e IP fora da whitelist.
 */
export async function conferirCredencialDoMonitor(
  configId: string,
): Promise<ConferenciaDaCredencial> {
  const [config] = await db
    .select({ credentials: channelConfigs.credentials })
    .from(channelConfigs)
    .where(eq(channelConfigs.id, configId))
    .limit(1)

  const credencial = credencialDe(config?.credentials)
  if (!credencial) {
    return { ok: false, erro: 'Este canal está sem o token de acesso do Monitor de Envios.' }
  }

  try {
    const { saldoNoMonitor } = await import('@/lib/channels/monitor')
    return { ok: true, saldo: await saldoNoMonitor(credencial) }
  } catch (erro) {
    return {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'o Monitor de Envios não respondeu',
    }
  }
}
