'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { channelEnum } from '@/db/schema/enums'
import { exigirPoderTotal, exigirTimeNex } from '@/lib/auth/atual'
import { religarCanal, removerCanal, salvarCanal } from '@/lib/canais/servico'

export type Estado = { erro?: string; ok?: string } | undefined

const guardar = z.object({
  configId: z.string().uuid().optional().or(z.literal('')),
  canal: z.enum(channelEnum.enumValues),
  provedor: z.string().min(2).max(40),
  rotulo: z.string().trim().min(2, 'Dê um nome a este provedor.').max(80),
})

/**
 * Provedor da plataforma: `orgId` nulo.
 *
 * Todo cliente sem canal próprio deste tipo passa a enviar por ele — é por isso
 * que a tela avisa em amarelo antes de salvar.
 */
export async function guardarProvedor(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirTimeNex()
  exigirPoderTotal(admin)

  const dados = guardar.safeParse({
    configId: form.get('configId') ?? '',
    canal: form.get('canal'),
    provedor: form.get('provedor'),
    rotulo: form.get('rotulo'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const valores: Record<string, string> = {}
  for (const [chave, valor] of form.entries()) {
    if (['configId', 'canal', 'provedor', 'rotulo', 'ativo', 'padrao'].includes(chave)) continue
    if (typeof valor === 'string') valores[chave] = valor
  }

  const r = await salvarCanal({
    orgId: null,
    configId: dados.data.configId || null,
    canal: dados.data.canal,
    provider: dados.data.provedor,
    rotulo: dados.data.rotulo,
    valores,
    ativo: form.get('ativo') === 'on',
    padrao: form.get('padrao') === 'on',
    autorId: admin.id,
  })

  if (!r.ok) return { erro: r.erro }

  revalidatePath('/admin/provedores')
  return { ok: 'Provedor salvo.' }
}

export async function apagarProvedor(configId: string): Promise<void> {
  const admin = await exigirTimeNex()
  exigirPoderTotal(admin)
  await removerCanal(null, configId, admin.id)
  revalidatePath('/admin/provedores')
}

export async function religar(configId: string): Promise<void> {
  const admin = await exigirTimeNex()
  exigirPoderTotal(admin)
  await religarCanal(configId, admin.id)
  revalidatePath('/admin/provedores')
}
