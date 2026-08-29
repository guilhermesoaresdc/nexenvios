import { beforeAll, describe, expect, it } from 'vitest'

/**
 * A cifra das credenciais. Um dump do banco não pode entregar as chaves de API
 * dos clientes — este teste é o que garante que o que vai para a coluna é
 * ciphertext, e não o segredo com outra cara.
 */

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0'.repeat(64)
})

const { criptografar, descriptografar, guardarSegredo, lerSegredo, mascarar } = await import(
  '@/lib/cripto'
)

describe('criptografar', () => {
  it('ida e volta devolve o texto original', () => {
    const segredo = 'chave-de-api-do-provedor-123'
    expect(descriptografar(criptografar(segredo))).toBe(segredo)
  })

  it('o resultado não contém o texto em claro', () => {
    const segredo = 'senha-super-secreta'
    expect(criptografar(segredo)).not.toContain(segredo)
  })

  it('duas cifragens do mesmo texto são diferentes', () => {
    // IV aleatório: sem isso, dois clientes com a mesma chave de provedor
    // teriam a mesma linha no banco, e isso já é um vazamento.
    expect(criptografar('igual')).not.toBe(criptografar('igual'))
  })

  it('recusa em silêncio o que foi adulterado, em vez de estourar', () => {
    const cifrado = criptografar('um valor secreto qualquer')
    const [versao, iv, tag, dados] = cifrado.split('.')

    /*
     * O byte é virado depois de decodificar, e não trocando um caractere do
     * base64url: base64 é leniente com os bits de sobra do último caractere, e
     * um "troca a última letra" pode não alterar byte nenhum — o teste passaria
     * sem ter testado nada.
     */
    const virarByte = (b64: string, posicao: number) => {
      const bytes = Buffer.from(b64, 'base64url')
      bytes.writeUInt8(bytes.readUInt8(posicao) ^ 0xff, posicao)
      return bytes.toString('base64url')
    }

    // Ciphertext mexido: a tag GCM não confere mais.
    expect(descriptografar([versao, iv, tag, virarByte(dados!, 0)].join('.'))).toBeNull()
    // Tag mexida.
    expect(descriptografar([versao, iv, virarByte(tag!, 0), dados].join('.'))).toBeNull()
    // IV mexido.
    expect(descriptografar([versao, virarByte(iv!, 0), tag, dados].join('.'))).toBeNull()
  })

  it('devolve null para lixo, nulo e formato desconhecido', () => {
    expect(descriptografar(null)).toBeNull()
    expect(descriptografar(undefined)).toBeNull()
    expect(descriptografar('')).toBeNull()
    expect(descriptografar('nao-e-cifrado')).toBeNull()
    expect(descriptografar('v9.a.b.c')).toBeNull()
  })

  it('guarda e lê um objeto inteiro de credenciais', () => {
    const cred = { apiKey: 'abc123', url: 'https://provedor.com.br', porta: 443 }
    const guardado = guardarSegredo(cred)
    expect(guardado).not.toContain('abc123')
    expect(lerSegredo(guardado)).toEqual(cred)
  })

  it('lerSegredo devolve null em vez de estourar com conteúdo inválido', () => {
    expect(lerSegredo(criptografar('isto não é json'))).toBeNull()
    expect(lerSegredo(null)).toBeNull()
  })
})

describe('mascarar', () => {
  it('mostra só o fim da credencial', () => {
    expect(mascarar('abcdefgh3f9a')).toBe('••••••3f9a')
    expect(mascarar('abc')).toBe('••••')
    expect(mascarar(null)).toBe('—')
  })
})
