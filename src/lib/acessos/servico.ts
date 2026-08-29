import 'server-only'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, organizations, users } from '@/db/schema'
import { PAPEIS_DA_NEX, type UserRole } from '@/db/schema/enums'
import type { UsuarioAutenticado } from '@/lib/auth/sessao'
import { enviarEmailDeSenha } from '@/lib/auth/email'
import { encerrarTodasAsSessoes } from '@/lib/auth/sessao'
import { gerarHash, gerarSenha } from '@/lib/auth/senha'
import { emitirToken, linkDeSenha } from '@/lib/auth/tokens'
import { TAMANHO_MINIMO_SENHA } from '@/lib/auth/regras'

/**
 * Gestão de acesso, num lugar só.
 *
 * As três telas que mexem em usuário — equipe do cliente, equipe da Nex e a
 * lista global — chamam daqui. O que não pode divergir entre elas são as
 * travas, e trava repetida em três arquivos é trava que um dia diverge.
 *
 * As regras, todas elas:
 *
 * 1. Papel da Nex (`superadmin`, `suporte`) só um superadmin concede. Sem
 *    isso, quem administra a conta de um cliente se promoveria a dono da
 *    plataforma por um campo de formulário.
 * 2. Ninguém mexe no próprio papel nem se desativa. O caminho para uma conta
 *    sem administrador nenhum é curto demais.
 * 3. O último administrador ativo de uma conta não é rebaixado nem desativado.
 * 4. Trocar senha ou desativar derruba as sessões abertas na hora. Esperar o
 *    cookie vencer deixaria a pessoa dentro por trinta dias.
 */

export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { valor?: never } : { valor: T }))
  | { ok: false; erro: string }

function recusar(erro: string): { ok: false; erro: string } {
  return { ok: false, erro }
}

/** Quem pode conceder este papel? */
function podeConceder(autor: UsuarioAutenticado, papel: UserRole): boolean {
  if (PAPEIS_DA_NEX.includes(papel)) return autor.isSuperadmin
  return autor.isAdmin
}

/** O autor pode mexer nesta organização? */
function alcanca(autor: UsuarioAutenticado, orgId: string): boolean {
  return autor.isTimeNex || autor.orgId === orgId
}

async function outrosAdminsAtivos(orgId: string, exceto: string): Promise<number> {
  const linhas = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.role, 'admin'),
        eq(users.active, true),
        ne(users.id, exceto),
      ),
    )
  return linhas.length
}

export type NovoUsuario = {
  orgId: string
  nome: string
  email: string
  papel: UserRole
  /**
   * Como a pessoa entra:
   * - `convite`: recebe um link para definir a própria senha
   * - `senha`: o administrador define agora e passa por fora
   */
  acesso: 'convite' | 'senha'
  senha?: string
}

export type AcessoCriado = {
  usuarioId: string
  email: string
  /** Só quando `acesso: 'senha'`. Aparece uma vez e não volta. */
  senha?: string
  /** Só quando `acesso: 'convite'`. */
  link?: string
  emailEnviado: boolean
}

export async function criarUsuario(
  autor: UsuarioAutenticado,
  dados: NovoUsuario,
): Promise<Resultado<AcessoCriado>> {
  if (!alcanca(autor, dados.orgId)) return recusar('Você não administra esta conta.')
  if (!podeConceder(autor, dados.papel)) {
    return recusar('Só um Administrador Nex concede papel do time Nex.')
  }

  const email = dados.email.trim().toLowerCase()
  const [jaExiste] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (jaExiste) return recusar('Já existe um usuário com este e-mail.')

  const [org] = await db
    .select({ id: organizations.id, nome: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, dados.orgId))
    .limit(1)
  if (!org) return recusar('Conta não encontrada.')

  let hash: string | null = null
  let senhaEmClaro: string | undefined

  if (dados.acesso === 'senha') {
    senhaEmClaro = dados.senha?.trim() || gerarSenha(14)
    if (senhaEmClaro.length < TAMANHO_MINIMO_SENHA) {
      return recusar(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
    }
    hash = await gerarHash(senhaEmClaro)
  }

  const [novo] = await db
    .insert(users)
    .values({
      orgId: dados.orgId,
      name: dados.nome.trim(),
      email,
      role: dados.papel,
      passwordHash: hash,
    })
    .returning({ id: users.id })

  if (!novo) return recusar('Não foi possível criar o usuário.')

  let link: string | undefined
  let emailEnviado = false

  if (dados.acesso === 'convite') {
    const token = await emitirToken(novo.id, 'convite')
    const envio = await enviarEmailDeSenha(email, token, 'convite')
    link = envio.link
    emailEnviado = envio.enviado
  }

  await db.insert(auditLog).values({
    orgId: dados.orgId,
    userId: autor.id,
    action: 'usuario.criado',
    entity: 'user',
    entityId: novo.id,
    // Sem e-mail nem nome aqui: auditoria guarda o QUE aconteceu, e o dado
    // pessoal já está na tabela de usuários.
    meta: { papel: dados.papel, acesso: dados.acesso },
  })

  return { ok: true, valor: { usuarioId: novo.id, email, senha: senhaEmClaro, link, emailEnviado } }
}

export type SenhaDefinida = { senha: string; email: string }

/**
 * Define a senha de alguém.
 *
 * Existe porque e-mail transacional falha: cai no spam, o domínio não está
 * verificado, o cliente digitou o endereço errado. Sem este caminho, um
 * cliente sem acesso vira chamado de suporte que ninguém consegue resolver.
 *
 * A senha aparece UMA vez para quem definiu, e é ele que a entrega por fora.
 */
export async function definirSenhaDe(
  autor: UsuarioAutenticado,
  usuarioId: string,
  senha?: string,
): Promise<Resultado<SenhaDefinida>> {
  const [alvo] = await db
    .select({ id: users.id, orgId: users.orgId, email: users.email, papel: users.role })
    .from(users)
    .where(eq(users.id, usuarioId))
    .limit(1)

  if (!alvo) return recusar('Usuário não encontrado.')
  if (!alcanca(autor, alvo.orgId)) return recusar('Você não administra esta conta.')
  if (PAPEIS_DA_NEX.includes(alvo.papel) && !autor.isSuperadmin) {
    return recusar('Só um Administrador Nex troca a senha de alguém do time Nex.')
  }

  const nova = senha?.trim() || gerarSenha(14)
  if (nova.length < TAMANHO_MINIMO_SENHA) {
    return recusar(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
  }

  await db
    .update(users)
    .set({ passwordHash: await gerarHash(nova) })
    .where(eq(users.id, usuarioId))

  // Senha nova derruba tudo que estava aberto com a antiga.
  await encerrarTodasAsSessoes(usuarioId)

  await db.insert(auditLog).values({
    orgId: alvo.orgId,
    userId: autor.id,
    action: 'senha.definida_por_admin',
    entity: 'user',
    entityId: usuarioId,
  })

  return { ok: true, valor: { senha: nova, email: alvo.email } }
}

/** Gera um link novo de definição de senha, para mandar pelo canal que quiser. */
export async function gerarLinkDeAcesso(
  autor: UsuarioAutenticado,
  usuarioId: string,
): Promise<Resultado<{ link: string; email: string; enviado: boolean }>> {
  const [alvo] = await db
    .select({ id: users.id, orgId: users.orgId, email: users.email, papel: users.role })
    .from(users)
    .where(eq(users.id, usuarioId))
    .limit(1)

  if (!alvo) return recusar('Usuário não encontrado.')
  if (!alcanca(autor, alvo.orgId)) return recusar('Você não administra esta conta.')
  if (PAPEIS_DA_NEX.includes(alvo.papel) && !autor.isSuperadmin) {
    return recusar('Só um Administrador Nex faz isso para alguém do time Nex.')
  }

  const token = await emitirToken(alvo.id, 'convite')
  const envio = await enviarEmailDeSenha(alvo.email, token, 'convite')

  await db.insert(auditLog).values({
    orgId: alvo.orgId,
    userId: autor.id,
    action: 'acesso.link_gerado',
    entity: 'user',
    entityId: usuarioId,
  })

  return {
    ok: true,
    valor: { link: envio.link || linkDeSenha(token), email: alvo.email, enviado: envio.enviado },
  }
}

export async function trocarPapel(
  autor: UsuarioAutenticado,
  usuarioId: string,
  papel: UserRole,
): Promise<Resultado> {
  const [alvo] = await db
    .select({ id: users.id, orgId: users.orgId, papel: users.role, ativo: users.active })
    .from(users)
    .where(eq(users.id, usuarioId))
    .limit(1)

  if (!alvo) return recusar('Usuário não encontrado.')
  if (!alcanca(autor, alvo.orgId)) return recusar('Você não administra esta conta.')
  if (usuarioId === autor.id) {
    return recusar('Você não muda o próprio papel. Peça a outro administrador.')
  }
  if (!podeConceder(autor, papel) || (PAPEIS_DA_NEX.includes(alvo.papel) && !autor.isSuperadmin)) {
    return recusar('Só um Administrador Nex mexe em papel do time Nex.')
  }

  // Rebaixar o último administrador ativo deixa a conta sem ninguém que
  // consiga liberar canal, equipe ou chave — e a saída vira chamado.
  if (alvo.papel === 'admin' && papel !== 'admin' && alvo.ativo) {
    if ((await outrosAdminsAtivos(alvo.orgId, usuarioId)) === 0) {
      return recusar('Este é o último administrador ativo da conta. Promova outro antes.')
    }
  }

  await db.update(users).set({ role: papel }).where(eq(users.id, usuarioId))

  await db.insert(auditLog).values({
    orgId: alvo.orgId,
    userId: autor.id,
    action: 'usuario.papel_alterado',
    entity: 'user',
    entityId: usuarioId,
    meta: { de: alvo.papel, para: papel },
  })

  return { ok: true }
}

export async function alternarAtivo(
  autor: UsuarioAutenticado,
  usuarioId: string,
  ativar: boolean,
): Promise<Resultado> {
  const [alvo] = await db
    .select({ id: users.id, orgId: users.orgId, papel: users.role, ativo: users.active })
    .from(users)
    .where(eq(users.id, usuarioId))
    .limit(1)

  if (!alvo) return recusar('Usuário não encontrado.')
  if (!alcanca(autor, alvo.orgId)) return recusar('Você não administra esta conta.')
  if (usuarioId === autor.id) return recusar('Você não desativa a si mesmo.')
  if (PAPEIS_DA_NEX.includes(alvo.papel) && !autor.isSuperadmin) {
    return recusar('Só um Administrador Nex desativa alguém do time Nex.')
  }

  if (!ativar && alvo.papel === 'admin') {
    if ((await outrosAdminsAtivos(alvo.orgId, usuarioId)) === 0) {
      return recusar('Este é o último administrador ativo da conta. Promova outro antes.')
    }
  }

  await db.update(users).set({ active: ativar }).where(eq(users.id, usuarioId))
  if (!ativar) await encerrarTodasAsSessoes(usuarioId)

  await db.insert(auditLog).values({
    orgId: alvo.orgId,
    userId: autor.id,
    action: ativar ? 'usuario.reativado' : 'usuario.desativado',
    entity: 'user',
    entityId: usuarioId,
  })

  return { ok: true }
}

/** Remove de vez. Só o time Nex, e nunca a si mesmo. */
export async function removerUsuario(
  autor: UsuarioAutenticado,
  usuarioId: string,
): Promise<Resultado> {
  if (!autor.isTimeNex) return recusar('Só o time Nex Envios remove usuário.')
  if (usuarioId === autor.id) return recusar('Você não se remove.')

  const [alvo] = await db
    .select({ id: users.id, orgId: users.orgId, papel: users.role, ativo: users.active })
    .from(users)
    .where(eq(users.id, usuarioId))
    .limit(1)

  if (!alvo) return recusar('Usuário não encontrado.')
  if (PAPEIS_DA_NEX.includes(alvo.papel) && !autor.isSuperadmin) {
    return recusar('Só um Administrador Nex remove alguém do time Nex.')
  }
  if (alvo.papel === 'admin' && alvo.ativo) {
    if ((await outrosAdminsAtivos(alvo.orgId, usuarioId)) === 0) {
      return recusar('Este é o último administrador ativo da conta. Promova outro antes.')
    }
  }

  await encerrarTodasAsSessoes(usuarioId)
  await db.delete(users).where(eq(users.id, usuarioId))

  await db.insert(auditLog).values({
    orgId: alvo.orgId,
    userId: autor.id,
    action: 'usuario.removido',
    entity: 'user',
    entityId: usuarioId,
    meta: { papel: alvo.papel },
  })

  return { ok: true }
}
