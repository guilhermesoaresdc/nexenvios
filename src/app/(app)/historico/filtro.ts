import type { FiltroDoHistorico } from '@/db/queries/historico'
import { STATUS_ENVIO_LABEL, type Channel, type DispatchStatus } from '@/db/schema/enums'

/**
 * Lê os parâmetros da URL num filtro.
 *
 * Fica fora de `page.tsx` porque um arquivo de página no App Router só pode
 * exportar o componente e a configuração de rota — e porque a tela e a rota do
 * CSV precisam ler os MESMOS parâmetros. Se divergissem, o CSV baixaria um
 * recorte diferente do que está na tela.
 */
export function filtroDaUrl(
  p: Record<string, string | string[] | undefined> | URLSearchParams,
): FiltroDoHistorico {
  const pegar = (chave: string): string | undefined => {
    if (p instanceof URLSearchParams) return p.get(chave) ?? undefined
    const v = p[chave]
    return Array.isArray(v) ? v[0] : v
  }
  const pegarTodos = (chave: string): string[] => {
    if (p instanceof URLSearchParams) return p.getAll(chave)
    const v = p[chave]
    return Array.isArray(v) ? v : v ? [v] : []
  }

  const status = pegarTodos('status').filter((s) =>
    Object.keys(STATUS_ENVIO_LABEL).includes(s),
  ) as DispatchStatus[]

  const desdeBruto = pegar('desde')
  const ateBruto = pegar('ate')
  const desde = desdeBruto ? new Date(`${desdeBruto}T00:00:00`) : undefined
  const ate = ateBruto ? new Date(`${ateBruto}T23:59:59`) : undefined

  const canal = pegar('canal')
  const campanha = pegar('campanha')
  const busca = pegar('busca')

  return {
    status: status.length > 0 ? status : undefined,
    canal: canal ? (canal as Channel) : undefined,
    campanhaId: campanha || undefined,
    busca: busca || undefined,
    desde: desde && !Number.isNaN(desde.getTime()) ? desde : undefined,
    ate: ate && !Number.isNaN(ate.getTime()) ? ate : undefined,
  }
}
