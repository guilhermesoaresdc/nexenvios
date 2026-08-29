import { describe, expect, it } from 'vitest'

/**
 * O tradutor do webhook de retorno.
 *
 * É o que transforma "delivered", "READ" e `{ status: 3 }` de três provedores
 * diferentes no mesmo vocabulário. Um erro aqui não derruba nada — só faz toda
 * mensagem ficar "enviada" para sempre na tela do cliente, que é pior.
 *
 * As funções são privadas do módulo de rota; o teste reimplementa o contrato
 * que elas precisam cumprir e exercita o formato de cada provedor.
 */

const ORDEM: Record<string, number> = {
  pendente: 0,
  enviando: 1,
  enviado: 2,
  entregue: 3,
  lido: 4,
  respondido: 5,
}

function traduzirStatus(bruto: string): string | null {
  const s = bruto.toLowerCase()
  if (['delivered', 'delivery_ack', 'entregue', 'received'].includes(s)) return 'entregue'
  if (['read', 'lido', 'played'].includes(s)) return 'lido'
  if (['sent', 'enviado', 'server_ack', 'accepted'].includes(s)) return 'enviado'
  if (['failed', 'undelivered', 'falhou', 'error', 'rejected'].includes(s)) return 'falhou'
  return null
}

function soAvanca(atual: string, novo: string): boolean {
  if (novo === 'falhou') return true
  return (ORDEM[novo] ?? -1) > (ORDEM[atual] ?? -1)
}

describe('traduzirStatus', () => {
  it('entende o vocabulário da Meta', () => {
    expect(traduzirStatus('sent')).toBe('enviado')
    expect(traduzirStatus('delivered')).toBe('entregue')
    expect(traduzirStatus('read')).toBe('lido')
    expect(traduzirStatus('failed')).toBe('falhou')
  })

  it('entende o vocabulário da Evolution', () => {
    expect(traduzirStatus('SERVER_ACK')).toBe('enviado')
    expect(traduzirStatus('DELIVERY_ACK')).toBe('entregue')
    expect(traduzirStatus('READ')).toBe('lido')
  })

  it('devolve null para o que não reconhece, em vez de inventar', () => {
    expect(traduzirStatus('pending_enroute')).toBeNull()
    expect(traduzirStatus('')).toBeNull()
  })
})

describe('só avança', () => {
  it('não deixa um webhook atrasado desfazer a entrega', () => {
    // Webhooks chegam fora de ordem o tempo todo. Sem esta regra, o "sent"
    // que atrasou apagaria o "delivered" que já tinha chegado.
    expect(soAvanca('entregue', 'enviado')).toBe(false)
    expect(soAvanca('lido', 'entregue')).toBe(false)
  })

  it('deixa avançar', () => {
    expect(soAvanca('enviado', 'entregue')).toBe(true)
    expect(soAvanca('entregue', 'lido')).toBe(true)
  })

  it('falha é terminal e sempre vale', () => {
    expect(soAvanca('lido', 'falhou')).toBe(true)
  })
})

describe('pedido de saída', () => {
  const PEDIDOS = ['pare', 'sair', 'stop', 'descadastrar', 'remover', 'cancelar']

  const limpar = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase()

  it('reconhece com acento, em caixa alta e com espaço em volta', () => {
    for (const t of ['PARE', ' Pare ', 'sair', 'SAIR', 'Descadastrar', 'cancelar']) {
      expect(PEDIDOS.includes(limpar(t)), `falhou em "${t}"`).toBe(true)
    }
  })

  it('não descadastra quem só usou a palavra numa frase', () => {
    // "pare de me mandar" é um pedido, mas "não pare de mandar ofertas" é o
    // contrário. Exigir a palavra sozinha erra menos do que adivinhar.
    expect(PEDIDOS.includes(limpar('não pare de mandar'))).toBe(false)
    expect(PEDIDOS.includes(limpar('quero sair do trabalho hoje'))).toBe(false)
  })
})
