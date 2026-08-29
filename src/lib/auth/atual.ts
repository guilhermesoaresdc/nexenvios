import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { criarLog } from '@/lib/log'
import { lerTokenSessao } from './cookies'
import { validarSessao, type UsuarioAutenticado } from './sessao'

const log = criarLog('auth')

/**
 * O usuário da requisição atual.
 *
 * `cache` do React memoiza por requisição: layout, página e cada Server
 * Component podem chamar à vontade que a sessão é validada uma vez só.
 */
export const usuarioAtual = cache(async (): Promise<UsuarioAutenticado | null> => {
  const token = await lerTokenSessao()
  if (!token) return null
  try {
    return await validarSessao(token)
  } catch (erro) {
    /*
     * Banco fora do ar significa "não autenticado", nunca uma página de erro:
     * a própria tela de entrada chama esta função, e propagar a exceção
     * derrubaria justamente a tela onde o problema deveria ser explicado.
     */
    log.warn('não foi possível validar a sessão', {
      motivo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    return null
  }
})

export async function exigirUsuario(): Promise<UsuarioAutenticado> {
  const usuario = await usuarioAtual()
  if (!usuario) redirect('/entrar')
  return usuario
}

/** Administra a conta (dono do cliente ou time Nex). */
export async function exigirAdmin(): Promise<UsuarioAutenticado> {
  const usuario = await exigirUsuario()
  if (!usuario.isAdmin) redirect('/painel')
  return usuario
}

/**
 * Time Nex Envios — superadmin ou suporte. Porta de entrada do /admin.
 *
 * A restrição não depende do menu estar escondido: quem digitar /admin na
 * barra de endereços cai no painel do próprio cliente.
 */
export async function exigirTimeNex(): Promise<UsuarioAutenticado> {
  const usuario = await exigirUsuario()
  if (!usuario.isTimeNex) redirect('/painel')
  return usuario
}

/**
 * Só superadmin.
 *
 * Guarda o que move dinheiro (crédito, preço) e o que afeta todos os clientes
 * de uma vez (provedor da plataforma, criar e suspender cliente). Suporte que
 * cair aqui volta para /admin, que é uma tela que ele pode ver.
 */
export async function exigirSuperadmin(): Promise<UsuarioAutenticado> {
  const usuario = await exigirUsuario()
  if (!usuario.isSuperadmin) redirect('/admin')
  return usuario
}

/**
 * A mesma checagem, para dentro de uma server action.
 *
 * `exigirSuperadmin` redireciona, o que numa action vira uma navegação
 * silenciosa em vez de uma mensagem. Aqui o erro sobe e a tela explica.
 */
export function exigirPoderTotal(usuario: UsuarioAutenticado): void {
  if (!usuario.isSuperadmin) {
    throw new Error(
      'Esta ação é só para Administrador Nex. Seu acesso de suporte não move crédito nem configuração da plataforma.',
    )
  }
}

/** Quem só lê não escreve. Chamado no começo de toda server action. */
export function exigirEscrita(usuario: UsuarioAutenticado): void {
  if (usuario.isLeitor) {
    throw new Error('Seu acesso é somente leitura. Peça a um administrador para liberar.')
  }
}

export type { UsuarioAutenticado }
