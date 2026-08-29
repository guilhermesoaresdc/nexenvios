import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { extratoDaOrg, tabelaDePrecos, usuariosDaOrg, verCliente } from '@/db/queries/admin'
import { CANAL_LABEL, PAPEL_LABEL, type UserRole } from '@/db/schema/enums'
import { entrarNaConta } from '@/lib/auth/visita'
import {
  Botao,
  BotaoLink,
  Chip,
  Etiqueta,
  Numero,
  Pad,
  PadTitulo,
  Tabela,
  Td,
  Th,
  Vazio,
} from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { dataHora, moeda, numero, quando } from '@/lib/ui'
import { Cadastro, Convite, Credito, FormularioDeConvite, Status } from './painel'

export const metadata: Metadata = { title: 'Cliente' }
export const dynamic = 'force-dynamic'

const TIPO_LABEL: Record<string, string> = {
  recarga: 'Recarga',
  consumo: 'Consumo',
  estorno: 'Estorno',
  ajuste: 'Ajuste',
}

export default async function Cliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirSuperadmin()
  const { id } = await params
  const p = await searchParams

  const cliente = await verCliente(id)
  if (!cliente) notFound()

  const [usuarios, extrato, precos] = await Promise.all([
    usuariosDaOrg(id),
    extratoDaOrg(id, 40),
    tabelaDePrecos(),
  ])

  const doCliente = precos.filter((x) => x.orgId === id)
  const padrao = precos.filter((x) => x.orgId === null)
  const convite = typeof p.convite === 'string' && p.convite ? p.convite : null

  return (
    <>
      <Titulo
        titulo={cliente.nome}
        descricao={
          <>
            <span className="font-mono text-[.8rem]">{cliente.apelido}</span>
            {cliente.documento ? ` · ${cliente.documento}` : ''} · cliente desde{' '}
            {dataHora(cliente.criadoEm)}
          </>
        }
        acao={
          <>
            <BotaoLink href="/admin/clientes" tom="contorno" tamanho="sm">
              Voltar
            </BotaoLink>
            <form action={entrarNaConta.bind(null, cliente.id)}>
              <Botao type="submit" tamanho="sm">
                Entrar na conta
              </Botao>
            </form>
          </>
        }
      />

      {convite ? (
        <div className="mb-5">
          <Convite link={convite} />
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <Numero
          rotulo="Saldo"
          valor={moeda(cliente.saldo)}
          tom={Number(cliente.saldo) <= 0 ? 'vermelho' : 'navy'}
          nota={Number(cliente.limite) > 0 ? `+ ${moeda(cliente.limite)} de limite` : undefined}
        />
        <Numero rotulo="Gasto em 30 dias" valor={moeda(cliente.gasto30)} tom="verde" />
        <Numero rotulo="Envios em 30 dias" valor={numero(cliente.envios30)} tom="blue" />
        <Numero
          rotulo="Base de contatos"
          valor={numero(cliente.contatos)}
          nota={`último envio ${quando(cliente.ultimoEnvio)}`}
        />
      </div>

      <div className="mt-6 grid grid-cols-[1.3fr_1fr] gap-6 max-lg:grid-cols-1">
        <div className="space-y-6">
          <Cadastro cliente={cliente} />

          <Pad>
            <PadTitulo
              titulo="Extrato"
              descricao="Toda movimentação de crédito. É o que faz o saldo bater."
            />
            {extrato.length === 0 ? (
              <Vazio titulo="Sem movimentação" descricao="Nenhum crédito lançado nesta conta ainda." />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Quando</Th>
                    <Th>Tipo</Th>
                    <Th>Descrição</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="text-right">Saldo depois</Th>
                  </tr>
                </thead>
                <tbody>
                  {extrato.map((l) => {
                    const valor = Number(l.valor)
                    return (
                      <tr key={l.id}>
                        <Td className="text-[.84rem] whitespace-nowrap text-muted">
                          {dataHora(l.criadoEm)}
                        </Td>
                        <Td>
                          <Chip tom={valor >= 0 ? 'verde' : 'neutro'}>
                            {TIPO_LABEL[l.tipo] ?? l.tipo}
                          </Chip>
                        </Td>
                        <Td className="text-[.86rem]">
                          {l.descricao ?? '—'}
                          {l.autor ? (
                            <span className="block text-[.74rem] text-muted">por {l.autor}</span>
                          ) : null}
                        </Td>
                        <Td
                          className={`tabular text-right font-semibold ${
                            valor >= 0 ? 'text-[#0f6b34]' : 'text-danger'
                          }`}
                        >
                          {valor >= 0 ? '+' : ''}
                          {moeda(valor)}
                        </Td>
                        <Td className="tabular text-right text-muted">{moeda(l.saldoApos)}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Tabela>
            )}
          </Pad>

          <Pad>
            <PadTitulo
              titulo="Usuários"
              descricao="Quem tem acesso a esta conta."
              acao={<Etiqueta>{numero(usuarios.length)} no total</Etiqueta>}
            />
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>E-mail</Th>
                  <Th>Papel</Th>
                  <Th>Senha</Th>
                  <Th>Último acesso</Th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-semibold text-navy">{u.nome}</Td>
                    <Td className="text-[.86rem] text-muted">{u.email}</Td>
                    <Td>
                      <Chip tom={u.papel === 'admin' ? 'azul' : 'neutro'}>
                        {PAPEL_LABEL[u.papel as UserRole] ?? u.papel}
                      </Chip>
                    </Td>
                    <Td>
                      {u.temSenha ? (
                        <Chip tom="verde">Definida</Chip>
                      ) : (
                        <Chip tom="ambar">Convite pendente</Chip>
                      )}
                    </Td>
                    <Td className="text-[.84rem] text-muted">{quando(u.ultimoAcesso)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            <div className="border-t border-line p-6">
              <FormularioDeConvite orgId={cliente.id} />
            </div>
          </Pad>
        </div>

        <div className="space-y-6">
          <Credito orgId={cliente.id} saldo={cliente.saldo} />
          <Status orgId={cliente.id} status={cliente.status} />

          <Pad>
            <PadTitulo
              titulo="Preço por canal"
              descricao="Sem exceção, vale a tabela padrão da plataforma."
              acao={
                <Link href="/admin/precos" className="text-[.84rem] font-semibold text-blue hover:underline">
                  Editar
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {padrao.map((linha) => {
                const excecao = doCliente.find((x) => x.canal === linha.canal)
                return (
                  <li key={linha.canal} className="flex items-center justify-between px-6 py-3">
                    <span className="text-[.88rem] text-ink">{CANAL_LABEL[linha.canal]}</span>
                    <span className="tabular text-[.88rem] font-semibold text-navy">
                      {moeda(excecao?.preco ?? linha.preco)}
                      {excecao ? (
                        <Chip tom="ciano" className="ml-2">
                          exceção
                        </Chip>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Pad>
        </div>
      </div>
    </>
  )
}
