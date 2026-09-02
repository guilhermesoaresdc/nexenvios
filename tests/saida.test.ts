import { describe, expect, it } from 'vitest'
import { ehEndereco } from '@/lib/channels/saida'

/**
 * O IP de saída vai direto para uma mensagem que a pessoa COPIA e manda para o
 * suporte do provedor, pedindo autorização. Isso muda o que o validador tem
 * que fazer: não basta "parece um IP" — o que passar daqui vira uma afirmação
 * nossa sobre a nossa infraestrutura, dita para gente de fora.
 *
 * O caso que motivou o teste é o espelho fora do ar: um serviço de eco que
 * responde 200 com página de erro faria a conferência anunciar
 * "esta consulta saiu do IP <!DOCTYPE html>".
 */
describe('endereço de saída', () => {
  it('aceita IPv4 e IPv6 de verdade', () => {
    for (const bom of [
      '76.76.21.21',
      '0.0.0.0',
      '255.255.255.255',
      '2600:1f18:6cf:5900::1',
      '::1',
    ]) {
      expect(ehEndereco(bom), bom).toBe(true)
    }
  })

  it('recusa o que só se parece com um endereço', () => {
    for (const ruim of [
      '',
      '   ',
      '256.1.1.1', // octeto fora da faixa
      '1.2.3', // faltando um
      '1.2.3.4.5',
      '01.2.3.4', // zero à esquerda: nem sempre é lido como decimal
      'localhost',
      '<!DOCTYPE html>',
      '<html><body>error</body></html>',
      'Your IP is 8.8.8.8',
      'nao-foi-possivel',
      // Comprido demais para ser endereço, e o começo passaria por IPv6.
      `2600:${'a'.repeat(60)}`,
    ]) {
      expect(ehEndereco(ruim), JSON.stringify(ruim)).toBe(false)
    }
  })

  it('ignora espaço em volta — os espelhos devolvem com quebra de linha', () => {
    expect(ehEndereco('76.76.21.21\n')).toBe(true)
    expect(ehEndereco('  2600:1f18:6cf:5900::1  ')).toBe(true)
  })
})
