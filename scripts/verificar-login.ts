/** Teste HTTP do build, exclusivamente no banco local descartável do CI. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as esperar } from 'node:timers/promises'
import postgres from 'postgres'
import { gerarHash } from '../src/lib/auth/senha'
import { emitirToken } from '../src/lib/auth/tokens'

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
    return fetch(origem + caminho, { ...opcoes, redirect: 'manual', signal: AbortSignal.timeout(25_000) })
  }
  async function conferirRedirecionamento(resposta: Response, destino: string) {
    if (resposta.headers.get('location') === destino) return
    const html = await resposta.text()
    assert(html.includes(`content="0;url=${destino}"`) || html.includes(`content="1;url=${destino}"`),
      `Deve redirecionar para ${destino}, inclusive quando o loading já iniciou o streaming.`)
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
      const [usuario] = await sql`insert into users (org_id, name, email, password_hash, role) values (${org!.id}, 'Teste HTTP', ${email}, ${await gerarHash(senha)}, ${plataforma ? 'superadmin' : 'admin'}) returning id`
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
      const caminhos = plataforma
        ? ['/admin', '/admin/operacao', '/admin/clientes', '/admin/usuarios', '/admin/equipe', '/admin/envios', '/admin/precos', '/admin/provedores', '/admin/clientes/novo']
        : ['/painel', '/disparo', '/campanhas', '/campanhas?status=rascunho', '/contatos', '/saldo', '/historico', '/canais', '/configuracoes', '/contatos/listas', '/contatos/importar', '/respostas', '/configuracoes/equipe', '/configuracoes/api', '/canais/nome-de-perfil']
      // Dados não vazios conferem também a decodificação de arrays das consultas.
      await sql`insert into contacts (org_id, name, email, tags) values (${org!.id}, 'Contato de teste HTTP', ${email}, ARRAY['etiqueta-http'])`
      // A segunda volta verifica o reuso da instância, além da primeira entrada.
      for (let volta = 0; volta < 2; volta++) {
        for (const caminho of caminhos) {
          const pagina = await consultar(caminho, { headers: { Cookie: cookie } })
          const html = await pagina.text()
          assert.equal(pagina.status, 200, caminho)
          assert(!html.includes('Não foi possível carregar esta página'), caminho)
          assert(!html.includes('Acesse sua conta'), caminho)
          assert(html.includes('Teste HTTP'), 'Página deve identificar a conta autenticada.')
          assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500') && !html.includes('PageDatabaseTimeout'), caminho)
          assert(saida.includes('carregamento concluído'), 'Renderização deve usar conexão com prazo.')
          assert(/<h1[^>]*>[^<]+<\/h1>/.test(html), 'Deve concluir o conteúdo da página, não apenas o menu e loading.')
          if (caminho === '/contatos') assert(html.includes('etiqueta-http'), 'Arrays devem continuar decodificados.')
          console.log(`OK: login ${plataforma ? 'Nex' : 'cliente'} → ${caminho}`)
        }
      }
      const invalido = await consultar('/api/auth/entrar', {
        method: 'POST', headers: { Origin: origem, Accept: 'application/json' },
        body: new URLSearchParams({ email, senha: 'senha-incorreta' }),
      })
      assert.equal(invalido.status, 400)
      assert.equal(invalido.headers.get('set-cookie'), null)
      if (!plataforma) {
        const restrito = await consultar('/admin', { headers: { Cookie: cookie } })
        await conferirRedirecionamento(restrito, '/painel')
      }
      const pedido = await consultar('/api/auth/recuperar', {
        method: 'POST', headers: { Origin: origem, Accept: 'application/json' },
        body: new URLSearchParams({ email }),
      })
      assert.equal(pedido.status, 200)
      assert((await pedido.json()).ok)
      // Exercita o mesmo emissor usado pelo e-mail, sem enviar mensagens no CI.
      const token = await emitirToken(usuario!.id, 'recuperacao')
      const link = await consultar(`/definir-senha/${token}`)
      const paginaSenha = await link.text()
      assert.equal(link.status, 200)
      assert(paginaSenha.includes('Nova senha'))
      assert(paginaSenha.includes('Salvar nova senha'))
      const novaSenha = randomUUID()
      const salvar = () => consultar('/api/auth/definir-senha', {
        method: 'POST', headers: { Origin: origem, Accept: 'application/json' },
        body: new URLSearchParams({ token, senha: novaSenha, confirmacao: novaSenha }),
      })
      const salvo = await salvar()
      assert.equal(salvo.status, 200)
      assert((await salvo.json()).ok)
      assert.match(salvo.headers.get('set-cookie') ?? '', /Max-Age=0/i)
      assert.equal((await salvar()).status, 400, 'O link não pode ser usado duas vezes.')
      const sessaoAntiga = await consultar(destino, { headers: { Cookie: cookie } })
      await conferirRedirecionamento(sessaoAntiga, '/entrar')
      for (const [valor, status] of [[senha, 400], [novaSenha, 200]] as const) {
        const login = await consultar('/api/auth/entrar', {
          method: 'POST', headers: { Origin: origem, Accept: 'application/json' },
          body: new URLSearchParams({ email, senha: valor }),
        })
        assert.equal(login.status, status, 'Somente a nova senha deve permitir entrada.')
      }
      console.log(`OK: recuperação ${plataforma ? 'Nex' : 'cliente'} → link → nova senha → login`)
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
