import { NextRequest, NextResponse } from 'next/server'
import { CONSENTIMENTO_COOKIE } from '@/lib/marketing/config'
import { enviarMeta, esquemaEvento, excedeuLimite } from '@/lib/marketing/servidor'
import { ORIGEM } from '@/lib/site/origem'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(req: NextRequest) {
  const origem = req.headers.get('origin')
  const permitidas = new Set([ORIGEM, 'https://nexenvios.com.br'])
  if (process.env.NODE_ENV === 'development') permitidas.add(req.nextUrl.origin)
  if (!origem || !permitidas.has(origem)) return new NextResponse(null, { status: 403 })
  const usarCookies = req.cookies.get(CONSENTIMENTO_COOKIE)?.value === 'granted'
  if (!req.headers.get('content-type')?.startsWith('application/json')) {
    return new NextResponse(null, { status: 415 })
  }
  if (Number(req.headers.get('content-length')) > 4096) return new NextResponse(null, { status: 413 })
  let entrada
  try {
    const corpo = await req.text()
    if (corpo.length > 4096) return new NextResponse(null, { status: 413 })
    entrada = esquemaEvento.safeParse(JSON.parse(corpo))
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (!entrada.success || !req.headers.get('user-agent')) return new NextResponse(null, { status: 400 })
  if (!usarCookies && entrada.data.event_name !== 'Lead') {
    return new NextResponse(null, { status: 204 })
  }
  // Sem aceite, não encaminhar identificadores de cookies, mesmo que o cliente
  // os inclua por engano ou a preferência tenha mudado entre envio e retry.
  const evento = usarCookies ? entrada.data : {
    event_name: entrada.data.event_name,
    event_id: entrada.data.event_id,
  }
  try {
    if (await excedeuLimite(req.headers)) return new NextResponse(null, { status: 429 })
    const resultado = await enviarMeta(evento, req.headers)
    return NextResponse.json(resultado, {
      status: resultado.ok ? 200 : 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
