import { NextResponse } from 'next/server'
import { autenticarEntrada, ERROS_ENTRADA } from '@/lib/auth/entrada'
import { gravarCookieSessao } from '@/lib/auth/cookies'
import { criarLog } from '@/lib/log'

export const runtime = 'nodejs'
export const maxDuration = 30
const log = criarLog('entrada-http')
const semCache = { 'Cache-Control': 'no-store' }

/** Responde ao login sem aguardar o HTML/Flight do painel de destino. */
export async function POST(request: Request) {
  // Uma rota HTTP não recebe a proteção de origem das Server Actions.
  // Confere antes de ler os campos ou executar qualquer consulta.
  const origem = request.headers.get('origin')
  if (origem !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ erro: 'Origem da solicitação inválida.' }, { status: 403, headers: semCache })
  }
  const querJson = request.headers.get('accept')?.includes('application/json')
  function falhar(codigo: keyof typeof ERROS_ENTRADA, status: number, erro = ERROS_ENTRADA[codigo] as string) {
    if (querJson) return NextResponse.json({ erro }, { status, headers: semCache })
    return new Response(null, {
      status: 303, headers: { ...semCache, Location: `/entrar?erro=${codigo}` },
    })
  }
  try {
    const tipo = request.headers.get('content-type') ?? ''
    if (!tipo.startsWith('multipart/form-data') && !tipo.startsWith('application/x-www-form-urlencoded')) {
      return falhar('dados', 415)
    }
    const form = await request.formData()
    const resultado = await autenticarEntrada(form, {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido',
      agente: request.headers.get('user-agent') ?? '',
    })
    if (!resultado.ok) {
      return falhar(resultado.codigo, resultado.codigo === 'temporario' ? 503 : resultado.codigo === 'limite' ? 429 : 400, resultado.erro)
    }
    // O cookie só é emitido depois que todas as consultas terminam.
    await gravarCookieSessao(resultado.token, resultado.expiraEm)
    log.info('entrada concluída', { destino: resultado.destino })
    if (querJson) return NextResponse.json({ destino: resultado.destino }, { headers: semCache })
    return new Response(null, { status: 303, headers: { ...semCache, Location: resultado.destino } })
  } catch (erro) {
    log.error('falha ao responder entrada', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return falhar('temporario', 503)
  }
}
