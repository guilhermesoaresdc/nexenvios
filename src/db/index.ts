import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { opcoesDeConexao } from './conexao'
import * as schema from './schema'

/**
 * Conexão com o Postgres.
 *
 * **Preguiçosa de propósito.** Se o cliente fosse criado no carregamento do
 * módulo, `next build` quebraria em qualquer ambiente sem `DATABASE_URL` — e
 * ele quebrava mesmo: a coleta de dados de página importa as rotas, a rota do
 * batimento importa o motor, e o motor importa isto. Um build que exige o
 * banco de produção para compilar HTML estático é um build frágil.
 *
 * Agora a variável só é exigida na PRIMEIRA CONSULTA, que é quando ela de fato
 * faz falta.
 */

declare global {
  // eslint-disable-next-line no-var
  var __nexPg: ReturnType<typeof postgres> | undefined
  // eslint-disable-next-line no-var
  var __nexDb: ReturnType<typeof drizzle<typeof schema>> | undefined
}

function criarCliente() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL não está configurada. Sem ela o Nex Envios não fala com o banco.',
    )
  }
  // Serverless abre um pool por instância; o pooler do Supabase multiplexa.
  return postgres(url, opcoesDeConexao(url, { max: process.env.VERCEL ? 1 : 10 }))
}

/*
 * Em desenvolvimento o Next recarrega o módulo a cada mudança; sem o global,
 * cada recarga vazaria um pool inteiro até estourar o limite de conexões.
 */
function cliente() {
  globalThis.__nexPg ??= criarCliente()
  return globalThis.__nexPg
}

function orm() {
  globalThis.__nexDb ??= drizzle(cliente(), { schema })
  return globalThis.__nexDb
}

/**
 * O cliente cru (postgres.js), para SQL que o Drizzle não expressa bem.
 *
 * É uma função-tag: `sql\`SELECT …\`` funciona igual. O Proxy existe só para
 * adiar a criação do cliente até a primeira chamada.
 */
export const sql = new Proxy(function () {} as unknown as ReturnType<typeof postgres>, {
  apply: (_alvo, _this, args) =>
    (cliente() as unknown as (...a: unknown[]) => unknown)(...(args as unknown[])),
  get: (_alvo, prop) => Reflect.get(cliente() as object, prop),
})

/** O Drizzle, para as consultas tipadas. */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get: (_alvo, prop) => Reflect.get(orm() as object, prop),
})

export { schema }
export type Db = ReturnType<typeof drizzle<typeof schema>>
