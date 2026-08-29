import 'server-only'
import { sql } from '@/db'
import type { Channel } from '@/db/schema/enums'

/**
 * Os números do painel do cliente.
 *
 * Tudo agregado no banco. Trazer linhas de envio para a memória e somar em
 * JavaScript funciona com mil e derruba a função com um milhão — e é a
 * primeira coisa que quebra quando o cliente cresce.
 */

export type ResumoDoPainel = {
  enviadosHoje: number
  enviados30: number
  entregues30: number
  falhas30: number
  respostas30: number
  campanhasAtivas: number
  naFila: number
  contatos: number
  descadastrados: number
  gasto30: string
  saldo: string
}

export async function resumoDoPainel(orgId: string): Promise<ResumoDoPainel> {
  const [linha] = await sql<ResumoDoPainel[]>`
    SELECT
      (SELECT count(*)::int FROM dispatches
        WHERE org_id = ${orgId} AND sent_at >= date_trunc('day', now())) AS "enviadosHoje",
      (SELECT count(*)::int FROM dispatches
        WHERE org_id = ${orgId} AND sent_at >= now() - interval '30 days') AS "enviados30",
      (SELECT count(*)::int FROM dispatches
        WHERE org_id = ${orgId} AND created_at >= now() - interval '30 days'
          AND status IN ('entregue', 'lido', 'respondido')) AS "entregues30",
      (SELECT count(*)::int FROM dispatches
        WHERE org_id = ${orgId} AND created_at >= now() - interval '30 days'
          AND status = 'falhou') AS "falhas30",
      (SELECT count(*)::int FROM dispatches
        WHERE org_id = ${orgId} AND created_at >= now() - interval '30 days'
          AND status = 'respondido') AS "respostas30",
      (SELECT count(*)::int FROM campaigns
        WHERE org_id = ${orgId} AND status IN ('preparando', 'agendada', 'enviando', 'pausada')) AS "campanhasAtivas",
      (SELECT count(*)::int FROM dispatches
        WHERE org_id = ${orgId} AND status = 'pendente') AS "naFila",
      (SELECT count(*)::int FROM contacts WHERE org_id = ${orgId}) AS contatos,
      (SELECT count(*)::int FROM contacts WHERE org_id = ${orgId} AND opted_out) AS descadastrados,
      (SELECT COALESCE(sum(-delta), 0)::text FROM credit_ledger
        WHERE org_id = ${orgId} AND kind = 'consumo'
          AND created_at >= now() - interval '30 days') AS "gasto30",
      (SELECT credits::text FROM organizations WHERE id = ${orgId}) AS saldo
  `

  return (
    linha ?? {
      enviadosHoje: 0,
      enviados30: 0,
      entregues30: 0,
      falhas30: 0,
      respostas30: 0,
      campanhasAtivas: 0,
      naFila: 0,
      contatos: 0,
      descadastrados: 0,
      gasto30: '0',
      saldo: '0',
    }
  )
}

export type PontoDoGrafico = { dia: string; enviados: number; falhas: number }

/**
 * Os últimos 30 dias, dia a dia — inclusive os dias sem envio.
 *
 * O `generate_series` com LEFT JOIN é o que garante o zero: sem ele, o gráfico
 * ligaria segunda a quinta com uma reta e esconderia que quarta não saiu nada.
 */
export async function serieDoPainel(orgId: string, dias = 30): Promise<PontoDoGrafico[]> {
  return sql<PontoDoGrafico[]>`
    WITH calendario AS (
      SELECT generate_series(
        date_trunc('day', now()) - (${dias - 1} || ' days')::interval,
        date_trunc('day', now()),
        '1 day'
      ) AS dia
    )
    SELECT to_char(c.dia, 'YYYY-MM-DD') AS dia,
           COALESCE(count(d.id) FILTER (WHERE d.status <> 'falhou'), 0)::int AS enviados,
           COALESCE(count(d.id) FILTER (WHERE d.status = 'falhou'), 0)::int AS falhas
      FROM calendario c
      LEFT JOIN dispatches d
        ON d.org_id = ${orgId}
       AND d.created_at >= c.dia
       AND d.created_at < c.dia + interval '1 day'
       AND d.status <> 'cancelado'
     GROUP BY c.dia
     ORDER BY c.dia
  `
}

export type UsoPorCanal = { canal: Channel; enviados: number; custo: string }

export async function usoPorCanal(orgId: string, dias = 30): Promise<UsoPorCanal[]> {
  return sql<UsoPorCanal[]>`
    SELECT channel AS canal,
           count(*)::int AS enviados,
           COALESCE(sum(cost), 0)::text AS custo
      FROM dispatches
     WHERE org_id = ${orgId}
       AND created_at >= now() - (${dias} || ' days')::interval
       AND status NOT IN ('cancelado', 'pendente')
     GROUP BY channel
     ORDER BY enviados DESC
  `
}

export type CampanhaEmCurso = {
  id: string
  nome: string
  canal: Channel
  status: string
  total: number
  pendentes: number
  enviados: number
  entregues: number
  lidos: number
  respondidos: number
  falhas: number
  criadaEm: Date
  agendadaPara: Date | null
}

export async function campanhasEmCurso(orgId: string, limite = 5): Promise<CampanhaEmCurso[]> {
  return sql<CampanhaEmCurso[]>`
    SELECT id, name AS nome, channel AS canal, status::text AS status,
           total, pending AS pendentes, sent AS enviados,
           delivered AS entregues, read AS lidos, replied AS respondidos,
           failed AS falhas,
           created_at AS "criadaEm", scheduled_at AS "agendadaPara"
      FROM campaigns
     WHERE org_id = ${orgId}
       AND status IN ('preparando', 'agendada', 'enviando', 'pausada')
     ORDER BY created_at DESC
     LIMIT ${limite}
  `
}

export type PrimeirosPassos = { temCanal: boolean; temContato: boolean; temEnvio: boolean }

/**
 * O que a conta já tem — decide entre o painel e o onboarding.
 *
 * `EXISTS` em vez de `count(*)`: a pergunta é "existe algum?", e assim o
 * Postgres para no primeiro registro em vez de varrer a tabela de envios
 * inteira só para descobrir que ela não está vazia.
 */
export async function primeirosPassos(orgId: string): Promise<PrimeirosPassos> {
  const [linha] = await sql<PrimeirosPassos[]>`
    SELECT
      EXISTS (SELECT 1 FROM channel_configs
               WHERE (org_id = ${orgId} OR org_id IS NULL) AND active) AS "temCanal",
      EXISTS (SELECT 1 FROM contacts WHERE org_id = ${orgId}) AS "temContato",
      EXISTS (SELECT 1 FROM dispatches WHERE org_id = ${orgId}) AS "temEnvio"
  `

  return linha ?? { temCanal: false, temContato: false, temEnvio: false }
}
