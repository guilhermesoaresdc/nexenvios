import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ autenticar: vi.fn(), cookie: vi.fn() }))
vi.mock('@/lib/auth/entrada', async (original) => ({
  ...await original<typeof import('@/lib/auth/entrada')>(), autenticarEntrada: mocks.autenticar,
}))
vi.mock('@/lib/auth/cookies', () => ({ gravarCookieSessao: mocks.cookie }))
import { POST } from '@/app/api/auth/entrar/route'

function pedido(origem: string | null = 'https://nex.example', json = true) {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (origem) headers.Origin = origem
  if (json) headers.Accept = 'application/json'
  return new Request('https://nex.example/api/auth/entrar', {
    method: 'POST', headers, body: 'email=teste%40example.test&senha=Teste-ficticio',
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.autenticar.mockResolvedValue({ ok: true, token: 'segredo-ficticio', expiraEm: new Date(), destino: '/admin' })
  mocks.cookie.mockResolvedValue(undefined)
})
it('confirma o login sem renderizar o painel e não devolve o token no JSON', async () => {
  const resposta = await POST(pedido())
  expect(resposta.status).toBe(200)
  expect(await resposta.json()).toEqual({ destino: '/admin' })
  expect(resposta.headers.get('cache-control')).toBe('no-store')
  expect(mocks.cookie).toHaveBeenCalledOnce()
})
it.each([null, 'https://outro.example', 'null'])('recusa origem %s antes de autenticar', async (origem) => {
  expect((await POST(pedido(origem))).status).toBe(403)
  expect(mocks.autenticar).not.toHaveBeenCalled()
  expect(mocks.cookie).not.toHaveBeenCalled()
})
it('mantém entrada por formulário nativo sem JavaScript', async () => {
  const resposta = await POST(pedido('https://nex.example', false))
  expect(resposta.status).toBe(303)
  expect(resposta.headers.get('location')).toBe('/admin')
})
it('indisponibilidade é 503 e não grava sessão', async () => {
  mocks.autenticar.mockResolvedValue({ ok: false, codigo: 'temporario', erro: 'Tente novamente.' })
  const resposta = await POST(pedido())
  expect(resposta.status).toBe(503)
  expect(await resposta.json()).toEqual({ erro: 'Tente novamente.' })
  expect(mocks.cookie).not.toHaveBeenCalled()
})
it('erro nativo redireciona sem colocar e-mail ou senha na URL', async () => {
  mocks.autenticar.mockResolvedValue({ ok: false, codigo: 'credenciais', erro: 'E-mail ou senha não conferem.' })
  const resposta = await POST(pedido('https://nex.example', false))
  expect(resposta.headers.get('location')).toBe('/entrar?erro=credenciais')
  expect(mocks.cookie).not.toHaveBeenCalled()
})
