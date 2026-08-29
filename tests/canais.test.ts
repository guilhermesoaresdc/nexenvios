import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enviarSms } from '@/lib/channels/sms'
import { enviarWhatsappOficial, enviarWhatsappEvolution } from '@/lib/channels/whatsapp'
import { enviarGenerico } from '@/lib/channels/generico'
import type { Destino } from '@/lib/channels/tipos'

/**
 * Os adaptadores de canal.
 *
 * O que se testa aqui é a CLASSIFICAÇÃO do erro: "sem saldo" e "número
 * inválido" não podem virar a mesma coisa, porque um merece nova tentativa e o
 * outro não — e porque é essa etiqueta que o cliente lê quando pergunta por que
 * não chegou.
 */

const destino: Destino = { para: '5511987654321', nome: 'Maria', corpo: 'Oi' }

function responder(corpo: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

let fetchOriginal: typeof globalThis.fetch

beforeEach(() => {
  fetchOriginal = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = fetchOriginal
  vi.restoreAllMocks()
})

describe('SMS · SMSDev', () => {
  it('aceita quando a situação é OK', async () => {
    globalThis.fetch = responder({ situacao: 'OK', id: '4821' })
    const r = await enviarSms(destino, { provider: 'smsdev', apiKey: 'k' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.providerMessageId).toBe('4821')
  })

  it('trata o 200 com situação ERRO — que é o caminho normal de falha aqui', async () => {
    globalThis.fetch = responder({ situacao: 'ERRO', descricao: 'Saldo insuficiente' })
    const r = await enviarSms(destino, { provider: 'smsdev', apiKey: 'k' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.codigo).toBe('saldo_insuficiente')
      expect(r.reenviavel).toBe(false)
    }
  })

  it('separa número inválido de sem saldo', async () => {
    globalThis.fetch = responder({ situacao: 'ERRO', descricao: 'Numero invalido' })
    const r = await enviarSms(destino, { provider: 'smsdev', apiKey: 'k' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe('destino_invalido')
  })

  it('sem credencial nem chega a chamar o provedor', async () => {
    const chamou = vi.fn()
    globalThis.fetch = chamou
    const r = await enviarSms(destino, { provider: 'smsdev' })
    expect(chamou).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe('sem_credencial')
  })
})

describe('SMS · Comtele', () => {
  it('manda o número sem o código do país, que é o que a Comtele espera', async () => {
    const espiao = responder({ Success: true, Object: 'id-1' })
    globalThis.fetch = espiao
    await enviarSms(destino, { provider: 'comtele', apiKey: 'k', remetente: 'NEX' })

    const corpo = JSON.parse(String((espiao.mock.calls[0]![1] as RequestInit).body))
    expect(corpo.Receivers).toBe('11987654321')
  })

  it('erro 401 é credencial recusada e não se repete', async () => {
    globalThis.fetch = responder({ Success: false, Message: 'unauthorized' }, 401)
    const r = await enviarSms(destino, { provider: 'comtele', apiKey: 'k' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.codigo).toBe('credencial_recusada')
      expect(r.reenviavel).toBe(false)
    }
  })

  it('erro 500 merece nova tentativa', async () => {
    globalThis.fetch = responder({ Success: false }, 500)
    const r = await enviarSms(destino, { provider: 'comtele', apiKey: 'k' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reenviavel).toBe(true)
  })
})

describe('WhatsApp oficial · Meta Cloud', () => {
  it('manda texto simples quando não há template', async () => {
    const espiao = responder({ messages: [{ id: 'wamid.X' }] })
    globalThis.fetch = espiao
    const r = await enviarWhatsappOficial(destino, { phoneNumberId: '1', accessToken: 't' })

    const corpo = JSON.parse(String((espiao.mock.calls[0]![1] as RequestInit).body))
    expect(corpo.type).toBe('text')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.providerMessageId).toBe('wamid.X')
  })

  it('manda template quando o disparo declara um', async () => {
    const espiao = responder({ messages: [{ id: 'wamid.Y' }] })
    globalThis.fetch = espiao
    await enviarWhatsappOficial(
      { ...destino, templateName: 'promocao' },
      { phoneNumberId: '1', accessToken: 't' },
    )

    const corpo = JSON.parse(String((espiao.mock.calls[0]![1] as RequestInit).body))
    expect(corpo.type).toBe('template')
    expect(corpo.template.name).toBe('promocao')
    expect(corpo.template.language.code).toBe('pt_BR')
  })

  it('reconhece o código da Meta para número sem WhatsApp', async () => {
    globalThis.fetch = responder({ error: { code: 131_026, message: 'undeliverable' } }, 400)
    const r = await enviarWhatsappOficial(destino, { phoneNumberId: '1', accessToken: 't' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.codigo).toBe('sem_whatsapp')
      expect(r.reenviavel).toBe(false)
    }
  })

  it('429 vira limite do provedor e pede nova tentativa', async () => {
    globalThis.fetch = responder({ error: { code: 130_429 } }, 429)
    const r = await enviarWhatsappOficial(destino, { phoneNumberId: '1', accessToken: 't' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.codigo).toBe('limite_provedor')
      expect(r.reenviavel).toBe(true)
    }
  })
})

describe('WhatsApp não oficial · Evolution', () => {
  it('usa a rota de texto e a de mídia conforme o disparo', async () => {
    const texto = responder({ key: { id: 'A' } })
    globalThis.fetch = texto
    await enviarWhatsappEvolution(destino, { url: 'https://evo.x', apikey: 'k', instancia: 'chip1' })
    expect(String(texto.mock.calls[0]![0])).toContain('/message/sendText/chip1')

    const midia = responder({ key: { id: 'B' } })
    globalThis.fetch = midia
    await enviarWhatsappEvolution(
      { ...destino, mediaUrl: 'https://x/y.jpg' },
      { url: 'https://evo.x', apikey: 'k', instancia: 'chip1' },
    )
    expect(String(midia.mock.calls[0]![0])).toContain('/message/sendMedia/chip1')
  })

  it('reconhece instância desconectada e pede nova tentativa', async () => {
    globalThis.fetch = responder({ response: { message: 'Connection Closed' } }, 400)
    const r = await enviarWhatsappEvolution(destino, {
      url: 'https://evo.x',
      apikey: 'k',
      instancia: 'chip1',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.codigo).toBe('instancia_desconectada')
      expect(r.reenviavel).toBe(true)
    }
  })

  it('sem instância escolhida não chama a Evolution', async () => {
    const chamou = vi.fn()
    globalThis.fetch = chamou
    const r = await enviarWhatsappEvolution(destino, { url: 'https://evo.x', apikey: 'k' })
    expect(chamou).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })
})

describe('Provedor genérico', () => {
  it('preenche os marcadores do template', async () => {
    const espiao = responder({ data: { id: 'g-1' } })
    globalThis.fetch = espiao

    const r = await enviarGenerico(destino, {
      url: 'https://provedor.x/enviar',
      auth: 'header',
      authHeader: 'x-token',
      apiKey: 'segredo',
      corpoTemplate: '{"numero":"{{para}}","texto":"{{mensagem_json}}","nome":"{{nome}}"}',
      caminhoId: 'data.id',
    })

    const chamada = espiao.mock.calls[0]!
    const corpo = JSON.parse(String((chamada[1] as RequestInit).body))
    expect(corpo).toEqual({ numero: '5511987654321', texto: 'Oi', nome: 'Maria' })
    expect((chamada[1] as RequestInit).headers).toMatchObject({ 'x-token': 'segredo' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.providerMessageId).toBe('g-1')
  })

  it('escapa aspas do texto para não quebrar o JSON do template', async () => {
    const espiao = responder({ id: 1 })
    globalThis.fetch = espiao
    const r = await enviarGenerico(
      { ...destino, corpo: 'ele disse "oi" e saiu' },
      {
        url: 'https://provedor.x',
        corpoTemplate: '{"msg":"{{mensagem_json}}"}',
        auth: 'nenhum',
      },
    )
    expect(r.ok).toBe(true)
    const corpo = JSON.parse(String((espiao.mock.calls[0]![1] as RequestInit).body))
    expect(corpo.msg).toBe('ele disse "oi" e saiu')
  })

  it('recusa antes de chamar quando o template preenchido não é JSON válido', async () => {
    const chamou = vi.fn()
    globalThis.fetch = chamou
    const r = await enviarGenerico(destino, {
      url: 'https://provedor.x',
      corpoTemplate: '{"msg": {{mensagem}} }',
      auth: 'nenhum',
    })
    expect(chamou).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })

  it('trata 200 com erro no corpo, que é o padrão de metade dos gateways', async () => {
    globalThis.fetch = responder({ erro: 'numero bloqueado' })
    const r = await enviarGenerico(destino, {
      url: 'https://provedor.x',
      auth: 'nenhum',
      corpoTemplate: '{}',
      caminhoErro: 'erro',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.mensagem).toContain('numero bloqueado')
  })

  it('a chave na query vai codificada', async () => {
    const espiao = responder({})
    globalThis.fetch = espiao
    await enviarGenerico(destino, {
      url: 'https://provedor.x/api',
      auth: 'query',
      authQuery: 'token',
      apiKey: 'a b&c',
      metodo: 'GET',
    })
    expect(String(espiao.mock.calls[0]![0])).toContain('token=a%20b%26c')
  })

  it('resposta que não é JSON não derruba o envio', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 }))
    const r = await enviarGenerico(destino, {
      url: 'https://provedor.x',
      auth: 'nenhum',
      corpoTemplate: '{}',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reenviavel).toBe(true)
  })
})

describe('montarConfig', () => {
  it('aninha o genérico de SMS sob `generico`, e não no topo', async () => {
    /*
     * Esta é a forma de um bug que passou por build, typecheck e tela de
     * canais sem reclamar: `enviarSms` procura a configuração em
     * `config.generico`, e espalhá-la no topo fazia TODO envio por provedor
     * genérico ser recusado com "canal não configurado" — mensagem nenhuma
     * saindo, sem erro visível em lugar nenhum.
     */
    const { montarConfig } = await import('@/lib/channels')

    const alvo = montarConfig('sms', 'generico', {
      url: 'https://provedor.x/enviar',
      corpoTemplate: '{"to":"{{para}}"}',
    })

    expect(alvo).not.toBeNull()
    expect(alvo!.canal).toBe('sms')
    expect(alvo!.provider).toBe('generico')
    // O adaptador precisa achar a URL exatamente aqui.
    expect((alvo!.config as { generico?: { url?: string } }).generico?.url).toBe(
      'https://provedor.x/enviar',
    )
  })

  it('mantém o SMS nomeado com os campos no topo', async () => {
    const { montarConfig } = await import('@/lib/channels')
    const alvo = montarConfig('sms', 'smsdev', { apiKey: 'k' })
    expect((alvo!.config as { apiKey?: string }).apiKey).toBe('k')
  })

  it('monta cada canal com o provedor que ele aceita', async () => {
    const { montarConfig } = await import('@/lib/channels')

    expect(montarConfig('whatsapp_oficial', 'meta_cloud', { phoneNumberId: '1' })).not.toBeNull()
    expect(montarConfig('whatsapp_nao_oficial', 'evolution', { url: 'x' })).not.toBeNull()
    expect(montarConfig('rcs', 'generico', { url: 'x' })).not.toBeNull()
    expect(montarConfig('voz', 'generico', { url: 'x' })).not.toBeNull()

    // Combinação que não existe devolve null em vez de montar algo errado.
    expect(montarConfig('sms', 'evolution', {})).toBeNull()
    expect(montarConfig('voz', 'smsdev', {})).toBeNull()
  })

  it('canalConfigurado enxerga o genérico aninhado', async () => {
    const { canalConfigurado, montarConfig } = await import('@/lib/channels')
    const alvo = montarConfig('sms', 'generico', { url: 'https://x' })!
    expect(canalConfigurado(alvo)).toBe(true)

    const vazio = montarConfig('sms', 'generico', {})!
    expect(canalConfigurado(vazio)).toBe(false)
  })
})
