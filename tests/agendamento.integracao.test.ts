import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, sql } from '@/db'
import { channelConfigs, contacts, dispatches, organizations } from '@/db/schema'
import { criarCampanha, materializar } from '@/lib/campanhas/servico'
import { bater } from '@/lib/delivery/motor'

/**
 * O disparo agendado.
 *
 * Sem worker, quem segura a mensagem até a hora é o próprio banco: cada linha
 * nasce com `scheduled_for` e o batimento só pega o que já venceu. Este teste
 * prova as duas metades — que nada sai antes e que tudo sai depois — porque é
 * exatamente aqui que um erro passa despercebido: uma campanha agendada que
 * dispara na hora da criação só aparece quando o cliente já mandou de
 * madrugada.
 *
 * Há duas comportas, e as duas precisam abrir: `campaigns.scheduled_at`, que
 * tira a campanha de 'agendada', e `dispatches.scheduled_for` de cada linha.
 */

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

let orgId: string | null = null

cenario('disparo agendado', () => {
  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('segura tudo até a hora marcada e então solta de uma vez', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Agenda LTDA', slug: `agenda-${Date.now()}`, credits: '500' })
      .returning()
    if (!org) throw new Error('a organização de teste não foi criada')
    orgId = org.id

    await db.insert(contacts).values(
      Array.from({ length: 5 }, (_, i) => ({
        orgId: org.id,
        phone: `55119876543${10 + i}`,
        name: `Pessoa ${i}`,
      })),
    )

    const [canal] = await db
      .insert(channelConfigs)
      .values({
        orgId: org.id,
        channel: 'sms',
        label: 'SMS de teste',
        provider: 'generico',
        active: true,
      })
      .returning()
    if (!canal) throw new Error('o canal de teste não foi criado')

    const daquiTresHoras = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const criada = await criarCampanha(org.id, null, {
      nome: 'Agendada',
      canal: 'sms',
      configId: canal.id,
      corpo: 'Oi {{primeiro_nome}}',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
      ratePerMinute: 60,
      jitterMs: 0,
      // Janela do dia inteiro: aqui se testa o agendamento, não o silêncio.
      quietStart: 0,
      quietEnd: 0,
      agendarPara: daquiTresHoras,
    })
    if (!criada.ok) throw new Error(criada.erro)
    await materializar(criada.campanhaId, 100)

    const linhas = await db
      .select()
      .from(dispatches)
      .where(eq(dispatches.campaignId, criada.campanhaId))
    expect(linhas).toHaveLength(5)

    // Cada linha nasce marcada para o futuro pedido, não para agora.
    for (const linha of linhas) {
      expect(linha.status).toBe('pendente')
      expect(linha.scheduledFor!.getTime()).toBeGreaterThan(Date.now() + 2.5 * 60 * 60 * 1000)
    }

    // O batimento roda e não encosta em nada: ainda não é hora.
    expect((await bater(100)).tentados).toBe(0)

    // Chega a hora. Adiantar o relógio das duas comportas é o que o cron veria
    // daqui a três horas.
    await sql`UPDATE dispatches SET scheduled_for = now() - interval '1 minute'
              WHERE campaign_id = ${criada.campanhaId}`
    await sql`UPDATE campaigns SET scheduled_at = now() - interval '1 minute'
              WHERE id = ${criada.campanhaId}`

    expect((await bater(100)).tentados).toBe(5)

    const finais = await db
      .select()
      .from(dispatches)
      .where(eq(dispatches.campaignId, criada.campanhaId))
    expect(finais.every((l) => l.status !== 'pendente')).toBe(true)
  })
})
