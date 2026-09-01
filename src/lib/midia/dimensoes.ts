/**
 * Largura e altura lidas do cabeçalho do arquivo.
 *
 * Sem biblioteca de imagem de propósito. O que precisamos é de dois números
 * que moram nos primeiros bytes de cada formato — carregar um decodificador
 * inteiro (e o binário nativo que vem junto) para ler dois inteiros seria
 * pagar caro por nada.
 *
 * Isto não é enfeite de tela. O Monitor de Envios exige foto quadrada de no
 * mínimo 192×192, e foto reprovada não barra o cadastro: derruba a campanha no
 * meio do disparo, com o envio parado até alguém cadastrar outra e esperar
 * nova aprovação. Conferir aqui custa microssegundos.
 *
 * Devolve nulo quando o formato não é reconhecido — quem chama decide se isso
 * é motivo para recusar.
 */

export type Dimensoes = { largura: number; altura: number }

export function dimensoesDaImagem(dados: Uint8Array): Dimensoes | null {
  return png(dados) ?? gif(dados) ?? webp(dados) ?? jpeg(dados)
}

function u16(d: Uint8Array, i: number): number {
  return (d[i]! << 8) | d[i + 1]!
}
function u32(d: Uint8Array, i: number): number {
  return ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0
}
function texto(d: Uint8Array, i: number, n: number): string {
  return String.fromCharCode(...d.subarray(i, i + n))
}

function png(d: Uint8Array): Dimensoes | null {
  // 8 bytes de assinatura, 4 de tamanho, 'IHDR', e então largura e altura.
  if (d.length < 24) return null
  if (d[0] !== 0x89 || texto(d, 1, 3) !== 'PNG') return null
  if (texto(d, 12, 4) !== 'IHDR') return null
  return { largura: u32(d, 16), altura: u32(d, 20) }
}

function gif(d: Uint8Array): Dimensoes | null {
  if (d.length < 10 || texto(d, 0, 3) !== 'GIF') return null
  return { largura: d[6]! | (d[7]! << 8), altura: d[8]! | (d[9]! << 8) }
}

function webp(d: Uint8Array): Dimensoes | null {
  if (d.length < 30 || texto(d, 0, 4) !== 'RIFF' || texto(d, 8, 4) !== 'WEBP') return null
  const forma = texto(d, 12, 4)

  if (forma === 'VP8X') {
    // 24 bits, byte menos significativo primeiro, guardados como "menos um".
    const l = (d[24]! | (d[25]! << 8) | (d[26]! << 16)) + 1
    const a = (d[27]! | (d[28]! << 8) | (d[29]! << 16)) + 1
    return { largura: l, altura: a }
  }
  if (forma === 'VP8 ') {
    // 14 bits cada, logo depois do código de início de quadro.
    return {
      largura: (d[26]! | (d[27]! << 8)) & 0x3fff,
      altura: (d[28]! | (d[29]! << 8)) & 0x3fff,
    }
  }
  if (forma === 'VP8L') {
    const bits = d[21]! | (d[22]! << 8) | (d[23]! << 16) | (d[24]! << 24)
    return { largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1 }
  }
  return null
}

function jpeg(d: Uint8Array): Dimensoes | null {
  if (d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) return null

  let i = 2
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) {
      i += 1
      continue
    }
    const marcador = d[i + 1]!

    // Preenchimento e marcadores sem carga: andam sozinhos.
    if (marcador === 0xff) {
      i += 1
      continue
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      i += 2
      continue
    }

    const tamanho = u16(d, i + 2)
    if (tamanho < 2) return null

    /*
     * SOF0..SOF15 carregam as dimensões — menos 0xC4 (DHT), 0xC8 (JPG) e
     * 0xCC (DAC), que ocupam a mesma faixa e não são início de quadro.
     */
    const eSof =
      marcador >= 0xc0 &&
      marcador <= 0xcf &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc
    if (eSof) return { altura: u16(d, i + 5), largura: u16(d, i + 7) }

    i += 2 + tamanho
  }
  return null
}
