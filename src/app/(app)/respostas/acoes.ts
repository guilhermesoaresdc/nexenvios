'use server'

import { revalidatePath } from 'next/cache'
import { exigirEscrita, exigirUsuario } from '@/lib/auth/atual'
import { descadastrar } from '@/lib/campanhas/servico'
import { normalizarTelefone } from '@/lib/telefone'

export async function descadastrarNumero(telefone: string): Promise<void> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const norm = normalizarTelefone(telefone)
  if (!norm.ok) return

  await descadastrar(usuario.orgId, norm.e164, 'pedido do destinatário')
  revalidatePath('/respostas')
  revalidatePath('/contatos')
}
