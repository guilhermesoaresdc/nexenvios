import { NextResponse } from 'next/server'
import { solicitarRecuperacao } from '@/lib/auth/recuperacao'
import { mesmaOrigem } from '@/lib/auth/origem-http'

export const runtime = 'nodejs'
export const maxDuration = 30
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!mesmaOrigem(request)) return NextResponse.json({ erro: 'Origem da solicitação inválida.' }, { status: 403, headers })
  try {
    const form = await request.formData()
    const resultado = await solicitarRecuperacao(form, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido')
    return NextResponse.json(resultado, { status: resultado.erro ? 400 : 200, headers })
  } catch {
    return NextResponse.json({ erro: 'Não foi possível concluir agora. Tente novamente.' }, { status: 503, headers })
  }
}
