import { createServer, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { autenticarEntrada } from '@/lib/auth/entrada'
import { PRAZO_SESSAO_MS } from '@/db/sessao-conexao'

afterEach(() => vi.unstubAllEnvs())

it('login termina com falha temporária se a primeira consulta de tentativas trava', async () => {
  const sockets = new Set<Socket>()
  const servidor = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.once('data', () => {
      socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]))
    })
  })
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  vi.stubEnv('DATABASE_URL', `postgres://teste:teste@127.0.0.1:${(servidor.address() as { port: number }).port}/teste`)
  const form = new FormData()
  form.set('email', 'teste@example.test')
  form.set('senha', 'Senha-ficticia')
  try {
    const inicio = Date.now()
    const resultado = await autenticarEntrada(form, { ip: '127.0.0.1', agente: 'teste' })
    expect(resultado).toMatchObject({ ok: false, codigo: 'temporario' })
    expect(Date.now() - inicio).toBeLessThan(PRAZO_SESSAO_MS + 2000)
    expect(resultado).not.toHaveProperty('token')
    await vi.waitFor(() => expect(sockets.size).toBe(0))
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => servidor.close(() => resolve()))
  }
}, 16_000)
