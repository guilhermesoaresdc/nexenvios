'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { contactLists, contacts } from '@/db/schema'
import { exigirEscrita, exigirUsuario } from '@/lib/auth/atual'
import { descadastrar } from '@/lib/campanhas/servico'
import { criarLista as criar, importarContatos, registrarImportacao } from '@/lib/contatos/importar'
import { normalizarTelefone } from '@/lib/telefone'

export type Estado = { erro?: string; ok?: string } | undefined

const novaLista = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à lista.').max(80),
  descricao: z.string().trim().max(200).optional().or(z.literal('')),
})

export async function criarLista(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const dados = novaLista.safeParse({ nome: form.get('nome'), descricao: form.get('descricao') ?? '' })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  await criar(usuario.orgId, usuario.id, dados.data.nome, dados.data.descricao || null)
  revalidatePath('/contatos/listas')
  return { ok: 'Lista criada.' }
}

const renomear = z.object({
  listaId: z.string().uuid(),
  nome: z.string().trim().min(2, 'Dê um nome à lista.').max(80),
  descricao: z.string().trim().max(200).optional().or(z.literal('')),
})

export async function renomearLista(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const dados = renomear.safeParse({
    listaId: form.get('listaId'),
    nome: form.get('nome'),
    descricao: form.get('descricao') ?? '',
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  await db
    .update(contactLists)
    .set({ name: dados.data.nome, description: dados.data.descricao || null })
    .where(and(eq(contactLists.id, dados.data.listaId), eq(contactLists.orgId, usuario.orgId)))

  revalidatePath('/contatos/listas')
  return { ok: 'Lista salva.' }
}

/**
 * Marca (ou desmarca) a lista de teste da organização.
 *
 * Uma só, e o índice único no banco garante — mas quem tira a anterior é este
 * UPDATE. Sem ele, marcar a segunda estouraria erro de índice na cara de quem
 * clicou, em vez de simplesmente trocar, que é o que a pessoa quis dizer.
 */
export async function marcarListaDeTeste(listaId: string, marcar: boolean): Promise<void> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  if (marcar) {
    await db
      .update(contactLists)
      .set({ isTest: false })
      .where(and(eq(contactLists.orgId, usuario.orgId), eq(contactLists.isTest, true)))
  }

  await db
    .update(contactLists)
    .set({ isTest: marcar })
    .where(and(eq(contactLists.id, listaId), eq(contactLists.orgId, usuario.orgId)))

  revalidatePath('/contatos/listas')
  revalidatePath('/disparo')
}

/** Apaga a lista, não os contatos: o vínculo cai por cascade. */
export async function apagarLista(listaId: string): Promise<void> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  await db
    .delete(contactLists)
    .where(and(eq(contactLists.id, listaId), eq(contactLists.orgId, usuario.orgId)))

  revalidatePath('/contatos/listas')
  revalidatePath('/disparo')
}

export async function descadastrarContato(contatoId: string): Promise<void> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const [contato] = await db
    .select({ phone: contacts.phone })
    .from(contacts)
    .where(and(eq(contacts.id, contatoId), eq(contacts.orgId, usuario.orgId)))
    .limit(1)

  if (!contato?.phone) return
  await descadastrar(usuario.orgId, contato.phone, 'descadastrado pela equipe')
  revalidatePath('/contatos')
}

/**
 * Reativar é ato explícito e registrado no motivo.
 *
 * Existe porque acontece de alguém marcar sem querer — mas nunca acontece por
 * importação: quem pediu para sair só volta se alguém disser, aqui, que quer.
 */
export async function reativarContato(contatoId: string): Promise<void> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  await db
    .update(contacts)
    .set({ optedOut: false, optedOutAt: null, optedOutReason: 'reativado pela equipe' })
    .where(and(eq(contacts.id, contatoId), eq(contacts.orgId, usuario.orgId)))

  revalidatePath('/contatos')
}

const linha = z.object({
  telefone: z.string().min(8),
  nome: z.string().max(120).optional().nullable(),
})

const importacao = z.object({
  linhas: z.array(linha).min(1, 'Nenhum número válido para importar.').max(5_000),
  listaId: z.string().uuid().optional().or(z.literal('')),
  novaLista: z.string().trim().max(80).optional().or(z.literal('')),
  etiquetas: z.string().trim().max(200).optional().or(z.literal('')),
  arquivo: z.string().max(200).optional().or(z.literal('')),
  invalidos: z.number().int().min(0).max(5_000_000).optional(),
  /** Lotes seguintes não criam lista nem registram job de novo. */
  continuando: z.boolean().optional(),
})

export type RespostaDaImportacao =
  | {
      ok: true
      listaId: string | null
      novos: number
      atualizados: number
      repetidos: number
      descadastrados: number
    }
  | { ok: false; erro: string }

/**
 * Recebe um lote já normalizado no navegador.
 *
 * A tela manda em lotes de 2.000 e soma os resultados. Fatiar é o que permite
 * subir uma planilha de cem mil linhas sem estourar o tempo da função nem o
 * limite de corpo da requisição.
 */
export async function importarLote(entrada: unknown): Promise<RespostaDaImportacao> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const dados = importacao.safeParse(entrada)
  if (!dados.success) {
    return { ok: false, erro: dados.error.issues[0]?.message ?? 'Dados de importação inválidos.' }
  }

  let listaId: string | null = dados.data.listaId || null

  if (listaId) {
    // A lista precisa ser desta organização — o id vem do navegador.
    const [minha] = await db
      .select({ id: contactLists.id })
      .from(contactLists)
      .where(and(eq(contactLists.id, listaId), eq(contactLists.orgId, usuario.orgId)))
      .limit(1)
    if (!minha) return { ok: false, erro: 'Lista não encontrada.' }
  } else if (dados.data.novaLista && !dados.data.continuando) {
    listaId = await criar(usuario.orgId, usuario.id, dados.data.novaLista, 'Criada na importação')
  }

  const etiquetas = (dados.data.etiquetas ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10)

  // Reconferimos a normalização no servidor: o que veio do navegador é
  // entrada do usuário, e um telefone malformado aqui vira envio perdido.
  const limpas = dados.data.linhas
    .map((l) => ({ norm: normalizarTelefone(l.telefone), nome: l.nome }))
    .filter((l) => l.norm.ok)
    .map((l) => ({ telefone: (l.norm as { e164: string }).e164, nome: l.nome ?? null }))

  if (limpas.length === 0) return { ok: false, erro: 'Nenhum número válido neste lote.' }

  const r = await importarContatos({
    orgId: usuario.orgId,
    autorId: usuario.id,
    linhas: limpas,
    listaId,
    etiquetas,
  })

  if (!dados.data.continuando) {
    await registrarImportacao({
      orgId: usuario.orgId,
      autorId: usuario.id,
      arquivo: dados.data.arquivo || null,
      listaId,
      invalidos: dados.data.invalidos ?? 0,
      resultado: r,
    })
  }

  revalidatePath('/contatos')
  revalidatePath('/contatos/listas')
  revalidatePath('/disparo')

  return {
    ok: true,
    listaId,
    novos: r.novos,
    atualizados: r.atualizados,
    repetidos: r.repetidos,
    descadastrados: r.descadastrados,
  }
}
