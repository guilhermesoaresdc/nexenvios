import { eq } from 'drizzle-orm'
import { db } from './index'
import { channelPrices, organizations, users } from './schema'
import { gerarHash, gerarSenha } from '@/lib/auth/senha'

/**
 * A semente.
 *
 * Cria a organização interna da Nex Envios e o primeiro superadmin. Roda uma
 * vez, na instalação. Idempotente: chamar de novo não duplica nada e não troca
 * a senha de ninguém.
 */

export type ResultadoDaSemente = {
  orgId: string
  email: string
  /** Só existe quando o usuário foi criado agora. */
  senha: string | null
  criouOrg: boolean
  criouUsuario: boolean
}

export async function semear(opcoes: {
  email?: string
  senha?: string
  nome?: string
} = {}): Promise<ResultadoDaSemente> {
  const email = (opcoes.email ?? process.env.ADMIN_EMAIL ?? 'admin@nexenvios.com.br')
    .trim()
    .toLowerCase()

  let criouOrg = false
  let [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isPlatform, true))
    .limit(1)

  if (!org) {
    const inseridas = await db
      .insert(organizations)
      .values({
        name: 'Nex Envios',
        slug: 'nex-envios',
        isPlatform: true,
        status: 'ativo',
        // A casa não cobra de si mesma: crédito alto para os testes internos.
        credits: '100000',
      })
      .returning({ id: organizations.id })
    org = inseridas[0]
    criouOrg = true
  }

  if (!org) throw new Error('Não foi possível criar a organização da plataforma.')

  const [existente] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existente) {
    return { orgId: org.id, email, senha: null, criouOrg, criouUsuario: false }
  }

  const senha = opcoes.senha ?? process.env.ADMIN_SENHA ?? gerarSenha(16)
  await db.insert(users).values({
    orgId: org.id,
    name: opcoes.nome ?? 'Administrador Nex',
    email,
    passwordHash: await gerarHash(senha),
    role: 'superadmin',
  })

  // Se a tabela de preços estiver vazia (banco criado sem a migration 0003),
  // preenche o padrão — a tela de preços não pode abrir sem nada.
  const precos = await db.select({ id: channelPrices.id }).from(channelPrices).limit(1)
  if (precos.length === 0) {
    await db.insert(channelPrices).values([
      { channel: 'whatsapp_oficial', price: '0.1200' },
      { channel: 'whatsapp_nao_oficial', price: '0.0400' },
      { channel: 'sms', price: '0.0700' },
      { channel: 'rcs', price: '0.1000' },
      { channel: 'voz', price: '0.0900' },
    ])
  }

  return { orgId: org.id, email, senha, criouOrg, criouUsuario: true }
}
