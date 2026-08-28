import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Credencial de provedor criptografada em repouso (AES-256-GCM).
 *
 * O que está no banco é ciphertext. Quem tiver um dump não tem as chaves de
 * API dos clientes — precisa também da ENCRYPTION_KEY, que só existe no
 * ambiente. Perder essa variável torna tudo que foi salvo ilegível: é preciso
 * reconfigurar os canais, não há recuperação.
 *
 * Formato: v1.<iv-base64url>.<tag-base64url>.<ciphertext-base64url>
 * A versão no começo permite trocar de algoritmo sem quebrar o que já existe.
 */

const VERSAO = 'v1'

function chave(): Buffer {
  const bruta = process.env.ENCRYPTION_KEY
  if (!bruta) {
    throw new Error(
      'ENCRYPTION_KEY não está configurada. Gere com: openssl rand -hex 32',
    )
  }
  // Aceita hex de 32 bytes (o formato documentado) ou qualquer texto, que é
  // então esticado por scrypt. O segundo caminho existe para não travar quem
  // colou uma frase; o primeiro é o recomendado.
  if (/^[0-9a-f]{64}$/i.test(bruta)) return Buffer.from(bruta, 'hex')
  return scryptSync(bruta, 'nexenvios-credenciais', 32)
}

export function criptografar(texto: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  const tag = cifra.getAuthTag()
  return [VERSAO, iv.toString('base64url'), tag.toString('base64url'), dados.toString('base64url')].join('.')
}

/** Devolve `null` para qualquer coisa que não decifre — nunca lança. */
export function descriptografar(guardado: string | null | undefined): string | null {
  if (!guardado) return null
  const partes = guardado.split('.')
  if (partes.length !== 4 || partes[0] !== VERSAO) return null
  try {
    const [, iv, tag, dados] = partes
    const decifra = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv!, 'base64url'))
    decifra.setAuthTag(Buffer.from(tag!, 'base64url'))
    return Buffer.concat([decifra.update(Buffer.from(dados!, 'base64url')), decifra.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Guarda um objeto de credenciais inteiro. */
export function guardarSegredo(valor: Record<string, unknown>): string {
  return criptografar(JSON.stringify(valor))
}

export function lerSegredo<T = Record<string, unknown>>(guardado: string | null | undefined): T | null {
  const texto = descriptografar(guardado)
  if (!texto) return null
  try {
    return JSON.parse(texto) as T
  } catch {
    return null
  }
}

/** Mostra só o final da credencial na tela: "••••••3f9a". */
export function mascarar(valor: string | null | undefined): string {
  if (!valor) return '—'
  if (valor.length <= 4) return '••••'
  return `••••••${valor.slice(-4)}`
}
