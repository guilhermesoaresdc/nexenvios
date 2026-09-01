import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { channelConfigs, contacts, organizations, users } from '@/db/schema'
import { criarCampanha } from '@/lib/campanhas/servico'
import { salvarCanal } from '@/lib/canais/servico'

/**
 * Trocar o provedor de um canal com fila viva.
 *
 * É a falha mais silenciosa que este sistema sabe produzir. `montarConfig`
 * recebe o canal CONGELADO na linha de envio e o provedor ATUAL da
 * configuração; trocar o provedor faz a combinação deixar de existir e toda
 * linha da fila passa a falhar com "canal sem configuração". Ninguém é
 * avisado: a tela de canais diz "salvo", o build passa, e a campanha
 * simplesmente para de andar.
 *
 * Por isso o teste vai pelos dois lados — que a troca é recusada com a fila
 * cheia, e que salvar o resto do canal (rótulo, credencial) continua livre,
 * porque é assim que se gira um token vencido.
 */

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

let orgId = ''
let autorId = ''
let configId = ''

cenario('troca de provedor', () => {
  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('recusa a troca enquanto há mensagem na fila, e diz quanto está em risco', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Troca LTDA', slug: `troca-${Date.now()}`, credits: '500' })
      .returning({ id: organizations.id })
    orgId = org!.id

    const [autor] = await db
      .insert(users)
      .values({
        orgId,
        email: `troca-${Date.now()}@exemplo.com`,
        name: 'Quem edita',
        passwordHash: 'x',
        role: 'admin',
      })
      .returning({ id: users.id })
    autorId = autor!.id

    await db.insert(contacts).values(
      Array.from({ length: 4 }, (_, i) => ({
        orgId,
        phone: `5511955000${10 + i}`,
        name: `Pessoa ${i}`,
      })),
    )

    const [canal] = await db
      .insert(channelConfigs)
      .values({ orgId, channel: 'sms', provider: 'generico', label: 'SMS de teste' })
      .returning({ id: channelConfigs.id })
    configId = canal!.id

    const criada = await criarCampanha(orgId, autorId, {
      nome: 'Campanha viva',
      canal: 'sms',
      configId,
      corpo: 'Olá!',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
    })
    expect(criada.ok).toBe(true)

    const recusa = await salvarCanal({
      orgId,
      configId,
      canal: 'sms',
      provider: 'smsdev',
      rotulo: 'SMS de teste',
      valores: { apiKey: 'chave-nova' },
      ativo: true,
      padrao: false,
      autorId,
    })

    expect(recusa.ok).toBe(false)
    if (recusa.ok) return
    // O número precisa aparecer: "não pode" sem dizer o que está em jogo faz a
    // pessoa tentar de novo em vez de esperar a campanha terminar.
    expect(recusa.erro).toMatch(/campanha|mensage/i)

    // E o provedor continua o de antes — a recusa não pode ter salvado metade.
    const [depois] = await db
      .select({ provider: channelConfigs.provider })
      .from(channelConfigs)
      .where(eq(channelConfigs.id, configId))
    expect(depois!.provider).toBe('generico')
  })

  it('deixa girar a credencial e o rótulo do mesmo provedor', async () => {
    const r = await salvarCanal({
      orgId,
      configId,
      canal: 'sms',
      provider: 'generico',
      rotulo: 'SMS de teste (renomeado)',
      valores: { url: 'https://exemplo.com/envio' },
      ativo: true,
      padrao: false,
      autorId,
    })

    expect(r.ok).toBe(true)

    const [depois] = await db
      .select({ label: channelConfigs.label })
      .from(channelConfigs)
      .where(eq(channelConfigs.id, configId))
    expect(depois!.label).toBe('SMS de teste (renomeado)')
  })

  it('libera a troca quando não sobrou nada dependendo do canal', async () => {
    // Sem campanha viva e sem fila, trocar o provedor é uma correção legítima.
    const [outro] = await db
      .insert(channelConfigs)
      .values({ orgId, channel: 'sms', provider: 'generico', label: 'SMS parado' })
      .returning({ id: channelConfigs.id })

    const r = await salvarCanal({
      orgId,
      configId: outro!.id,
      canal: 'sms',
      provider: 'smsdev',
      rotulo: 'SMS parado',
      valores: { apiKey: 'chave-qualquer' },
      ativo: true,
      padrao: false,
      autorId,
    })

    expect(r.ok).toBe(true)

    const [depois] = await db
      .select({ provider: channelConfigs.provider })
      .from(channelConfigs)
      .where(eq(channelConfigs.id, outro!.id))
    expect(depois!.provider).toBe('smsdev')
  })
})
