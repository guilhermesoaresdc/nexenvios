import { NextResponse } from 'next/server'
import { sql } from '@/db'

/** Sinal de vida. Responde 200 só se o banco responder. */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const [linha] = await sql<{ agora: Date }[]>`SELECT now() AS agora`
    return NextResponse.json({ ok: true, banco: 'no ar', agora: linha?.agora })
  } catch {
    return NextResponse.json({ ok: false, banco: 'sem resposta' }, { status: 503 })
  }
}
