import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirTimeNex } from '@/lib/auth/atual'
import { listarClientes } from '@/db/queries/admin'
import type { OrgStatus } from '@/db/schema/enums'
import { entrarNaConta } from '@/lib/auth/visita'
import {
  Botao,
  BotaoLink,
  Chip,
  Entrada,
  Pad,
  Selecao,
  Tabela,
  Td,
  Th,
  Vazio,
} from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { IcClientes } from '@/components/shell/icones'
import { moeda, numero, quando } from '@/lib/ui'

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

const STATUS_TOM = {
  ativo: 'verde',
  suspenso: 'ambar',
  cancelado: 'vermelho',
} as const

const STATUS_LABEL: Record<OrgStatus, string> = {
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

const POR_PAGINA = 30

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const eu = await exigirTimeNex()
  const p = await searchParams

  const busca = typeof p.busca === 'string' ? p.busca : undefined
  const status =
    typeof p.status === 'string' && ['ativo', 'suspenso', 'cancelado'].includes(p.status)
      ? (p.status as OrgStatus)
      : undefined
  const pagina = Math.max(1, Number(p.pagina) || 1)

  const clientes = await listarClientes({
    busca,
    status,
    limite: POR_PAGINA + 1,
    pular: (pagina - 1) * POR_PAGINA,
  })

  const temMais = clientes.length > POR_PAGINA
  const linhas = clientes.slice(0, POR_PAGINA)

  const url = (pag: number) => {
    const q = new URLSearchParams()
    if (busca) q.set('busca', busca)
    if (status) q.set('status', status)
    if (pag > 1) q.set('pagina', String(pag))
    const s = q.toString()
    return s ? `/admin/clientes?${s}` : '/admin/clientes'
  }

  return (
    <>
      <Titulo
        titulo="Clientes"
        descricao="Cada conta da Nex Envios: consumo, saldo e acesso."
        acao={eu.isSuperadmin ? <BotaoLink href="/admin/clientes/novo">Novo cliente</BotaoLink> : null}
      />

      <Pad className="mb-5 p-4">
        {/* Filtro por GET: o estado mora na URL, então recarregar e compartilhar
            o link levam à mesma lista. */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Entrada
              name="busca"
              defaultValue={busca ?? ''}
              placeholder="Buscar por nome ou apelido"
              aria-label="Buscar cliente"
            />
          </div>
          <Selecao name="status" defaultValue={status ?? ''} className="w-auto min-w-[170px]">
            <option value="">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="suspenso">Suspensos</option>
            <option value="cancelado">Cancelados</option>
          </Selecao>
          <Botao type="submit" tom="contorno">
            Filtrar
          </Botao>
          {busca || status ? (
            <Link href="/admin/clientes" className="px-2 text-[.86rem] font-semibold text-muted hover:text-blue">
              Limpar
            </Link>
          ) : null}
        </form>
      </Pad>

      <Pad>
        {linhas.length === 0 ? (
          <Vazio
            icone={<IcClientes className="h-6 w-6" />}
            titulo={busca || status ? 'Nenhum cliente com esse filtro' : 'Nenhum cliente ainda'}
            descricao={
              busca || status
                ? 'Tente outro termo ou limpe o filtro para ver a lista inteira.'
                : 'Cadastre o primeiro cliente para começar a operar disparos por ele.'
            }
            acao={eu.isSuperadmin ? <BotaoLink href="/admin/clientes/novo">Novo cliente</BotaoLink> : null}
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Status</Th>
                <Th className="text-right">Saldo</Th>
                <Th className="text-right">Envios 30d</Th>
                <Th className="text-right">Gasto 30d</Th>
                <Th className="text-right">Base</Th>
                <Th>Último envio</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                const saldo = Number(c.saldo)
                const limite = Number(c.limite)
                return (
                  <tr key={c.id} className="transition-colors hover:bg-paper-alt/60">
                    <Td>
                      <Link
                        href={`/admin/clientes/${c.id}`}
                        className="font-semibold text-navy hover:text-blue"
                      >
                        {c.nome}
                      </Link>
                      <span className="block font-mono text-[.7rem] text-muted">{c.apelido}</span>
                    </Td>
                    <Td>
                      <Chip tom={STATUS_TOM[c.status]}>{STATUS_LABEL[c.status]}</Chip>
                    </Td>
                    <Td
                      className={`tabular text-right font-semibold ${
                        saldo <= 0 ? 'text-danger' : saldo < 10 ? 'text-[#a16207]' : 'text-navy'
                      }`}
                    >
                      {moeda(saldo)}
                      {limite > 0 ? (
                        <span className="block text-[.7rem] font-normal text-muted">
                          +{moeda(limite)} de limite
                        </span>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right">{numero(c.envios30)}</Td>
                    <Td className="tabular text-right">{moeda(c.gasto30)}</Td>
                    <Td className="tabular text-right">{numero(c.contatos)}</Td>
                    <Td className="text-[.84rem] text-muted">{quando(c.ultimoEnvio)}</Td>
                    <Td className="text-right">
                      {/* A visita é uma ação, não um link: precisa gravar o
                          acting_org_id na sessão e registrar quem entrou. */}
                      <form action={entrarNaConta.bind(null, c.id)}>
                        <Botao type="submit" tom="contorno" tamanho="sm">
                          Entrar na conta
                        </Botao>
                      </form>
                    </Td>
                  </tr>
                )
              })}
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
