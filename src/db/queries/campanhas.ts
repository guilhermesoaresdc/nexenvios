import 'server-only'
import { sql } from '@/db'
import type { CampaignStatus, Channel } from '@/db/schema/enums'

/** As consultas das telas de campanha. */

export type LinhaDeCampanha = {
  id: string
  nome: string
  canal: Channel
  status: CampaignStatus
  total: number
  pendentes: number
  enviados: number
  entregues: number
  lidos: number
  respostas: number
  falhas: number
  custoPrevisto: string
  custoReal: string
  fontes: string[]
  criadaEm: Date
  agendadaPara: Date | null
  iniciadaEm: Date | null
  terminadaEm: Date | null
  autor: string | null
  materializada: boolean
}

const COLUNAS = sql`
  c.id, c.name AS nome, c.channel AS canal, c.status, c.total,
  c.pending AS pendentes, c.sent AS enviados, c.delivered AS entregues,
  c.read AS lidos, c.replied AS respostas, c.failed AS falhas,
  c.estimated_cost::text AS "custoPrevisto", c.actual_cost::text AS "custoReal",
  COALESCE(c.audience_labels, '[]'::jsonb) AS fontes,
  c.created_at AS "criadaEm", c.scheduled_at AS "agendadaPara",
  c.started_at AS "iniciadaEm", c.finished_at AS "terminadaEm",
  u.name AS autor, c.materialized AS materializada
`

export async function listarCampanhas(
  orgId: string,
  opcoes: { status?: CampaignStatus[]; canal?: Channel; busca?: string; limite?: number; pular?: number } = {},
): Promise<LinhaDeCampanha[]> {
  const { status, canal, busca, limite = 30, pular = 0 } = opcoes

  return sql<LinhaDeCampanha[]>`
    SELECT ${COLUNAS}
      FROM campaigns c
      LEFT JOIN users u ON u.id = c.created_by
     WHERE c.org_id = ${orgId}
       ${status && status.length > 0 ? sql`AND c.status = ANY(${status}::campaign_status[])` : sql``}
       ${canal ? sql`AND c.channel = ${canal}::channel` : sql``}
       ${busca ? sql`AND c.name ILIKE ${'%' + busca + '%'}` : sql``}
     ORDER BY c.created_at DESC
     LIMIT ${limite} OFFSET ${pular}
  `
}

export async function contarCampanhas(
  orgId: string,
  opcoes: { status?: CampaignStatus[]; canal?: Channel; busca?: string } = {},
): Promise<number> {
  const { status, canal, busca } = opcoes
  const [linha] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM campaigns c
     WHERE c.org_id = ${orgId}
       ${status && status.length > 0 ? sql`AND c.status = ANY(${status}::campaign_status[])` : sql``}
       ${canal ? sql`AND c.channel = ${canal}::channel` : sql``}
       ${busca ? sql`AND c.name ILIKE ${'%' + busca + '%'}` : sql``}
  `
  return linha?.n ?? 0
}

export type CampanhaDetalhada = LinhaDeCampanha & {
  corpo: string
  mediaUrl: string | null
  canalNome: string | null
  ritmo: number
  jitter: number
  janelaInicio: number
  janelaFim: number
  aparado: boolean
  eleitoral: boolean
  precoUnitario: string
}

export async function verCampanha(
  orgId: string,
  campanhaId: string,
): Promise<CampanhaDetalhada | null> {
  const [linha] = await sql<CampanhaDetalhada[]>`
    SELECT ${COLUNAS},
           c.body AS corpo, c.media_url AS "mediaUrl", cc.label AS "canalNome",
           c.rate_per_minute AS ritmo, c.jitter_ms AS jitter,
           c.quiet_start AS "janelaInicio", c.quiet_end AS "janelaFim",
           c.trimmed AS aparado, c.eleitoral, c.unit_price::text AS "precoUnitario"
      FROM campaigns c
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN channel_configs cc ON cc.id = c.config_id
     WHERE c.org_id = ${orgId} AND c.id = ${campanhaId}
     LIMIT 1
  `
  return linha ?? null
}

export type MotivoDeFalha = { codigo: string | null; total: number; exemplo: string | null }

/** Por que falhou, agrupado. É o que o cliente precisa para agir. */
export async function falhasDaCampanha(campanhaId: string): Promise<MotivoDeFalha[]> {
  return sql<MotivoDeFalha[]>`
    SELECT error_code AS codigo, count(*)::int AS total,
           (array_agg(error_message ORDER BY updated_at DESC))[1] AS exemplo
      FROM dispatches
     WHERE campaign_id = ${campanhaId} AND status = 'falhou'
     GROUP BY error_code
     ORDER BY total DESC
     LIMIT 10
  `
}

/** Quando a última linha deve sair — a estimativa de término da campanha. */
export async function terminoPrevisto(campanhaId: string): Promise<Date | null> {
  const [linha] = await sql<{ fim: Date | null }[]>`
    SELECT max(scheduled_for) AS fim
      FROM dispatches
     WHERE campaign_id = ${campanhaId} AND status = 'pendente'
  `
  return linha?.fim ?? null
}
