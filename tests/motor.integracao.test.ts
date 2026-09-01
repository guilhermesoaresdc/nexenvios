import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

/**
 * O motor de ponta a ponta, contra um Postgres de verdade.
 *
 * Pulado quando `DATABASE_URL` não está no ambiente — não faz sentido travar
 * `npm test` de quem só quer rodar os testes de unidade. Para rodar:
 *
 *   DATABASE_URL=postgres://... npx vitest run tests/motor.integracao.test.ts
 *
 * O provedor é um servidor HTTP local que aceita tudo: o que se testa aqui é o
 * caminho — campanha vira linhas, linhas viram envio, envio vira crédito
 * debitado e campanha concluída — não a integração com terceiro.
 */

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

cenario('motor de disparo', () => {
  let servidor: Server
  let recebidas = 0
  let orgId: string
  let configId: string
  let listaId: string
  let campanhaId: string

  let db: typeof import('@/db')['db']
  let sql: typeof import('@/db')['sql']
  let servico: typeof import('@/lib/campanhas/servico')
  let motor: typeof import('@/lib/delivery/motor')

  beforeAll(async () => {
    const banco = await import('@/db')
    const esquema = await import('@/db/schema')
    const cripto = await import('@/lib/cripto')
    db = banco.db
    sql = banco.sql
    servico = await import('@/lib/campanhas/servico')
    motor = await import('@/lib/delivery/motor')

    process.env.ENCRYPTION_KEY ??= '0'.repeat(64)

    servidor = createServer((req, res) => {
      let corpo = ''
      req.on('data', (c) => (corpo += c))
      req.on('end', () => {
        recebidas += 1
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: { id: `falso-${recebidas}` } }))
      })
    })
    await new Promise<void>((r) => servidor.listen(4599, '127.0.0.1', () => r()))

    const [org] = await db
      .insert(esquema.organizations)
      .values({
        name: 'Motor — teste',
        slug: `motor-teste-${Math.floor(Date.now() / 1000)}`,
        credits: '0',
      })
      .returning({ id: esquema.organizations.id })
    orgId = org!.id

    await db.insert(esquema.creditLedger).values({
      orgId,
      kind: 'recarga',
      delta: '100',
      description: 'Saldo do teste',
    })

    const [canal] = await db
      .insert(esquema.channelConfigs)
      .values({
        orgId,
        channel: 'sms',
        provider: 'generico',
        label: 'Provedor falso',
        credentials: cripto.guardarSegredo({
          url: 'http://127.0.0.1:4599/enviar',
          metodo: 'POST',
          auth: 'nenhum',
          corpoTemplate: '{"to":"{{para}}","msg":"{{mensagem_json}}"}',
          caminhoId: 'data.id',
        }),
      })
      .returning({ id: esquema.channelConfigs.id })
    configId = canal!.id

    const [lista] = await db
      .insert(esquema.contactLists)
      .values({ orgId, name: 'Base do teste' })
      .returning({ id: esquema.contactLists.id })
    listaId = lista!.id

    // 40 contatos, um deles descadastrado — para conferir a barreira.
    const gente = await db
      .insert(esquema.contacts)
      .values(
        Array.from({ length: 40 }, (_, i) => ({
          orgId,
          phone: `5511${String(970000000 + i)}`,
          name: `Contato ${i + 1}`,
          optedOut: i === 0,
        })),
      )
      .returning({ id: esquema.contacts.id })

    await db
      .insert(esquema.contactListMembers)
      .values(gente.map((g) => ({ listId: listaId, contactId: g.id })))
  })

  afterAll(async () => {
    servidor?.close()
    if (orgId) {
      const esquema = await import('@/db/schema')
      await db.delete(esquema.organizations).where(eq(esquema.organizations.id, orgId))
    }
  })

  it('cria a campanha, orça e materializa uma linha por destinatário', async () => {
    const r = await servico.criarCampanha(orgId, null, {
      nome: 'Teste do motor',
      canal: 'sms',
      configId,
      corpo: '{Oi|Olá} {{primeiro_nome}}, teste.',
      fontes: [{ tipo: 'lista', chave: listaId, rotulo: 'Base do teste' }],
      ratePerMinute: 6000,
      jitterMs: 0,
      quietStart: 0,
      quietEnd: 0,
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    campanhaId = r.campanhaId

    // 40 contatos menos o descadastrado.
    expect(r.destinatarios).toBe(39)

    for (let i = 0; i < 20; i += 1) {
      if ((await servico.materializar(campanhaId, 5_000)) === 0) break
    }

    const [linhas] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM dispatches WHERE campaign_id = ${campanhaId}
    `
    expect(linhas?.n).toBe(39)
  })

  it('compila a mensagem por destinatário, com a variável já resolvida', async () => {
    const corpos = await sql<{ body: string }[]>`
      SELECT body FROM dispatches WHERE campaign_id = ${campanhaId} LIMIT 5
    `
    for (const c of corpos) {
      expect(c.body).not.toContain('{{')
      expect(c.body).not.toContain('|')
      expect(c.body).toMatch(/^(Oi|Olá) Contato/)
    }
  })

  it('envia, debita o crédito e conclui a campanha', async () => {
    // Duas batidas: a primeira promove a campanha de agendada para enviando.
    let enviados = 0
    /*
     * Bate até a fila DESTA campanha esvaziar, e não até uma batida vir vazia.
     *
     * O motor espalha os envios no tempo conforme o ritmo: as últimas linhas
     * nascem com `scheduled_for` alguns milissegundos à frente. Como as
     * batidas do teste acontecem em sequência imediata, era normal uma delas
     * não achar nada ainda — e parar por `tentados === 0` deixava duas linhas
     * por enviar. A suíte inteira falhava em 3 de 4 execuções por isso, sempre
     * neste teste, sempre por 2 linhas com `attempts: 0`.
     *
     * Esperar o vencimento é o que a produção faz: uma invocação por minuto,
     * um pedaço por vez.
     */
    const limite = Date.now() + 15_000
    for (;;) {
      const resumo = await motor.bater(100)
      enviados += resumo.enviados

      const [faltam] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM dispatches
         WHERE campaign_id = ${campanhaId} AND status IN ('pendente', 'enviando')
      `
      if ((faltam?.n ?? 0) === 0) break
      if (Date.now() > limite) throw new Error(`${faltam?.n} linha(s) ficaram para trás`)
      await new Promise((ok) => setTimeout(ok, 50))
    }

    expect(enviados).toBe(39)
    expect(recebidas).toBeGreaterThanOrEqual(39)

    const [campanha] = await sql<
      { status: string; sent: number; pending: number; actual_cost: string }[]
    >`
      SELECT status::text, sent, pending, actual_cost::text FROM campaigns WHERE id = ${campanhaId}
    `
    expect(campanha?.status).toBe('concluida')
    expect(campanha?.sent).toBe(39)
    expect(campanha?.pending).toBe(0)

    // 39 mensagens × R$ 0,07 = R$ 2,73.
    expect(Number(campanha?.actual_cost)).toBeCloseTo(2.73, 2)

    const [saldo] = await sql<{ credits: string; consumos: number }[]>`
      SELECT credits::text,
             (SELECT count(*)::int FROM credit_ledger
               WHERE org_id = ${orgId} AND kind = 'consumo') AS consumos
        FROM organizations WHERE id = ${orgId}
    `
    expect(saldo?.consumos).toBe(39)
    expect(Number(saldo?.credits)).toBeCloseTo(100 - 2.73, 2)
  })

  it('não envia duas vezes quando duas batidas rodam ao mesmo tempo', async () => {
    // A reserva é comparação-e-troca com SKIP LOCKED: duas invocações
    // sobrepostas nunca pegam a mesma linha. É a garantia que substitui a
    // fila externa.
    const antes = recebidas
    const [a, b] = await Promise.all([motor.bater(100), motor.bater(100)])
    expect(a.enviados + b.enviados).toBe(0)
    expect(recebidas).toBe(antes)
  })
})
