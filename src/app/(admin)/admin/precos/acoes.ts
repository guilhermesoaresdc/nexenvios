'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, channelPrices } from '@/db/schema'
import { channelEnum } from '@/db/schema/enums'
import { exigirSuperadmin } from '@/lib/auth/atual'

export type Estado = { erro?: string; ok?: string } | undefined

const canal = z.enum(channelEnum.enumValues)
const preco = z.coerce.number().min(0, 'O preço não pode ser negativo.').max(999)

/** Preço padrão da plataforma — vale para todo cliente sem exceção própria. */
export async function salvarPrecoPadrao(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const dados = z
    .object({ canal, preco })
    .safeParse({ canal: form.get('canal'), preco: form.get('preco') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira o preço.' }

  const [existente] = await db
    .select({ id: channelPrices.id })
    .from(channelPrices)
    .where(and(isNull(channelPrices.orgId), eq(channelPrices.channel, dados.data.canal)))
    .limit(1)

  if (existente) {
    await db
      .update(channelPrices)
      .set({ price: String(dados.data.preco), updatedAt: new Date() })
      .where(eq(channelPrices.id, existente.id))
  } else {
    await db
      .insert(channelPrices)
      .values({ orgId: null, channel: dados.data.canal, price: String(dados.data.preco) })
  }

  await db.insert(auditLog).values({
    userId: admin.id,
    action: 'preco.alterado',
    entity: 'channel_price',
    meta: { canal: dados.data.canal, preco: dados.data.preco, escopo: 'padrao' },
  })

  revalidatePath('/admin/precos')
  return { ok: 'Preço padrão atualizado. Campanhas já criadas mantêm o preço congelado.' }
}

/** Exceção de preço para um cliente específico. */
export async function salvarExcecao(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const dados = z
    .object({ orgId: z.string().uuid('Escolha um cliente.'), canal, preco })
    .safeParse({ orgId: form.get('orgId'), canal: form.get('canal'), preco: form.get('preco') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const [existente] = await db
    .select({ id: channelPrices.id })
    .from(channelPrices)
    .where(and(eq(channelPrices.orgId, dados.data.orgId), eq(channelPrices.channel, dados.data.canal)))
    .limit(1)

  if (existente) {
    await db
      .update(channelPrices)
      .set({ price: String(dados.data.preco), updatedAt: new Date() })
      .where(eq(channelPrices.id, existente.id))
  } else {
    await db.insert(channelPrices).values({
      orgId: dados.data.orgId,
      channel: dados.data.canal,
      price: String(dados.data.preco),
    })
  }

  await db.insert(auditLog).values({
    orgId: dados.data.orgId,
    userId: admin.id,
    action: 'preco.alterado',
    entity: 'channel_price',
    meta: { canal: dados.data.canal, preco: dados.data.preco, escopo: 'cliente' },
  })

  revalidatePath('/admin/precos')
  return { ok: 'Exceção salva.' }
}

export async function removerExcecao(id: string): Promise<void> {
  const admin = await exigirSuperadmin()

  /*
   * `isNotNull(orgId)` no WHERE não é zelo: a linha de preço PADRÃO tem
   * org_id nulo, e apagá-la faria o canal passar a orçar em zero — a
   * plataforma mandaria de graça até alguém reparar na fatura.
   */
  const removidas = await db
    .delete(channelPrices)
    .where(and(eq(channelPrices.id, id), isNotNull(channelPrices.orgId)))
    .returning({ orgId: channelPrices.orgId, canal: channelPrices.channel })

  const removida = removidas[0]
  if (!removida) return

  await db.insert(auditLog).values({
    orgId: removida.orgId,
    userId: admin.id,
    action: 'preco.alterado',
    entity: 'channel_price',
    entityId: id,
    meta: { canal: removida.canal, escopo: 'excecao_removida' },
  })

  revalidatePath('/admin/precos')
}
