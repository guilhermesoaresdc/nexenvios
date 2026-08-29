import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { UsuarioAutenticado } from '@/lib/auth/sessao'

/**
 * As travas da gestão de acesso, contra um banco de verdade.
 *
 * O que se testa aqui não é a tela: é quem-pode-o-quê. Uma trava esquecida
 * neste arquivo é alguém se promovendo a dono da plataforma por um campo de
 * formulário, ou uma conta ficando sem administrador nenhum.
 */

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

cenario('gestão de acesso', () => {
  let db: typeof import('@/db')['db']
  let esquema: typeof import('@/db/schema')
  let acessos: typeof import('@/lib/acessos/servico')
  let senha: typeof import('@/lib/auth/senha')

  let orgCliente: string
  let orgPlataforma: string
  let superadmin: UsuarioAutenticado
  let suporte: UsuarioAutenticado
  let adminDoCliente: UsuarioAutenticado

  const marca = Math.floor(Date.now() / 1000)

  function comoUsuario(
    id: string,
    orgId: string,
    papel: 'superadmin' | 'suporte' | 'admin',
  ): UsuarioAutenticado {
    const isSuperadmin = papel === 'superadmin'
    const isTimeNex = isSuperadmin || papel === 'suporte'
    return {
      id,
      name: papel,
      email: `${papel}@teste.local`,
      role: papel,
      isSuperadmin,
      isTimeNex,
      isAdmin: isTimeNex || papel === 'admin',
      isLeitor: false,
      homeOrgId: orgId,
      orgId,
      orgName: 'teste',
      orgSlug: 'teste',
      orgStatus: 'ativo',
      timezone: 'America/Sao_Paulo',
      credits: '0',
      personificando: false,
    }
  }

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY ??= '0'.repeat(64)
    const banco = await import('@/db')
    db = banco.db
    esquema = await import('@/db/schema')
    acessos = await import('@/lib/acessos/servico')
    senha = await import('@/lib/auth/senha')

    const [plataforma] = await db
      .insert(esquema.organizations)
      .values({ name: 'Nex teste', slug: `nex-teste-${marca}`, isPlatform: false })
      .returning({ id: esquema.organizations.id })
    orgPlataforma = plataforma!.id

    const [cliente] = await db
      .insert(esquema.organizations)
      .values({ name: 'Cliente teste', slug: `cliente-teste-${marca}` })
      .returning({ id: esquema.organizations.id })
    orgCliente = cliente!.id

    const [sa] = await db
      .insert(esquema.users)
      .values({
        orgId: orgPlataforma,
        name: 'Super',
        email: `super-${marca}@teste.local`,
        role: 'superadmin',
      })
      .returning({ id: esquema.users.id })
    superadmin = comoUsuario(sa!.id, orgPlataforma, 'superadmin')

    const [su] = await db
      .insert(esquema.users)
      .values({
        orgId: orgPlataforma,
        name: 'Suporte',
        email: `suporte-${marca}@teste.local`,
        role: 'suporte',
      })
      .returning({ id: esquema.users.id })
    suporte = comoUsuario(su!.id, orgPlataforma, 'suporte')

    const [ad] = await db
      .insert(esquema.users)
      .values({
        orgId: orgCliente,
        name: 'Admin do cliente',
        email: `admin-${marca}@teste.local`,
        role: 'admin',
      })
      .returning({ id: esquema.users.id })
    adminDoCliente = comoUsuario(ad!.id, orgCliente, 'admin')
  })

  afterAll(async () => {
    for (const id of [orgCliente, orgPlataforma]) {
      if (id) await db.delete(esquema.organizations).where(eq(esquema.organizations.id, id))
    }
  })

  it('cria acesso com senha definida na hora, e a senha confere', async () => {
    const r = await acessos.criarUsuario(superadmin, {
      orgId: orgCliente,
      nome: 'Operador Um',
      email: `op1-${marca}@teste.local`,
      papel: 'operador',
      acesso: 'senha',
      senha: 'senhaDoTeste123',
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.senha).toBe('senhaDoTeste123')

    const [gravado] = await db
      .select({ hash: esquema.users.passwordHash })
      .from(esquema.users)
      .where(eq(esquema.users.id, r.valor.usuarioId))

    // O que vai para o banco é hash, e ele valida a senha entregue.
    expect(gravado?.hash).not.toContain('senhaDoTeste123')
    expect(await senha.conferirSenha('senhaDoTeste123', gravado!.hash)).toBe(true)
  })

  it('gera senha forte quando nenhuma é informada', async () => {
    const r = await acessos.criarUsuario(superadmin, {
      orgId: orgCliente,
      nome: 'Operador Dois',
      email: `op2-${marca}@teste.local`,
      papel: 'operador',
      acesso: 'senha',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.senha!.length).toBeGreaterThanOrEqual(12)
  })

  it('cria acesso por convite sem senha nenhuma no banco', async () => {
    const r = await acessos.criarUsuario(superadmin, {
      orgId: orgCliente,
      nome: 'Convidado',
      email: `convidado-${marca}@teste.local`,
      papel: 'visualizador',
      acesso: 'convite',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.link).toContain('/definir-senha/')

    const [gravado] = await db
      .select({ hash: esquema.users.passwordHash })
      .from(esquema.users)
      .where(eq(esquema.users.id, r.valor.usuarioId))
    expect(gravado?.hash).toBeNull()
  })

  it('recusa e-mail repetido', async () => {
    const r = await acessos.criarUsuario(superadmin, {
      orgId: orgCliente,
      nome: 'Outro',
      email: `op1-${marca}@teste.local`,
      papel: 'operador',
      acesso: 'convite',
    })
    expect(r.ok).toBe(false)
  })

  it('SUPORTE não concede papel do time Nex', async () => {
    const r = await acessos.criarUsuario(suporte, {
      orgId: orgPlataforma,
      nome: 'Tentativa',
      email: `tentativa-${marca}@teste.local`,
      papel: 'superadmin',
      acesso: 'senha',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain('Administrador Nex')
  })

  it('ADMIN DE CLIENTE não se promove a superadmin', async () => {
    // A trava que impede o cliente de virar dono da plataforma por um campo
    // de formulário.
    const r = await acessos.criarUsuario(adminDoCliente, {
      orgId: adminDoCliente.orgId,
      nome: 'Escalada',
      email: `escalada-${marca}@teste.local`,
      papel: 'superadmin',
      acesso: 'senha',
    })
    expect(r.ok).toBe(false)
  })

  it('ADMIN DE CLIENTE não cria usuário em outra conta', async () => {
    const r = await acessos.criarUsuario(adminDoCliente, {
      orgId: orgPlataforma,
      nome: 'Intruso',
      email: `intruso-${marca}@teste.local`,
      papel: 'operador',
      acesso: 'senha',
    })
    expect(r.ok).toBe(false)
  })

  it('suporte define senha de usuário de cliente, mas não do time Nex', async () => {
    const [alvo] = await db
      .select({ id: esquema.users.id })
      .from(esquema.users)
      .where(eq(esquema.users.email, `op1-${marca}@teste.local`))

    const doCliente = await acessos.definirSenhaDe(suporte, alvo!.id)
    expect(doCliente.ok).toBe(true)

    const daNex = await acessos.definirSenhaDe(suporte, superadmin.id)
    expect(daNex.ok).toBe(false)
  })

  it('ninguém muda o próprio papel nem se desativa', async () => {
    expect((await acessos.trocarPapel(superadmin, superadmin.id, 'suporte')).ok).toBe(false)
    expect((await acessos.alternarAtivo(superadmin, superadmin.id, false)).ok).toBe(false)
    expect((await acessos.removerUsuario(superadmin, superadmin.id)).ok).toBe(false)
  })

  it('o último administrador ativo da conta não cai', async () => {
    // Rebaixar ou desativar deixaria a conta sem ninguém que consiga liberar
    // canal, equipe ou chave — e a saída viraria chamado de suporte.
    expect((await acessos.trocarPapel(superadmin, adminDoCliente.id, 'operador')).ok).toBe(false)
    expect((await acessos.alternarAtivo(superadmin, adminDoCliente.id, false)).ok).toBe(false)

    // Com um segundo administrador, passa.
    const segundo = await acessos.criarUsuario(superadmin, {
      orgId: orgCliente,
      nome: 'Segundo admin',
      email: `admin2-${marca}@teste.local`,
      papel: 'admin',
      acesso: 'senha',
    })
    expect(segundo.ok).toBe(true)

    expect((await acessos.trocarPapel(superadmin, adminDoCliente.id, 'operador')).ok).toBe(true)
  })

  it('desativar encerra as sessões abertas na hora', async () => {
    const sessao = await import('@/lib/auth/sessao')
    const [alvo] = await db
      .select({ id: esquema.users.id })
      .from(esquema.users)
      .where(eq(esquema.users.email, `op2-${marca}@teste.local`))

    await sessao.criarSessao(alvo!.id)
    const antes = await db
      .select({ id: esquema.sessions.id })
      .from(esquema.sessions)
      .where(eq(esquema.sessions.userId, alvo!.id))
    expect(antes.length).toBe(1)

    expect((await acessos.alternarAtivo(superadmin, alvo!.id, false)).ok).toBe(true)

    const depois = await db
      .select({ id: esquema.sessions.id })
      .from(esquema.sessions)
      .where(eq(esquema.sessions.userId, alvo!.id))
    expect(depois.length).toBe(0)
  })

  it('trocar a senha também derruba as sessões', async () => {
    const sessao = await import('@/lib/auth/sessao')
    const [alvo] = await db
      .select({ id: esquema.users.id })
      .from(esquema.users)
      .where(eq(esquema.users.email, `op1-${marca}@teste.local`))

    await sessao.criarSessao(alvo!.id)
    expect((await acessos.definirSenhaDe(superadmin, alvo!.id, 'outraSenhaForte1')).ok).toBe(true)

    const depois = await db
      .select({ id: esquema.sessions.id })
      .from(esquema.sessions)
      .where(eq(esquema.sessions.userId, alvo!.id))
    expect(depois.length).toBe(0)
  })

  it('recusa senha curta demais', async () => {
    const [alvo] = await db
      .select({ id: esquema.users.id })
      .from(esquema.users)
      .where(eq(esquema.users.email, `op1-${marca}@teste.local`))

    const r = await acessos.definirSenhaDe(superadmin, alvo!.id, 'curta')
    expect(r.ok).toBe(false)
  })

  it('registra tudo na auditoria', async () => {
    const linhas = await db
      .select({ acao: esquema.auditLog.action })
      .from(esquema.auditLog)
      .where(eq(esquema.auditLog.orgId, orgCliente))

    const acoes = linhas.map((l) => l.acao)
    expect(acoes).toContain('usuario.criado')
    expect(acoes).toContain('senha.definida_por_admin')
    expect(acoes).toContain('usuario.desativado')
  })
})
