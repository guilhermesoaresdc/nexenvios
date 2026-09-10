import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
const cenario = process.env.DATABASE_URL ? describe : describe.skip
cenario('autenticação e isolamento de acesso', () => {
  let banco: typeof import('@/db')
  let schema: typeof import('@/db/schema')
  let auth: typeof import('@/lib/auth/sessao')
  let tokens: typeof import('@/lib/auth/tokens')
  let acesso: typeof import('@/lib/acessos/servico')
  let orgId: string
  let userId: string
  let token: string
  beforeAll(async () => {
    banco = await import('@/db')
    schema = await import('@/db/schema')
    auth = await import('@/lib/auth/sessao')
    tokens = await import('@/lib/auth/tokens')
    acesso = await import('@/lib/acessos/servico')
    const [org] = await banco.db
      .insert(schema.organizations)
      .values({ name: 'Teste acesso', slug: `auth-${Date.now()}` })
      .returning()
    orgId = org!.id
    const [user] = await banco.db
      .insert(schema.users)
      .values({ orgId, name: 'Teste', email: `auth-${Date.now()}@example.test`, role: 'admin' })
      .returning()
    userId = user!.id
    token = (await auth.criarSessao(userId)).token
  })
  afterAll(async () => {
    if (orgId) await banco.db.delete(schema.organizations).where(eq(schema.organizations.id, orgId))
  })
  it('papel Nex fora da organização interna não dá poder global', async () => {
    await banco.db
      .update(schema.users)
      .set({ role: 'superadmin' })
      .where(eq(schema.users.id, userId))
    const user = await auth.validarSessao(token)
    expect(user?.isSuperadmin).toBe(false)
    expect(user?.isTimeNex).toBe(false)
    await banco.db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId))
  })
  it('operador não pode trocar senha, gerar convite nem desativar colega pelo serviço', async () => {
    const user = (await auth.validarSessao(token))!
    const operador = { ...user, role: 'operador' as const, isAdmin: false }
    expect((await acesso.definirSenhaDe(operador, userId, 'senha-forte-para-teste')).ok).toBe(false)
    expect((await acesso.gerarLinkDeAcesso(operador, userId)).ok).toBe(false)
    expect((await acesso.alternarAtivo(operador, userId, false)).ok).toBe(false)
  })
  it('nova recuperação invalida também convite anterior', async () => {
    const antigo = await tokens.emitirToken(userId, 'convite')
    const novo = await tokens.emitirToken(userId, 'recuperacao')
    expect((await tokens.conferirToken(antigo)).ok).toBe(false)
    expect((await tokens.conferirToken(novo)).ok).toBe(true)
  })
  it('token consumido não pode redefinir a senha outra vez e revoga sessões', async () => {
    const novo = await tokens.emitirToken(userId, 'recuperacao')
    const senha = await import('@/lib/auth/senha')
    expect(
      (await tokens.consumirTokenDeSenha(novo, await senha.gerarHash('SenhaPrimeira123'))).ok,
    ).toBe(true)
    expect(
      (await tokens.consumirTokenDeSenha(novo, await senha.gerarHash('SenhaSegunda123'))).ok,
    ).toBe(false)
    expect(await auth.validarSessao(token)).toBeNull()
    const [user] = await banco.db.select().from(schema.users).where(eq(schema.users.id, userId))
    expect(await senha.conferirSenha('SenhaPrimeira123', user!.passwordHash)).toBe(true)
  })
  it('cancelamento da empresa invalida sessão e recuperação', async () => {
    const sessao = await auth.criarSessao(userId)
    const link = await tokens.emitirToken(userId, 'recuperacao')
    await banco.db
      .update(schema.organizations)
      .set({ status: 'cancelado' })
      .where(eq(schema.organizations.id, orgId))
    expect(await auth.validarSessao(sessao.token)).toBeNull()
    expect((await tokens.conferirToken(link)).ok).toBe(false)
  })
  it('limite persiste em banco e expira', async () => {
    const limite = await import('@/lib/auth/limite')
    const chave = `teste-${Date.now()}`
    for (let i = 0; i < 10; i++)
      expect((await limite.registrarTentativa(chave)).bloqueado).toBe(false)
    expect((await limite.registrarTentativa(chave)).bloqueado).toBe(true)
    await limite.limparTentativas(chave)
    expect((await limite.registrarTentativa(chave)).bloqueado).toBe(false)
  })
})
