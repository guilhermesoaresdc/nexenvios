'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, organizations } from '@/db/schema'
import { exigirAdmin, exigirEscrita, exigirUsuario } from '@/lib/auth/atual'
import {
  criarUsuario,
  gerarLinkDeAcesso,
  trocarPapel,
  alternarAtivo as alternarAcesso,
} from '@/lib/acessos/servico'
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

  const r = await criarUsuario(usuario, {
    orgId: usuario.orgId,
    nome: dados.data.nome,
    email: dados.data.email,
    papel: dados.data.papel,
    acesso: 'convite',
  })
  if (!r.ok) return { erro: r.erro }
  revalidatePath('/configuracoes/equipe')
  return {
    ok: r.valor.emailEnviado ? 'Convite enviado.' : 'Acesso criado. Copie o link.',
    link: r.valor.link,
  }
}

export async function reenviarConvite(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const id = z.string().uuid().safeParse(form.get('usuarioId'))
  if (!id.success) return { erro: 'Usuário inválido.' }
  const r = await gerarLinkDeAcesso(usuario, id.data)
  if (!r.ok) return { erro: r.erro }
  return {
    ok: r.valor.enviado ? 'Convite reenviado.' : 'Link gerado. Copie abaixo.',
    link: r.valor.link,
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

  const r = await trocarPapel(usuario, dados.data.usuarioId, dados.data.papel)
  if (!r.ok) return { erro: r.erro }
  revalidatePath('/configuracoes/equipe')
  return { ok: 'Papel atualizado.' }
}

export async function alternarAtivo(usuarioId: string, ativar: boolean): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)
  if (!z.string().uuid().safeParse(usuarioId).success || typeof ativar !== 'boolean')
    return { erro: 'Dados inválidos.' }
  const r = await alternarAcesso(usuario, usuarioId, ativar)
  if (!r.ok) return { erro: r.erro }
  revalidatePath('/configuracoes/equipe')
  return { ok: ativar ? 'Usuário reativado.' : 'Usuário desativado.' }
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
