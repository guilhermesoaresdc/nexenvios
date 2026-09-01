import { createServer, type Server, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

/**
 * O Monitor de Envios, contra um servidor falso.
 *
 * O que precisa ser provado aqui não é que a chamada HTTP sai — é o contrato
 * de dinheiro e de estado, que é onde um erro custa caro:
 *
 * - A campanha delegada NÃO cria linha em `dispatches`. Se criasse, o motor
 *   tentaria enviar de novo o que a plataforma deles já mandou, e o cliente
 *   pagaria duas vezes pela mesma mensagem.
 * - O crédito sai pelo que ANDOU. O progresso deles é acumulado; cobrar o
 *   número cheio a cada consulta debitaria a campanha inteira a cada minuto.
 * - Rejeição vira campanha cancelada com o motivo à vista.
 */

const PORTA = 4703
const BASE_FALSA = `http://127.0.0.1:${PORTA}`

process.env.MONITOR_API_BASE = BASE_FALSA

const temBanco = Boolean(process.env.DATABASE_URL)
const cenario = temBanco ? describe : describe.skip

type EstadoFalso = {
  aprovacao: 'aguardando' | 'aprovado' | 'rejeitado'
  motivo: string | null
  emExecucao: boolean
  statusExecucao: string | null
  enviadas: number
  recebidas: number
  recebeuUpload: Record<string, string> | null
  baseRecebida: string
  /** Liga o 401 do lado deles: token revogado, conta suspensa, IP fora da lista. */
  tokenRevogado: boolean
  /** As rotas que o cliente bateu, para provar o que ele NÃO chamou. */
  rotasChamadas: string[]
  /** O 404 deles: código que não existe naquela conta. */
  campanhaSumida: boolean
  /** O token que chegou na última consulta, e por qual caminho. */
  tokenNaUrl: string | null
  tokenNoCabecalho: string | null
}

const estado: EstadoFalso = {
  aprovacao: 'aguardando',
  motivo: null,
  emExecucao: false,
  statusExecucao: null,
  enviadas: 0,
  recebidas: 0,
  recebeuUpload: null,
  baseRecebida: '',
  tokenRevogado: false,
  rotasChamadas: [],
  campanhaSumida: false,
  tokenNaUrl: null,
  tokenNoCabecalho: null,
}

let servidor: Server | undefined
let orgId = ''
let configId = ''

function json(res: ServerResponse, corpo: unknown) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

cenario('Monitor de Envios', () => {
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const url = new URL(req.url ?? '/', BASE_FALSA)
      estado.rotasChamadas.push(url.pathname)
      estado.tokenNaUrl = url.searchParams.get('api_token')
      estado.tokenNoCabecalho = (req.headers['x-api-token'] as string | undefined) ?? null

      if (estado.campanhaSumida && url.pathname.endsWith('status_aprovacao.php')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ success: false, message: 'Campanha não encontrada.' }))
        return
      }

      if (estado.tokenRevogado && url.pathname.endsWith('.php')) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ success: false, message: 'Token de acesso inválido.' }))
        return
      }

      if (url.pathname.endsWith('receber_campanha_externa.php')) {
        const pedacos: Buffer[] = []
        req.on('data', (p: Buffer) => pedacos.push(p))
        req.on('end', () => {
          const bruto = Buffer.concat(pedacos).toString('utf8')
          const campos: Record<string, string> = {}
          // multipart cru: o suficiente para conferir o que mandamos.
          for (const parte of bruto.split('--')) {
            const nome = /name="([^"]+)"/.exec(parte)?.[1]
            if (!nome) continue
            const valor = parte.split('\r\n\r\n').slice(1).join('\r\n\r\n').trimEnd()
            campos[nome] = valor
          }
          estado.recebeuUpload = campos
          estado.baseRecebida = campos.base_dados ?? ''
          json(res, {
            success: true,
            message: 'Campanha enviada para análise.',
            id: 3042,
            codigo_acompanhamento: 'codigo-falso-123',
          })
        })
        return
      }

      if (url.pathname.endsWith('saldo_empresa.php')) {
        json(res, { success: true, message: 'Saldo recuperado.', data: { saldo: 352781 } })
        return
      }

      if (url.pathname.endsWith('listar_campanhas.php')) {
        json(res, { success: true, message: 'Campanhas recuperadas.', data: [] })
        return
      }

      if (url.pathname.endsWith('status_aprovacao.php')) {
        json(res, {
          success: true,
          data: {
            codigo_acompanhamento: 'codigo-falso-123',
            status: estado.aprovacao,
            status_rotulo: estado.aprovacao,
            motivo_rejeicao: estado.motivo,
            em_execucao: estado.emExecucao,
            status_execucao: estado.statusExecucao,
          },
        })
        return
      }

      if (url.pathname.endsWith('status_campanha.php')) {
        json(res, {
          success: true,
          data: {
            progresso: 50,
            quantidadeEnviada: estado.enviadas,
            quantidadeRecebida: estado.recebidas,
          },
        })
        return
      }

      if (url.pathname.endsWith('respostas_campanha.php')) {
        json(res, { success: true, data: [] })
        return
      }

      if (url.pathname.endsWith('.png')) {
        // PNG mínimo de 1x1: o cliente baixa a foto para repassar como arquivo.
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
          ),
        )
        return
      }

      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((ok) => servidor!.listen(PORTA, '127.0.0.1', ok))

    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')
    const cripto = await import('@/lib/cripto')

    const [org] = await db
      .insert(esquema.organizations)
      .values({ name: 'Delegada LTDA', slug: `del-${Date.now()}`, credits: '1000' })
      .returning({ id: esquema.organizations.id })
    orgId = org!.id

    const [canal] = await db
      .insert(esquema.channelConfigs)
      .values({
        orgId,
        channel: 'whatsapp_nao_oficial',
        provider: 'monitor_envios',
        label: 'Monitor falso',
        credentials: cripto.guardarSegredo({ apiToken: 'token-de-teste' }),
      })
      .returning({ id: esquema.channelConfigs.id })
    configId = canal!.id

    await db.insert(esquema.contacts).values(
      Array.from({ length: 8 }, (_, i) => ({
        orgId,
        phone: `5511970${String(100000 + i)}`,
        name: `Pessoa ${i + 1}`,
      })),
    )

    await db
      .insert(esquema.channelPrices)
      .values({ orgId, channel: 'whatsapp_nao_oficial', price: '0.10' })
  })

  afterAll(async () => {
    servidor?.close()
    if (orgId) {
      const { db } = await import('@/db')
      const esquema = await import('@/db/schema')
      await db.delete(esquema.organizations).where(eq(esquema.organizations.id, orgId))
    }
  })

  const perfil = {
    nome: 'Moveis Silva',
    fotoUrl: `${BASE_FALSA}/avatar.png`,
    nome2: 'Silva Moveis',
    fotoUrl2: `${BASE_FALSA}/avatar-2.png`,
  }

  let campanhaId = ''

  it('submete a campanha inteira e não cria linha de envio nenhuma', async () => {
    const servico = await import('@/lib/campanhas/servico')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    const criada = await servico.criarCampanha(orgId, null, {
      nome: 'Delegada de teste',
      canal: 'whatsapp_nao_oficial',
      configId,
      corpo: 'Olá {{primeiro_nome}}!',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
      perfil,
    })

    expect(criada.ok).toBe(true)
    if (!criada.ok) return
    campanhaId = criada.campanhaId
    expect(criada.destinatarios).toBe(8)

    const [campanha] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))

    // O estado que importa: submetida, esperando o outro lado.
    expect(campanha!.status).toBe('aguardando')
    expect(campanha!.externalCode).toBe('codigo-falso-123')
    expect(campanha!.externalProvider).toBe('monitor_envios')

    // E, principalmente: nenhuma linha para o motor tentar enviar de novo.
    const linhas = await db
      .select()
      .from(esquema.dispatches)
      .where(eq(esquema.dispatches.campaignId, campanhaId))
    expect(linhas).toHaveLength(0)
  })

  it('sem agendamento, manda a data de HOJE — não deixa em branco', () => {
    /*
     * Omitir `data_campanha` faz o Monitor assumir D+1 (§2.0). Quem escolheu
     * "Agora" não pediu amanhã, e a diferença só apareceria no dia seguinte,
     * quando a campanha não saísse.
     */
    const hoje = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date())

    expect(estado.recebeuUpload?.data_campanha).toBe(hoje)
  })

  it('manda os dois perfis e a base com um número por linha', () => {
    expect(estado.recebeuUpload?.perfil_nome).toBe('Moveis Silva')
    expect(estado.recebeuUpload?.perfil_nome_2).toBe('Silva Moveis')
    expect(estado.recebeuUpload?.nome_arquivo_original).toBe(campanhaId)

    const linhas = estado.baseRecebida.trim().split('\n')
    expect(linhas[0]).toBe('telefone,nome')
    expect(linhas).toHaveLength(9)
    expect(linhas[1]).toMatch(/^5511970\d+,"Pessoa/)
  })

  it('enquanto está na fila deles, não cobra nada', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, campanhaId))

    const resumo = await sincronizarExternas()
    expect(resumo.conferidas).toBe(1)

    const lancamentos = await db
      .select()
      .from(esquema.creditLedger)
      .where(eq(esquema.creditLedger.campaignId, campanhaId))
    expect(lancamentos).toHaveLength(0)
  })

  it('cobra só o que andou desde a última conferência', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    estado.aprovacao = 'aprovado'
    estado.emExecucao = true
    estado.statusExecucao = 'Enviando'
    estado.enviadas = 3

    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, campanhaId))
    await sincronizarExternas()

    let [campanha] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))
    expect(campanha!.status).toBe('enviando')
    expect(campanha!.sent).toBe(3)
    expect(campanha!.externalBilled).toBe(3)
    expect(Number(campanha!.actualCost)).toBeCloseTo(0.3, 4)

    // Andou mais duas. Só as duas novas podem ser cobradas.
    estado.enviadas = 5
    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, campanhaId))
    await sincronizarExternas()
    ;[campanha] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))

    expect(campanha!.externalBilled).toBe(5)
    expect(Number(campanha!.actualCost)).toBeCloseTo(0.5, 4)

    const lancamentos = await db
      .select()
      .from(esquema.creditLedger)
      .where(eq(esquema.creditLedger.campaignId, campanhaId))
    expect(lancamentos).toHaveLength(2)
    const somado = lancamentos.reduce((s, l) => s + Number(l.delta), 0)
    expect(somado).toBeCloseTo(-0.5, 4)
  })

  it('enviados e entregues não se somam duas vezes na tela', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    /*
     * As duas contas têm semânticas que precisam casar:
     *
     *   deles:  quantidadeEnviada (sem confirmação) + quantidadeRecebida
     *   nossa:  campaigns.sent    (sem confirmação) + campaigns.delivered
     *
     * A tela faz `saidos = sent + delivered`. Se `sent` guardasse o total
     * processado, "Enviados" contaria os confirmados duas vezes e passaria do
     * total da campanha. Já a COBRANÇA usa a soma — por isso ela vive em
     * `externalBilled`, e não é derivada do que a tela mostra.
     */
    estado.enviadas = 3
    estado.recebidas = 2

    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, campanhaId))
    await sincronizarExternas()

    const [c] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))

    expect(c!.sent).toBe(3)
    expect(c!.delivered).toBe(2)
    // O que a tela soma não pode passar do total da campanha (8 contatos).
    expect(c!.sent + c!.delivered).toBe(5)
    expect(c!.sent + c!.delivered).toBeLessThanOrEqual(c!.total)
    // E a cobrança acompanha a soma, não só o "sem confirmação".
    expect(c!.externalBilled).toBe(5)
  })

  it('uma consulta sem progresso novo não cobra de novo', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, campanhaId))
    await sincronizarExternas()

    const lancamentos = await db
      .select()
      .from(esquema.creditLedger)
      .where(eq(esquema.creditLedger.campaignId, campanhaId))
    expect(lancamentos).toHaveLength(2)
  })

  it('a batida do motor NÃO fecha a campanha delegada que acabou de começar', async () => {
    const { bater } = await import('@/lib/delivery/motor')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    /*
     * A armadilha: campanha delegada não tem linha em `dispatches`, então
     * `fecharConcluidas` via "nenhuma pendente" e a dava por terminada na
     * mesma batida em que o Monitor a aprovava. Como a sincronização pula
     * campanha concluída, o acompanhamento morria ali — progresso congelado
     * e crédito não cobrado, com as mensagens saindo do outro lado.
     */
    const [antes] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))
    expect(antes!.status).toBe('enviando')

    await bater(10)

    const [depois] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))
    expect(depois!.status).toBe('enviando')
  })

  it('não deixa pausar nem cancelar o que já é deles', async () => {
    const servico = await import('@/lib/campanhas/servico')
    expect(await servico.pausar(orgId, campanhaId)).toBe(false)
    expect(await servico.cancelar(orgId, campanhaId)).toBe(-1)
  })

  it('rejeição vira campanha cancelada com o motivo à vista', async () => {
    const servico = await import('@/lib/campanhas/servico')
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    const criada = await servico.criarCampanha(orgId, null, {
      nome: 'Vai ser rejeitada',
      canal: 'whatsapp_nao_oficial',
      configId,
      corpo: 'Texto qualquer',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
      perfil,
    })
    expect(criada.ok).toBe(true)
    if (!criada.ok) return

    estado.aprovacao = 'rejeitado'
    estado.motivo = 'Conteúdo contra os termos de uso.'

    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, criada.campanhaId))
    const resumo = await sincronizarExternas()
    expect(resumo.rejeitadas).toBeGreaterThanOrEqual(1)

    const [campanha] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, criada.campanhaId))
    expect(campanha!.status).toBe('cancelada')
    expect(campanha!.externalReason).toBe('Conteúdo contra os termos de uso.')
  })

  it('barra campanha eleitoral sem a declaração política', async () => {
    const servico = await import('@/lib/campanhas/servico')

    /*
     * Neste canal o corpo vai cru, e a frase de descadastro é a DELES — que
     * só é acrescentada com politica=true. Sem a declaração, a mensagem sairia
     * sem nenhuma saída: art. 57-G descumprido.
     */
    const r = await servico.criarCampanha(orgId, null, {
      nome: 'Eleitoral sem declarar',
      canal: 'whatsapp_nao_oficial',
      configId,
      corpo: 'Vote consciente',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
      perfil,
      eleitoral: true,
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/candidato|partido/i)
  })

  it('campanha eleitoral declarada vai com politica=true e os dados', async () => {
    const servico = await import('@/lib/campanhas/servico')

    const r = await servico.criarCampanha(orgId, null, {
      nome: 'Eleitoral declarada',
      canal: 'whatsapp_nao_oficial',
      configId,
      corpo: 'Vote consciente',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
      perfil,
      eleitoral: true,
      politica: { documento: '12.345.678/0001-95', partido: 'EXEMPLO' },
    })

    expect(r.ok).toBe(true)
    expect(estado.recebeuUpload?.politica).toBe('true')
    expect(estado.recebeuUpload?.politica_documento).toBe('12.345.678/0001-95')
    expect(estado.recebeuUpload?.politica_partido).toBe('EXEMPLO')
    expect(estado.recebeuUpload?.politica_aceite).toBe('true')
  })

  it('recusa perfil reserva igual ao principal antes de gastar o upload', async () => {
    const { conferirSubmissao } = await import('@/lib/channels/monitor')
    const erro = conferirSubmissao({
      nome: 'x',
      copy: 'oi',
      perfil: { nome: 'Igual', fotoUrl: 'a', nome2: 'igual', fotoUrl2: 'b' },
      base: { nomeArquivo: 'b.csv', conteudo: 'telefone\n5511' },
    })
    expect(erro).toMatch(/diferente do principal/)
  })

  it('recusa nome de perfil que a Meta reprova, antes de gastar o upload', async () => {
    const { conferirSubmissao } = await import('@/lib/channels/monitor')
    const erro = conferirSubmissao({
      nome: 'x',
      copy: 'oi',
      // "Turbobet" tem "bet" colado: a Meta bane o número por isso.
      perfil: { nome: 'Turbobet', fotoUrl: 'a', nome2: 'Silva Moveis', fotoUrl2: 'b' },
      base: { nomeArquivo: 'b.csv', conteudo: 'telefone\n5511' },
    })
    expect(erro).toMatch(/Perfil principal/)
    expect(erro).toMatch(/bet/)
  })

  it('token revogado aparece no cartão do canal, não só no log', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    /*
     * O disjuntor tinha um alimentador só: o envio linha a linha. Campanha
     * delegada nunca passa por lá — a plataforma deles é que envia. O efeito
     * era um canal com token revogado marcado como saudável para SEMPRE:
     * "credencial salva", sem falha nenhuma no /admin/provedores, enquanto
     * nada andava e ninguém tinha como saber por quê.
     */
    await db
      .update(esquema.channelConfigs)
      .set({ failureStreak: 0, brokenUntil: null })
      .where(eq(esquema.channelConfigs.id, configId))

    estado.tokenRevogado = true

    for (const esperado of [1, 2]) {
      await db
        .update(esquema.campaigns)
        .set({ externalSyncedAt: null })
        .where(eq(esquema.campaigns.id, campanhaId))
      await sincronizarExternas()

      const [canal] = await db
        .select({ falhas: esquema.channelConfigs.failureStreak })
        .from(esquema.channelConfigs)
        .where(eq(esquema.channelConfigs.id, configId))
      expect(canal!.falhas).toBe(esperado)
    }

    // E a campanha continua viva: consulta que falhou não é campanha perdida.
    const [campanha] = await db
      .select({ status: esquema.campaigns.status })
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, campanhaId))
    expect(campanha!.status).toBe('enviando')
  })

  it('a consulta que volta a funcionar religa o canal', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    estado.tokenRevogado = false
    estado.aprovacao = 'aprovado'
    estado.motivo = null

    // Semeado à mão de propósito: o teste tem que provar que a sincronização
    // ZERA o contador, e não apenas que ele já estava zerado.
    await db
      .update(esquema.channelConfigs)
      .set({ failureStreak: 3 })
      .where(eq(esquema.channelConfigs.id, configId))

    await db
      .update(esquema.campaigns)
      .set({ externalSyncedAt: null })
      .where(eq(esquema.campaigns.id, campanhaId))
    await sincronizarExternas()

    const [canal] = await db
      .select({
        falhas: esquema.channelConfigs.failureStreak,
        quebradoAte: esquema.channelConfigs.brokenUntil,
      })
      .from(esquema.channelConfigs)
      .where(eq(esquema.channelConfigs.id, configId))

    expect(canal!.falhas).toBe(0)
    expect(canal!.quebradoAte).toBeNull()
  })

  it('conferir credencial testa o endpoint do ENVIO, não só o do saldo', async () => {
    const { conferirCredencialDoMonitor } = await import('@/lib/campanhas/externa')

    /*
     * A armadilha que custou uma ida e volta com o suporte deles: o saldo vai
     * pelo cabeçalho `X-API-Token` e a campanha vai como campo `api_token` de
     * um POST. São caminhos diferentes. Conferir só o saldo dava a credencial
     * por boa enquanto a campanha morria com "Token inválido".
     */
    const r = await conferirCredencialDoMonitor(configId)
    expect('erro' in r).toBe(false)
    if ('erro' in r) return

    // O token de teste tem 14 caracteres; a impressão tem que dizer o tamanho,
    // que é o que separa Token (40) de Chave de Acesso (32).
    expect(r.impressao).toMatch(/\(14 caracteres\)/)
    expect(r.impressao).not.toContain('token-de-teste')
    expect(r.upload?.aceito).toBe(true)
  })

  it('quando o envio recusa o token, a conferência reprova mesmo com saldo respondendo', async () => {
    const { conferirTokenNoUpload } = await import('@/lib/channels/monitor')

    estado.tokenRevogado = true
    const r = await conferirTokenNoUpload({ apiToken: 'chave-de-acesso-errada' })
    estado.tokenRevogado = false

    expect(r.aceito).toBe(false)
    expect(r.resposta).toMatch(/[Tt]oken/)
  })

  it('a conferência do token NÃO gasta cota de erro deles', async () => {
    const { conferirTokenNoUpload } = await import('@/lib/channels/monitor')

    /*
     * A política deles bloqueia o IP por 15 minutos depois de 5 respostas 4xx
     * em 5 minutos (§6.1). A primeira versão desta conferência provocava um
     * 400 de propósito — cinco cliques em "Conferir credencial" derrubariam
     * junto o polling de todas as campanhas vivas.
     */
    estado.rotasChamadas = []
    const r = await conferirTokenNoUpload({ apiToken: 'token-de-teste' })

    expect(r.aceito).toBe(true)
    expect(estado.rotasChamadas).toContain('/listar_campanhas.php')
    expect(estado.rotasChamadas.some((rota) => rota.includes('receber_campanha'))).toBe(false)
  })

  it('recusa mídia que o Monitor não aceita, antes de gastar o upload', async () => {
    const { conferirSubmissao } = await import('@/lib/channels/monitor')
    const comum = {
      nome: 'x',
      copy: 'oi',
      perfil: { nome: 'Moveis Silva', fotoUrl: 'a.png', nome2: 'Silva Moveis', fotoUrl2: 'b.png' },
      base: { nomeArquivo: 'b.csv', conteudo: 'telefone\n5511' },
    }

    // PDF e áudio não estão em `midia_campanha`: voltariam 400 DEPOIS do upload.
    expect(conferirSubmissao({ ...comum, mediaUrl: 'https://x/arte.pdf' })).toMatch(/\.pdf/)
    expect(conferirSubmissao({ ...comum, mediaUrl: 'https://x/audio.mp3' })).toMatch(/\.mp3/)

    // Imagem e vídeo passam.
    expect(conferirSubmissao({ ...comum, mediaUrl: 'https://x/arte.jpg' })).toBeNull()
    expect(conferirSubmissao({ ...comum, mediaUrl: 'https://x/video.mp4' })).toBeNull()
    expect(conferirSubmissao({ ...comum, mediaUrl: 'https://x/video.mov' })).toBeNull()
  })

  it('manda o token na URL também, não só no cabeçalho', async () => {
    const { saldoNoMonitor } = await import('@/lib/channels/monitor')

    /*
     * Só o cabeçalho fez `status_aprovacao.php` responder "Campanha não
     * encontrada." a cada minuto, em produção, para uma campanha que existia:
     * sem reconhecer a conta, a busca pelo código não acha nada. A seção 1 da
     * documentação deles promete que os dois caminhos valem — mandar os dois
     * custa nada e é o que os exemplos deles fazem.
     */
    await saldoNoMonitor({ apiToken: 'token-de-teste' })
    expect(estado.tokenNaUrl).toBe('token-de-teste')
    expect(estado.tokenNoCabecalho).toBe('token-de-teste')
  })

  it('campanha aceita por eles NUNCA vira falha por erro de leitura', async () => {
    const { sincronizarExternas } = await import('@/lib/campanhas/externa')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    /*
     * Aconteceu em produção, duas vezes: campanha ACEITA pelo Monitor — com
     * código de acompanhamento e status "aguardando" do lado deles — cujo
     * `status_aprovacao.php` respondia "Campanha não encontrada." A primeira
     * versão desta regra desistia depois de cinco tentativas e marcava a
     * campanha como `falhou`.
     *
     * Isso é pior do que o problema que resolvia: a tela passa a afirmar que
     * não saiu algo que pode estar saindo naquele instante, a campanha some do
     * acompanhamento e nada é cobrado. Não conseguir LER o status é problema
     * nosso de leitura, não notícia sobre a campanha.
     */
    const criada = await (await import('@/lib/campanhas/servico')).criarCampanha(orgId, null, {
      nome: 'Some do lado deles',
      canal: 'whatsapp_nao_oficial',
      configId,
      corpo: 'Texto',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
      perfil,
    })
    expect(criada.ok).toBe(true)
    if (!criada.ok) return

    await db
      .update(esquema.channelConfigs)
      .set({ failureStreak: 0, brokenUntil: null })
      .where(eq(esquema.channelConfigs.id, configId))

    estado.campanhaSumida = true
    for (let i = 0; i < 5; i += 1) {
      await db
        .update(esquema.campaigns)
        .set({ externalSyncedAt: null })
        .where(eq(esquema.campaigns.id, criada.campanhaId))
      await sincronizarExternas()
    }
    estado.campanhaSumida = false

    const [campanha] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, criada.campanhaId))

    // Continua viva, com o aviso escrito — e NÃO marcada como falha.
    expect(campanha!.status).toBe('aguardando')
    expect(campanha!.externalReason).toMatch(/[Ss]em acompanhamento/)
    expect(campanha!.externalSyncFailures).toBeGreaterThan(0)

    // E o canal continua limpo: o problema era da campanha, não da credencial.
    const [canal] = await db
      .select({ falhas: esquema.channelConfigs.failureStreak })
      .from(esquema.channelConfigs)
      .where(eq(esquema.channelConfigs.id, configId))
    expect(canal!.falhas).toBe(0)
  })

  it('SMS pelo Monitor também é campanha inteira, não fila de mensagens', async () => {
    const servico = await import('@/lib/campanhas/servico')
    const { db } = await import('@/db')
    const esquema = await import('@/db/schema')

    /*
     * A documentação deles não tem seção de SMS: nenhum campo de canal, nenhum
     * endpoint separado. Quem decide a entrega é a conta do lado deles, então
     * o envio é o mesmo `receber_campanha_externa.php` — inclusive com
     * `perfil_nome` e `foto_perfil`, que são obrigatórios ali qualquer que
     * seja o canal.
     *
     * O que este teste protege é o nosso lado: SMS por provedor delegado NÃO
     * pode materializar linha em `dispatches`, senão o motor tentaria mandar
     * de novo o que o Monitor já mandou e o cliente pagaria duas vezes.
     */
    const [canalSms] = await db
      .insert(esquema.channelConfigs)
      .values({
        orgId,
        channel: 'sms',
        provider: 'monitor_envios',
        label: 'SMS pelo Monitor',
        credentials: (await import('@/lib/cripto')).guardarSegredo({
          apiToken: 'token-de-teste',
          perfilNome: perfil.nome,
          perfilFoto: perfil.fotoUrl,
          perfilNome2: perfil.nome2,
          perfilFoto2: perfil.fotoUrl2,
        }),
      })
      .returning({ id: esquema.channelConfigs.id })

    await db
      .insert(esquema.channelPrices)
      .values({ orgId, channel: 'sms', price: '0.07' })
      .onConflictDoNothing()

    /*
     * Sem perfil no disparo, de propósito: em SMS ninguém vê nome nem foto.
     * O valor vem do CANAL, que foi criado com as mesmas credenciais do
     * WhatsApp — incluindo os quatro campos de perfil.
     */
    const criada = await servico.criarCampanha(orgId, null, {
      nome: 'SMS de teste',
      canal: 'sms',
      configId: canalSms!.id,
      corpo: 'Mensagem curta de SMS',
      fontes: [{ tipo: 'todos', chave: 'todos', rotulo: 'Base inteira' }],
    })

    expect(criada.ok).toBe(true)
    if (!criada.ok) return

    const [campanha] = await db
      .select()
      .from(esquema.campaigns)
      .where(eq(esquema.campaigns.id, criada.campanhaId))
    expect(campanha!.channel).toBe('sms')
    expect(campanha!.status).toBe('aguardando')
    expect(campanha!.externalProvider).toBe('monitor_envios')

    const linhas = await db
      .select()
      .from(esquema.dispatches)
      .where(eq(esquema.dispatches.campaignId, criada.campanhaId))
    expect(linhas).toHaveLength(0)

    // E o preço cobrado é o do canal SMS, não o do WhatsApp.
    expect(Number(campanha!.unitPrice)).toBeCloseTo(0.07, 4)

    /*
     * O perfil VAI no POST, vindo do canal.
     *
     * A hipótese de que o SMS dispensaria perfil era razoável — a
     * documentação deles não tem seção de SMS — mas a API respondeu "Campo
     * 'perfil_nome' é obrigatório." também ali. O que a tela evita é pedir
     * isso a cada disparo; o valor sai do cadastro do canal.
     */
    expect(estado.recebeuUpload?.perfil_nome).toBe('Moveis Silva')
    expect(estado.recebeuUpload?.perfil_nome_2).toBe('Silva Moveis')
  })

  it('a régua do perfil vale em todo canal — muda só onde cadastrar', async () => {
    const { conferirSubmissao } = await import('@/lib/channels/monitor')
    const vazio = { nome: '', fotoUrl: '', nome2: '', fotoUrl2: '' }
    const base = { nomeArquivo: 'b.csv', conteudo: 'telefone\n5511' }

    // Sem canal declarado ou em WhatsApp: perfil é obrigatório, como antes.
    expect(conferirSubmissao({ nome: 'x', copy: 'oi', perfil: vazio, base })).toMatch(/dois nomes/)
    expect(
      conferirSubmissao({ nome: 'x', copy: 'oi', perfil: vazio, base, canal: 'whatsapp_nao_oficial' }),
    ).toMatch(/dois nomes/)

    /*
     * Em SMS também — a API deles respondeu "Campo 'perfil_nome' é
     * obrigatório." para uma campanha nossa. O que muda é a mensagem, que
     * manda cadastrar no canal em vez de preencher a cada disparo.
     */
    const noSms = conferirSubmissao({ nome: 'x', copy: 'oi', perfil: vazio, base, canal: 'sms' })
    expect(noSms).toMatch(/dois nomes/)
    expect(noSms).toMatch(/Canais/)
  })

  it('recusa copy acima do limite com mídia', async () => {
    const { conferirSubmissao, LIMITES } = await import('@/lib/channels/monitor')
    const erro = conferirSubmissao({
      nome: 'x',
      copy: 'a'.repeat(LIMITES.copyComMidia + 1),
      perfil: { nome: 'Moveis Silva', fotoUrl: 'a', nome2: 'Silva Moveis', fotoUrl2: 'b' },
      base: { nomeArquivo: 'b.csv', conteudo: 'telefone\n5511' },
      mediaUrl: 'https://exemplo/x.jpg',
    })
    expect(erro).toMatch(new RegExp(String(LIMITES.copyComMidia)))
  })
})
