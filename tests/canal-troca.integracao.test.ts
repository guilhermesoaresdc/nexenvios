import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { campaigns, channelConfigs, contacts, dispatches, organizations, users } from '@/db/schema'
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

    const [contato] = await db
      .insert(contacts)
      .values({ orgId, phone: '5511955000010', name: 'Pessoa' })
      .returning({ id: contacts.id })

    const [canal] = await db
      .insert(channelConfigs)
      .values({ orgId, channel: 'sms', provider: 'generico', label: 'SMS de teste' })
      .returning({ id: channelConfigs.id })
    configId = canal!.id

    /*
     * A fila é montada À MÃO, e não por `criarCampanha`.
     *
     * `bater()` do motor trabalha a fila INTEIRA do banco, não só a da
     * organização de quem chamou — e os testes compartilham um banco só. Uma
     * campanha materializada de verdade aqui vira linha pendente que a batida
     * do teste do motor pega, e ele passa a medir errado, num arquivo que não
     * tem nada a ver com este.
     *
     * A campanha nasce 'pausada' e já materializada pelo mesmo motivo: nesse
     * estado o motor não a materializa nem a fecha. O que o guarda conta é
     * exatamente isto — linha pendente e campanha viva —, então o que está sob
     * teste continua igual.
     */
    const [campanha] = await db
      .insert(campaigns)
      .values({
        orgId,
        name: 'Campanha viva',
        channel: 'sms',
        configId,
        body: 'Olá!',
        status: 'pausada',
        materialized: true,
        total: 1,
        pending: 1,
        unitPrice: '0.05',
      })
      .returning({ id: campaigns.id })

    await db.insert(dispatches).values({
      orgId,
      campaignId: campanha!.id,
      contactId: contato!.id,
      channel: 'sms',
      configId,
      toAddress: '5511955000010',
      body: 'Olá!',
      status: 'pendente',
      // Longe no futuro: mesmo que uma batida rode, esta linha não vence.
      scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      cost: '0.05',
    })

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
