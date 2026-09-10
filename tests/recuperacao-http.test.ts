import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ pedir: vi.fn(), salvar: vi.fn(), limparCookie: vi.fn() }))
vi.mock('@/lib/auth/recuperacao', () => ({ solicitarRecuperacao: mocks.pedir, salvarNovaSenha: mocks.salvar }))
vi.mock('@/lib/auth/cookies', () => ({ apagarCookieSessao: mocks.limparCookie }))
import { POST as recuperar } from '@/app/api/auth/recuperar/route'
import { POST as definir } from '@/app/api/auth/definir-senha/route'

function request(origem: string) {
  return new Request('https://nex.example/api/auth/recuperar', {
    method: 'POST', headers: { Host: 'nex.example', Origin: origem },
    body: new URLSearchParams({ email: 'teste@example.test' }),
  })
}
beforeEach(() => { vi.resetAllMocks() })
it.each([recuperar, definir])('recusa solicitação externa antes de processar acesso', async (post) => {
  expect((await post(request('https://outro.example'))).status).toBe(403)
  expect(mocks.pedir).not.toHaveBeenCalled()
  expect(mocks.salvar).not.toHaveBeenCalled()
})
it('confirma alteração sem abrir uma sessão nem redirecionar ao painel', async () => {
  mocks.salvar.mockResolvedValue({ ok: 'Senha alterada.' })
  const resposta = await definir(request('https://nex.example'))
  expect(resposta.status).toBe(200)
  expect(await resposta.json()).toEqual({ ok: 'Senha alterada.' })
  expect(resposta.headers.get('location')).toBeNull()
  expect(resposta.headers.get('cache-control')).toBe('no-store')
  expect(mocks.limparCookie).toHaveBeenCalledOnce()
})
it('mantém cookie e informa falha quando a senha não foi alterada', async () => {
  mocks.salvar.mockResolvedValue({ erro: 'Link expirado.' })
  expect((await definir(request('https://nex.example'))).status).toBe(400)
  expect(mocks.limparCookie).not.toHaveBeenCalled()
})
