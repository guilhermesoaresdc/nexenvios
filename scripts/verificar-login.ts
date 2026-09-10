/** Teste HTTP do build, exclusivamente no banco local descartável do CI. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as esperar } from 'node:timers/promises'
import postgres from 'postgres'
import { gerarHash } from '../src/lib/auth/senha'

async function main() {
  const bancoUrl = process.env.DATABASE_URL
  assert(bancoUrl && process.env.CI === 'true', 'Execute somente no CI com banco local descartável.')
  assert(['127.0.0.1', 'localhost'].includes(new URL(bancoUrl).hostname))
  const sql = postgres(bancoUrl, { max: 1, prepare: false })
  const origem = 'http://127.0.0.1:3219'
  const servidor = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3219'], {
    env: { ...process.env, VERCEL: '1', APP_URL: origem }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let saida = ''
  servidor.stdout.on('data', (dados) => { saida = (saida + dados).slice(-24000) })
  servidor.stderr.on('data', (dados) => { saida = (saida + dados).slice(-24000) })
  const orgs: string[] = []
  async function consultar(caminho: string, opcoes: RequestInit = {}) {
    return fetch(origem + caminho, { ...opcoes, redirect: 'manual', signal: AbortSignal.timeout(18_000) })
  }
  try {
    let pronto = false
    for (let i = 0; i < 40; i++) {
      try {
        const r = await consultar('/entrar')
        pronto = r.status === 200 && (await r.text()).includes('/api/auth/entrar')
        if (pronto) break
      } catch { /* Aguarda somente a abertura do servidor local. */ }
      await esperar(250)
    }
    assert(pronto, 'Build não abriu o novo formulário.')
    for (const plataforma of [true, false]) {
      const id = randomUUID()
      const email = `http-${id}@example.test`
      const senha = randomUUID()
      const [org] = await sql`insert into organizations (name, slug, is_platform) values ('Teste HTTP', ${id}, ${plataforma}) returning id`
      orgs.push(org!.id)
      await sql`insert into users (org_id, name, email, password_hash, role) values (${org!.id}, 'Teste HTTP', ${email}, ${await gerarHash(senha)}, ${plataforma ? 'superadmin' : 'admin'})`
      const destino = plataforma ? '/admin' : '/painel'
      const resultado = await consultar('/api/auth/entrar', {
        method: 'POST', headers: { Origin: origem, Accept: 'application/json' },
        body: new URLSearchParams({ email, senha }),
      })
      assert.equal(resultado.status, 200, 'Login deve confirmar sem aguardar renderização do painel.')
      assert.deepEqual(await resultado.json(), { destino })
      const cookieCompleto = resultado.headers.get('set-cookie') ?? ''
      assert.match(cookieCompleto, /HttpOnly/i)
      assert.match(cookieCompleto, /SameSite=lax/i)
      const cookie = cookieCompleto.split(';')[0]!
      assert(cookie.startsWith('nex_sessao='))
      const caminhos = plataforma ? ['/admin', '/admin/clientes', '/admin/operacao'] : ['/painel', '/contatos', '/saldo']
      for (const caminho of caminhos) {
        const pagina = await consultar(caminho, { headers: { Cookie: cookie } })
        const html = await pagina.text()
        assert.equal(pagina.status, 200, caminho)
        assert(!html.includes('Não foi possível carregar esta página'), caminho)
        assert(!html.includes('Acesse sua conta'), caminho)
        assert(html.includes('Teste HTTP'), 'Página deve identificar a conta autenticada.')
        console.log(`OK: login ${plataforma ? 'Nex' : 'cliente'} → ${caminho}`)
      }
      const invalido = await consultar('/api/auth/entrar', {
        method: 'POST', headers: { Origin: origem, Accept: 'application/json' },
        body: new URLSearchParams({ email, senha: 'senha-incorreta' }),
      })
      assert.equal(invalido.status, 400)
      assert.equal(invalido.headers.get('set-cookie'), null)
      if (!plataforma) {
        const restrito = await consultar('/admin', { headers: { Cookie: cookie } })
        assert.equal(restrito.headers.get('location'), '/painel')
      }
    }
  } catch (erro) {
    console.error(saida)
    throw erro
  } finally {
    servidor.kill('SIGTERM')
    for (const id of orgs) await sql`delete from organizations where id = ${id}`
    await sql.end({ timeout: 1 })
  }
}
main().catch((erro) => { console.error(erro); process.exitCode = 1 })
