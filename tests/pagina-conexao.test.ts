import { createServer, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { comBancoDaPagina, bancoDoEscopo, PRAZO_PAGINA_MS } from '@/db/escopo'
import { sql, db } from '@/db'
import { sql as consulta } from 'drizzle-orm'

afterEach(() => vi.unstubAllEnvs())

it('isola carregamentos concorrentes e reutiliza o escopo apenas dentro da mesma página', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste:teste@127.0.0.1:1/teste')
  const clientes: unknown[] = []
  await Promise.all(['clientes', 'usuarios'].map((pagina) => comBancoDaPagina(async () => {
    const cliente = bancoDoEscopo()!.cliente
    clientes.push(cliente)
    await Promise.resolve()
    expect(bancoDoEscopo()!.cliente).toBe(cliente)
    await comBancoDaPagina(async () => expect(bancoDoEscopo()!.cliente).toBe(cliente), 'filho')
  }, pagina)))
  expect(clientes[0]).not.toBe(clientes[1])
  expect(bancoDoEscopo()).toBeUndefined()
})

it('encerra SQL e Drizzle presos sem bloquear outra página nem repetir a operação', async () => {
  const sockets = new Set<Socket>()
  const servidor = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.once('data', () => {
      // Autentica e aceita a conexão, mas nunca responde às consultas.
      socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]))
    })
  })
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  vi.stubEnv('DATABASE_URL', `postgres://teste:teste@127.0.0.1:${(servidor.address() as {port:number}).port}/teste`)
  try {
    let chamadas = 0
    const inicio = Date.now()
    const presa = expect(comBancoDaPagina(async () => {
      chamadas++
      await Promise.all([sql`select 1`, db.execute(consulta`select 2`)])
    }, '/clientes')).rejects.toMatchObject({ name: 'PageDatabaseTimeout' })
    await vi.waitFor(() => expect(sockets.size).toBe(1))
    await expect(comBancoDaPagina(async () => 'outra página', '/usuarios')).resolves.toBe('outra página')
    await presa
    expect(chamadas).toBe(1)
    expect(Date.now() - inicio).toBeLessThan(PRAZO_PAGINA_MS + 2000)
    await vi.waitFor(() => expect(sockets.size).toBe(0))
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => servidor.close(() => resolve()))
  }
}, 24_000)
