import 'server-only'
import { sql } from '@/db'

/** Consultas da base de contatos e das listas. */

export type LinhaDeContato = {
  id: string
  telefone: string | null
  nome: string | null
  email: string | null
  etiquetas: string[]
  descadastrado: boolean
  origem: string | null
  criadoEm: Date
  ultimoEnvio: Date | null
}

export type FiltroDeContatos = {
  busca?: string
  etiqueta?: string
  listaId?: string
  descadastrados?: 'incluir' | 'excluir' | 'somente'
  limite?: number
  pular?: number
}

function condicoes(orgId: string, f: FiltroDeContatos) {
  return sql`
    c.org_id = ${orgId}
    ${f.etiqueta ? sql`AND c.tags @> ARRAY[${f.etiqueta}]::text[]` : sql``}
    ${
      f.listaId
        ? sql`AND EXISTS (SELECT 1 FROM contact_list_members m
                           WHERE m.contact_id = c.id AND m.list_id = ${f.listaId})`
        : sql``
    }
    ${f.descadastrados === 'excluir' ? sql`AND NOT c.opted_out` : sql``}
    ${f.descadastrados === 'somente' ? sql`AND c.opted_out` : sql``}
    ${
      f.busca
        ? sql`AND (c.name ILIKE ${'%' + f.busca + '%'}
                OR c.phone ILIKE ${'%' + f.busca.replace(/\D/g, '') + '%'}
                OR c.email ILIKE ${'%' + f.busca + '%'})`
        : sql``
    }
  `
}

export async function listarContatos(
  orgId: string,
  filtro: FiltroDeContatos = {},
): Promise<LinhaDeContato[]> {
  const { limite = 50, pular = 0 } = filtro
  return sql<LinhaDeContato[]>`
    SELECT c.id, c.phone AS telefone, c.name AS nome, c.email,
           c.tags AS etiquetas, c.opted_out AS descadastrado,
           c.source AS origem, c.created_at AS "criadoEm",
           (SELECT max(d.sent_at) FROM dispatches d WHERE d.contact_id = c.id) AS "ultimoEnvio"
      FROM contacts c
     WHERE ${condicoes(orgId, filtro)}
     ORDER BY c.created_at DESC, c.id
     LIMIT ${limite} OFFSET ${pular}
  `
}

export async function contarContatos(
  orgId: string,
  filtro: FiltroDeContatos = {},
): Promise<number> {
  const [linha] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM contacts c WHERE ${condicoes(orgId, filtro)}
  `
  return linha?.n ?? 0
}

export type LinhaDeLista = {
  id: string
  nome: string
  descricao: string | null
  total: number
  criadaEm: Date
  autor: string | null
  /** A lista de teste da organização. Vem primeiro na ordenação. */
  deTeste: boolean
}

export async function listarListas(orgId: string): Promise<LinhaDeLista[]> {
  return sql<LinhaDeLista[]>`
    SELECT l.id, l.name AS nome, l.description AS descricao, l.total,
           l.created_at AS "criadaEm", u.name AS autor, l.is_test AS "deTeste"
      FROM contact_lists l
      LEFT JOIN users u ON u.id = l.created_by
     WHERE l.org_id = ${orgId}
     ORDER BY l.is_test DESC, l.created_at DESC
  `
}

export type EtiquetaContada = { etiqueta: string; total: number }

/** As etiquetas em uso, com quantos contatos ativos cada uma alcança. */
export async function etiquetasEmUso(orgId: string): Promise<EtiquetaContada[]> {
  return sql<EtiquetaContada[]>`
    SELECT etiqueta, count(*)::int AS total
      FROM contacts c, unnest(c.tags) AS etiqueta
     WHERE c.org_id = ${orgId} AND NOT c.opted_out AND c.phone IS NOT NULL
     GROUP BY etiqueta
     ORDER BY total DESC, etiqueta
     LIMIT 60
  `
}

export type ResumoDaBase = {
  total: number
  ativos: number
  descadastrados: number
  semTelefone: number
}

export async function resumoDaBase(orgId: string): Promise<ResumoDaBase> {
  const [linha] = await sql<ResumoDaBase[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE NOT opted_out AND phone IS NOT NULL)::int AS ativos,
           count(*) FILTER (WHERE opted_out)::int AS descadastrados,
           count(*) FILTER (WHERE phone IS NULL)::int AS "semTelefone"
      FROM contacts WHERE org_id = ${orgId}
  `
  return linha ?? { total: 0, ativos: 0, descadastrados: 0, semTelefone: 0 }
}

export type ImportacaoRecente = {
  id: string
  arquivo: string | null
  total: number
  importados: number
  repetidos: number
  invalidos: number
  descadastrados: number
  lista: string | null
  criadaEm: Date
}

export async function importacoesRecentes(
  orgId: string,
  limite = 10,
): Promise<ImportacaoRecente[]> {
  return sql<ImportacaoRecente[]>`
    SELECT j.id, j.filename AS arquivo, j.total, j.imported AS importados,
           j.duplicates AS repetidos, j.invalid AS invalidos,
           j.opted_out AS descadastrados, l.name AS lista, j.created_at AS "criadaEm"
      FROM import_jobs j
      LEFT JOIN contact_lists l ON l.id = j.list_id
     WHERE j.org_id = ${orgId}
     ORDER BY j.created_at DESC
     LIMIT ${limite}
  `
}
