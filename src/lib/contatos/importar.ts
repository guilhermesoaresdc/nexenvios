import 'server-only'
import { and, eq, inArray, isNotNull, sql as raw } from 'drizzle-orm'
import { db, sql } from '@/db'
import { contactListMembers, contactLists, contacts, importJobs } from '@/db/schema'

/**
 * Importação de contatos.
 *
 * Os números chegam JÁ NORMALIZADOS do navegador — a planilha é lida lá, o que
 * evita subir um arquivo de 40 MB para o servidor e devolve o erro por linha
 * na hora, com a linha original, para a pessoa achar no Excel.
 *
 * A regra que mais importa aqui: **quem se descadastrou não volta pela
 * importação**. Subir a mesma planilha de novo não pode reativar quem pediu
 * para sair — seria a porta lateral mais fácil para fora da LGPD.
 */

export type LinhaParaImportar = {
  telefone: string
  nome?: string | null
  email?: string | null
}

export type ResultadoDaImportacao = {
  recebidos: number
  novos: number
  atualizados: number
  repetidos: number
  descadastrados: number
}

const LOTE = 500

export async function importarContatos(opcoes: {
  orgId: string
  autorId: string
  linhas: LinhaParaImportar[]
  listaId?: string | null
  etiquetas?: string[]
  origem?: string
}): Promise<ResultadoDaImportacao> {
  const { orgId, linhas, listaId, etiquetas = [], origem = 'importacao' } = opcoes

  // Dedupe dentro do próprio arquivo: a mesma pessoa duas vezes na planilha é
  // uma pessoa só, e o primeiro nome informado é o que vale.
  const porTelefone = new Map<string, LinhaParaImportar>()
  for (const l of linhas) {
    if (!l.telefone) continue
    if (!porTelefone.has(l.telefone)) porTelefone.set(l.telefone, l)
  }
  const unicos = [...porTelefone.values()]

  const resultado: ResultadoDaImportacao = {
    recebidos: linhas.length,
    novos: 0,
    atualizados: 0,
    repetidos: linhas.length - unicos.length,
    descadastrados: 0,
  }

  if (unicos.length === 0) return resultado

  // Quem já está descadastrado é contado e deixado de fora do upsert.
  const bloqueados = new Set<string>()
  for (let i = 0; i < unicos.length; i += LOTE) {
    const fatia = unicos.slice(i, i + LOTE).map((l) => l.telefone)
    const achados = await db
      .select({ phone: contacts.phone })
      .from(contacts)
      .where(
        and(eq(contacts.orgId, orgId), eq(contacts.optedOut, true), inArray(contacts.phone, fatia)),
      )
    for (const a of achados) if (a.phone) bloqueados.add(a.phone)
  }

  const paraGravar = unicos.filter((l) => !bloqueados.has(l.telefone))
  resultado.descadastrados = unicos.length - paraGravar.length

  const idsAfetados: string[] = []

  for (let i = 0; i < paraGravar.length; i += LOTE) {
    const fatia = paraGravar.slice(i, i + LOTE)

    const gravadas = await db
      .insert(contacts)
      .values(
        fatia.map((l) => ({
          orgId,
          phone: l.telefone,
          name: l.nome?.trim() || null,
          email: l.email?.trim() || null,
          tags: etiquetas,
          source: origem,
        })),
      )
      .onConflictDoUpdate({
        target: [contacts.orgId, contacts.phone],
        /*
         * O índice único de telefone é PARCIAL (`WHERE phone IS NOT NULL`), e
         * o Postgres só infere um índice parcial se o ON CONFLICT repetir o
         * predicado. Sem esta linha o insert falha com "there is no unique or
         * exclusion constraint matching the ON CONFLICT specification".
         */
        targetWhere: isNotNull(contacts.phone),
        set: {
          // Nome vazio na planilha não apaga o nome que já existe.
          name: raw`COALESCE(NULLIF(EXCLUDED.name, ''), ${contacts.name})`,
          email: raw`COALESCE(NULLIF(EXCLUDED.email, ''), ${contacts.email})`,
          // As etiquetas somam; a importação acrescenta, não substitui.
          tags: raw`(
            SELECT COALESCE(array_agg(DISTINCT t), '{}')
              FROM unnest(${contacts.tags} || EXCLUDED.tags) AS t
          )`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: contacts.id, criadoEm: contacts.createdAt, atualizadoEm: contacts.updatedAt })

    for (const g of gravadas) {
      idsAfetados.push(g.id)
      // Criado e atualizado no mesmo instante = linha nova.
      if (Math.abs(g.criadoEm.getTime() - g.atualizadoEm.getTime()) < 1000) resultado.novos += 1
      else resultado.atualizados += 1
    }
  }

  if (listaId && idsAfetados.length > 0) {
    for (let i = 0; i < idsAfetados.length; i += LOTE) {
      const fatia = idsAfetados.slice(i, i + LOTE)
      await db
        .insert(contactListMembers)
        .values(fatia.map((contactId) => ({ listId: listaId, contactId })))
        .onConflictDoNothing()
    }
  }

  return resultado
}

/** Registra o resultado para a tela poder explicar o número depois. */
export async function registrarImportacao(opcoes: {
  orgId: string
  autorId: string
  arquivo: string | null
  listaId: string | null
  invalidos: number
  resultado: ResultadoDaImportacao
  amostra?: unknown[]
}): Promise<void> {
  await db.insert(importJobs).values({
    orgId: opcoes.orgId,
    listId: opcoes.listaId,
    filename: opcoes.arquivo,
    total: opcoes.resultado.recebidos + opcoes.invalidos,
    imported: opcoes.resultado.novos + opcoes.resultado.atualizados,
    duplicates: opcoes.resultado.repetidos,
    invalid: opcoes.invalidos,
    optedOut: opcoes.resultado.descadastrados,
    sample: (opcoes.amostra ?? []).slice(0, 10),
    createdBy: opcoes.autorId,
  })
}

/** Recalcula o tamanho de uma lista. O gatilho conta linha a linha; isto conserta. */
export async function recontarLista(listaId: string): Promise<void> {
  await sql`
    UPDATE contact_lists
       SET total = (SELECT count(*)::int FROM contact_list_members WHERE list_id = ${listaId})
     WHERE id = ${listaId}
  `
}

export async function criarLista(
  orgId: string,
  autorId: string,
  nome: string,
  descricao?: string | null,
): Promise<string | null> {
  const [lista] = await db
    .insert(contactLists)
    .values({ orgId, name: nome, description: descricao ?? null, createdBy: autorId })
    .returning({ id: contactLists.id })
  return lista?.id ?? null
}
