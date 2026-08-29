'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, creditLedger, organizations, users } from '@/db/schema'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { enviarEmailDeSenha } from '@/lib/auth/email'
import { emitirToken } from '@/lib/auth/tokens'
import { encerrarTodasAsSessoes } from '@/lib/auth/sessao'
import { criarLog } from '@/lib/log'
import { apelido } from '@/lib/ui'

const log = criarLog('admin')

export type Estado = { erro?: string; ok?: string; link?: string } | undefined

const cadastro = {
  nome: z.string().trim().min(2, 'Informe o nome da empresa.').max(120),
  apelido: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Use só letras minúsculas, números e hífen.')
    .min(2)
    .max(48),
  documento: z.string().trim().max(30).optional().or(z.literal('')),
  contatoNome: z.string().trim().max(120).optional().or(z.literal('')),
  contatoEmail: z.string().trim().toLowerCase().email('E-mail de contato inválido.').or(z.literal('')),
  contatoTelefone: z.string().trim().max(30).optional().or(z.literal('')),
  fuso: z.string().trim().min(3).max(60),
  limite: z.coerce.number().min(0).max(1_000_000),
}

const novoCliente = z.object({
  ...cadastro,
  creditoInicial: z.coerce.number().min(0).max(1_000_000),
  adminNome: z.string().trim().min(2, 'Informe o nome de quem vai administrar a conta.').max(120),
  adminEmail: z.string().trim().toLowerCase().email('E-mail do administrador inválido.'),
})

export async function criarCliente(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const bruto = {
    nome: form.get('nome'),
    apelido: form.get('apelido') || apelido(String(form.get('nome') ?? '')),
    documento: form.get('documento') ?? '',
    contatoNome: form.get('contatoNome') ?? '',
    contatoEmail: form.get('contatoEmail') ?? '',
    contatoTelefone: form.get('contatoTelefone') ?? '',
    fuso: form.get('fuso') || 'America/Sao_Paulo',
    limite: form.get('limite') ?? 0,
    creditoInicial: form.get('creditoInicial') ?? 0,
    adminNome: form.get('adminNome'),
    adminEmail: form.get('adminEmail'),
  }

  const dados = novoCliente.safeParse(bruto)
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const [jaExiste] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, dados.data.adminEmail))
    .limit(1)
  if (jaExiste) {
    return { erro: 'Já existe um usuário com este e-mail. Use outro endereço para o administrador.' }
  }

  const [duplicada] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, dados.data.apelido))
    .limit(1)
  if (duplicada) return { erro: 'Este apelido já está em uso. Escolha outro.' }

  const [org] = await db
    .insert(organizations)
    .values({
      name: dados.data.nome,
      slug: dados.data.apelido,
      document: dados.data.documento || null,
      contactName: dados.data.contatoNome || null,
      contactEmail: dados.data.contatoEmail || null,
      contactPhone: dados.data.contatoTelefone || null,
      timezone: dados.data.fuso,
      creditLimit: String(dados.data.limite),
      // O saldo NASCE ZERO. Quem move crédito é o razão, sempre: um valor
      // gravado aqui direto não teria lançamento, e o extrato do cliente
      // começaria mentindo.
      credits: '0',
    })
    .returning({ id: organizations.id })

  if (!org) return { erro: 'Não foi possível criar o cliente.' }

  const [novoUsuario] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name: dados.data.adminNome,
      email: dados.data.adminEmail,
      role: 'admin',
      // Sem senha: quem define é a própria pessoa, pelo link do convite.
      passwordHash: null,
    })
    .returning({ id: users.id })

  if (dados.data.creditoInicial > 0) {
    await db.insert(creditLedger).values({
      orgId: org.id,
      kind: 'recarga',
      delta: String(dados.data.creditoInicial),
      description: 'Crédito inicial',
      createdBy: admin.id,
    })
  }

  await db.insert(auditLog).values({
    orgId: org.id,
    userId: admin.id,
    action: 'cliente.criado',
    entity: 'organization',
    entityId: org.id,
    meta: { nome: dados.data.nome, credito: dados.data.creditoInicial },
  })

  let link: string | undefined
  if (novoUsuario) {
    const token = await emitirToken(novoUsuario.id, 'convite')
    const envio = await enviarEmailDeSenha(dados.data.adminEmail, token, 'convite')
    // O link vai para a tela mesmo quando o e-mail saiu: numa instalação nova,
    // sem domínio verificado, o e-mail some no spam e o cliente fica esperando.
    link = envio.link
  }

  log.info('cliente criado', { org: org.id })
  revalidatePath('/admin/clientes')
  redirect(`/admin/clientes/${org.id}?convite=${encodeURIComponent(link ?? '')}`)
}

const edicao = z.object({ orgId: z.string().uuid(), ...cadastro })

export async function salvarCliente(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const dados = edicao.safeParse({
    orgId: form.get('orgId'),
    nome: form.get('nome'),
    apelido: form.get('apelido'),
    documento: form.get('documento') ?? '',
    contatoNome: form.get('contatoNome') ?? '',
    contatoEmail: form.get('contatoEmail') ?? '',
    contatoTelefone: form.get('contatoTelefone') ?? '',
    fuso: form.get('fuso') || 'America/Sao_Paulo',
    limite: form.get('limite') ?? 0,
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  await db
    .update(organizations)
    .set({
      name: dados.data.nome,
      slug: dados.data.apelido,
      document: dados.data.documento || null,
      contactName: dados.data.contatoNome || null,
      contactEmail: dados.data.contatoEmail || null,
      contactPhone: dados.data.contatoTelefone || null,
      timezone: dados.data.fuso,
      creditLimit: String(dados.data.limite),
    })
    .where(eq(organizations.id, dados.data.orgId))

  await db.insert(auditLog).values({
    orgId: dados.data.orgId,
    userId: admin.id,
    action: 'cliente.atualizado',
    entity: 'organization',
    entityId: dados.data.orgId,
  })

  revalidatePath(`/admin/clientes/${dados.data.orgId}`)
  return { ok: 'Cadastro salvo.' }
}

const mudancaDeStatus = z.object({
  orgId: z.string().uuid(),
  status: z.enum(['ativo', 'suspenso', 'cancelado']),
})

export async function mudarStatus(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const dados = mudancaDeStatus.safeParse({
    orgId: form.get('orgId'),
    status: form.get('status'),
  })
  if (!dados.success) return { erro: 'Status inválido.' }

  await db
    .update(organizations)
    .set({ status: dados.data.status })
    .where(eq(organizations.id, dados.data.orgId))

  /*
   * Conta cancelada perde as sessões abertas na hora. Sem isto, quem já estava
   * dentro continuaria disparando até o cookie vencer — trinta dias depois.
   */
  if (dados.data.status === 'cancelado') {
    const doCliente = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, dados.data.orgId))
    for (const u of doCliente) await encerrarTodasAsSessoes(u.id)
  }

  await db.insert(auditLog).values({
    orgId: dados.data.orgId,
    userId: admin.id,
    action: 'cliente.status',
    entity: 'organization',
    entityId: dados.data.orgId,
    meta: { status: dados.data.status },
  })

  revalidatePath(`/admin/clientes/${dados.data.orgId}`)
  revalidatePath('/admin/clientes')
  return { ok: `Conta marcada como ${dados.data.status}.` }
}

const lancamento = z.object({
  orgId: z.string().uuid(),
  valor: z.coerce
    .number()
    .refine((v) => v !== 0, 'Informe um valor diferente de zero.')
    .refine((v) => Math.abs(v) <= 1_000_000, 'Valor fora do limite.'),
  descricao: z.string().trim().max(200).optional().or(z.literal('')),
})

export async function lancarCredito(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const dados = lancamento.safeParse({
    orgId: form.get('orgId'),
    valor: form.get('valor'),
    descricao: form.get('descricao') ?? '',
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira o valor.' }

  /*
   * Só o lançamento. O saldo em `organizations.credits` é mantido pelo gatilho
   * `aplicar_credito` — atualizar as duas coisas aqui faria o saldo divergir
   * do extrato, e o extrato é a fonte da verdade para dinheiro.
   */
  await db.insert(creditLedger).values({
    orgId: dados.data.orgId,
    kind: dados.data.valor > 0 ? 'recarga' : 'ajuste',
    delta: String(dados.data.valor),
    description: dados.data.descricao || (dados.data.valor > 0 ? 'Recarga' : 'Ajuste'),
    createdBy: admin.id,
  })

  await db.insert(auditLog).values({
    orgId: dados.data.orgId,
    userId: admin.id,
    action: 'credito.lancado',
    entity: 'organization',
    entityId: dados.data.orgId,
    meta: { valor: dados.data.valor },
  })

  revalidatePath(`/admin/clientes/${dados.data.orgId}`)
  revalidatePath('/admin/clientes')
  return {
    ok:
      dados.data.valor > 0
        ? `Crédito de R$ ${dados.data.valor.toFixed(2).replace('.', ',')} lançado.`
        : `Ajuste de R$ ${Math.abs(dados.data.valor).toFixed(2).replace('.', ',')} debitado.`,
  }
}

const convite = z.object({
  orgId: z.string().uuid(),
  nome: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  papel: z.enum(['admin', 'operador', 'visualizador']),
})

export async function convidarUsuario(_anterior: Estado, form: FormData): Promise<Estado> {
  const admin = await exigirSuperadmin()

  const dados = convite.safeParse({
    orgId: form.get('orgId'),
    nome: form.get('nome'),
    email: form.get('email'),
    papel: form.get('papel'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const [jaExiste] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, dados.data.email))
    .limit(1)
  if (jaExiste) return { erro: 'Já existe um usuário com este e-mail.' }

  const [novo] = await db
    .insert(users)
    .values({
      orgId: dados.data.orgId,
      name: dados.data.nome,
      email: dados.data.email,
      role: dados.data.papel,
      passwordHash: null,
    })
    .returning({ id: users.id })

  if (!novo) return { erro: 'Não foi possível criar o usuário.' }

  const token = await emitirToken(novo.id, 'convite')
  const envio = await enviarEmailDeSenha(dados.data.email, token, 'convite')

  await db.insert(auditLog).values({
    orgId: dados.data.orgId,
    userId: admin.id,
    action: 'usuario.convidado',
    entity: 'user',
    entityId: novo.id,
    meta: { papel: dados.data.papel },
  })

  revalidatePath(`/admin/clientes/${dados.data.orgId}`)
  return {
    ok: envio.enviado ? 'Convite enviado por e-mail.' : 'Usuário criado. Copie o link abaixo.',
    link: envio.link,
  }
}
