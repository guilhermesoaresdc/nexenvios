/**
 * Log de aplicação.
 *
 * Regra dura: NENHUM dado pessoal aqui. Telefone, e-mail, nome e documento
 * nunca vão para stdout — nem em objeto de contexto, nem em mensagem de erro
 * repassada do provedor. Quando precisar identificar uma linha, use o id.
 */

type Nivel = 'debug' | 'info' | 'warn' | 'error'

const ORDEM: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MINIMO = ORDEM[(process.env.LOG_LEVEL as Nivel) ?? 'info'] ?? 20

function escrever(nivel: Nivel, escopo: string, mensagem: string, ctx?: Record<string, unknown>) {
  if (ORDEM[nivel] < MINIMO) return
  const linha = { t: new Date().toISOString(), nivel, escopo, mensagem, ...ctx }
  const saida = JSON.stringify(linha)
  if (nivel === 'error') console.error(saida)
  else if (nivel === 'warn') console.warn(saida)
  else console.log(saida)
}

export function criarLog(escopo: string) {
  return {
    debug: (m: string, c?: Record<string, unknown>) => escrever('debug', escopo, m, c),
    info: (m: string, c?: Record<string, unknown>) => escrever('info', escopo, m, c),
    warn: (m: string, c?: Record<string, unknown>) => escrever('warn', escopo, m, c),
    error: (m: string, c?: Record<string, unknown>) => escrever('error', escopo, m, c),
  }
}
