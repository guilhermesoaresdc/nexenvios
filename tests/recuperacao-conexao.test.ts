import { createServer, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { conferirToken } from '@/lib/auth/tokens'
import { salvarNovaSenha, solicitarRecuperacao } from '@/lib/auth/recuperacao'

afterEach(() => vi.unstubAllEnvs())

it.each(['abrir', 'pedir', 'salvar'] as const)('encerra espera de banco ao %s a recuperação', async (acao) => {
  const sockets = new Set<Socket>()
  const servidor = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.once('data', () => socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73])))
  })
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  vi.stubEnv('DATABASE_URL', `postgres://teste:teste@127.0.0.1:${(servidor.address() as { port: number }).port}/teste`)
  try {
    const inicio = Date.now()
    const form = new FormData()
    form.set('email', 'teste@example.test')
    form.set('token', 'token-ficticio')
    form.set('senha', 'Senha-ficticia123')
    form.set('confirmacao', 'Senha-ficticia123')
    if (acao === 'abrir') {
      await expect(conferirToken('token-ficticio')).rejects.toMatchObject({ name: 'SessionDatabaseTimeout' })
    } else {
      const resultado = await (acao === 'pedir' ? solicitarRecuperacao : salvarNovaSenha)(form, '127.0.0.1')
      expect(resultado.erro).toBeTruthy()
      expect(resultado.ok).toBeUndefined()
    }
    expect(Date.now() - inicio).toBeLessThan(14_000)
    await vi.waitFor(() => expect(sockets.size).toBe(0))
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => servidor.close(() => resolve()))
  }
}, 16_000)
