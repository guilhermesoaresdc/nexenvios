import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { db } from '@/db'
import { organizations, sessions, users } from '@/db/schema'
import type { Session, UserRole } from '@/db/schema'

/**
 * Sessão em cookie, sem dependência externa.
 *
 * O token cru (32 bytes aleatórios) só existe no cookie do navegador; o banco
 * guarda o sha256 dele como chave primária. Quem obtiver um dump do banco não
 * consegue personificar ninguém — não dá para inverter o hash.
 */

export const COOKIE_SESSAO = 'nex_sessao'
export const TTL_SESSAO_MS = 30 * 24 * 60 * 60 * 1000

export type UsuarioAutenticado = {
  id: string
  name: string
  email: string
  role: UserRole
  /** Time Nex Envios: enxerga todos os clientes. */
  isSuperadmin: boolean
  /** Administra a própria conta (ou é superadmin). */
  isAdmin: boolean
  /** Só leitura. */
  isLeitor: boolean
  /** A organização a que o usuário pertence de verdade. */
  homeOrgId: string
  /**
   * A organização em que ele está trabalhando agora. Igual à de casa, exceto
   * quando um superadmin entrou na conta de um cliente.
   */
  orgId: string
  orgName: string
  orgSlug: string
  orgStatus: string
  timezone: string
  credits: string
  /** true quando o superadmin está vendo a conta de outro cliente. */
  personificando: boolean
}

export function gerarTokenSessao(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function criarSessao(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; sessao: Session }> {
  const token = gerarTokenSessao()
  const [sessao] = await db
    .insert(sessions)
    .values({
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + TTL_SESSAO_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    })
    .returning()

  if (!sessao) throw new Error('Não foi possível criar a sessão.')
  return { token, sessao }
}

/**
 * Valida o token e monta o usuário já com a organização em que ele está.
 *
 * Renova a expiração quando falta menos de metade do TTL: evita escrever no
 * banco a cada requisição sem deixar a sessão morrer no meio do expediente.
 */
export async function validarSessao(token: string): Promise<UsuarioAutenticado | null> {
  const id = hashToken(token)

  const [linha] = await db
    .select({
      sessao: sessions,
      userId: users.id,
      homeOrgId: users.orgId,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1)

  if (!linha) return null

  // Vencida ou de usuário desativado morre na hora em que é apresentada.
  if (linha.sessao.expiresAt.getTime() <= Date.now() || !linha.active) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  const restante = linha.sessao.expiresAt.getTime() - Date.now()
  if (restante < TTL_SESSAO_MS / 2) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + TTL_SESSAO_MS) })
      .where(eq(sessions.id, id))
  }

  const isSuperadmin = linha.role === 'superadmin'
  // Personificação só vale para superadmin. Se o papel mudou depois que a
  // sessão foi aberta, o acting_org_id vira letra morta na hora.
  const alvo = isSuperadmin && linha.sessao.actingOrgId ? linha.sessao.actingOrgId : linha.homeOrgId

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      timezone: organizations.timezone,
      credits: organizations.credits,
    })
    .from(organizations)
    .where(eq(organizations.id, alvo))
    .limit(1)

  if (!org) return null

  return {
    id: linha.userId,
    name: linha.name,
    email: linha.email,
    role: linha.role,
    isSuperadmin,
    isAdmin: isSuperadmin || linha.role === 'admin',
    isLeitor: linha.role === 'visualizador',
    homeOrgId: linha.homeOrgId,
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    orgStatus: org.status,
    timezone: org.timezone,
    credits: org.credits,
    personificando: org.id !== linha.homeOrgId,
  }
}

export async function encerrarSessao(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

/** Usada ao trocar senha ou desativar usuário. */
export async function encerrarTodasAsSessoes(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** O superadmin passa a ver a conta de um cliente sem trocar de identidade. */
export async function personificar(token: string, orgId: string | null): Promise<void> {
  await db.update(sessions).set({ actingOrgId: orgId }).where(eq(sessions.id, hashToken(token)))
}

export async function limparSessoesVencidas(): Promise<number> {
  const removidas = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id })
  return removidas.length
}
