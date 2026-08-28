import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'
import { TAMANHO_MINIMO_SENHA } from './regras'

/**
 * Hash de senha com scrypt do `node:crypto`.
 *
 * scrypt e não argon2/bcrypt porque é memória-dura, recomendado pela OWASP e
 * vem no Node — sem dependência nativa para compilar, o que mantém o deploy
 * serverless viável.
 *
 * Formato: scrypt$N$r$p$salt-base64$hash-base64. Guardar os parâmetros junto
 * permite endurecê-los depois sem invalidar as senhas já cadastradas.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

// 2^15 e não 2^16: a Vercel dá 1 vCPU à função, e o custo maior levava o login
// a passar de um segundo. Continua muito acima do mínimo recomendado.
const N = 2 ** 15
const r = 8
const p = 1
const TAMANHO_CHAVE = 64
const TAMANHO_SAL = 16
const MAX_MEM = 128 * N * r * 2

export { TAMANHO_MINIMO_SENHA }

export async function gerarHash(senha: string): Promise<string> {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
  }
  const sal = randomBytes(TAMANHO_SAL)
  const derivada = await scrypt(senha.normalize('NFKC'), sal, TAMANHO_CHAVE, { N, r, p, maxmem: MAX_MEM })
  return ['scrypt', N, r, p, sal.toString('base64'), derivada.toString('base64')].join('$')
}

/**
 * Verifica em tempo constante. Devolve `false` para qualquer formato inválido
 * em vez de lançar: um hash corrompido no banco não pode derrubar o login.
 */
export async function conferirSenha(senha: string, guardado: string | null): Promise<boolean> {
  if (!guardado) return false
  const partes = guardado.split('$')
  if (partes.length !== 6) return false

  const [esquema, rawN, rawR, rawP, rawSal, rawHash] = partes
  if (esquema !== 'scrypt') return false

  const pN = Number(rawN)
  const pR = Number(rawR)
  const pP = Number(rawP)
  if (!Number.isInteger(pN) || !Number.isInteger(pR) || !Number.isInteger(pP)) return false
  // Impede que um hash adulterado force uma alocação absurda de memória.
  if (pN < 2 || pN > 2 ** 20 || pR < 1 || pR > 32 || pP < 1 || pP > 16) return false

  let sal: Buffer
  let esperado: Buffer
  try {
    sal = Buffer.from(rawSal ?? '', 'base64')
    esperado = Buffer.from(rawHash ?? '', 'base64')
  } catch {
    return false
  }
  if (sal.length === 0 || esperado.length === 0) return false

  try {
    const derivada = await scrypt(senha.normalize('NFKC'), sal, esperado.length, {
      N: pN,
      r: pR,
      p: pP,
      maxmem: 128 * pN * pR * 2,
    })
    return timingSafeEqual(derivada, esperado)
  } catch {
    return false
  }
}

/** Senha aleatória legível — sem 0/O nem 1/l/I, porque é lida em voz alta. */
export function gerarSenha(tamanho = 20): string {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(tamanho)
  let saida = ''
  for (let i = 0; i < tamanho; i += 1) saida += alfabeto[bytes[i]! % alfabeto.length]
  return saida
}
