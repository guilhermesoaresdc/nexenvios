import 'server-only'
import { sql } from '@/db'
import type { Channel, DispatchStatus } from '@/db/schema/enums'

/** O log de envios: uma linha por mensagem, com filtro e paginação. */

export type LinhaDoHistorico = {
  id: string
  campanhaId: string | null
  campanha: string | null
  canal: Channel
  para: string
  nome: string | null
  corpo: string
  status: DispatchStatus
  tentativas: number
  provedor: string | null
  erroCodigo: string | null
  erroMensagem: string | null
  custo: string
  agendadoPara: Date
  enviadoEm: Date | null
  entregueEm: Date | null
  criadoEm: Date
}

export type FiltroDoHistorico = {
  status?: DispatchStatus[]
  canal?: Channel
  campanhaId?: string
  busca?: string
  desde?: Date
  ate?: Date
  limite?: number
  pular?: number
}

function condicoes(orgId: string, f: FiltroDoHistorico) {
  return sql`
    d.org_id = ${orgId}
    ${f.status && f.status.length > 0 ? sql`AND d.status = ANY(${f.status}::dispatch_status[])` : sql``}
    ${f.canal ? sql`AND d.channel = ${f.canal}::channel` : sql``}
    ${f.campanhaId ? sql`AND d.campaign_id = ${f.campanhaId}` : sql``}
    ${f.desde ? sql`AND d.created_at >= ${f.desde}` : sql``}
    ${f.ate ? sql`AND d.created_at <= ${f.ate}` : sql``}
    ${
      f.busca
        ? sql`AND (d.to_address ILIKE ${'%' + f.busca.replace(/\D/g, '') + '%'}
                OR d.to_name ILIKE ${'%' + f.busca + '%'})`
        : sql``
    }
  `
}

export async function listarHistorico(
  orgId: string,
  filtro: FiltroDoHistorico = {},
): Promise<LinhaDoHistorico[]> {
  const { limite = 50, pular = 0 } = filtro

  return sql<LinhaDoHistorico[]>`
    SELECT d.id, d.campaign_id AS "campanhaId", c.name AS campanha,
           d.channel AS canal, d.to_address AS para, d.to_name AS nome,
           d.body AS corpo, d.status, d.attempts AS tentativas,
           d.provider AS provedor, d.error_code AS "erroCodigo",
           d.error_message AS "erroMensagem", d.cost::text AS custo,
           d.scheduled_for AS "agendadoPara", d.sent_at AS "enviadoEm",
           d.delivered_at AS "entregueEm", d.created_at AS "criadoEm"
      FROM dispatches d
      LEFT JOIN campaigns c ON c.id = d.campaign_id
     WHERE ${condicoes(orgId, filtro)}
     ORDER BY d.created_at DESC, d.id
     LIMIT ${limite} OFFSET ${pular}
  `
}

export async function contarHistorico(
  orgId: string,
  filtro: FiltroDoHistorico = {},
): Promise<number> {
  const [linha] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM dispatches d WHERE ${condicoes(orgId, filtro)}
  `
  return linha?.n ?? 0
}

/**
 * O CSV do histórico.
 *
 * Montado no banco com `string_agg` para não trazer as linhas à memória: um
 * cliente com meio milhão de envios derrubaria a função montando string em
 * JavaScript. O teto existe pelo mesmo motivo.
 */
export async function historicoEmCsv(
  orgId: string,
  filtro: FiltroDoHistorico = {},
  teto = 50_000,
): Promise<string> {
  const [linha] = await sql<{ csv: string | null }[]>`
    WITH linhas AS (
      SELECT d.created_at, d.to_address, COALESCE(d.to_name, '') AS nome,
             d.channel::text AS canal, COALESCE(c.name, '') AS campanha,
             d.status::text AS status, COALESCE(d.error_code, '') AS erro,
             d.cost::text AS custo, d.sent_at
        FROM dispatches d
        LEFT JOIN campaigns c ON c.id = d.campaign_id
       WHERE ${condicoes(orgId, filtro)}
       ORDER BY d.created_at DESC
       LIMIT ${teto}
    )
    SELECT string_agg(
             concat_ws(';',
               to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
               to_address,
               '"' || replace(nome, '"', '""') || '"',
               canal,
               '"' || replace(campanha, '"', '""') || '"',
               status,
               erro,
               replace(custo, '.', ','),
               COALESCE(to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), '')
             ),
             E'\n'
           ) AS csv
      FROM linhas
  `

  const cabecalho = 'data;telefone;nome;canal;campanha;status;erro;custo;enviado_em'
  return `${cabecalho}\n${linha?.csv ?? ''}`
}

export type Resposta = {
  id: string
  canal: Channel
  de: string
  texto: string | null
  campanha: string | null
  recebidaEm: Date
}

/**
 * As respostas recebidas.
 *
 * A campanha vem pela linha de envio OU pelo que o polling guardou: a resposta
 * trazida do Monitor de Envios não tem `dispatch_id`, porque a campanha
 * delegada não cria linha nenhuma. `sincronizarExternas` grava o id da campanha
 * em `raw.campanha`, e é o COALESCE que salva a coluna de ficar vazia para
 * sempre nesse canal. O teste do formato evita que um `raw` de outro provedor
 * derrube a consulta no cast para uuid.
 */
export async function listarRespostas(orgId: string, limite = 50): Promise<Resposta[]> {
  return sql<Resposta[]>`
    SELECT i.id, i.channel AS canal, i.from_address AS de, i.body AS texto,
           c.name AS campanha, i.received_at AS "recebidaEm"
      FROM inbound_messages i
      LEFT JOIN dispatches d ON d.id = i.dispatch_id
      LEFT JOIN campaigns c
             ON c.id = COALESCE(
                  d.campaign_id,
                  CASE WHEN i.raw ->> 'campanha' ~ '^[0-9a-f-]{36}$'
                       THEN (i.raw ->> 'campanha')::uuid END
                )
     WHERE i.org_id = ${orgId}
     ORDER BY i.received_at DESC
     LIMIT ${limite}
  `
}
