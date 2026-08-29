import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { webhookTokens } from '@/db/schema'
import type { Channel } from '@/db/schema/enums'

/**
 * O token que identifica organização e canal na URL do webhook de retorno.
 *
 * Vai na URL porque é assim que quase todo provedor aceita ser configurado —
 * muitos não mandam cabeçalho nenhum. Por isso ele é longo e aleatório: a URL
 * é o único segredo dessa rota.
 *
 * Criado sob demanda e reaproveitado: trocar o token quebraria o webhook já
 * configurado no provedor.
 */
export async function tokenDeRetorno(orgId: string, canal: Channel): Promise<string> {
  const [existente] = await db
    .select({ token: webhookTokens.token })
    .from(webhookTokens)
    .where(and(eq(webhookTokens.orgId, orgId), eq(webhookTokens.channel, canal)))
    .limit(1)

  if (existente) return existente.token

  const token = randomBytes(24).toString('base64url')
  const [criado] = await db
    .insert(webhookTokens)
    .values({ token, orgId, channel: canal })
    .onConflictDoNothing()
    .returning({ token: webhookTokens.token })

  if (criado) return criado.token

  // Corrida: outra requisição criou primeiro. O dela vale.
  const [agora] = await db
    .select({ token: webhookTokens.token })
    .from(webhookTokens)
    .where(and(eq(webhookTokens.orgId, orgId), eq(webhookTokens.channel, canal)))
    .limit(1)

  if (!agora) throw new Error('Não foi possível criar o token de retorno.')
  return agora.token
}

/** A quem pertence este token. Devolve null para token desconhecido. */
export async function donoDoToken(token: string) {
  const [linha] = await db
    .select({ orgId: webhookTokens.orgId, canal: webhookTokens.channel })
    .from(webhookTokens)
    .where(eq(webhookTokens.token, token))
    .limit(1)
  return linha ?? null
}
