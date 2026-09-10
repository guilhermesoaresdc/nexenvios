import { createServer, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { comBancoDeSessao, PRAZO_SESSAO_MS } from '@/db/sessao-conexao'

afterEach(() => vi.unstubAllEnvs())

it('fecha a conexão que não responde e permite uma nova validação independente', async () => {
  const sockets = new Set<Socket>()
  const servidor = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    // Simula o banco aceitando a conexão e parando de responder depois.
    socket.once('data', () => {
      socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]))
    })
  })
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  const endereco = servidor.address() as { port: number }
  vi.stubEnv('DATABASE_URL', `postgres://teste:teste@127.0.0.1:${endereco.port}/teste`)
  try {
    const inicio = Date.now()
    await expect(comBancoDeSessao(async (banco) => banco.execute(sql`select 1`)))
      .rejects.toMatchObject({ name: 'SessionDatabaseTimeout' })
    expect(Date.now() - inicio).toBeLessThan(PRAZO_SESSAO_MS + 2000)
    // Espera o peer observar o fechamento, sem terminar a conexão pelo teste.
    await vi.waitFor(() => expect(sockets.size).toBe(0))
    await expect(comBancoDeSessao(async () => 'nova validação')).resolves.toBe('nova validação')
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => servidor.close(() => resolve()))
  }
}, 16_000)

it('preserva o resultado de sessão inválida sem inventar usuário', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste:teste@127.0.0.1:1/teste')
  await expect(comBancoDeSessao(async () => null)).resolves.toBeNull()
})

it('propaga a falha original sem repetir a operação', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste:teste@127.0.0.1:1/teste')
  const falha = new Error('falha simulada')
  const executar = vi.fn(async () => { throw falha })
  await expect(comBancoDeSessao(executar)).rejects.toBe(falha)
  expect(executar).toHaveBeenCalledTimes(1)
})
