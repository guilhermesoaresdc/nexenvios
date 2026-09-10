'use server'

import { headers } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'
import { criarLog } from '@/lib/log'
import { apagarCookieSessao, gravarCookieSessao, lerTokenSessao } from './cookies'
import { encerrarSessao } from './sessao'
import { solicitarRecuperacao, salvarNovaSenha } from './recuperacao'
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
    return await solicitarRecuperacao(form, (await origem()).ip)
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
    const resultado = await salvarNovaSenha(form, (await origem()).ip)
    if (resultado.ok) {
      await apagarCookieSessao()
      // POST nativo não deve renderizar novamente o link já consumido.
      redirect('/entrar?senha=alterada')
    }
    return resultado
  } catch (erro) {
    unstable_rethrow(erro)
    log.error('falha temporária na autenticação', { operacao: 'definirSenha' })
    return { erro: 'Não foi possível concluir agora. Tente novamente em instantes.' }
  }
}
