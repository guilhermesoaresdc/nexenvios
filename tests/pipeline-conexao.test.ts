import { createServer, type Socket } from 'node:net'
import { expect, it, vi } from 'vitest'
import { comBancoDaPagina, bancoDoEscopo } from '@/db/escopo'
import { sql } from '@/db'

function mensagem(tipo: string, conteudo = Buffer.alloc(0)) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeInt32BE(conteudo.length + 4)
  return Buffer.concat([Buffer.from(tipo), tamanho, conteudo])
}

it('não envia outra consulta antes de receber ReadyForQuery, mesmo com Promise.all', async () => {
  const sockets = new Set<Socket>()
  let consultas = 0
  const servidor = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let buffer = Buffer.alloc(0)
    let iniciou = false
    socket.on('data', (dados: Buffer) => {
      buffer = Buffer.concat([buffer, dados])
      if (!iniciou) {
        if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return
        buffer = buffer.subarray(buffer.readInt32BE(0))
        iniciou = true
        socket.write(Buffer.concat([mensagem('R', Buffer.alloc(4)), mensagem('Z', Buffer.from('I'))]))
      }
      while (buffer.length >= 5 && buffer.length >= buffer.readInt32BE(1) + 1) {
        const tipo = String.fromCharCode(buffer[0]!)
        buffer = buffer.subarray(buffer.readInt32BE(1) + 1)
        if (tipo === 'P') consultas++
        // Responde ao aquecimento; retém o ReadyForQuery da segunda consulta.
        if (consultas > 1) continue
        if (tipo === 'P') socket.write(mensagem('1'))
        if (tipo === 'D') socket.write(Buffer.concat([mensagem('t', Buffer.alloc(2)), mensagem('T', Buffer.alloc(2))]))
        if (tipo === 'B') socket.write(mensagem('2'))
        if (tipo === 'E') socket.write(mensagem('C', Buffer.from('SELECT 0\0')))
        if (tipo === 'S') socket.write(mensagem('Z', Buffer.from('I')))
      }
    })
  })
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  const url = `postgres://teste:teste@127.0.0.1:${(servidor.address() as {port:number}).port}/teste`
  vi.stubEnv('DATABASE_URL', url)
  try {
    await comBancoDaPagina(async () => {
    await sql`select 1`
    const pendentes = Promise.allSettled([sql`select 2`, sql`select 3`, sql`select ${4}`])
    await vi.waitFor(() => expect(consultas).toBe(2))
    // Dá tempo ao cliente de escrever qualquer pacote indevido ao peer local.
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(consultas).toBe(2)
    await bancoDoEscopo()!.cliente.end({ timeout: 0 })
    await pendentes
    }, '/teste-pipeline')
  } finally {
    vi.unstubAllEnvs()
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => servidor.close(() => resolve()))
  }
})
