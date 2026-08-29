import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import postgres from 'postgres'
import { opcoesDeConexao } from './conexao'

/**
 * Aplicador de migrations.
 *
 * SQL escrito à mão em `drizzle/`, aplicado em ordem de nome, uma transação
 * por arquivo, com registro do que já rodou. O gerador do drizzle-kit não
 * expressa gatilho, índice parcial nem política de RLS — e o schema depende
 * dos três.
 */

export async function migrar(url: string, pasta = 'drizzle'): Promise<string[]> {
  const sql = postgres(url, opcoesDeConexao(url, { max: 1 }))

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `

    const aplicadas = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((l) => l.name),
    )

    const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.sql')).sort()
    const novas: string[] = []

    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue
      const conteudo = await readFile(join(pasta, arquivo), 'utf8')
      // `simple: true` porque os arquivos trazem várias instruções, e o
      // protocolo estendido do Postgres só aceita uma por vez.
      await sql.unsafe(conteudo, [], { prepare: false })
      await sql`INSERT INTO _migrations (name) VALUES (${arquivo})`
      novas.push(arquivo)
    }

    return novas
  } finally {
    await sql.end({ timeout: 5 })
  }
}
