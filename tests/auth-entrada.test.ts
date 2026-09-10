import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const consulta = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn() }
  consulta.from.mockReturnValue(consulta)
  consulta.innerJoin.mockReturnValue(consulta)
  consulta.where.mockReturnValue(consulta)
  return {
    consulta,
    db: {
      select: vi.fn(() => consulta),
      update: vi.fn(() => ({ set: () => ({ where: async () => [] }) })),
    },
    confere: vi.fn(),
    criarSessao: vi.fn(),
    tentativas: new Map<string, number>(),
  }
})
vi.mock('@/db', () => ({ db: mocks.db }))
vi.mock('@/db/sessao-conexao', () => ({
  comBancoDeSessao: async (executar: (db: typeof mocks.db) => Promise<unknown>) => executar(mocks.db),
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.10' }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith('redirect:')) throw e
  },
}))
vi.mock('@/lib/auth/senha', () => ({ conferirSenha: mocks.confere, gerarHash: vi.fn() }))
vi.mock('@/lib/auth/sessao', () => ({
  criarSessao: mocks.criarSessao,
  encerrarSessao: vi.fn(),
  TTL_SESSAO_MS: 10000,
}))
vi.mock('@/lib/auth/tokens', () => ({ consumirTokenDeSenha: vi.fn(), emitirToken: vi.fn() }))
vi.mock('@/lib/auth/cookies', () => ({
  gravarCookieSessao: vi.fn(),
  apagarCookieSessao: vi.fn(),
  lerTokenSessao: vi.fn(),
}))
vi.mock('@/lib/auth/limite', () => ({
  registrarTentativa: async (chave: string) => {
    const n = (mocks.tentativas.get(chave) ?? 0) + 1
    mocks.tentativas.set(chave, n)
    return { bloqueado: n > 10, restam: Math.max(0, 10 - n) }
  },
  limparTentativas: async (chave: string) => {
    mocks.tentativas.delete(chave)
  },
}))
import { entrar } from '@/lib/auth/acoes'

function formulario(email: string) {
  const form = new FormData()
  form.set('email', email)
  form.set('senha', 'SenhaTeste12345')
  return form
}
describe('entrada única', () => {
  beforeEach(() => {
    mocks.tentativas.clear()
    mocks.criarSessao.mockClear().mockResolvedValue({ token: 'sessao-ficticia', sessao: { expiresAt: new Date(Date.now() + 10000) } })
    mocks.confere.mockReset().mockResolvedValue(true)
    mocks.consulta.limit.mockResolvedValue([
      {
        id: 'usuario',
        hash: 'hash-ficticio',
        ativo: true,
        orgStatus: 'ativo',
        papel: 'admin',
        plataforma: false,
      },
    ])
  })
  it('permite mais de dez logins válidos pela mesma rede', async () => {
    for (let n = 0; n < 12; n++) {
      await expect(entrar(undefined, formulario(`pessoa${n}@example.test`))).rejects.toThrow(
        'redirect:/painel',
      )
    }
    expect(mocks.criarSessao).toHaveBeenCalledTimes(12)
  })
  it.each([
    { papel: 'superadmin', plataforma: true, destino: '/admin' },
    { papel: 'suporte', plataforma: true, destino: '/admin' },
    { papel: 'admin', plataforma: false, destino: '/painel' },
    { papel: 'superadmin', plataforma: false, destino: '/painel' },
  ])('direciona $papel (plataforma: $plataforma) para $destino', async ({ papel, plataforma, destino }) => {
    mocks.consulta.limit.mockResolvedValue([
      { id: 'usuario', hash: 'hash-ficticio', ativo: true, orgStatus: 'ativo', papel, plataforma },
    ])
    await expect(entrar(undefined, formulario('pessoa@example.test'))).rejects.toThrow(
      `redirect:${destino}`,
    )
    expect(mocks.criarSessao).toHaveBeenCalledTimes(1)
  })
  it('mantém o bloqueio da origem para tentativas inválidas', async () => {
    mocks.confere.mockResolvedValue(false)
    for (let n = 0; n < 10; n++) {
      expect((await entrar(undefined, formulario(`pessoa${n}@example.test`)))?.erro).toBe(
        'E-mail ou senha não conferem.',
      )
    }
    mocks.confere.mockResolvedValue(true)
    expect((await entrar(undefined, formulario('outra@example.test')))?.erro).toContain(
      'Tentativas demais',
    )
    expect(mocks.criarSessao).not.toHaveBeenCalled()
  })
})
