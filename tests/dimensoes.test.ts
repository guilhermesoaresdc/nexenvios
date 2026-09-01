import { describe, expect, it } from 'vitest'
import { dimensoesDaImagem } from '@/lib/midia/dimensoes'

/**
 * O leitor de cabeçalho de imagem.
 *
 * Vale um teste por formato porque o que ele decide não é cosmético: é este
 * número que barra a foto de perfil fora do quadrado antes do upload. Errar
 * para MENOS recusa uma foto boa e trava quem está cadastrando; errar para
 * MAIS deixa passar a que o Monitor reprova — e reprovação lá derruba a
 * campanha no meio do disparo, não na hora de criar.
 *
 * Os arquivos são montados aqui, byte a byte, porque é exatamente o cabeçalho
 * que está sob teste.
 */

function png(largura: number, altura: number): Uint8Array {
  const d = new Uint8Array(24)
  d.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  d.set([0, 0, 0, 13], 8)
  d.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
  new DataView(d.buffer).setUint32(16, largura)
  new DataView(d.buffer).setUint32(20, altura)
  return d
}

function gif(largura: number, altura: number): Uint8Array {
  const d = new Uint8Array(13)
  d.set([...'GIF89a'].map((c) => c.charCodeAt(0)), 0)
  new DataView(d.buffer).setUint16(6, largura, true)
  new DataView(d.buffer).setUint16(8, altura, true)
  return d
}

function webpVP8X(largura: number, altura: number): Uint8Array {
  const d = new Uint8Array(30)
  d.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0)
  d.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8)
  d.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12)
  const l = largura - 1
  const a = altura - 1
  d.set([l & 0xff, (l >> 8) & 0xff, (l >> 16) & 0xff], 24)
  d.set([a & 0xff, (a >> 8) & 0xff, (a >> 16) & 0xff], 27)
  return d
}

/** JPEG com um APP0 e um DHT ANTES do SOF0 — o arranjo mais comum de verdade. */
function jpeg(largura: number, altura: number): Uint8Array {
  const partes: number[] = [0xff, 0xd8]

  // APP0 (JFIF), 16 bytes de carga.
  partes.push(0xff, 0xe0, 0x00, 0x10)
  partes.push(...new Array(14).fill(0))

  /*
   * 0xC4 é DHT, e cai bem no meio da faixa 0xC0–0xCF do SOF. Pular por engano
   * como se fosse início de quadro devolveria lixo como dimensão — é o erro
   * clássico deste parser, e é o que esta parte do arquivo existe para pegar.
   */
  partes.push(0xff, 0xc4, 0x00, 0x06, 0, 0, 0, 0)

  // SOF0: tamanho 17, precisão 8, altura, largura.
  partes.push(0xff, 0xc0, 0x00, 0x11, 0x08)
  partes.push((altura >> 8) & 0xff, altura & 0xff)
  partes.push((largura >> 8) & 0xff, largura & 0xff)
  partes.push(...new Array(6).fill(0))

  return new Uint8Array(partes)
}

describe('dimensões pelo cabeçalho', () => {
  it('lê PNG', () => {
    expect(dimensoesDaImagem(png(512, 512))).toEqual({ largura: 512, altura: 512 })
    expect(dimensoesDaImagem(png(1080, 1920))).toEqual({ largura: 1080, altura: 1920 })
  })

  it('lê o PNG de 1×1 que os testes usam como imagem de mentira', () => {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    expect(dimensoesDaImagem(new Uint8Array(bytes))).toEqual({ largura: 1, altura: 1 })
  })

  it('lê GIF, com os bytes ao contrário', () => {
    expect(dimensoesDaImagem(gif(300, 200))).toEqual({ largura: 300, altura: 200 })
  })

  it('lê WebP estendido, que guarda a medida menos um', () => {
    expect(dimensoesDaImagem(webpVP8X(640, 480))).toEqual({ largura: 640, altura: 480 })
  })

  it('lê JPEG pulando os segmentos que não são início de quadro', () => {
    expect(dimensoesDaImagem(jpeg(192, 192))).toEqual({ largura: 192, altura: 192 })
    // Deitada: é o caso que o cadastro precisa recusar.
    expect(dimensoesDaImagem(jpeg(1600, 900))).toEqual({ largura: 1600, altura: 900 })
  })

  it('devolve nulo para o que não é imagem', () => {
    expect(dimensoesDaImagem(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull() // %PDF
    expect(dimensoesDaImagem(new Uint8Array(0))).toBeNull()
    expect(dimensoesDaImagem(new Uint8Array([0xff, 0xd8]))).toBeNull() // JPEG truncado
  })
})
