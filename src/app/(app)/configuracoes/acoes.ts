'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, organizations, users } from '@/db/schema'
import { exigirAdmin, exigirEscrita, exigirUsuario } from '@/lib/auth/atual'
import { enviarEmailDeSenha } from '@/lib/auth/email'
import { encerrarTodasAsSessoes } from '@/lib/auth/sessao'
import { emitirToken } from '@/lib/auth/tokens'
import { criarChave, revogarChave, ESCOPOS, type Escopo } from '@/lib/api/chave'

export type Estado = { erro?: string; ok?: string; link?: string; chave?: string } | undefined

// ────────────────────────────────────────────────────────────── conta

const conta = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da empresa.').max(120),
  documento: z.string().trim().max(30).optional().or(z.literal('')),
  contatoNome: z.string().trim().max(120).optional().or(z.literal('')),
  contatoEmail: z.string().trim().toLowerCase().email('E-mail inválido.').or(z.literal('')),
  contatoTelefone: z.string().trim().max(30).optional().or(z.literal('')),
  fuso: z.string().trim().min(3).max(60),
})

export async function salvarConta(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = conta.safeParse({
    nome: form.get('nome'),
    documento: form.get('documento') ?? '',
    contatoNome: form.get('contatoNome') ?? '',
    contatoEmail: form.get('contatoEmail') ?? '',
    contatoTelefone: form.get('contatoTelefone') ?? '',
    fuso: form.get('fuso') || 'America/Sao_Paulo',
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  await db
    .update(organizations)
    .set({
      name: dados.data.nome,
      document: dados.data.documento || null,
      contactName: dados.data.contatoNome || null,
      contactEmail: dados.data.contatoEmail || null,
      contactPhone: dados.data.contatoTelefone || null,
      timezone: dados.data.fuso,
    })
    .where(eq(organizations.id, usuario.orgId))

  revalidatePath('/configuracoes')
  return { ok: 'Dados salvos.' }
}

// ───────────────────────────────────────────────────────────── equipe

const convite = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  // `superadmin` fora de propósito: é papel do time Nex, e o cliente não
  // pode se promover a ele por um campo de formulário.
  papel: z.enum(['admin', 'operador', 'visualizador']),
})

export async function convidar(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = convite.safeParse({
    nome: form.get('nome'),
    email: form.get('email'),
    papel: form.get('papel'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const [jaExiste] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, dados.data.email))
    .limit(1)
  if (jaExiste) return { erro: 'Já existe um usuário com este e-mail.' }

  const [novo] = await db
    .insert(users)
    .values({
      orgId: usuario.orgId,
      name: dados.data.nome,
      email: dados.data.email,
      role: dados.data.papel,
      passwordHash: null,
    })
    .returning({ id: users.id })

  if (!novo) return { erro: 'Não foi possível criar o usuário.' }

  const token = await emitirToken(novo.id, 'convite')
  const envio = await enviarEmailDeSenha(dados.data.email, token, 'convite')

  await db.insert(auditLog).values({
    orgId: usuario.orgId,
    userId: usuario.id,
    action: 'usuario.convidado',
    entity: 'user',
    entityId: novo.id,
    meta: { papel: dados.data.papel },
  })

  revalidatePath('/configuracoes/equipe')
  return {
    ok: envio.enviado ? 'Convite enviado por e-mail.' : 'Usuário criado. Copie o link abaixo.',
    link: envio.link,
  }
}

export async function reenviarConvite(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const id = String(form.get('usuarioId') ?? '')
  const [alvo] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, usuario.orgId)))
    .limit(1)

  if (!alvo) return { erro: 'Usuário não encontrado.' }

  const token = await emitirToken(alvo.id, 'convite')
  const envio = await enviarEmailDeSenha(alvo.email, token, 'convite')

  return {
    ok: envio.enviado ? 'Convite reenviado.' : 'Link gerado. Copie abaixo.',
    link: envio.link,
  }
}

const mudanca = z.object({
  usuarioId: z.string().uuid(),
  papel: z.enum(['admin', 'operador', 'visualizador']),
})

export async function mudarPapel(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = mudanca.safeParse({
    usuarioId: form.get('usuarioId'),
    papel: form.get('papel'),
  })
  if (!dados.success) return { erro: 'Papel inválido.' }

  /*
   * Um administrador não se rebaixa. Sem esta trava, o único admin da conta
   * pode se tornar operador e a empresa fica sem ninguém que consiga liberar
   * canal, equipe ou chave de API — e a saída vira chamado de suporte.
   */
  if (dados.data.usuarioId === usuario.id) {
    return { erro: 'Você não pode mudar o próprio papel. Peça a outro administrador.' }
  }

  await db
    .update(users)
    .set({ role: dados.data.papel })
    .where(and(eq(users.id, dados.data.usuarioId), eq(users.orgId, usuario.orgId)))

  revalidatePath('/configuracoes/equipe')
  return { ok: 'Papel atualizado.' }
}

export async function alternarAtivo(usuarioId: string, ativar: boolean): Promise<void> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  if (usuarioId === usuario.id) return

  await db
    .update(users)
    .set({ active: ativar })
    .where(and(eq(users.id, usuarioId), eq(users.orgId, usuario.orgId)))

  // Desativar derruba as sessões abertas na hora; esperar o cookie vencer
  // deixaria a pessoa dentro por até trinta dias.
  if (!ativar) await encerrarTodasAsSessoes(usuarioId)

  revalidatePath('/configuracoes/equipe')
}

/** Quantos administradores ativos a conta ainda tem além deste. */
export async function outrosAdmins(orgId: string, exceto: string): Promise<number> {
  const linhas = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.role, 'admin'),
        eq(users.active, true),
        ne(users.id, exceto),
      ),
    )
  return linhas.length
}

// ───────────────────────────────────────────────────────── chaves API

const novaChave = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à chave.').max(60),
})

export async function gerarChave(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = novaChave.safeParse({ nome: form.get('nome') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira o nome.' }

  const escopos = ESCOPOS.filter((e) => form.get(`escopo:${e}`) === 'on') as Escopo[]
  const criada = await criarChave(usuario.orgId, usuario.id, dados.data.nome, escopos)

  await db.insert(auditLog).values({
    orgId: usuario.orgId,
    userId: usuario.id,
    action: 'chave.criada',
    entity: 'api_key',
    entityId: criada.id,
  })

  revalidatePath('/configuracoes/api')
  return {
    ok: 'Chave criada. Ela aparece uma única vez — copie agora.',
    chave: criada.chave,
  }
}

export async function revogar(chaveId: string): Promise<void> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  await revogarChave(usuario.orgId, chaveId)
  await db.insert(auditLog).values({
    orgId: usuario.orgId,
    userId: usuario.id,
    action: 'chave.revogada',
    entity: 'api_key',
    entityId: chaveId,
  })

  revalidatePath('/configuracoes/api')
}

/** Usada pela tela de conta para mostrar o próprio extrato do cliente. */
export async function meuOrgId(): Promise<string> {
  const usuario = await exigirUsuario()
  return usuario.orgId
}
