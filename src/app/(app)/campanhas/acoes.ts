'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verCampanha } from '@/db/queries/campanhas'
import type { CampaignStatus } from '@/db/schema/enums'
import { exigirEscrita, exigirUsuario, type UsuarioAutenticado } from '@/lib/auth/atual'
import { cancelar, pausar, retomar } from '@/lib/campanhas/servico'
import { numero } from '@/lib/ui'

/**
 * Os três controles de uma campanha em curso.
 *
 * Nenhum deles recebe organização: o id da campanha vem da tela, mas quem
 * decide de quem ela é são `pausar`/`retomar`/`cancelar`, que filtram pelo
 * `orgId` da sessão. Um id adivinhado não alcança a campanha de outro cliente.
 */

export type EstadoDoControle = { ok?: string; erro?: string }

const identificador = z.uuid()

const CANCELAVEIS: readonly CampaignStatus[] = [
  'rascunho',
  'preparando',
  'agendada',
  'enviando',
  'pausada',
]

/** Leitor não controla disparo. Vira mensagem na tela em vez de exceção. */
function conferirEscrita(usuario: UsuarioAutenticado): string | null {
  try {
    exigirEscrita(usuario)
    return null
  } catch (erro) {
    return erro instanceof Error ? erro.message : 'Seu acesso é somente leitura.'
  }
}

function revalidar(campanhaId: string): void {
  revalidatePath('/campanhas')
  revalidatePath(`/campanhas/${campanhaId}`)
  revalidatePath('/painel')
}

export async function pausarCampanha(campanhaId: string): Promise<EstadoDoControle> {
  const usuario = await exigirUsuario()
  const barrado = conferirEscrita(usuario)
  if (barrado) return { erro: barrado }

  const id = identificador.safeParse(campanhaId)
  if (!id.success) return { erro: 'Campanha não encontrada.' }

  const pausou = await pausar(usuario.orgId, id.data)
  if (!pausou) {
    return { erro: 'A campanha já saiu do ar sozinha. Atualize a página para ver o estado atual.' }
  }

  revalidar(id.data)
  return { ok: 'Campanha pausada. Nada sai daqui para a frente até você retomar.' }
}

export async function retomarCampanha(campanhaId: string): Promise<EstadoDoControle> {
  const usuario = await exigirUsuario()
  const barrado = conferirEscrita(usuario)
  if (barrado) return { erro: barrado }

  const id = identificador.safeParse(campanhaId)
  if (!id.success) return { erro: 'Campanha não encontrada.' }

  const retomou = await retomar(usuario.orgId, id.data)
  if (!retomou) {
    return { erro: 'Esta campanha não está pausada. Atualize a página para ver o estado atual.' }
  }

  revalidar(id.data)
  return { ok: 'Campanha retomada. A fila volta a sair no mesmo ritmo de antes.' }
}

export async function cancelarCampanha(campanhaId: string): Promise<EstadoDoControle> {
  const usuario = await exigirUsuario()
  const barrado = conferirEscrita(usuario)
  if (barrado) return { erro: barrado }

  const id = identificador.safeParse(campanhaId)
  if (!id.success) return { erro: 'Campanha não encontrada.' }

  /*
   * `cancelar` devolve zero tanto para "não existe" quanto para "não havia
   * nada na fila". Conferir o estado antes é o que separa as duas mensagens —
   * e cancelar não tem volta, então a pessoa precisa saber qual das duas foi.
   */
  const campanha = await verCampanha(usuario.orgId, id.data)
  if (!campanha) return { erro: 'Campanha não encontrada.' }
  if (!CANCELAVEIS.includes(campanha.status)) {
    return { erro: 'Esta campanha já terminou. Não há mais nada na fila para cancelar.' }
  }

  const canceladas = await cancelar(usuario.orgId, id.data)
  revalidar(id.data)

  return {
    ok:
      canceladas > 0
        ? `Campanha cancelada. ${numero(canceladas)} ${canceladas === 1 ? 'envio que ainda não tinha saído foi cancelado' : 'envios que ainda não tinham saído foram cancelados'}. O que já saiu não volta atrás.`
        : 'Campanha cancelada. Não havia nenhum envio na fila — o que já tinha saído continua valendo.',
  }
}
