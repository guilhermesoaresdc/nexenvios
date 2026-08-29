import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth/atual'
import {
  contarContatos,
  etiquetasEmUso,
  listarContatos,
  listarListas,
  resumoDaBase,
} from '@/db/queries/contatos'
import {
  Botao,
  BotaoLink,
  Chip,
  Entrada,
  Numero,
  Pad,
  Selecao,
  Tabela,
  Td,
  Th,
  Vazio,
} from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { IcContatos } from '@/components/shell/icones'
import { formatarTelefone } from '@/lib/telefone'
import { data, numero, quando } from '@/lib/ui'
import { Acoes } from './painel'

export const metadata: Metadata = { title: 'Contatos' }
export const dynamic = 'force-dynamic'

const POR_PAGINA = 50

export default async function Contatos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await exigirUsuario()
  const p = await searchParams

  const busca = typeof p.busca === 'string' && p.busca ? p.busca : undefined
  const etiqueta = typeof p.etiqueta === 'string' && p.etiqueta ? p.etiqueta : undefined
  const listaId = typeof p.lista === 'string' && p.lista ? p.lista : undefined
  const saida = p.saida === 'somente' ? 'somente' : p.saida === 'incluir' ? 'incluir' : 'excluir'
  const pagina = Math.max(1, Number(p.pagina) || 1)

  const filtro = { busca, etiqueta, listaId, descadastrados: saida as never }

  const [resumo, linhas, total, listas, etiquetas] = await Promise.all([
    resumoDaBase(usuario.orgId),
    listarContatos(usuario.orgId, { ...filtro, limite: POR_PAGINA, pular: (pagina - 1) * POR_PAGINA }),
    contarContatos(usuario.orgId, filtro),
    listarListas(usuario.orgId),
    etiquetasEmUso(usuario.orgId),
  ])

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const url = (pag: number) => {
    const q = new URLSearchParams()
    if (busca) q.set('busca', busca)
    if (etiqueta) q.set('etiqueta', etiqueta)
    if (listaId) q.set('lista', listaId)
    if (saida !== 'excluir') q.set('saida', saida)
    if (pag > 1) q.set('pagina', String(pag))
    const s = q.toString()
    return s ? `/contatos?${s}` : '/contatos'
  }

  return (
    <>
      <Titulo
        titulo="Contatos"
        descricao="A base que recebe seus disparos. Quem se descadastra sai de todas as campanhas na hora."
        acao={
          <>
            <BotaoLink href="/contatos/listas" tom="contorno" tamanho="sm">
              Listas
            </BotaoLink>
            <BotaoLink href="/contatos/importar" tamanho="sm">
              Importar planilha
            </BotaoLink>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
        <Numero rotulo="Na base" valor={numero(resumo.total)} />
        <Numero rotulo="Alcançáveis" valor={numero(resumo.ativos)} tom="verde" nota="com telefone e sem descadastro" />
        <Numero
          rotulo="Descadastrados"
          valor={numero(resumo.descadastrados)}
          tom={resumo.descadastrados > 0 ? 'ambar' : 'navy'}
        />
      </div>

      <Pad className="my-5 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Entrada
              name="busca"
              defaultValue={busca ?? ''}
              placeholder="Nome, telefone ou e-mail"
              aria-label="Buscar contato"
            />
          </div>
          <Selecao name="lista" defaultValue={listaId ?? ''} className="w-auto min-w-[160px]">
            <option value="">Todas as listas</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome} ({numero(l.total)})
              </option>
            ))}
          </Selecao>
          <Selecao name="etiqueta" defaultValue={etiqueta ?? ''} className="w-auto min-w-[150px]">
            <option value="">Todas as etiquetas</option>
            {etiquetas.map((e) => (
              <option key={e.etiqueta} value={e.etiqueta}>
                {e.etiqueta} ({numero(e.total)})
              </option>
            ))}
          </Selecao>
          <Selecao name="saida" defaultValue={saida} className="w-auto min-w-[180px]">
            <option value="excluir">Sem os descadastrados</option>
            <option value="incluir">Incluir descadastrados</option>
            <option value="somente">Só os descadastrados</option>
          </Selecao>
          <Botao type="submit" tom="contorno">
            Filtrar
          </Botao>
          {busca || etiqueta || listaId || saida !== 'excluir' ? (
            <Link href="/contatos" className="px-2 text-[.86rem] font-semibold text-muted hover:text-blue">
              Limpar
            </Link>
          ) : null}
        </form>
      </Pad>

      <Pad>
        {linhas.length === 0 ? (
          <Vazio
            icone={<IcContatos className="h-6 w-6" />}
            titulo={total === 0 && !busca ? 'Sua base está vazia' : 'Nenhum contato com esse filtro'}
            descricao={
              total === 0 && !busca
                ? 'Suba uma planilha com os números. A gente normaliza, tira repetido e mostra o que não entrou e por quê.'
                : 'Tente outro termo ou limpe o filtro.'
            }
            acao={<BotaoLink href="/contatos/importar">Importar planilha</BotaoLink>}
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-6 py-3">
              <span className="text-[.86rem] text-muted">
                <b className="tabular font-semibold text-navy">{numero(total)}</b> contato(s)
              </span>
              <span className="text-[.82rem] text-muted">
                Página {pagina} de {numero(paginas)}
              </span>
            </div>
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Telefone</Th>
                  <Th>Etiquetas</Th>
                  <Th>Origem</Th>
                  <Th>Último envio</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-paper-alt/60">
                    <Td className="font-semibold text-navy">
                      {c.nome ?? <span className="font-normal text-muted">sem nome</span>}
                      {c.descadastrado ? (
                        <Chip tom="ambar" className="ml-2">
                          Descadastrado
                        </Chip>
                      ) : null}
                      {c.email ? (
                        <span className="block text-[.76rem] font-normal text-muted">{c.email}</span>
                      ) : null}
                    </Td>
                    <Td className="tabular whitespace-nowrap">{formatarTelefone(c.telefone)}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {c.etiquetas.slice(0, 4).map((e) => (
                          <Chip key={e} tom="neutro">
                            {e}
                          </Chip>
                        ))}
                      </span>
                    </Td>
                    <Td className="text-[.82rem] text-muted">
                      {c.origem ?? '—'}
                      <span className="block text-[.74rem]">{data(c.criadoEm)}</span>
                    </Td>
                    <Td className="text-[.82rem] text-muted">{quando(c.ultimoEnvio)}</Td>
                    <Td className="text-right">
                      {usuario.isLeitor ? null : (
                        <Acoes id={c.id} descadastrado={c.descadastrado} />
                      )}
                    </Td>
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
