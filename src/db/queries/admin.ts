import 'server-only'
import { sql } from '@/db'
import type { Channel, OrgStatus } from '@/db/schema/enums'

/**
 * As consultas do painel da Nex Envios.
 *
 * Estas são as ÚNICAS consultas do sistema que atravessam organizações. Toda
 * função aqui pressupõe que quem chamou já passou por `exigirSuperadmin` — e
 * nenhuma delas deve ser importada de dentro de `(app)`.
 */

export type ResumoGeral = {
  clientes: number
  clientesAtivos: number
  usuarios: number
  enviosHoje: number
  envios30: number
  falhas30: number
  naFila: number
  campanhasAtivas: number
  receita30: string
  creditoEmCirculacao: string
}

export async function resumoGeral(): Promise<ResumoGeral> {
  const [linha] = await sql<ResumoGeral[]>`
    SELECT
      (SELECT count(*)::int FROM organizations WHERE NOT is_platform) AS clientes,
      (SELECT count(*)::int FROM organizations WHERE NOT is_platform AND status = 'ativo') AS "clientesAtivos",
      (SELECT count(*)::int FROM users WHERE active) AS usuarios,
      (SELECT count(*)::int FROM dispatches WHERE sent_at >= date_trunc('day', now())) AS "enviosHoje",
      (SELECT count(*)::int FROM dispatches WHERE sent_at >= now() - interval '30 days') AS "envios30",
      (SELECT count(*)::int FROM dispatches
        WHERE status = 'falhou' AND created_at >= now() - interval '30 days') AS "falhas30",
      (SELECT count(*)::int FROM dispatches WHERE status = 'pendente') AS "naFila",
      (SELECT count(*)::int FROM campaigns
        WHERE status IN ('preparando', 'agendada', 'enviando', 'pausada')) AS "campanhasAtivas",
      (SELECT COALESCE(sum(-delta), 0)::text FROM credit_ledger
        WHERE kind = 'consumo' AND created_at >= now() - interval '30 days') AS "receita30",
      (SELECT COALESCE(sum(credits), 0)::text FROM organizations WHERE NOT is_platform)
        AS "creditoEmCirculacao"
  `
  return (
    linha ?? {
      clientes: 0,
      clientesAtivos: 0,
      usuarios: 0,
      enviosHoje: 0,
      envios30: 0,
      falhas30: 0,
      naFila: 0,
      campanhasAtivas: 0,
      receita30: '0',
      creditoEmCirculacao: '0',
    }
  )
}

export type LinhaDeCliente = {
  id: string
  nome: string
  apelido: string
  status: OrgStatus
  saldo: string
  limite: string
  usuarios: number
  contatos: number
  envios30: number
  gasto30: string
  ultimoEnvio: Date | null
  criadoEm: Date
  contato: string | null
}

export async function listarClientes(opcoes: {
  busca?: string
  status?: OrgStatus
  limite?: number
  pular?: number
} = {}): Promise<LinhaDeCliente[]> {
  const { busca, status, limite = 50, pular = 0 } = opcoes
  return sql<LinhaDeCliente[]>`
    SELECT o.id, o.name AS nome, o.slug AS apelido, o.status,
           o.credits::text AS saldo, o.credit_limit::text AS limite,
           (SELECT count(*)::int FROM users u WHERE u.org_id = o.id AND u.active) AS usuarios,
           (SELECT count(*)::int FROM contacts c WHERE c.org_id = o.id) AS contatos,
           (SELECT count(*)::int FROM dispatches d
             WHERE d.org_id = o.id AND d.sent_at >= now() - interval '30 days') AS "envios30",
           (SELECT COALESCE(sum(-l.delta), 0)::text FROM credit_ledger l
             WHERE l.org_id = o.id AND l.kind = 'consumo'
               AND l.created_at >= now() - interval '30 days') AS "gasto30",
           (SELECT max(d.sent_at) FROM dispatches d WHERE d.org_id = o.id) AS "ultimoEnvio",
           o.created_at AS "criadoEm", o.contact_email AS contato
      FROM organizations o
     WHERE NOT o.is_platform
       ${status ? sql`AND o.status = ${status}::org_status` : sql``}
       ${busca ? sql`AND (o.name ILIKE ${'%' + busca + '%'} OR o.slug ILIKE ${'%' + busca + '%'})` : sql``}
     ORDER BY o.created_at DESC
     LIMIT ${limite} OFFSET ${pular}
  `
}

export type ClienteDetalhado = LinhaDeCliente & {
  documento: string | null
  contatoNome: string | null
  contatoTelefone: string | null
  fuso: string
  tetoDiario: number | null
  observacoes: string | null
}

export async function verCliente(orgId: string): Promise<ClienteDetalhado | null> {
  const [linha] = await sql<ClienteDetalhado[]>`
    SELECT o.id, o.name AS nome, o.slug AS apelido, o.status,
           o.credits::text AS saldo, o.credit_limit::text AS limite,
           o.document AS documento, o.contact_name AS "contatoNome",
           o.contact_email AS contato, o.contact_phone AS "contatoTelefone",
           o.timezone AS fuso, o.daily_cap AS "tetoDiario", o.notes AS observacoes,
           (SELECT count(*)::int FROM users u WHERE u.org_id = o.id AND u.active) AS usuarios,
           (SELECT count(*)::int FROM contacts c WHERE c.org_id = o.id) AS contatos,
           (SELECT count(*)::int FROM dispatches d
             WHERE d.org_id = o.id AND d.sent_at >= now() - interval '30 days') AS "envios30",
           (SELECT COALESCE(sum(-l.delta), 0)::text FROM credit_ledger l
             WHERE l.org_id = o.id AND l.kind = 'consumo'
               AND l.created_at >= now() - interval '30 days') AS "gasto30",
           (SELECT max(d.sent_at) FROM dispatches d WHERE d.org_id = o.id) AS "ultimoEnvio",
           o.created_at AS "criadoEm"
      FROM organizations o
     WHERE o.id = ${orgId}
     LIMIT 1
  `
  return linha ?? null
}

export type UsuarioDoCliente = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  ultimoAcesso: Date | null
  temSenha: boolean
  criadoEm: Date
}

export async function usuariosDaOrg(orgId: string): Promise<UsuarioDoCliente[]> {
  return sql<UsuarioDoCliente[]>`
    SELECT id, name AS nome, email, role::text AS papel, active AS ativo,
           last_login_at AS "ultimoAcesso", (password_hash IS NOT NULL) AS "temSenha",
           created_at AS "criadoEm"
      FROM users
     WHERE org_id = ${orgId}
     ORDER BY created_at
  `
}

export type LancamentoDeCredito = {
  id: number
  tipo: string
  valor: string
  saldoApos: string | null
  descricao: string | null
  autor: string | null
  criadoEm: Date
}

export async function extratoDaOrg(orgId: string, limite = 50): Promise<LancamentoDeCredito[]> {
  return sql<LancamentoDeCredito[]>`
    SELECT l.id, l.kind::text AS tipo, l.delta::text AS valor,
           l.balance_after::text AS "saldoApos", l.description AS descricao,
           u.name AS autor, l.created_at AS "criadoEm"
      FROM credit_ledger l
      LEFT JOIN users u ON u.id = l.created_by
     WHERE l.org_id = ${orgId}
     ORDER BY l.id DESC
     LIMIT ${limite}
  `
}

/**
 * O consumo agregado do lançamento de consumo, não das linhas de envio.
 *
 * São a mesma coisa contada de dois jeitos, e o razão é a fonte da verdade
 * para dinheiro: é ele que bate com o saldo.
 */
export type ConsumoPorCliente = {
  orgId: string
  cliente: string
  canal: Channel
  envios: number
  custo: string
}

export async function consumoPorCliente(dias = 30): Promise<ConsumoPorCliente[]> {
  return sql<ConsumoPorCliente[]>`
    SELECT d.org_id AS "orgId", o.name AS cliente, d.channel AS canal,
           count(*)::int AS envios, COALESCE(sum(d.cost), 0)::text AS custo
      FROM dispatches d
      JOIN organizations o ON o.id = d.org_id
     WHERE d.created_at >= now() - (${dias} || ' days')::interval
       AND d.status NOT IN ('pendente', 'cancelado')
     GROUP BY d.org_id, o.name, d.channel
     ORDER BY count(*) DESC
     LIMIT 100
  `
}

export type PrecoDoCanal = {
  id: string | null
  orgId: string | null
  cliente: string | null
  canal: Channel
  preco: string
}

export async function tabelaDePrecos(): Promise<PrecoDoCanal[]> {
  return sql<PrecoDoCanal[]>`
    SELECT p.id, p.org_id AS "orgId", o.name AS cliente, p.channel AS canal, p.price::text AS preco
      FROM channel_prices p
      LEFT JOIN organizations o ON o.id = p.org_id
     ORDER BY (p.org_id IS NOT NULL), o.name NULLS FIRST, p.channel
  `
}

export type EnvioGlobal = {
  id: string
  cliente: string
  campanha: string | null
  canal: Channel
  para: string
  status: string
  erro: string | null
  custo: string
  criadoEm: Date
  enviadoEm: Date | null
}

export async function enviosGlobais(opcoes: {
  orgId?: string
  status?: string
  limite?: number
  pular?: number
} = {}): Promise<EnvioGlobal[]> {
  const { orgId, status, limite = 50, pular = 0 } = opcoes
  return sql<EnvioGlobal[]>`
    SELECT d.id, o.name AS cliente, c.name AS campanha, d.channel AS canal,
           d.to_address AS para, d.status::text AS status,
           d.error_code AS erro, d.cost::text AS custo,
           d.created_at AS "criadoEm", d.sent_at AS "enviadoEm"
      FROM dispatches d
      JOIN organizations o ON o.id = d.org_id
      LEFT JOIN campaigns c ON c.id = d.campaign_id
     WHERE true
       ${orgId ? sql`AND d.org_id = ${orgId}` : sql``}
       ${status ? sql`AND d.status = ${status}::dispatch_status` : sql``}
     ORDER BY d.created_at DESC
     LIMIT ${limite} OFFSET ${pular}
  `
}

export type LinhaDeAuditoria = {
  id: number
  acao: string
  entidade: string | null
  autor: string | null
  cliente: string | null
  meta: Record<string, unknown>
  criadoEm: Date
}

export async function auditoria(limite = 100): Promise<LinhaDeAuditoria[]> {
  return sql<LinhaDeAuditoria[]>`
    SELECT a.id, a.action AS acao, a.entity AS entidade, u.name AS autor,
           o.name AS cliente, a.meta, a.created_at AS "criadoEm"
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN organizations o ON o.id = a.org_id
     ORDER BY a.id DESC
     LIMIT ${limite}
  `
}

export type UsuarioGlobal = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  temSenha: boolean
  ultimoAcesso: Date | null
  criadoEm: Date
  orgId: string
  cliente: string
  clienteApelido: string
  daPlataforma: boolean
  /** Tem convite emitido e ainda não usado? */
  convitePendente: boolean
}

export type FiltroDeUsuarios = {
  busca?: string
  orgId?: string
  papel?: string
  /** 'plataforma' = só o time Nex; 'clientes' = só usuários de cliente. */
  escopo?: 'todos' | 'plataforma' | 'clientes'
  ativos?: 'todos' | 'ativos' | 'inativos'
  limite?: number
  pular?: number
}

function condicoesDeUsuario(f: FiltroDeUsuarios) {
  return sql`
    true
    ${f.orgId ? sql`AND u.org_id = ${f.orgId}` : sql``}
    ${f.papel ? sql`AND u.role = ${f.papel}::user_role` : sql``}
    ${f.escopo === 'plataforma' ? sql`AND o.is_platform` : sql``}
    ${f.escopo === 'clientes' ? sql`AND NOT o.is_platform` : sql``}
    ${f.ativos === 'ativos' ? sql`AND u.active` : sql``}
    ${f.ativos === 'inativos' ? sql`AND NOT u.active` : sql``}
    ${
      f.busca
        ? sql`AND (u.name ILIKE ${'%' + f.busca + '%'}
                OR u.email ILIKE ${'%' + f.busca + '%'}
                OR o.name ILIKE ${'%' + f.busca + '%'})`
        : sql``
    }
  `
}

/**
 * Todos os usuários, de todos os clientes.
 *
 * Atravessa organizações — como tudo neste arquivo, pressupõe que quem chamou
 * passou por `exigirTimeNex()`.
 */
export async function todosOsUsuarios(f: FiltroDeUsuarios = {}): Promise<UsuarioGlobal[]> {
  const { limite = 50, pular = 0 } = f
  return sql<UsuarioGlobal[]>`
    SELECT u.id, u.name AS nome, u.email, u.role::text AS papel, u.active AS ativo,
           (u.password_hash IS NOT NULL) AS "temSenha",
           u.last_login_at AS "ultimoAcesso", u.created_at AS "criadoEm",
           u.org_id AS "orgId", o.name AS cliente, o.slug AS "clienteApelido",
           o.is_platform AS "daPlataforma",
           EXISTS (
             SELECT 1 FROM password_tokens t
              WHERE t.user_id = u.id AND t.used_at IS NULL AND t.expires_at > now()
           ) AS "convitePendente"
      FROM users u
      JOIN organizations o ON o.id = u.org_id
     WHERE ${condicoesDeUsuario(f)}
     ORDER BY o.is_platform DESC, o.name, u.created_at
     LIMIT ${limite} OFFSET ${pular}
  `
}

export async function contarUsuarios(f: FiltroDeUsuarios = {}): Promise<number> {
  const [linha] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM users u JOIN organizations o ON o.id = u.org_id
     WHERE ${condicoesDeUsuario(f)}
  `
  return linha?.n ?? 0
}

export type ResumoDeAcessos = {
  total: number
  ativos: number
  semSenha: number
  timeNex: number
}

export async function resumoDeAcessos(): Promise<ResumoDeAcessos> {
  const [linha] = await sql<ResumoDeAcessos[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE u.active)::int AS ativos,
           count(*) FILTER (WHERE u.password_hash IS NULL)::int AS "semSenha",
           count(*) FILTER (WHERE o.is_platform)::int AS "timeNex"
      FROM users u JOIN organizations o ON o.id = u.org_id
  `
  return linha ?? { total: 0, ativos: 0, semSenha: 0, timeNex: 0 }
}

/** A organização interna da Nex Envios. */
export async function orgDaPlataforma(): Promise<{ id: string; nome: string } | null> {
  const [linha] = await sql<{ id: string; nome: string }[]>`
    SELECT id, name AS nome FROM organizations WHERE is_platform LIMIT 1
  `
  return linha ?? null
}

/** Clientes em forma de opção de select — nome e id, nada mais. */
export async function clientesParaEscolha(): Promise<{ id: string; nome: string; plataforma: boolean }[]> {
  return sql<{ id: string; nome: string; plataforma: boolean }[]>`
    SELECT id, name AS nome, is_platform AS plataforma
      FROM organizations
     ORDER BY is_platform DESC, name
     LIMIT 500
  `
}

// ──────────────────────────────────────────────────────────── o batimento

export type EstadoDoBatimento = {
  /** Linhas esperando a vez. */
  naFila: number
  /** A mais antiga que já venceu e continua parada. */
  vencidaDesde: Date | null
  /** Quando o motor bateu pela última vez. Nulo se nunca bateu. */
  ultimoEm: Date | null
  ultimoEnviados: number
  ultimoTentados: number
}

/**
 * O sinal de vida do motor.
 *
 * Uma fila parada e uma fila vazia se parecem na tela — e a diferença entre
 * as duas é um cliente esperando um disparo que não sai. Por isso `vencidaDesde`
 * vem junto: é ele que denuncia o agendador caído.
 */
export async function estadoDoBatimento(): Promise<EstadoDoBatimento> {
  const [linha] = await sql<EstadoDoBatimento[]>`
    SELECT
      (SELECT count(*)::int FROM dispatches WHERE status = 'pendente') AS "naFila",
      (SELECT min(scheduled_for) FROM dispatches
        WHERE status = 'pendente' AND scheduled_for <= now()) AS "vencidaDesde",
      (SELECT updated_at FROM system_settings WHERE key = 'ultimo_batimento') AS "ultimoEm",
      (SELECT COALESCE((value ->> 'enviados')::int, 0) FROM system_settings
        WHERE key = 'ultimo_batimento') AS "ultimoEnviados",
      (SELECT COALESCE((value ->> 'tentados')::int, 0) FROM system_settings
        WHERE key = 'ultimo_batimento') AS "ultimoTentados"
  `
  return (
    linha ?? {
      naFila: 0,
      vencidaDesde: null,
      ultimoEm: null,
      ultimoEnviados: 0,
      ultimoTentados: 0,
    }
  )
}
