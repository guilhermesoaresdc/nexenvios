import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirTimeNex } from '@/lib/auth/atual'
import {
  clientesParaEscolha,
  contarUsuarios,
  resumoDeAcessos,
  todosOsUsuarios,
  type FiltroDeUsuarios,
} from '@/db/queries/admin'
import {
  PAPEIS_DA_NEX,
  PAPEIS_DO_CLIENTE,
  PAPEL_LABEL,
  userRoleEnum,
  type UserRole,
} from '@/db/schema/enums'
import {
  Aviso,
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
import { numero, quando } from '@/lib/ui'
import { AcoesDoUsuario, EstadoDoAcesso, NovoAcesso } from './painel'

export const metadata: Metadata = { title: 'Usuários' }
export const dynamic = 'force-dynamic'

const POR_PAGINA = 40

export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const eu = await exigirTimeNex()
  const p = await searchParams

  const filtro: FiltroDeUsuarios = {
    busca: typeof p.busca === 'string' && p.busca ? p.busca : undefined,
    orgId: typeof p.conta === 'string' && p.conta ? p.conta : undefined,
    papel:
      typeof p.papel === 'string' && userRoleEnum.enumValues.includes(p.papel as UserRole)
        ? p.papel
        : undefined,
    escopo:
      p.escopo === 'plataforma' ? 'plataforma' : p.escopo === 'clientes' ? 'clientes' : 'todos',
    ativos: p.ativos === 'inativos' ? 'inativos' : p.ativos === 'ativos' ? 'ativos' : 'todos',
  }

  const pagina = Math.max(1, Number(p.pagina) || 1)

  const [linhas, total, resumo, contas] = await Promise.all([
    todosOsUsuarios({ ...filtro, limite: POR_PAGINA, pular: (pagina - 1) * POR_PAGINA }),
    contarUsuarios(filtro),
    resumoDeAcessos(),
    clientesParaEscolha(),
  ])

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const url = (pag: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) {
      if (k === 'pagina' || !v) continue
      q.set(k, Array.isArray(v) ? (v[0] ?? '') : v)
    }
    if (pag > 1) q.set('pagina', String(pag))
    const s = q.toString()
    return s ? `/admin/usuarios?${s}` : '/admin/usuarios'
  }

  return (
    <>
      <Titulo
        titulo="Usuários"
        descricao="Todo mundo que entra na plataforma — seu time e o de cada cliente. Aqui você cria o acesso, define a senha e tira quem saiu."
        acao={
          <BotaoLink href="/admin/equipe" tom="contorno" tamanho="sm">
            Só o time Nex
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <Numero rotulo="Usuários" valor={numero(resumo.total)} />
        <Numero rotulo="Ativos" valor={numero(resumo.ativos)} tom="verde" />
        <Numero
          rotulo="Sem senha definida"
          valor={numero(resumo.semSenha)}
          tom={resumo.semSenha > 0 ? 'ambar' : 'navy'}
          nota="convite pendente ou nunca acessou"
        />
        <Numero rotulo="Time Nex" valor={numero(resumo.timeNex)} tom="blue" />
      </div>

      <div className="mt-6 grid grid-cols-[1.5fr_1fr] gap-6 max-xl:grid-cols-1">
        <div>
          <Pad className="mb-5 p-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <Entrada
                  name="busca"
                  defaultValue={filtro.busca ?? ''}
                  placeholder="Nome, e-mail ou conta"
                  aria-label="Buscar usuário"
                />
              </div>
              <Selecao name="conta" defaultValue={filtro.orgId ?? ''} className="w-auto min-w-[180px]">
                <option value="">Todas as contas</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.plataforma ? `${c.nome} (time Nex)` : c.nome}
                  </option>
                ))}
              </Selecao>
              <Selecao name="papel" defaultValue={filtro.papel ?? ''} className="w-auto min-w-[170px]">
                <option value="">Todos os papéis</option>
                {userRoleEnum.enumValues.map((r) => (
                  <option key={r} value={r}>
                    {PAPEL_LABEL[r]}
                  </option>
                ))}
              </Selecao>
              <Selecao name="ativos" defaultValue={filtro.ativos} className="w-auto min-w-[140px]">
                <option value="todos">Ativos e inativos</option>
                <option value="ativos">Só ativos</option>
                <option value="inativos">Só desativados</option>
              </Selecao>
              <Botao type="submit" tom="contorno">
                Filtrar
              </Botao>
              {Object.keys(p).length > 0 ? (
                <Link
                  href="/admin/usuarios"
                  className="px-2 text-[.86rem] font-semibold text-muted hover:text-blue"
                >
                  Limpar
                </Link>
              ) : null}
            </form>
          </Pad>

          <Pad>
            {linhas.length === 0 ? (
              <Vazio
                icone={<IcContatos className="h-6 w-6" />}
                titulo="Nenhum usuário com esse filtro"
                descricao="Ajuste a busca ou crie um acesso no formulário ao lado."
              />
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-line px-6 py-3">
                  <span className="text-[.86rem] text-muted">
                    <b className="tabular font-semibold text-navy">{numero(total)}</b> usuário(s)
                  </span>
                  <span className="text-[.82rem] text-muted">
                    Página {pagina} de {numero(paginas)}
                  </span>
                </div>

                <Tabela>
                  <thead>
                    <tr>
                      <Th>Pessoa</Th>
                      <Th>Conta</Th>
                      <Th>Papel</Th>
                      <Th>Acesso</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((u) => {
                      const linha = {
                        id: u.id,
                        nome: u.nome,
                        email: u.email,
                        papel: u.papel as UserRole,
                        ativo: u.ativo,
                        temSenha: u.temSenha,
                        convitePendente: u.convitePendente,
                        cliente: u.cliente,
                        daPlataforma: u.daPlataforma,
                        eu: u.id === eu.id,
                      }
                      return (
                        <tr key={u.id} className="align-top">
                          <Td>
                            <span className="font-semibold text-navy">{u.nome}</span>
                            {linha.eu ? (
                              <Chip tom="azul" className="ml-2">
                                você
                              </Chip>
                            ) : null}
                            <span className="block text-[.8rem] text-muted">{u.email}</span>
                          </Td>
                          <Td>
                            {u.daPlataforma ? (
                              <Chip tom="ciano">Time Nex</Chip>
                            ) : (
                              <Link
                                href={`/admin/clientes/${u.orgId}`}
                                className="text-[.86rem] font-semibold text-navy hover:text-blue"
                              >
                                {u.cliente}
                              </Link>
                            )}
                          </Td>
                          <Td>
                            <Chip tom={u.papel === 'superadmin' ? 'navy' : 'neutro'}>
                              {PAPEL_LABEL[u.papel as UserRole] ?? u.papel}
                            </Chip>
                          </Td>
                          <Td>
                            <EstadoDoAcesso usuario={linha} />
                            <span className="mt-0.5 block text-[.74rem] text-muted">
                              {quando(u.ultimoAcesso)}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <AcoesDoUsuario usuario={linha} podeConcederNex={eu.isSuperadmin} />
                          </Td>
                        </tr>
                      )
                    })}
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
                {numero((pagina - 1) * POR_PAGINA + 1)}–
                {numero(Math.min(pagina * POR_PAGINA, total))} de {numero(total)}
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
        </div>

        <div className="space-y-5">
          <NovoAcesso
            contas={contas}
            papeis={
              eu.isSuperadmin
                ? [...PAPEIS_DO_CLIENTE, ...PAPEIS_DA_NEX]
                : [...PAPEIS_DO_CLIENTE]
            }
            podeConcederNex={eu.isSuperadmin}
          />

          {eu.isSuperadmin ? null : (
            <Aviso tom="info">
              Você entrou como <b>{PAPEL_LABEL.suporte}</b>: cuida de acesso e enxerga todos os
              clientes, mas não concede papel do time Nex nem mexe em crédito, preço ou provedor.
            </Aviso>
          )}
        </div>
      </div>
    </>
  )
}
