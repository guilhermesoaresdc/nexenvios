import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { enviosGlobais, listarClientes } from '@/db/queries/admin'
import { CANAL_CURTO, STATUS_ENVIO_LABEL, type DispatchStatus } from '@/db/schema/enums'
import { ERRO_LABEL, type CodigoErro } from '@/lib/channels/tipos'
import { Botao, BotaoLink, Chip, Pad, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { IcHistorico } from '@/components/shell/icones'
import { formatarTelefone } from '@/lib/telefone'
import { dataHora, moeda } from '@/lib/ui'

export const metadata: Metadata = { title: 'Envios' }
export const dynamic = 'force-dynamic'

const TOM: Record<DispatchStatus, 'verde' | 'azul' | 'neutro' | 'vermelho' | 'ciano'> = {
  pendente: 'neutro',
  enviando: 'ciano',
  enviado: 'azul',
  entregue: 'verde',
  lido: 'verde',
  respondido: 'verde',
  falhou: 'vermelho',
  cancelado: 'neutro',
}

const POR_PAGINA = 60

export default async function Envios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirSuperadmin()
  const p = await searchParams

  const orgId = typeof p.cliente === 'string' && p.cliente ? p.cliente : undefined
  const status = typeof p.status === 'string' && p.status ? p.status : undefined
  const pagina = Math.max(1, Number(p.pagina) || 1)

  const [linhas, clientes] = await Promise.all([
    enviosGlobais({ orgId, status, limite: POR_PAGINA + 1, pular: (pagina - 1) * POR_PAGINA }),
    listarClientes({ limite: 200 }),
  ])

  const temMais = linhas.length > POR_PAGINA
  const pagina_ = linhas.slice(0, POR_PAGINA)

  const url = (pag: number) => {
    const q = new URLSearchParams()
    if (orgId) q.set('cliente', orgId)
    if (status) q.set('status', status)
    if (pag > 1) q.set('pagina', String(pag))
    const s = q.toString()
    return s ? `/admin/envios?${s}` : '/admin/envios'
  }

  return (
    <>
      <Titulo
        titulo="Envios"
        descricao="Toda mensagem que passou pela plataforma. É aqui que se olha quando um cliente diz que não chegou."
      />

      <Pad className="mb-5 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Selecao name="cliente" defaultValue={orgId ?? ''} className="w-auto min-w-[220px]">
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
          <Selecao name="status" defaultValue={status ?? ''} className="w-auto min-w-[170px]">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_ENVIO_LABEL) as DispatchStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_ENVIO_LABEL[s]}
              </option>
            ))}
          </Selecao>
          <Botao type="submit" tom="contorno">
            Filtrar
          </Botao>
          {orgId || status ? (
            <Link href="/admin/envios" className="px-2 text-[.86rem] font-semibold text-muted hover:text-blue">
              Limpar
            </Link>
          ) : null}
        </form>
      </Pad>

      <Pad>
        {pagina_.length === 0 ? (
          <Vazio
            icone={<IcHistorico className="h-6 w-6" />}
            titulo="Nenhum envio com esse filtro"
            descricao="Ajuste o cliente ou o status para encontrar a mensagem."
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Cliente</Th>
                <Th>Campanha</Th>
                <Th>Canal</Th>
                <Th>Destino</Th>
                <Th>Status</Th>
                <Th className="text-right">Custo</Th>
              </tr>
            </thead>
            <tbody>
              {pagina_.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-paper-alt/60">
                  <Td className="text-[.82rem] whitespace-nowrap text-muted">
                    {dataHora(e.enviadoEm ?? e.criadoEm)}
                  </Td>
                  <Td className="text-[.86rem] font-semibold text-navy">{e.cliente}</Td>
                  <Td className="max-w-[220px] truncate text-[.86rem]">{e.campanha ?? '—'}</Td>
                  <Td>
                    <Chip tom="azul">{CANAL_CURTO[e.canal]}</Chip>
                  </Td>
                  <Td className="tabular text-[.86rem] whitespace-nowrap">
                    {formatarTelefone(e.para)}
                  </Td>
                  <Td>
                    <Chip tom={TOM[e.status as DispatchStatus] ?? 'neutro'}>
                      {STATUS_ENVIO_LABEL[e.status as DispatchStatus] ?? e.status}
                    </Chip>
                    {e.erro ? (
                      <span className="mt-0.5 block text-[.74rem] text-danger">
                        {ERRO_LABEL[e.erro as CodigoErro] ?? e.erro}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right text-[.86rem]">{moeda(e.custo)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Pad>

      {(pagina > 1 || temMais) && (
        <div className="mt-5 flex items-center justify-between">
          {pagina > 1 ? (
            <BotaoLink href={url(pagina - 1)} tom="contorno" tamanho="sm">
              Anterior
            </BotaoLink>
          ) : (
            <span />
          )}
          <span className="text-[.84rem] text-muted">Página {pagina}</span>
          {temMais ? (
            <BotaoLink href={url(pagina + 1)} tom="contorno" tamanho="sm">
              Próxima
            </BotaoLink>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  )
}
