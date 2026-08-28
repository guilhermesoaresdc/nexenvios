import 'server-only'
import { cookies } from 'next/headers'
import { COOKIE_SESSAO } from './sessao'

export async function gravarCookieSessao(token: string, expiraEm: Date): Promise<void> {
  const loja = await cookies()
  loja.set(COOKIE_SESSAO, token, {
    // Inacessível ao JavaScript da página: um XSS não rouba a sessão.
    httpOnly: true,
    // 'lax' deixa o cookie viajar na navegação normal mas não num POST vindo
    // de outro site — é a proteção base contra CSRF.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  })
}

export async function apagarCookieSessao(): Promise<void> {
  const loja = await cookies()
  loja.set(COOKIE_SESSAO, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function lerTokenSessao(): Promise<string | null> {
  const loja = await cookies()
  return loja.get(COOKIE_SESSAO)?.value ?? null
}
