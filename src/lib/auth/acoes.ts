'use server'

import { headers } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/schema'
import { criarLog } from '@/lib/log'
import { apagarCookieSessao, gravarCookieSessao, lerTokenSessao } from './cookies'
import { registrarTentativa } from './limite'
import { TAMANHO_MINIMO_SENHA } from './regras'
import { gerarHash } from './senha'
import { criarSessao, encerrarSessao, TTL_SESSAO_MS } from './sessao'
import { consumirTokenDeSenha, emitirToken } from './tokens'
import { autenticarEntrada } from './entrada'

const log = criarLog('auth')

export type EstadoDoFormulario = { erro?: string; ok?: string } | undefined

async function origem(): Promise<{ ip: string; agente: string }> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'desconhecido'
  return { ip, agente: h.get('user-agent') ?? '' }
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
async function pedirRecuperacaoInterno(
  _anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  const dados = pedido.safeParse({ email: form.get('email') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'E-mail inválido.' }

  const { ip } = await origem()
  const { bloqueado } = await registrarTentativa(`recuperar:${ip}`)
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
    ok: 'Se o e-mail estiver cadastrado e a conta estiver ativa, você receberá um link válido por uma hora. Confira também o spam. Se não chegar, fale com o administrador da sua conta.',
  }
}

const novaSenha = z
  .object({
    token: z.string().min(1).max(200),
    senha: z
      .string()
      .max(200)
      .min(TAMANHO_MINIMO_SENHA, `Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: 'As duas senhas não são iguais.',
    path: ['confirmacao'],
  })

async function definirSenhaInterno(
  _anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  const dados = novaSenha.safeParse({
    token: form.get('token'),
    senha: form.get('senha'),
    confirmacao: form.get('confirmacao'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const { ip: endereco } = await origem()
  if ((await registrarTentativa(`senha:${endereco}`)).bloqueado)
    return { erro: 'Tentativas demais. Espere alguns minutos.' }
  const conferido = await consumirTokenDeSenha(dados.data.token, await gerarHash(dados.data.senha))
  if (!conferido.ok) {
    const { MOTIVO_DO_LINK } = await import('./regras')
    return { erro: MOTIVO_DO_LINK[conferido.motivo] ?? 'Este link não serve mais.' }
  }

  const { ip, agente } = await origem()
  const { token } = await criarSessao(conferido.userId, { ip, userAgent: agente })
  await gravarCookieSessao(token, new Date(Date.now() + TTL_SESSAO_MS))

  redirect('/entrar')
}

export async function entrar(
  anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  try {
    const resultado = await autenticarEntrada(form, await origem())
    if (!resultado.ok) return { erro: resultado.erro }
    await gravarCookieSessao(resultado.token, resultado.expiraEm)
    redirect(resultado.destino)
  } catch (erro) {
    unstable_rethrow(erro)
    log.error('falha temporária na autenticação', { operacao: 'entrar' })
    return { erro: 'Não foi possível concluir agora. Tente novamente em instantes.' }
  }
}

export async function pedirRecuperacao(
  anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  try {
    return await pedirRecuperacaoInterno(anterior, form)
  } catch (erro) {
    unstable_rethrow(erro)
    log.error('falha temporária na autenticação', { operacao: 'pedirRecuperacao' })
    return { erro: 'Não foi possível concluir agora. Tente novamente em instantes.' }
  }
}

export async function definirSenha(
  anterior: EstadoDoFormulario,
  form: FormData,
): Promise<EstadoDoFormulario> {
  try {
    return await definirSenhaInterno(anterior, form)
  } catch (erro) {
    unstable_rethrow(erro)
    log.error('falha temporária na autenticação', { operacao: 'definirSenha' })
    return { erro: 'Não foi possível concluir agora. Tente novamente em instantes.' }
  }
}
