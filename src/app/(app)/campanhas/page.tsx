import type { Metadata } from 'next'
import Link from 'next/link'
import { contarCampanhas, listarCampanhas } from '@/db/queries/campanhas'
import {
  campaignStatusEnum,
  CANAIS,
  CANAL_CURTO,
  STATUS_CAMPANHA_LABEL,
  type CampaignStatus,
  type Channel,
} from '@/db/schema/enums'
import { exigirUsuario } from '@/lib/auth/atual'
import { dataHora, moeda, numero, quando } from '@/lib/ui'
import { Titulo } from '@/components/shell/casca'
import { IcCampanhas } from '@/components/shell/icones'
import {
  Barra,
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
  type TomDoChip,
} from '@/components/ui/base'
import { COR } from '@/components/ui/graficos'

export const metadata: Metadata = { title: 'Campanhas' }

const POR_PAGINA = 20

const STATUS: readonly CampaignStatus[] = campaignStatusEnum.enumValues

const TOM_DO_STATUS: Record<CampaignStatus, TomDoChip> = {
  rascunho: 'neutro',
  preparando: 'azul',
  agendada: 'ciano',
  enviando: 'verde',
  pausada: 'ambar',
  concluida: 'navy',
  cancelada: 'neutro',
  falhou: 'vermelho',
}

const TOM_DO_CANAL: Record<Channel, TomDoChip> = {
  whatsapp_oficial: 'verde',
  whatsapp_nao_oficial: 'verde',
  sms: 'azul',
  rcs: 'ciano',
  voz: 'ambar',
}

type Busca = Record<string, string | string[] | undefined>

function texto(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? ''
}

function ehStatus(valor: string): valor is CampaignStatus {
  return (STATUS as readonly string[]).includes(valor)
}

function ehCanal(valor: string): valor is Channel {
  return (CANAIS as readonly string[]).includes(valor)
}

function endereco(filtros: { busca: string; status: string; canal: string }, pagina: number): string {
  const p = new URLSearchParams()
  if (filtros.busca) p.set('busca', filtros.busca)
  if (filtros.status) p.set('status', filtros.status)
  if (filtros.canal) p.set('canal', filtros.canal)
  if (pagina > 1) p.set('pagina', String(pagina))
  const consulta = p.toString()
  return consulta ? `/campanhas?${consulta}` : '/campanhas'
}

export default async function Campanhas({
  searchParams,
}: {
  searchParams: Promise<Busca>
}) {
  const usuario = await exigirUsuario()
  const parametros = await searchParams

  const buscaCrua = texto(parametros.busca).slice(0, 160)
  const statusCru = texto(parametros.status)
  const canalCru = texto(parametros.canal)
  const status = ehStatus(statusCru) ? statusCru : null
  const canal = ehCanal(canalCru) ? canalCru : null

  const paginaCrua = Number(texto(parametros.pagina))
  const pagina = Number.isFinite(paginaCrua) && paginaCrua > 1 ? Math.floor(paginaCrua) : 1

  const filtro = {
    status: status ? [status] : undefined,
    canal: canal ?? undefined,
    busca: buscaCrua || undefined,
  }

  const [linhas, total] = await Promise.all([
    listarCampanhas(usuario.orgId, {
      ...filtro,
      limite: POR_PAGINA,
      pular: (pagina - 1) * POR_PAGINA,
    }),
    contarCampanhas(usuario.orgId, filtro),
  ])

  const filtrando = Boolean(buscaCrua || status || canal)
  const filtros = { busca: buscaCrua, status: status ?? '', canal: canal ?? '' }
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA))
  const primeiroDaPagina = (pagina - 1) * POR_PAGINA + 1

  return (
    <>
      <Titulo
        titulo="Campanhas"
        descricao={`Tudo que ${usuario.orgName} já disparou, com andamento, custo e motivo de falha.`}
        acao={<BotaoLink href="/disparo">Novo disparo</BotaoLink>}
      />

      <Pad>
        <form method="get" className="grid gap-3 border-b border-line px-6 py-5 lg:grid-cols-[minmax(0,1fr)_190px_190px_auto]">
          <Entrada
            name="busca"
            defaultValue={buscaCrua}
            placeholder="Buscar pelo nome da campanha"
            aria-label="Buscar pelo nome da campanha"
          />

          <Selecao name="status" defaultValue={status ?? ''} aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_CAMPANHA_LABEL[s]}
              </option>
            ))}
          </Selecao>

          <Selecao name="canal" defaultValue={canal ?? ''} aria-label="Filtrar por canal">
            <option value="">Todos os canais</option>
            {CANAIS.map((c) => (
              <option key={c} value={c}>
                {CANAL_CURTO[c]}
              </option>
            ))}
          </Selecao>

          <div className="flex items-center gap-2">
            <Botao type="submit" tom="contorno">
              Filtrar
            </Botao>
            {filtrando ? (
              <BotaoLink href="/campanhas" tom="fantasma">
                Limpar
              </BotaoLink>
            ) : null}
          </div>
        </form>

        {linhas.length === 0 ? (
          filtrando ? (
            <Vazio
              icone={<IcCampanhas className="h-6 w-6" />}
              titulo="Nenhuma campanha com esses filtros"
              descricao="Nada por aqui bate com o nome, o status ou o canal escolhido. Solte os filtros para ver a lista inteira."
              acao={
                <BotaoLink href="/campanhas" tom="contorno">
                  Limpar os filtros
                </BotaoLink>
              }
            />
          ) : (
            <Vazio
              icone={<IcCampanhas className="h-6 w-6" />}
              titulo="Nenhuma campanha ainda"
              descricao="Assim que o primeiro disparo sair, ele aparece aqui com andamento, entrega, custo e o motivo de cada falha."
              acao={<BotaoLink href="/disparo">Criar o primeiro disparo</BotaoLink>}
            />
          )
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Campanha</Th>
                <Th>Canal</Th>
                <Th>Status</Th>
                <Th className="min-w-52">Andamento</Th>
                <Th className="text-right">Enviados</Th>
                <Th className="text-right">Custo</Th>
                <Th className="text-right">Criada</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                /*
                 * Os contadores da campanha são de estado atual, não
                 * acumulados: quem foi entregue saiu de `enviados`. Somar de
                 * volta é o que faz "enviados" significar "já saíram".
                 */
                const entregues = c.entregues + c.lidos + c.respostas
                const saidos = c.enviados + entregues
                const base = Math.max(c.total, saidos + c.falhas + c.pendentes, 1)
                const temReal = Number(c.custoReal) > 0

                return (
                  <tr key={c.id} className="transition-colors hover:bg-paper-alt">
                    <Td>
                      <Link
                        href={`/campanhas/${c.id}`}
                        className="block max-w-[22rem] truncate font-semibold text-navy hover:text-blue"
                      >
                        {c.nome}
                      </Link>
                      {c.fontes.length > 0 ? (
                        <span className="mt-0.5 block max-w-[22rem] truncate text-[.76rem] text-muted">
                          {c.fontes.join(' · ')}
                        </span>
                      ) : null}
                    </Td>

                    <Td>
                      <Chip tom={TOM_DO_CANAL[c.canal]}>{CANAL_CURTO[c.canal]}</Chip>
                    </Td>

                    <Td>
                      <Chip tom={TOM_DO_STATUS[c.status]} pulsando={c.status === 'enviando'}>
                        {STATUS_CAMPANHA_LABEL[c.status]}
                      </Chip>
                    </Td>

                    <Td>
                      <Barra
                        total={base}
                        fatias={[
                          { valor: entregues, cor: COR.verde, rotulo: 'Entregues' },
                          { valor: c.enviados, cor: COR.azul, rotulo: 'Enviados' },
                          { valor: c.falhas, cor: COR.vermelho, rotulo: 'Falhas' },
                        ]}
                      />
                      <span className="mt-1.5 block text-[.74rem] text-muted">
                        {c.status === 'preparando'
                          ? `preparando a base · ${numero(c.pendentes)} de ${numero(c.total)} linhas prontas`
                          : `${numero(c.pendentes)} na fila · ${numero(c.falhas)} ${c.falhas === 1 ? 'falha' : 'falhas'}`}
                      </span>
                    </Td>

                    <Td className="tabular text-right font-mono">
                      <span className="font-semibold text-navy">{numero(saidos)}</span>
                      <span className="text-muted"> / {numero(c.total)}</span>
                    </Td>

                    <Td className="tabular text-right font-mono">
                      {moeda(temReal ? c.custoReal : c.custoPrevisto)}
                      {temReal ? null : (
                        <span className="block font-sans text-[.7rem] text-muted">previsto</span>
                      )}
                    </Td>

                    <Td className="text-right text-muted">
                      <span title={dataHora(c.criadaEm)}>{quando(c.criadaEm)}</span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}

        {linhas.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <p className="text-[.82rem] text-muted">
              {primeiroDaPagina}–{primeiroDaPagina + linhas.length - 1} de {numero(total)}{' '}
              {total === 1 ? 'campanha' : 'campanhas'}
            </p>

            <div className="flex items-center gap-2">
              {pagina > 1 ? (
                <BotaoLink href={endereco(filtros, pagina - 1)} tom="contorno" tamanho="sm">
                  Anterior
                </BotaoLink>
              ) : null}
              {pagina < ultimaPagina ? (
                <BotaoLink href={endereco(filtros, pagina + 1)} tom="contorno" tamanho="sm">
                  Próxima
                </BotaoLink>
              ) : null}
            </div>
          </div>
        ) : null}
      </Pad>
    </>
  )
}
