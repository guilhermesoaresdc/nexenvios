'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, organizations, users } from '@/db/schema'
import { criarLog } from '@/lib/log'
import { apagarCookieSessao, gravarCookieSessao, lerTokenSessao } from './cookies'
import { limparTentativas, registrarTentativa } from './limite'
import { TAMANHO_MINIMO_SENHA } from './regras'
import { conferirSenha, gerarHash } from './senha'
import { criarSessao, encerrarSessao, encerrarTodasAsSessoes, TTL_SESSAO_MS } from './sessao'
import { conferirToken, emitirToken, queimarToken } from './tokens'

const log = criarLog('auth')

export type EstadoDoFormulario = { erro?: string; ok?: string } | undefined

const entrada = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

async function origem(): Promise<{ ip: string; agente: string }> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'desconhecido'
  return { ip, agente: h.get('user-agent') ?? '' }
}

export async function entrar(
  _anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  const dados = entrada.safeParse({ email: form.get('email'), senha: form.get('senha') })
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? 'Confira os dados e tente de novo.' }
  }

  const { ip } = await origem()
  const { bloqueado } = registrarTentativa(`entrar:${ip}`)
  if (bloqueado) {
    return { erro: 'Tentativas demais. Espere alguns minutos antes de tentar de novo.' }
  }

  const [conta] = await db
    .select({
      id: users.id,
      hash: users.passwordHash,
      ativo: users.active,
      orgStatus: organizations.status,
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(eq(users.email, dados.data.email))
    .limit(1)

  /*
   * Mesma mensagem para "não existe" e "senha errada", e a verificação roda
   * mesmo sem conta: sem isso, o tempo de resposta diria a um atacante quais
   * e-mails estão cadastrados.
   */
  const confere = await conferirSenha(dados.data.senha, conta?.hash ?? null)
  if (!conta || !confere) {
    log.warn('entrada recusada', { ip })
    return { erro: 'E-mail ou senha não conferem.' }
  }
  if (!conta.ativo) return { erro: 'Esta conta está desativada. Fale com o administrador.' }
  if (conta.orgStatus === 'cancelado') {
    return { erro: 'Esta conta foi encerrada. Fale com o suporte da Nex Envios.' }
  }

  limparTentativas(`entrar:${ip}`)

  const { ip: enderecoIp, agente } = await origem()
  const { token } = await criarSessao(conta.id, { ip: enderecoIp, userAgent: agente })
  await gravarCookieSessao(token, new Date(Date.now() + TTL_SESSAO_MS))
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, conta.id))

  redirect('/painel')
}

export async function sair(): Promise<void> {
  const token = await lerTokenSessao()
  if (token) await encerrarSessao(token)
  await apagarCookieSessao()
  redirect('/entrar')
}

const pedido = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
})

/**
 * Pede um link de recuperação.
 *
 * A resposta é sempre a mesma, exista a conta ou não: a tela de recuperação
 * não pode virar um verificador de quais e-mails são clientes.
 */
export async function pedirRecuperacao(
  _anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  const dados = pedido.safeParse({ email: form.get('email') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'E-mail inválido.' }

  const { ip } = await origem()
  const { bloqueado } = registrarTentativa(`recuperar:${ip}`)
  if (bloqueado) return { erro: 'Pedidos demais. Espere alguns minutos.' }

  const [conta] = await db
    .select({ id: users.id, ativo: users.active })
    .from(users)
    .where(eq(users.email, dados.data.email))
    .limit(1)

  if (conta?.ativo) {
    const token = await emitirToken(conta.id, 'recuperacao')
    const { enviarEmailDeSenha } = await import('./email')
    await enviarEmailDeSenha(dados.data.email, token, 'recuperacao')
  }

  return {
    ok: 'Se este e-mail estiver cadastrado, o link de recuperação já está a caminho. Ele vale por uma hora.',
  }
}

const novaSenha = z
  .object({
    token: z.string().min(1),
    senha: z.string().min(TAMANHO_MINIMO_SENHA, `Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: 'As duas senhas não são iguais.',
    path: ['confirmacao'],
  })

export async function definirSenha(
  _anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  const dados = novaSenha.safeParse({
    token: form.get('token'),
    senha: form.get('senha'),
    confirmacao: form.get('confirmacao'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const conferido = await conferirToken(dados.data.token)
  if (!conferido.ok) {
    const { MOTIVO_DO_LINK } = await import('./regras')
    return { erro: MOTIVO_DO_LINK[conferido.motivo] ?? 'Este link não serve mais.' }
  }

  const hash = await gerarHash(dados.data.senha)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, conferido.userId))
  await queimarToken(dados.data.token)
  // Trocar a senha derruba tudo que estava aberto — inclusive a sessão de
  // quem eventualmente já estivesse dentro com a senha antiga.
  await encerrarTodasAsSessoes(conferido.userId)

  await db.insert(auditLog).values({
    userId: conferido.userId,
    action: 'senha.definida',
    entity: 'user',
    entityId: conferido.userId,
    meta: raw`jsonb_build_object('proposito', ${conferido.proposito}::text)`,
  })

  const { ip, agente } = await origem()
  const { token } = await criarSessao(conferido.userId, { ip, userAgent: agente })
  await gravarCookieSessao(token, new Date(Date.now() + TTL_SESSAO_MS))

  redirect('/painel')
}
