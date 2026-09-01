import { afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { organizations, savedDispatches, users } from '@/db/schema'
import { descartarRascunho, guardarRascunho, lerRascunho } from '@/lib/campanhas/rascunho'

/**
 * O rascunho do assistente.
 *
 * Três coisas podem quebrar aqui, e as três são silenciosas:
 *
 * 1. **Mais de um rascunho por pessoa.** Duas abas abertas gravam ao mesmo
 *    tempo; se cada uma criasse o seu registro, a tela teria que adivinhar
 *    qual retomar e a pessoa voltaria para um texto que não é o último.
 * 2. **Rascunho estragado derrubando a tela.** O payload é jsonb: uma versão
 *    antiga do assistente, um campo renomeado ou uma linha mexida à mão
 *    devolveriam `undefined` no meio de um `useState`. Tem que ser ignorado,
 *    não propagado.
 * 3. **Rascunho vazio virando registro.** Abrir o assistente e sair sem tocar
 *    em nada não pode deixar nada para trás — a visita seguinte seria
 *    recebida por um "retomamos de onde você parou" que não retomou nada.
 */

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

let orgId = ''
let autorId = ''

const base = {
  passo: 3,
  configId: null,
  listas: [],
  etiquetas: [],
  todaABase: true,
  nome: '',
  corpo: 'Olá {{primeiro_nome}}',
  mediaUrl: '',
  eleitoral: false,
  ritmo: 60,
  abreAs: 8,
  fechaAs: 21,
  quando: 'agora' as const,
  agendarEm: '',
  perfilNome: '',
  perfilFoto: '',
  perfilNome2: '',
  perfilFoto2: '',
  politicaDocumento: '',
  politicaPartido: '',
}

cenario('rascunho do disparo', () => {
  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('guarda, devolve e sobrescreve — sempre um só por pessoa', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Rascunho LTDA', slug: `rasc-${Date.now()}`, credits: '50' })
      .returning({ id: organizations.id })
    orgId = org!.id

    const [autor] = await db
      .insert(users)
      .values({
        orgId,
        email: `rasc-${Date.now()}@exemplo.com`,
        name: 'Quem escreve',
        passwordHash: 'x',
        role: 'admin',
      })
      .returning({ id: users.id })
    autorId = autor!.id

    await guardarRascunho({ orgId, autorId, canal: 'sms', rascunho: base })
    await guardarRascunho({
      orgId,
      autorId,
      canal: 'sms',
      rascunho: { ...base, corpo: 'Segunda versão' },
    })

    const linhas = await db
      .select({ id: savedDispatches.id })
      .from(savedDispatches)
      .where(and(eq(savedDispatches.orgId, orgId), eq(savedDispatches.auto, true)))
    expect(linhas).toHaveLength(1)

    const lido = await lerRascunho(orgId, autorId)
    expect(lido?.rascunho.corpo).toBe('Segunda versão')
    expect(lido?.rascunho.passo).toBe(3)
    expect(lido?.rascunho.todaABase).toBe(true)
  })

  it('ignora um payload estragado em vez de devolver lixo para a tela', async () => {
    await db
      .update(savedDispatches)
      .set({ payload: { passo: 'três', corpo: { nao: 'é texto' }, listas: 'nem array' } })
      .where(and(eq(savedDispatches.orgId, orgId), eq(savedDispatches.auto, true)))

    // Não lança, e não devolve nada aproveitável.
    expect(await lerRascunho(orgId, autorId)).toBeNull()
  })

  it('não guarda rascunho em branco — e apaga o que já existia', async () => {
    await guardarRascunho({ orgId, autorId, canal: 'sms', rascunho: base })
    expect(await lerRascunho(orgId, autorId)).not.toBeNull()

    await guardarRascunho({
      orgId,
      autorId,
      canal: null,
      rascunho: { ...base, corpo: '', todaABase: false },
    })
    expect(await lerRascunho(orgId, autorId)).toBeNull()
  })

  it('descarta quando pedido', async () => {
    await guardarRascunho({ orgId, autorId, canal: 'sms', rascunho: base })
    expect(await lerRascunho(orgId, autorId)).not.toBeNull()

    await descartarRascunho(orgId, autorId)
    expect(await lerRascunho(orgId, autorId)).toBeNull()
  })

  it('o rascunho de uma pessoa não aparece para outra', async () => {
    const [outro] = await db
      .insert(users)
      .values({
        orgId,
        email: `outro-${Date.now()}@exemplo.com`,
        name: 'Colega',
        passwordHash: 'x',
        role: 'admin',
      })
      .returning({ id: users.id })

    await guardarRascunho({ orgId, autorId, canal: 'sms', rascunho: base })

    // Mesma organização, pessoa diferente: cada um tem o seu.
    expect(await lerRascunho(orgId, outro!.id)).toBeNull()
    expect(await lerRascunho(orgId, autorId)).not.toBeNull()
  })
})
