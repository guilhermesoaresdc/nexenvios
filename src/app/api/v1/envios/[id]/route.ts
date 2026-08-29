import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { campaigns, dispatches } from '@/db/schema'
import { erro, exigirChave } from '@/lib/api/chave'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/v1/envios/:id — o estado de um envio. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const conferido = await exigirChave(req, 'envios:ler')
  if ('resposta' in conferido) return conferido.resposta

  const { id } = await ctx.params

  const [linha] = await db
    .select({
      id: dispatches.id,
      canal: dispatches.channel,
      para: dispatches.toAddress,
      status: dispatches.status,
      tentativas: dispatches.attempts,
      provedor: dispatches.provider,
      providerMessageId: dispatches.providerMessageId,
      erroCodigo: dispatches.errorCode,
      erroMensagem: dispatches.errorMessage,
      custo: dispatches.cost,
      agendadoPara: dispatches.scheduledFor,
      enviadoEm: dispatches.sentAt,
      entregueEm: dispatches.deliveredAt,
      lidoEm: dispatches.readAt,
      respondidoEm: dispatches.repliedAt,
      criadoEm: dispatches.createdAt,
      campanhaId: dispatches.campaignId,
      campanha: campaigns.name,
    })
    .from(dispatches)
    .leftJoin(campaigns, eq(campaigns.id, dispatches.campaignId))
    // O `org_id` no WHERE é o que impede consultar o envio de outro cliente
    // com um id adivinhado.
    .where(and(eq(dispatches.id, id), eq(dispatches.orgId, conferido.auth.orgId)))
    .limit(1)

  if (!linha) return erro('Envio não encontrado.', 404, 'nao_encontrado')

  return Response.json({ ...linha, custo: Number(linha.custo) })
}
