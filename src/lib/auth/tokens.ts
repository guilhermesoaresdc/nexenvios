import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, organizations, passwordTokens, sessions, users } from '@/db/schema'
import { VALIDADE_CONVITE_MS, VALIDADE_RECUPERACAO_MS } from './regras'

/**
 * Convite e recuperação de senha.
 *
 * Os dois são a mesma coisa — "prove que é você e defina uma senha" — com
 * validade diferente. Mesmo esquema da sessão: o token cru vai no link, o
 * banco guarda só o sha256.
 */

export type Proposito = 'convite' | 'recuperacao'
export type MotivoInvalido = 'invalido' | 'expirado' | 'usado' | 'inativo'

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function emitirToken(userId: string, proposito: Proposito): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const validade = proposito === 'convite' ? VALIDADE_CONVITE_MS : VALIDADE_RECUPERACAO_MS

  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
    await tx
      .update(passwordTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordTokens.userId, userId), isNull(passwordTokens.usedAt)))
    await tx.insert(passwordTokens).values({
      id: hashDoToken(token),
      userId,
      purpose: proposito,
      expiresAt: new Date(Date.now() + validade),
    })
  })

  return token
}

export type TokenConferido =
  | { ok: true; userId: string; nome: string; email: string; proposito: Proposito }
  | { ok: false; motivo: MotivoInvalido }

export async function conferirToken(token: string): Promise<TokenConferido> {
  const [linha] = await db
    .select({
      id: passwordTokens.id,
      userId: passwordTokens.userId,
      purpose: passwordTokens.purpose,
      expiresAt: passwordTokens.expiresAt,
      usedAt: passwordTokens.usedAt,
      nome: users.name,
      email: users.email,
      ativo: users.active,
      status: organizations.status,
    })
    .from(passwordTokens)
    .innerJoin(users, eq(users.id, passwordTokens.userId))
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(eq(passwordTokens.id, hashDoToken(token)))
    .limit(1)

  if (!linha) return { ok: false, motivo: 'invalido' }
  if (linha.usedAt) return { ok: false, motivo: 'usado' }
  if (linha.expiresAt.getTime() <= Date.now()) return { ok: false, motivo: 'expirado' }
  if (!linha.ativo || linha.status === 'cancelado') return { ok: false, motivo: 'inativo' }

  return {
    ok: true,
    userId: linha.userId,
    nome: linha.nome,
    email: linha.email,
    proposito: linha.purpose as Proposito,
  }
}

export async function queimarToken(token: string): Promise<void> {
  await db
    .update(passwordTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordTokens.id, hashDoToken(token)))
}

/** O link que vai no e-mail (ou que o admin copia e manda pelo WhatsApp). */
export function linkDeSenha(token: string, base?: string): string {
  const raiz = (base ?? process.env.APP_URL ?? 'https://nexenvios.com.br').replace(/\/$/, '')
  return `${raiz}/definir-senha/${token}`
}

/** Consome o link e altera senha/sessões na mesma transação. */
export async function consumirTokenDeSenha(token: string, hash: string): Promise<TokenConferido> {
  const previa = await conferirToken(token)
  if (!previa.ok) return previa
  return db.transaction(async (tx) => {
    const [usuario] = await tx
      .select({ ativo: users.active, orgId: users.orgId })
      .from(users)
      .where(eq(users.id, previa.userId))
      .for('update')
    const [org] = await tx
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, usuario?.orgId ?? previa.userId))
    if (!usuario?.ativo || !org || org.status === 'cancelado')
      return { ok: false as const, motivo: 'inativo' as const }
    const [consumido] = await tx
      .update(passwordTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordTokens.id, hashDoToken(token)),
          isNull(passwordTokens.usedAt),
          gt(passwordTokens.expiresAt, new Date()),
        ),
      )
      .returning({ id: passwordTokens.id })
    if (!consumido) return { ok: false as const, motivo: 'usado' as const }
    await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, previa.userId))
    await tx
      .update(passwordTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordTokens.userId, previa.userId), isNull(passwordTokens.usedAt)))
    await tx.delete(sessions).where(eq(sessions.userId, previa.userId))
    await tx.insert(auditLog).values({
      orgId: usuario.orgId,
      userId: previa.userId,
      action: 'senha.definida',
      entity: 'user',
      entityId: previa.userId,
      meta: { proposito: previa.proposito },
    })
    return previa
  })
}
