import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/auth/atual'
import { contarHistorico, listarHistorico } from '@/db/queries/historico'
import { listarCampanhas } from '@/db/queries/campanhas'
import { CANAL_CURTO, STATUS_ENVIO_LABEL, type DispatchStatus } from '@/db/schema/enums'
import { ERRO_LABEL, type CodigoErro } from '@/lib/channels/tipos'
import { BotaoLink, Chip, Pad, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { IcHistorico } from '@/components/shell/icones'
import { formatarTelefone } from '@/lib/telefone'
import { dataHora, moeda, numero } from '@/lib/ui'
import { filtroDaUrl } from './filtro'
import { Filtros } from './filtros'

export const metadata: Metadata = { title: 'Histórico' }
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

const POR_PAGINA = 50

export default async function Historico({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await exigirUsuario()
  const p = await searchParams

  const filtro = filtroDaUrl(p)
  const pagina = Math.max(1, Number(p.pagina) || 1)

  const [linhas, total, campanhas] = await Promise.all([
    listarHistorico(usuario.orgId, {
      ...filtro,
      limite: POR_PAGINA,
      pular: (pagina - 1) * POR_PAGINA,
    }),
    contarHistorico(usuario.orgId, filtro),
    listarCampanhas(usuario.orgId, { limite: 100 }),
  ])

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const consulta = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (k === 'pagina') continue
    if (Array.isArray(v)) v.forEach((x) => consulta.append(k, x))
    else if (v) consulta.set(k, v)
  }
  const url = (pag: number) => {
    const q = new URLSearchParams(consulta)
    if (pag > 1) q.set('pagina', String(pag))
    const s = q.toString()
    return s ? `/historico?${s}` : '/historico'
  }

  return (
    <>
      <Titulo
        titulo="Histórico"
        descricao="Uma linha por mensagem, com o motivo exato de cada falha."
        acao={
          <BotaoLink
            href={`/historico/csv${consulta.toString() ? `?${consulta}` : ''}`}
            tom="contorno"
            tamanho="sm"
          >
            Baixar CSV
          </BotaoLink>
        }
      />

      <Filtros campanhas={campanhas.map((c) => ({ id: c.id, nome: c.nome }))} />

      <Pad className="mt-5">
        {linhas.length === 0 ? (
          <Vazio
            icone={<IcHistorico className="h-6 w-6" />}
            titulo={total === 0 ? 'Nenhum envio ainda' : 'Nenhum envio com esse filtro'}
            descricao={
              total === 0
                ? 'Assim que o primeiro disparo sair, cada mensagem aparece aqui com o status e o custo.'
                : 'Ajuste o período, o status ou o canal.'
            }
            acao={total === 0 ? <BotaoLink href="/disparo">Criar um disparo</BotaoLink> : undefined}
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-6 py-3">
              <span className="text-[.86rem] text-muted">
                <b className="tabular font-semibold text-navy">{numero(total)}</b> envio(s)
              </span>
              <span className="text-[.82rem] text-muted">
                Página {pagina} de {numero(paginas)}
              </span>
            </div>

            <Tabela>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Destino</Th>
                  <Th>Canal</Th>
                  <Th>Campanha</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Custo</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="align-top transition-colors hover:bg-paper-alt/60">
                    <Td className="text-[.82rem] whitespace-nowrap text-muted">
                      {dataHora(l.enviadoEm ?? l.criadoEm)}
                    </Td>
                    <Td>
                      <span className="tabular text-[.88rem] whitespace-nowrap">
                        {formatarTelefone(l.para)}
                      </span>
                      {l.nome ? (
                        <span className="block text-[.76rem] text-muted">{l.nome}</span>
                      ) : null}
                      {/* O corpo não cabe na coluna, mas é o que se quer ver
                          quando algo saiu errado. */}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[.74rem] font-semibold text-blue">
                          ver mensagem
                        </summary>
                        <p className="mt-1 max-w-md rounded-[8px] bg-paper-alt px-3 py-2 text-[.8rem] leading-relaxed whitespace-pre-wrap text-ink">
                          {l.corpo}
                        </p>
                      </details>
                    </Td>
                    <Td>
                      <Chip tom="azul">{CANAL_CURTO[l.canal]}</Chip>
                    </Td>
                    <Td className="max-w-[200px] truncate text-[.86rem]">{l.campanha ?? '—'}</Td>
                    <Td>
                      <Chip tom={TOM[l.status]}>{STATUS_ENVIO_LABEL[l.status]}</Chip>
                      {l.erroCodigo ? (
                        <span className="mt-1 block text-[.74rem] text-danger">
                          {ERRO_LABEL[l.erroCodigo as CodigoErro] ?? l.erroCodigo}
                          {l.tentativas > 1 ? ` · ${l.tentativas} tentativas` : ''}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right text-[.86rem]">{moeda(l.custo)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </>
        )}
      </Pad>

      {paginas > 1 && (
        <div className="mt-5 flex items-center justify-between">
          {pagina > 1 ? (
            <BotaoLink href={url(pagina - 1)} tom="contorno" tamanho="sm">
              Anterior
            </BotaoLink>
          ) : (
            <span />
          )}
          <span className="text-[.84rem] text-muted">
            {numero((pagina - 1) * POR_PAGINA + 1)}–{numero(Math.min(pagina * POR_PAGINA, total))} de{' '}
            {numero(total)}
          </span>
          {pagina < paginas ? (
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
