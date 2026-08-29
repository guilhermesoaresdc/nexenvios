import type { Metadata } from 'next'
import { exigirTimeNex } from '@/lib/auth/atual'
import { orgDaPlataforma, todosOsUsuarios } from '@/db/queries/admin'
import { PAPEIS_DA_NEX, PAPEL_EXPLICA, PAPEL_LABEL, type UserRole } from '@/db/schema/enums'
import { Aviso, BotaoLink, Chip, Etiqueta, Pad, PadTitulo, Tabela, Td, Th } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { dataHora, quando } from '@/lib/ui'
import { AcoesDoUsuario, EstadoDoAcesso, NovoAcesso } from '../usuarios/painel'

export const metadata: Metadata = { title: 'Time Nex' }
export const dynamic = 'force-dynamic'

export default async function Equipe() {
  const eu = await exigirTimeNex()
  const org = await orgDaPlataforma()

  if (!org) {
    return (
      <>
        <Titulo titulo="Time Nex Envios" />
        <Aviso tom="erro" titulo="A organização da plataforma não existe">
          Rode <code className="font-mono">npm run db:seed</code> para criá-la.
        </Aviso>
      </>
    )
  }

  const time = await todosOsUsuarios({ orgId: org.id, limite: 200 })

  return (
    <>
      <Titulo
        titulo="Time Nex Envios"
        descricao="Quem trabalha na operação. São estes que enxergam todos os clientes."
        acao={
          <BotaoLink href="/admin/usuarios" tom="contorno" tamanho="sm">
            Todos os usuários
          </BotaoLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {PAPEIS_DA_NEX.map((papel) => (
          <Pad key={papel} className="px-5 py-4">
            <Etiqueta>{papel === 'superadmin' ? 'Poder total' : 'Poder limitado'}</Etiqueta>
            <p className="mt-1.5 text-[1rem] font-semibold text-navy">{PAPEL_LABEL[papel]}</p>
            <p className="mt-1 text-[.86rem] leading-relaxed text-muted">{PAPEL_EXPLICA[papel]}</p>
          </Pad>
        ))}
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-6 max-xl:grid-cols-1">
        <Pad>
          <PadTitulo titulo="Pessoas" descricao={`${time.length} no time.`} />
          <Tabela>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Papel</Th>
                <Th>Acesso</Th>
                <Th>Entrou em</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {time.map((u) => {
                const linha = {
                  id: u.id,
                  nome: u.nome,
                  email: u.email,
                  papel: u.papel as UserRole,
                  ativo: u.ativo,
                  temSenha: u.temSenha,
                  convitePendente: u.convitePendente,
                  cliente: u.cliente,
                  daPlataforma: true,
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
                      <Chip tom={u.papel === 'superadmin' ? 'navy' : 'ciano'}>
                        {PAPEL_LABEL[u.papel as UserRole] ?? u.papel}
                      </Chip>
                    </Td>
                    <Td>
                      <EstadoDoAcesso usuario={linha} />
                      <span className="mt-0.5 block text-[.74rem] text-muted">
                        {quando(u.ultimoAcesso)}
                      </span>
                    </Td>
                    <Td className="text-[.82rem] whitespace-nowrap text-muted">
                      {dataHora(u.criadoEm)}
                    </Td>
                    <Td className="text-right">
                      <AcoesDoUsuario usuario={linha} podeConcederNex={eu.isSuperadmin} />
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        </Pad>

        <div className="space-y-5">
          {eu.isSuperadmin ? (
            <NovoAcesso
              titulo="Adicionar ao time"
              contas={[{ id: org.id, nome: org.nome, plataforma: true }]}
              contaFixa={org.id}
              papeis={[...PAPEIS_DA_NEX]}
              podeConcederNex
            />
          ) : (
            <Aviso tom="info" titulo="Só um Administrador Nex adiciona ao time">
              Seu acesso de suporte enxerga o time e cuida do acesso dos clientes, mas não concede
              papel da plataforma. É a trava que impede alguém de se promover.
            </Aviso>
          )}

          <Aviso tom="alerta" titulo="Uma coisa a saber">
            Quem entra aqui enxerga <b>todos</b> os clientes e pode entrar na conta deles. Para quem
            só precisa atender, use {PAPEL_LABEL.suporte} — não mexe em crédito nem em provedor.
          </Aviso>
        </div>
      </div>
    </>
  )
}
