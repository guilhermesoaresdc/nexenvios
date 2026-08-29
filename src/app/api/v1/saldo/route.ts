import { eq } from 'drizzle-orm'
import { db, sql } from '@/db'
import { organizations } from '@/db/schema'
import { CANAIS, type Channel } from '@/db/schema/enums'
import { erro, exigirChave } from '@/lib/api/chave'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/v1/saldo — saldo, limite e a tabela de preços da conta. */
export async function GET(req: Request) {
  const conferido = await exigirChave(req, 'envios:ler')
  if ('resposta' in conferido) return conferido.resposta
  const { orgId } = conferido.auth

  const [org] = await db
    .select({ credits: organizations.credits, creditLimit: organizations.creditLimit })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  if (!org) return erro('Conta não encontrada.', 404, 'nao_encontrado')

  // Um SELECT só para os cinco canais: o preço do cliente quando existe, o da
  // plataforma quando não.
  const linhas = await sql<{ canal: Channel; preco: string }[]>`
    SELECT DISTINCT ON (channel) channel AS canal, price::text AS preco
      FROM channel_prices
     WHERE org_id = ${orgId} OR org_id IS NULL
     ORDER BY channel, (org_id IS NULL)
  `

  const precos: Partial<Record<Channel, number>> = {}
  for (const canal of CANAIS) {
    const achado = linhas.find((l) => l.canal === canal)
    if (achado) precos[canal] = Number(achado.preco)
  }

  return Response.json({
    saldo: Number(org.credits),
    limite: Number(org.creditLimit),
    disponivel: Number(org.credits) + Number(org.creditLimit),
    precos,
    moeda: 'BRL',
  })
}
