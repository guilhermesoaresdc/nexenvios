import { afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { contactLists, organizations } from '@/db/schema'

/**
 * A lista de teste, uma por organização.
 *
 * O índice único parcial é quem garante — e é justamente por isso que marcar a
 * segunda tem que DESMARCAR a primeira antes de gravar. Sem isso, quem
 * clicasse em "usar como teste" na segunda lista levaria um erro de violação
 * de índice na cara, em vez de simplesmente trocar, que é o que a pessoa quis
 * dizer ao clicar.
 *
 * O teste vai pelo banco e não pela server action porque a action depende de
 * sessão; a regra que pode quebrar é a do índice, e ela está aqui.
 */

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

let orgId = ''

/** O mesmo passo a passo de `marcarListaDeTeste`. */
async function marcar(listaId: string, valor: boolean) {
  if (valor) {
    await db
      .update(contactLists)
      .set({ isTest: false })
      .where(and(eq(contactLists.orgId, orgId), eq(contactLists.isTest, true)))
  }
  await db.update(contactLists).set({ isTest: valor }).where(eq(contactLists.id, listaId))
}

cenario('lista de teste', () => {
  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('troca de lista sem estourar o índice, e mantém no máximo uma', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Teste LTDA', slug: `teste-${Date.now()}`, credits: '10' })
      .returning({ id: organizations.id })
    orgId = org!.id

    const [primeira] = await db
      .insert(contactLists)
      .values({ orgId, name: 'Números da equipe' })
      .returning({ id: contactLists.id })
    const [segunda] = await db
      .insert(contactLists)
      .values({ orgId, name: 'Meu celular' })
      .returning({ id: contactLists.id })

    await marcar(primeira!.id, true)
    await marcar(segunda!.id, true)

    const deTeste = await db
      .select({ id: contactLists.id })
      .from(contactLists)
      .where(and(eq(contactLists.orgId, orgId), eq(contactLists.isTest, true)))

    expect(deTeste).toHaveLength(1)
    expect(deTeste[0]!.id).toBe(segunda!.id)

    // E dá para ficar sem nenhuma: o índice é parcial, não obriga a ter uma.
    await marcar(segunda!.id, false)
    const nenhuma = await db
      .select({ id: contactLists.id })
      .from(contactLists)
      .where(and(eq(contactLists.orgId, orgId), eq(contactLists.isTest, true)))
    expect(nenhuma).toHaveLength(0)
  })

  it('deixa outra organização ter a lista de teste dela', async () => {
    const [outra] = await db
      .insert(organizations)
      .values({ name: 'Vizinha LTDA', slug: `vizinha-${Date.now()}`, credits: '10' })
      .returning({ id: organizations.id })

    try {
      const [minha] = await db
        .insert(contactLists)
        .values({ orgId, name: 'Minha', isTest: true })
        .returning({ id: contactLists.id })
      const [dela] = await db
        .insert(contactLists)
        .values({ orgId: outra!.id, name: 'Dela', isTest: true })
        .returning({ id: contactLists.id })

      // O índice é por org: duas organizações com a sua não se atrapalham.
      expect(minha!.id).not.toBe(dela!.id)
    } finally {
      await db.delete(organizations).where(eq(organizations.id, outra!.id))
    }
  })
})
