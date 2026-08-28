/**
 * Limite de tentativas de login, em memória.
 *
 * Em memória porque não há Redis nesta instalação — e, na Vercel, cada função
 * tem a sua. Isso quer dizer que o limite é POR INSTÂNCIA, não global: um
 * atacante distribuído passa por cima. O que ele resolve de fato é força bruta
 * ingênua contra um único endereço, que é o caso comum.
 *
 * A defesa real contra ataque distribuído é o custo do scrypt no `conferirSenha`
 * — cada tentativa errada custa CPU ao servidor, mas custa tempo ao atacante.
 */

type Registro = { tentativas: number; ate: number }

const JANELA_MS = 15 * 60 * 1000
const TETO = 10

const registros = new Map<string, Registro>()

export function registrarTentativa(chave: string): { bloqueado: boolean; restam: number } {
  const agora = Date.now()
  const atual = registros.get(chave)

  if (!atual || atual.ate <= agora) {
    registros.set(chave, { tentativas: 1, ate: agora + JANELA_MS })
    return { bloqueado: false, restam: TETO - 1 }
  }

  atual.tentativas += 1
  // Higiene: sem isto o Map cresce sem teto numa instância de vida longa.
  if (registros.size > 5000) {
    for (const [k, v] of registros) if (v.ate <= agora) registros.delete(k)
  }
  return { bloqueado: atual.tentativas > TETO, restam: Math.max(TETO - atual.tentativas, 0) }
}

export function limparTentativas(chave: string): void {
  registros.delete(chave)
}
