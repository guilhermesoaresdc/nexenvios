import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { channelConfigs } from '@/db/schema'
import type { Channel } from '@/db/schema/enums'

/**
 * O canal a usar quando ninguém escolheu um.
 *
 * A ordem importa e é sempre a mesma: o canal que o cliente marcou como
 * padrão, depois qualquer canal ativo dele, e só então o provedor da
 * plataforma. Um cliente que trouxe a própria credencial não pode acabar
 * enviando pela conta da Nex sem querer — pagaria por uma coisa e usaria outra.
 */
export async function canalPadrao(orgId: string, canal: Channel): Promise<string | undefined> {
  const candidatos = await db
    .select({
      id: channelConfigs.id,
      padrao: channelConfigs.isDefault,
      proprio: channelConfigs.orgId,
    })
    .from(channelConfigs)
    .where(and(eq(channelConfigs.channel, canal), eq(channelConfigs.active, true)))

  const doCliente = candidatos.filter((c) => c.proprio === orgId)
  const daPlataforma = candidatos.filter((c) => c.proprio === null)

  const escolhido =
    doCliente.find((c) => c.padrao) ??
    doCliente[0] ??
    daPlataforma.find((c) => c.padrao) ??
    daPlataforma[0]

  return escolhido?.id
}
