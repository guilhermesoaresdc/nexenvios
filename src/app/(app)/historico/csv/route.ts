import { exigirUsuario } from '@/lib/auth/atual'
import { historicoEmCsv } from '@/db/queries/historico'
import { filtroDaUrl } from '../filtro'

/** O CSV do histórico, com os mesmos filtros da tela. */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const usuario = await exigirUsuario()

  const url = new URL(req.url)
  const csv = await historicoEmCsv(usuario.orgId, filtroDaUrl(url.searchParams))

  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  /*
   * O BOM UTF-8 na frente não é detalhe: sem ele o Excel brasileiro abre o
   * arquivo em Latin-1 e todo acento vira caractere estranho. É a primeira
   * reclamação que chega quando falta.
   */
  return new Response(`﻿${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="nexenvios-historico-${hoje}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
