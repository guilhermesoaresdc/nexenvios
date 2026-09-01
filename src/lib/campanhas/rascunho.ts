import 'server-only'
import { and, eq, sql as raw } from 'drizzle-orm'
import { db } from '@/db'
import { savedDispatches } from '@/db/schema'
import { channelEnum, type Channel } from '@/db/schema/enums'
import { formaDoRascunho, type Rascunho } from './rascunho-forma'

export { formaDoRascunho }
export type { Rascunho }

/**
 * O rascunho do disparo.
 *
 * O assistente vivia inteiro na memória do navegador: fechar a aba, recarregar
 * sem querer, a sessão expirar — qualquer um desses jogava fora canal,
 * público, texto, mídia e perfil. Num disparo grande é meia hora de trabalho,
 * e o custo real não é o tempo: é a pessoa refazer com pressa e mandar
 * diferente do que pretendia.
 *
 * Um por pessoa, sobrescrito a cada mudança, apagado quando a campanha nasce.
 *
 * **O que é guardado é o que a pessoa DIGITOU, não o que ela vai gastar.**
 * Nada aqui é confiado na hora de criar a campanha: o rascunho volta para os
 * campos da tela e todo o caminho normal de validação, orçamento e cobrança
 * roda de novo por cima. Um rascunho adulterado no banco não compra nada.
 */

/** Vazio o bastante para não valer a pena guardar. */
function estaEmBranco(r: Rascunho): boolean {
  return (
    !r.configId &&
    !r.corpo.trim() &&
    !r.nome.trim() &&
    !r.mediaUrl.trim() &&
    !r.todaABase &&
    r.listas.length === 0 &&
    r.etiquetas.length === 0
  )
}

function canalValido(bruto: unknown): Channel | null {
  return (channelEnum.enumValues as readonly string[]).includes(bruto as string)
    ? (bruto as Channel)
    : null
}

/** Devolve se algo foi realmente gravado — a tela só carimba a hora se sim. */
export async function guardarRascunho(opcoes: {
  orgId: string
  autorId: string
  canal: unknown
  rascunho: unknown
}): Promise<boolean> {
  const dados = formaDoRascunho.safeParse(opcoes.rascunho)
  if (!dados.success) return false

  /*
   * Rascunho em branco APAGA em vez de gravar.
   *
   * Sem isto, abrir o assistente e sair sem tocar em nada deixaria um rascunho
   * vazio — e a próxima visita seria recebida por um aviso de "rascunho
   * retomado" que não retomou coisa nenhuma.
   */
  if (estaEmBranco(dados.data)) {
    await descartarRascunho(opcoes.orgId, opcoes.autorId)
    return false
  }

  const valores = {
    orgId: opcoes.orgId,
    createdBy: opcoes.autorId,
    name: 'Rascunho do assistente',
    channel: canalValido(opcoes.canal),
    payload: dados.data,
    auto: true,
    updatedAt: new Date(),
  }

  await db
    .insert(savedDispatches)
    .values(valores)
    .onConflictDoUpdate({
      target: [savedDispatches.orgId, savedDispatches.createdBy],
      targetWhere: raw`${savedDispatches.auto}`,
      set: {
        channel: valores.channel,
        payload: valores.payload,
        updatedAt: valores.updatedAt,
      },
    })

  return true
}

export type RascunhoGuardado = { rascunho: Rascunho; salvoEm: Date }

export async function lerRascunho(
  orgId: string,
  autorId: string,
): Promise<RascunhoGuardado | null> {
  const [linha] = await db
    .select({ payload: savedDispatches.payload, updatedAt: savedDispatches.updatedAt })
    .from(savedDispatches)
    .where(
      and(
        eq(savedDispatches.orgId, orgId),
        eq(savedDispatches.createdBy, autorId),
        eq(savedDispatches.auto, true),
      ),
    )
    .limit(1)

  if (!linha) return null

  const dados = formaDoRascunho.safeParse(linha.payload)
  if (!dados.success) return null
  if (estaEmBranco(dados.data)) return null

  return { rascunho: dados.data, salvoEm: linha.updatedAt }
}

export async function descartarRascunho(orgId: string, autorId: string): Promise<void> {
  await db
    .delete(savedDispatches)
    .where(
      and(
        eq(savedDispatches.orgId, orgId),
        eq(savedDispatches.createdBy, autorId),
        eq(savedDispatches.auto, true),
      ),
    )
}
