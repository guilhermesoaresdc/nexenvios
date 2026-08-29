/**
 * Como falar com o Postgres: TLS, tamanho do pool e prepared statements.
 *
 * Vive separado porque `migrate.ts` (que roda fora do Next, na linha de
 * comando) e `index.ts` (que roda dentro) precisam decidir a MESMA coisa. Já
 * divergiram uma vez: o cliente do app aceitava `127.0.0.1` sem TLS e o
 * migrador não, e a migration morria com ECONNRESET sem dizer por quê.
 */

/** Banco na própria máquina não tem TLS — e exigir TLS dele derruba a conexão. */
export function eLocal(url: string): boolean {
  try {
    const { hostname, searchParams } = new URL(url)
    if (searchParams.get('sslmode') === 'disable') return true
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local')
    )
  } catch {
    return false
  }
}

/**
 * Pooler em modo transação (PgBouncer/Supavisor) não guarda estado entre
 * comandos: prepared statement não sobrevive à troca de sessão.
 */
export function ePooler(url: string): boolean {
  return url.includes(':6543') || url.includes('pooler.supabase') || url.includes('pgbouncer=true')
}

export function opcoesDeConexao(url: string, opcoes: { max?: number } = {}) {
  return {
    max: opcoes.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: !ePooler(url),
    // O certificado do Supabase é de uma CA que o Node não traz na raiz.
    ssl: eLocal(url) ? (false as const) : ({ rejectUnauthorized: false } as const),
    onnotice: () => {},
  }
}
