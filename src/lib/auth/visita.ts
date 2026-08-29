'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, organizations } from '@/db/schema'
import { exigirTimeNex, exigirUsuario } from './atual'
import { lerTokenSessao } from './cookies'
import { personificar } from './sessao'

/**
 * "Entrar como cliente".
 *
 * O superadmin passa a ver a conta de um cliente sem trocar de identidade: a
 * sessão continua sendo dele, só o `acting_org_id` muda. Isso importa para a
 * auditoria — tudo que for feito lá dentro fica registrado no nome de quem
 * realmente fez, não no de um usuário do cliente.
 */

export async function entrarNaConta(orgId: string): Promise<void> {
  const usuario = await exigirTimeNex()
  const token = await lerTokenSessao()
  if (!token) redirect('/entrar')

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  if (!org) redirect('/admin/clientes')

  await personificar(token, org.id)
  await db.insert(auditLog).values({
    orgId: org.id,
    userId: usuario.id,
    action: 'conta.visitada',
    entity: 'organization',
    entityId: org.id,
    meta: { cliente: org.name },
  })

  revalidatePath('/', 'layout')
  redirect('/painel')
}

export async function encerrarVisita(): Promise<void> {
  const usuario = await exigirUsuario()
  const token = await lerTokenSessao()
  if (token) await personificar(token, null)

  if (usuario.personificando) {
    await db.insert(auditLog).values({
      orgId: usuario.orgId,
      userId: usuario.id,
      action: 'conta.visita_encerrada',
      entity: 'organization',
      entityId: usuario.orgId,
    })
  }

  revalidatePath('/', 'layout')
  redirect('/admin/clientes')
}
