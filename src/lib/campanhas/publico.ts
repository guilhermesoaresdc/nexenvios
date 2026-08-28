import 'server-only'
import { sql } from '@/db'

/**
 * Quem vai receber.
 *
 * Três origens somáveis num disparo só — listas, etiquetas e a base inteira —
 * resolvidas por UM SQL, sempre o mesmo. O padrão é `escolhidos / barrados /
 * livres`:
 *
 *   escolhidos = a UNIÃO das fontes (UNION, não UNION ALL: quem está em duas
 *                listas é uma pessoa só, e mandar duas vezes custa dobrado e
 *                chega como spam)
 *   barrados   = quem pediu para sair
 *   livres     = a diferença — é para esses que se manda
 *
 * Contar e materializar usam LITERALMENTE o mesmo SQL, trocando só `count(*)`
 * pela lista de telefones. Se divergissem, a tela prometeria um número e o
 * disparo entregaria outro — e ninguém descobriria até a fatura.
 *
 * O `ORDER BY phone` antes do LIMIT não é enfeite: é ele que torna a
 * materialização retomável. Uma campanha de um milhão não cabe numa
 * requisição da Vercel; o motor continua de onde parou usando o último
 * telefone como cursor, e só uma ordem estável torna isso correto.
 */

/** Uma fonte de público, com o rótulo que será congelado no histórico. */
export type Fonte =
  | { tipo: 'lista'; chave: string; rotulo: string }
  | { tipo: 'etiqueta'; chave: string; rotulo: string }
  | { tipo: 'todos'; chave: 'todos'; rotulo: string }

/**
 * O teto por campanha.
 *
 * Não é limite do banco: é o custo de um engano. Um disparo de dois milhões
 * criado por descuido gasta o saldo do cliente antes de alguém perceber. Acima
 * disto, a tela pede para dividir — e avisa que aparou.
 */
export const TETO_DA_BASE = 1_000_000

export type ContagemDoPublico = {
  /** Quantos vão receber. */
  total: number
  /** Quantos as fontes trouxeram, antes de tirar descadastrado e repetido. */
  bruto: number
  /** Quantos caíram por descadastro. */
  barrados: number
  /** Bateu no teto? */
  aparado: boolean
}

export type DestinoDoPublico = {
  contactId: string
  telefone: string
  nome: string | null
  email: string | null
  atributos: Record<string, unknown>
}

function partes(fontes: Fonte[]): { listas: string[]; etiquetas: string[]; todos: boolean } {
  return {
    listas: fontes.filter((f) => f.tipo === 'lista').map((f) => f.chave),
    etiquetas: fontes.filter((f) => f.tipo === 'etiqueta').map((f) => f.chave),
    todos: fontes.some((f) => f.tipo === 'todos'),
  }
}

/**
 * O SQL compartilhado, como fragmento.
 *
 * Fica num lugar só justamente para que contagem e materialização não possam
 * divergir. `todos` sendo verdadeiro engole as outras fontes — pedir "a base
 * inteira mais a lista X" é pedir a base inteira.
 */
function escolhidos(orgId: string, fontes: Fonte[]) {
  const { listas, etiquetas, todos } = partes(fontes)

  if (todos) {
    return sql`
      SELECT c.id, c.phone, c.name, c.email, c.attributes, c.opted_out
        FROM contacts c
       WHERE c.org_id = ${orgId} AND c.phone IS NOT NULL
    `
  }

  return sql`
    SELECT c.id, c.phone, c.name, c.email, c.attributes, c.opted_out
      FROM contacts c
     WHERE c.org_id = ${orgId}
       AND c.phone IS NOT NULL
       AND (
         ${etiquetas.length > 0 ? sql`c.tags && ${etiquetas}::text[]` : sql`false`}
         OR ${
           listas.length > 0
             ? sql`EXISTS (
                 SELECT 1 FROM contact_list_members m
                  WHERE m.contact_id = c.id AND m.list_id = ANY(${listas}::uuid[])
               )`
             : sql`false`
         }
       )
  `
}

export async function contarPublico(orgId: string, fontes: Fonte[]): Promise<ContagemDoPublico> {
  if (fontes.length === 0) return { total: 0, bruto: 0, barrados: 0, aparado: false }

  const [linha] = await sql<{ bruto: number; livres: number }[]>`
    WITH escolhidos AS (${escolhidos(orgId, fontes)})
    SELECT
      count(*)::int AS bruto,
      count(*) FILTER (WHERE NOT opted_out)::int AS livres
      FROM escolhidos
  `

  const bruto = linha?.bruto ?? 0
  const livres = linha?.livres ?? 0

  return {
    total: Math.min(livres, TETO_DA_BASE),
    bruto,
    barrados: bruto - livres,
    aparado: livres > TETO_DA_BASE,
  }
}

/**
 * Uma fatia do público, a partir do cursor.
 *
 * `depoisDe` é o último telefone já processado. Ordem estável + cursor é o que
 * permite materializar um milhão de linhas em várias invocações sem repetir
 * nem pular ninguém.
 */
export async function fatiaDoPublico(
  orgId: string,
  fontes: Fonte[],
  limite: number,
  depoisDe: string | null,
): Promise<DestinoDoPublico[]> {
  if (fontes.length === 0) return []

  const linhas = await sql<
    {
      id: string
      phone: string
      name: string | null
      email: string | null
      attributes: Record<string, unknown>
    }[]
  >`
    WITH escolhidos AS (${escolhidos(orgId, fontes)}),
         livres AS (
           SELECT DISTINCT ON (phone) id, phone, name, email, attributes
             FROM escolhidos
            WHERE NOT opted_out
              ${depoisDe ? sql`AND phone > ${depoisDe}` : sql``}
            ORDER BY phone, id
         )
    SELECT id, phone, name, email, attributes
      FROM livres
     ORDER BY phone
     LIMIT ${limite}
  `

  return linhas.map((l) => ({
    contactId: l.id,
    telefone: l.phone,
    nome: l.name,
    email: l.email,
    atributos: (l.attributes ?? {}) as Record<string, unknown>,
  }))
}

/** Amostra para a prévia da tela — os primeiros, sem materializar nada. */
export function amostraDoPublico(orgId: string, fontes: Fonte[], quantos = 5) {
  return fatiaDoPublico(orgId, fontes, quantos, null)
}

/**
 * Confere que cada fonte é mesmo desta organização.
 *
 * Sem isto, um id de lista adivinhado alcançaria a base de outro cliente. É a
 * checagem que sustenta o isolamento entre contas nesta rota — e a rota que
 * mais dói se falhar.
 */
export async function conferirFontes(orgId: string, fontes: Fonte[]): Promise<Fonte[]> {
  const listas = fontes.filter((f) => f.tipo === 'lista').map((f) => f.chave)
  if (listas.length === 0) return fontes

  const validas = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM contact_lists
     WHERE org_id = ${orgId} AND id = ANY(${listas}::uuid[])
  `
  const porId = new Map(validas.map((l) => [l.id, l.name]))

  return fontes
    .filter((f) => f.tipo !== 'lista' || porId.has(f.chave))
    .map((f) => (f.tipo === 'lista' ? { ...f, rotulo: porId.get(f.chave) ?? f.rotulo } : f))
}
