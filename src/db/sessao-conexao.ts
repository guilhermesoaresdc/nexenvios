import 'server-only'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { Db } from './index'
import { opcoesDeConexao } from './conexao'
import * as schema from './schema'
import { criarLog } from '@/lib/log'

const log = criarLog('sessao-db')
export const PRAZO_SESSAO_MS = 12_000

/** A sessão não compartilha a fila de consultas do painel ou do motor. */
export async function comBancoDeSessao<T>(
  executar: (banco: Db, cliente: ReturnType<typeof postgres>) => Promise<T>,
  operacao: 'validar' | 'entrar' = 'validar',
): Promise<T> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não configurada.')
  const cliente = postgres(url, {
    ...opcoesDeConexao(url, { max: 1 }),
    connect_timeout: 5,
    prepare: false,
    // A sessão usa apenas tipos escalares conhecidos pelo driver. Evita uma
    // consulta adicional ao catálogo durante a abertura da conexão.
    fetch_types: false,
  })
  const inicio = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  log.info('operação iniciada', { operacao })
  try {
    const resultado = await Promise.race([
      Promise.resolve().then(() => executar(drizzle(cliente, { schema }), cliente)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const erro = new Error('Prazo da validação de sessão excedido.')
          erro.name = 'SessionDatabaseTimeout'
          reject(erro)
        }, PRAZO_SESSAO_MS)
      }),
    ])
    log.info('operação concluída', { operacao, duracaoMs: Date.now() - inicio })
    return resultado
  } catch (erro) {
    log.error('operação falhou', {
      operacao,
      duracaoMs: Date.now() - inicio,
      tipo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    throw erro
  } finally {
    clearTimeout(timer)
    // Encerra também o socket pendente; Promise.race sozinho deixaria a
    // consulta viva. Este cliente pertence exclusivamente a esta validação.
    await cliente.end({ timeout: 0 })
  }
}
