import 'server-only'
import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import { channelConfigs } from '@/db/schema'
import { entregaACampanhaInteira, type Channel } from '@/db/schema/enums'

/**
 * O canal a usar quando ninguém escolheu um.
 *
 * A ordem importa e é sempre a mesma: o canal que o cliente marcou como
 * padrão, depois qualquer canal ativo dele, e só então o provedor da
 * plataforma. Um cliente que trouxe a própria credencial não pode acabar
 * enviando pela conta da Nex sem querer — pagaria por uma coisa e usaria outra.
 */
export async function canalPadrao(
  orgId: string,
  canal: Channel,
  /**
   * Pula provedor que só recebe campanha inteira.
   *
   * Quem pede uma mensagem avulsa (a API /envios, o teste) não pode receber o
   * Monitor de Envios como padrão: ele não tem esse caminho, e o pedido
   * morreria com um erro que acusa a credencial. Melhor não escolher do que
   * escolher errado.
   */
  opcoes: { precisaDeEnvioAvulso?: boolean } = {},
): Promise<string | undefined> {
  const todos = await db
    .select({
      id: channelConfigs.id,
      padrao: channelConfigs.isDefault,
      proprio: channelConfigs.orgId,
      provedor: channelConfigs.provider,
    })
    .from(channelConfigs)
    .where(and(eq(channelConfigs.channel, canal), eq(channelConfigs.active, true)))

  const candidatos = opcoes.precisaDeEnvioAvulso
    ? todos.filter((c) => !entregaACampanhaInteira(c.provedor))
    : todos

  const doCliente = candidatos.filter((c) => c.proprio === orgId)
  const daPlataforma = candidatos.filter((c) => c.proprio === null)

  const escolhido =
    doCliente.find((c) => c.padrao) ??
    doCliente[0] ??
    daPlataforma.find((c) => c.padrao) ??
    daPlataforma[0]

  return escolhido?.id
}

/** O provedor deste canal, se ele for desta organização ou da plataforma. */
export async function provedorDoCanal(orgId: string, configId: string): Promise<string | null> {
  const [linha] = await db
    .select({ provider: channelConfigs.provider })
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.id, configId),
        or(eq(channelConfigs.orgId, orgId), isNull(channelConfigs.orgId)),
      ),
    )
    .limit(1)
  return linha?.provider ?? null
}
