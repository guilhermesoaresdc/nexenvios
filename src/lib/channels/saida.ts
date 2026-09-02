import 'server-only'

/**
 * De qual endereço as nossas chamadas saem.
 *
 * Existe por um pedido concreto do outro lado: o Monitor de Envios mantém uma
 * lista de IPs autorizados (§6.4 da documentação deles — quem está de fora
 * leva 403), e o suporte pediu "me informa seu IP". Sem isto, a única resposta
 * possível era um encolher de ombros.
 *
 * A resposta honesta raramente é UM endereço. A função roda em servidor
 * gerenciado, e o IP de saída vem de um conjunto que muda sem aviso — por isso
 * a tela mostra o valor CRU, medido agora, em vez de guardar um número e
 * jurar que ele é fixo. Conferir duas vezes e ver dois endereços diferentes é
 * a prova de que a whitelist precisa de uma faixa, não de um IP.
 */

/**
 * Espelhos independentes, tentados em ordem.
 *
 * Um só vira ponto único de falha para um diagnóstico que só serve quando a
 * pessoa está justamente com problema de rede. Nenhum deles recebe nada nosso
 * além da própria requisição — sem token, sem identificação.
 */
const ESPELHOS = [
  'https://api.ipify.org',
  'https://checkip.amazonaws.com',
  'https://ifconfig.me/ip',
] as const

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV6 = /^[0-9a-f:]{2,45}$/i

/**
 * Só passa o que É um endereço.
 *
 * O valor daqui vai direto para uma mensagem que a pessoa copia e manda para o
 * suporte do provedor. Um espelho fora do ar devolvendo página de erro viraria
 * "seu IP é <!DOCTYPE html>" — e a conversa começaria pelo pé errado.
 */
export function ehEndereco(bruto: string): boolean {
  const t = bruto.trim()
  if (!t || t.length > 45) return false
  return IPV4.test(t) || (t.includes(':') && IPV6.test(t))
}

export async function enderecoDeSaida(): Promise<string | null> {
  for (const espelho of ESPELHOS) {
    try {
      const resposta = await fetch(espelho, {
        // Curto de propósito: é diagnóstico ao lado de outras consultas, não
        // pode ser ele a estourar o tempo da função.
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      })
      if (!resposta.ok) continue
      const texto = (await resposta.text()).trim()
      if (ehEndereco(texto)) return texto
    } catch {
      // Espelho fora do ar ou saída bloqueada: tenta o próximo.
    }
  }
  return null
}
