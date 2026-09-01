import 'server-only'
import { and, eq, sql as raw } from 'drizzle-orm'
import { db, sql } from '@/db'
import { channelConfigs } from '@/db/schema'

/**
 * O disjuntor do canal.
 *
 * Mora fora do motor porque tem dois alimentadores, não um. O envio linha a
 * linha registra o que aconteceu com cada mensagem; a sincronização das
 * campanhas delegadas registra o que aconteceu com cada consulta. Sem o
 * segundo, um token revogado do Monitor de Envios aparecia como canal saudável
 * para sempre: o cartão do canal só sabe o que o caminho de envio conta, e
 * campanha delegada nunca passa por lá.
 *
 * (Também evita o ciclo: `motor` importa `campanhas/externa` para sincronizar,
 * então `externa` não pode importar `motor` de volta.)
 */

/** Falhas seguidas antes de o canal ser desligado por um tempo. */
export const FALHAS_ATE_DISJUNTOR = 8
export const DISJUNTOR_MS = 10 * 60 * 1000

export async function registrarFalhaDoCanal(configId: string): Promise<void> {
  await sql`
    UPDATE channel_configs
       SET failure_streak = failure_streak + 1,
           broken_until = CASE
             WHEN failure_streak + 1 >= ${FALHAS_ATE_DISJUNTOR}
             THEN now() + (${DISJUNTOR_MS} || ' milliseconds')::interval
             ELSE broken_until
           END
     WHERE id = ${configId}
  `
}

export async function registrarSucessoDoCanal(configId: string): Promise<void> {
  await db
    .update(channelConfigs)
    .set({ failureStreak: 0, brokenUntil: null })
    .where(and(eq(channelConfigs.id, configId), raw`${channelConfigs.failureStreak} > 0`))
}
