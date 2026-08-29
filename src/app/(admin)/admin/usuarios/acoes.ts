'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { userRoleEnum } from '@/db/schema/enums'
import { exigirTimeNex } from '@/lib/auth/atual'
import {
  alternarAtivo as alternar,
  criarUsuario,
  definirSenhaDe,
  gerarLinkDeAcesso,
  removerUsuario,
  trocarPapel,
} from '@/lib/acessos/servico'

/**
 * As ações de acesso do painel da Nex.
 *
 * Cada uma é fina de propósito: valida a entrada, chama o serviço e revalida a
 * tela. As travas de quem-pode-o-quê moram todas em `lib/acessos/servico.ts` —
 * espalhá-las aqui seria a forma mais fácil de esquecer uma.
 */

export type Estado =
  | { erro?: string; ok?: string; senha?: string; link?: string; email?: string }
  | undefined

function atualizar() {
  revalidatePath('/admin/usuarios')
  revalidatePath('/admin/equipe')
  revalidatePath('/admin/clientes')
}

const novo = z.object({
  orgId: z.string().uuid('Escolha a conta.'),
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  papel: z.enum(userRoleEnum.enumValues),
  acesso: z.enum(['convite', 'senha']),
  senha: z.string().max(200).optional().or(z.literal('')),
})

export async function criarAcesso(_anterior: Estado, form: FormData): Promise<Estado> {
  const autor = await exigirTimeNex()

  const dados = novo.safeParse({
    orgId: form.get('orgId'),
    nome: form.get('nome'),
    email: form.get('email'),
    papel: form.get('papel'),
    acesso: form.get('acesso') || 'convite',
    senha: form.get('senha') ?? '',
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const r = await criarUsuario(autor, {
    orgId: dados.data.orgId,
    nome: dados.data.nome,
    email: dados.data.email,
    papel: dados.data.papel,
    acesso: dados.data.acesso,
    senha: dados.data.senha || undefined,
  })

  if (!r.ok) return { erro: r.erro }
  atualizar()

  return r.valor.senha
    ? {
        ok: 'Acesso criado. A senha aparece uma única vez — copie agora.',
        senha: r.valor.senha,
        email: r.valor.email,
      }
    : {
        ok: r.valor.emailEnviado
          ? 'Convite enviado por e-mail.'
          : 'Acesso criado. Mande o link abaixo para a pessoa.',
        link: r.valor.link,
        email: r.valor.email,
      }
}

const senhaNova = z.object({
  usuarioId: z.string().uuid(),
  senha: z.string().max(200).optional().or(z.literal('')),
})

export async function definirSenha(_anterior: Estado, form: FormData): Promise<Estado> {
  const autor = await exigirTimeNex()

  const dados = senhaNova.safeParse({
    usuarioId: form.get('usuarioId'),
    senha: form.get('senha') ?? '',
  })
  if (!dados.success) return { erro: 'Dados inválidos.' }

  const r = await definirSenhaDe(autor, dados.data.usuarioId, dados.data.senha || undefined)
  if (!r.ok) return { erro: r.erro }

  atualizar()
  return {
    ok: 'Senha definida. Ela aparece uma única vez — copie e entregue à pessoa.',
    senha: r.valor.senha,
    email: r.valor.email,
  }
}

export async function reenviarLink(_anterior: Estado, form: FormData): Promise<Estado> {
  const autor = await exigirTimeNex()
  const usuarioId = String(form.get('usuarioId') ?? '')

  const r = await gerarLinkDeAcesso(autor, usuarioId)
  if (!r.ok) return { erro: r.erro }

  atualizar()
  return {
    ok: r.valor.enviado ? 'Link enviado por e-mail.' : 'Link gerado. Mande para a pessoa.',
    link: r.valor.link,
    email: r.valor.email,
  }
}

const papelNovo = z.object({
  usuarioId: z.string().uuid(),
  papel: z.enum(userRoleEnum.enumValues),
})

export async function mudarPapel(_anterior: Estado, form: FormData): Promise<Estado> {
  const autor = await exigirTimeNex()

  const dados = papelNovo.safeParse({
    usuarioId: form.get('usuarioId'),
    papel: form.get('papel'),
  })
  if (!dados.success) return { erro: 'Papel inválido.' }

  const r = await trocarPapel(autor, dados.data.usuarioId, dados.data.papel)
  if (!r.ok) return { erro: r.erro }

  atualizar()
  return { ok: 'Papel atualizado.' }
}

export async function alternarAtivo(usuarioId: string, ativar: boolean): Promise<Estado> {
  const autor = await exigirTimeNex()
  const r = await alternar(autor, usuarioId, ativar)
  if (!r.ok) return { erro: r.erro }
  atualizar()
  return { ok: ativar ? 'Usuário reativado.' : 'Usuário desativado e sessões encerradas.' }
}

export async function remover(usuarioId: string): Promise<Estado> {
  const autor = await exigirTimeNex()
  const r = await removerUsuario(autor, usuarioId)
  if (!r.ok) return { erro: r.erro }
  atualizar()
  return { ok: 'Usuário removido.' }
}
