import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { opcoesDeConexao } from './conexao'
import type { Db } from './index'
import * as schema from './schema'
import { criarLog } from '@/lib/log'

export const PRAZO_PAGINA_MS = 20_000
const log = criarLog('pagina-db')
type Escopo = { cliente: ReturnType<typeof postgres>; banco: Db; encerrado: boolean }
const contexto = new AsyncLocalStorage<Escopo>()

export function bancoDoEscopo() {
  const escopo = contexto.getStore()
  if (escopo?.encerrado) throw new Error('O carregamento desta página já foi encerrado.')
  return escopo
}

/**
 * Cada carregamento tem sua própria conexão e prazo, incluindo consultas em
 * paralelo. Um socket antigo do cron/outra página não pode reter esta fila.
 * AsyncLocalStorage encaminha os imports de db/sql dos serviços para este
 * cliente, sem alterar filtros de organização, permissões ou transações.
 */
export async function comBancoDaPagina<T>(executar: () => Promise<T>, pagina: string): Promise<T> {
  if (bancoDoEscopo()) return executar()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não configurada.')
  const cliente = postgres(url, {
    ...opcoesDeConexao(url, { max: 1 }),
    connect_timeout: 5,
    prepare: false,
    // Evita a consulta automática ao catálogo (não aguardada pelo driver).
    // Arrays brutos são retornados como JSON nas consultas; o Drizzle
    // decodifica os arrays tipados por conta própria.
    fetch_types: false,
    connection: { application_name: 'nex-pagina' },
  })
  const escopo: Escopo = { cliente, banco: drizzle(cliente, { schema }), encerrado: false }
  const inicio = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  log.info('carregamento iniciado', { pagina })
  try {
    const resultado = await Promise.race([
      contexto.run(escopo, executar),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const erro = new Error('Prazo de carregamento da página excedido.')
          erro.name = 'PageDatabaseTimeout'
          reject(erro)
        }, PRAZO_PAGINA_MS)
      }),
    ])
    log.info('carregamento concluído', { pagina, duracaoMs: Date.now() - inicio })
    return resultado
  } catch (erro) {
    log.warn('carregamento interrompido', {
      pagina, duracaoMs: Date.now() - inicio,
      tipo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    throw erro
  } finally {
    clearTimeout(timer)
    escopo.encerrado = true
    // Fecha apenas esta conexão, inclusive se ficou aguardando resposta.
    await cliente.end({ timeout: 0 })
  }
}

/** Escopa a execução do componente; componentes filhos precisam de escopo próprio. */
export function paginaComBanco<Args extends unknown[], Resultado>(
  pagina: string, renderizar: (...args: Args) => Promise<Resultado>,
) {
  return (...args: Args) => comBancoDaPagina(() => renderizar(...args), pagina)
}
