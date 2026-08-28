import { describe, expect, it } from 'vitest'
import {
  aplicarVariaveis,
  compilarMensagem,
  contarVariantes,
  medirSms,
  primeiroNome,
  resolverSpintax,
  saudacaoDaHora,
  tirarAcentos,
  variaveisUsadas,
} from '@/lib/mensagem'

/** Um sorteio determinístico, para o spintax poder ser testado. */
function sorteioFixo(valores: number[]) {
  let i = 0
  return () => valores[i++ % valores.length]!
}

describe('spintax', () => {
  it('escolhe uma das opções', () => {
    expect(resolverSpintax('{oi|olá|e aí} tudo bem', sorteioFixo([0]))).toBe('oi tudo bem')
    expect(resolverSpintax('{oi|olá|e aí} tudo bem', sorteioFixo([0.5]))).toBe('olá tudo bem')
    expect(resolverSpintax('{oi|olá|e aí} tudo bem', sorteioFixo([0.99]))).toBe('e aí tudo bem')
  })

  it('resolve grupos aninhados de dentro para fora', () => {
    const saida = resolverSpintax('{bom {dia|fim de semana}|olá}', sorteioFixo([0, 0]))
    expect(saida).toBe('bom dia')
  })

  it('não altera texto sem spintax', () => {
    expect(resolverSpintax('mensagem simples')).toBe('mensagem simples')
  })

  it('não entra em laço infinito com chave desemparelhada', () => {
    // Um "{" solto num corpo de 100 mil mensagens travaria o disparo inteiro.
    expect(() => resolverSpintax('{a sem fechar')).not.toThrow()
    expect(resolverSpintax('{a sem fechar')).toBe('{a sem fechar')
  })

  it('conta quantas variantes distintas o texto pode gerar', () => {
    expect(contarVariantes('{a|b} e {c|d|e}')).toBe(6)
    expect(contarVariantes('sem variação')).toBe(1)
  })
})

describe('variáveis', () => {
  it('troca a chave pelo valor', () => {
    expect(aplicarVariaveis('Oi {{nome}}, tudo bem?', { nome: 'Maria' })).toBe(
      'Oi Maria, tudo bem?',
    )
  })

  it('aceita espaço dentro das chaves', () => {
    expect(aplicarVariaveis('Oi {{ nome }}', { nome: 'Ana' })).toBe('Oi Ana')
  })

  it('some com a chave que não tem valor, em vez de deixar {{nome}} na mensagem', () => {
    expect(aplicarVariaveis('Oi {{nome}}!', {})).toBe('Oi !')
  })

  it('lista as variáveis usadas, sem repetir', () => {
    expect(variaveisUsadas('{{nome}} e {{nome}} e {{link}}')).toEqual(['nome', 'link'])
  })

  it('normaliza o primeiro nome — nem GRITO nem desleixo', () => {
    expect(primeiroNome('MARIA APARECIDA SOUZA')).toBe('Maria')
    expect(primeiroNome('joão da silva')).toBe('João')
    expect(primeiroNome('  ')).toBe('')
    expect(primeiroNome(null)).toBe('')
  })

  it('escolhe a saudação pela hora', () => {
    expect(saudacaoDaHora(8)).toBe('Bom dia')
    expect(saudacaoDaHora(14)).toBe('Boa tarde')
    expect(saudacaoDaHora(21)).toBe('Boa noite')
  })
})

describe('compilarMensagem', () => {
  it('resolve variáveis antes do spintax, num passo só', () => {
    const saida = compilarMensagem(
      '{Oi|Olá} {{primeiro_nome}}, seu número {{telefone}}',
      { nome: 'maria souza', telefone: '5511987654321', hora: 10 },
      sorteioFixo([0]),
    )
    expect(saida).toBe('Oi Maria, seu número (11) 98765-4321')
  })

  it('usa os atributos do contato como variáveis', () => {
    const saida = compilarMensagem('Seu código é {{cupom}}', {
      nome: 'Ana',
      atributos: { cupom: 'NEX10' },
      hora: 9,
    })
    expect(saida).toBe('Seu código é NEX10')
  })
})

describe('medirSms', () => {
  it('conta 160 caracteres no alfabeto GSM', () => {
    const m = medirSms('a'.repeat(160))
    expect(m.alfabeto).toBe('gsm')
    expect(m.segmentos).toBe(1)
    expect(m.restam).toBe(0)
  })

  it('vira dois segmentos de 153 ao passar de 160', () => {
    const m = medirSms('a'.repeat(161))
    expect(m.segmentos).toBe(2)
    expect(m.restam).toBe(306 - 161)
  })

  it('UM acento derruba o limite para 70 e triplica o custo', () => {
    // É a armadilha mais cara do SMS: um "ã" numa campanha de 50 mil
    // multiplica a fatura sem nenhum aviso.
    const semAcento = medirSms('a'.repeat(160))
    const comAcento = medirSms('ã'.repeat(160))
    expect(semAcento.segmentos).toBe(1)
    expect(comAcento.alfabeto).toBe('unicode')
    expect(comAcento.segmentos).toBe(3)
    expect(comAcento.forcaramUnicode).toContain('ã')
  })

  it('conta o caractere estendido do GSM por dois', () => {
    // '{' ocupa duas unidades mesmo sendo um símbolo só.
    expect(medirSms('{').unidades).toBe(2)
    expect(medirSms('{').alfabeto).toBe('gsm')
  })

  it('aceita os acentuados que existem na tabela GSM sem virar unicode', () => {
    expect(medirSms('ção não é açaí').alfabeto).toBe('unicode')
    expect(medirSms('à é ù ì ò').alfabeto).toBe('gsm')
  })

  it('tirar acentos faz o texto caber no GSM', () => {
    const antes = medirSms('ação não é possível')
    const depois = medirSms(tirarAcentos('ação não é possível'))
    expect(antes.alfabeto).toBe('unicode')
    expect(depois.alfabeto).toBe('gsm')
  })
})
