import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Conexão com o Postgres do Supabase.
 *
 * Serverless não perdoa pool grande: cada instância da função abre o seu, e o
 * Supabase corta em algumas dezenas de conexões. Por isso `max: 1` na Vercel —
 * o pooler do Supabase (porta 6543) faz o trabalho de multiplexar.
 *
 * `prepare: false` é obrigatório com o pooler em modo transaction: prepared
 * statements não sobrevivem à troca de sessão do PgBouncer.
 */

declare global {
  // eslint-disable-next-line no-var
  var __nexPg: ReturnType<typeof postgres> | undefined
}

function url(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    throw new Error(
      'DATABASE_URL não está configurada. Sem ela o Nex Envios não fala com o banco.',
    )
  }
  return raw
}

function criar() {
  const conexao = url()
  const naVercel = Boolean(process.env.VERCEL)
  const pooler = conexao.includes(':6543') || conexao.includes('pooler.supabase')

  return postgres(conexao, {
    max: naVercel ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: !pooler,
    // O Supabase exige TLS; o certificado é de uma CA que o Node não traz.
    ssl: conexao.includes('localhost') ? false : { rejectUnauthorized: false },
    onnotice: () => {},
  })
}

// Em desenvolvimento o Next recarrega o módulo a cada mudança; sem o global,
// cada recarga vazaria um pool inteiro até estourar o limite do Supabase.
const sql = globalThis.__nexPg ?? criar()
if (process.env.NODE_ENV !== 'production') globalThis.__nexPg = sql

export const db = drizzle(sql, { schema })
export { sql, schema }
export type Db = typeof db
