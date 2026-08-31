import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirTimeNex } from '@/lib/auth/atual'
import { auditoria, consumoPorCliente, estadoDoBatimento, resumoGeral } from '@/db/queries/admin'
import { CANAL_CURTO } from '@/db/schema/enums'
import { Chip, Etiqueta, Numero, Pad, PadTitulo, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { moeda, numero, quando } from '@/lib/ui'
import { Batimento } from './batimento'

export const metadata: Metadata = { title: 'Visão geral' }
export const dynamic = 'force-dynamic'

/** O que cada ação da auditoria significa em português. */
const ACAO_LABEL: Record<string, string> = {
  'conta.visitada': 'entrou na conta de um cliente',
  'conta.visita_encerrada': 'saiu da conta do cliente',
  'senha.definida': 'definiu a senha',
  'cliente.criado': 'criou o cliente',
  'cliente.atualizado': 'atualizou o cadastro',
  'cliente.status': 'mudou o status da conta',
  'credito.lancado': 'lançou crédito',
  'preco.alterado': 'alterou preço',
  'usuario.convidado': 'convidou um usuário',
}

export default async function VisaoGeral() {
  await exigirTimeNex()

  const [resumo, consumo, registros, batimento] = await Promise.all([
    resumoGeral(),
    consumoPorCliente(30),
    auditoria(15),
    estadoDoBatimento(),
  ])

  const entrega =
    resumo.envios30 + resumo.falhas30 > 0
      ? Math.round((resumo.envios30 / (resumo.envios30 + resumo.falhas30)) * 100)
      : null

  return (
    <>
      <Titulo
        titulo="Visão geral"
        descricao="A operação inteira da Nex Envios — todos os clientes, em um lugar."
      />

      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <Numero
          rotulo="Clientes"
          valor={numero(resumo.clientesAtivos)}
          nota={
            resumo.clientes > resumo.clientesAtivos
              ? `${numero(resumo.clientes - resumo.clientesAtivos)} suspenso(s) ou cancelado(s)`
              : 'todos ativos'
          }
        />
        <Numero rotulo="Enviados hoje" valor={numero(resumo.enviosHoje)} tom="blue" />
        <Numero
          rotulo="Enviados em 30 dias"
          valor={numero(resumo.envios30)}
          nota={entrega === null ? 'sem envios no período' : `${entrega}% sem falha`}
        />
        <Numero
          rotulo="Na fila agora"
          valor={numero(resumo.naFila)}
          tom={resumo.naFila > 0 ? 'ambar' : 'navy'}
          nota={`${numero(resumo.campanhasAtivas)} campanha(s) em curso`}
        />
        <Numero
          rotulo="Consumo em 30 dias"
          valor={moeda(resumo.receita30)}
          tom="verde"
          nota="crédito debitado pelos envios"
        />
        <Numero
          rotulo="Crédito em circulação"
          valor={moeda(resumo.creditoEmCirculacao)}
          nota="saldo somado de todos os clientes"
        />
        <Numero rotulo="Usuários ativos" valor={numero(resumo.usuarios)} />
        <Numero
          rotulo="Falhas em 30 dias"
          valor={numero(resumo.falhas30)}
          tom={resumo.falhas30 > 0 ? 'vermelho' : 'navy'}
        />
      </div>

      <div className="mt-6">
        <Batimento estado={batimento} />
      </div>

      <div className="mt-6 grid grid-cols-[1.3fr_1fr] gap-6 max-lg:grid-cols-1">
        <Pad>
          <PadTitulo
            titulo="Quem mais consumiu"
            descricao="Últimos 30 dias, por cliente e canal."
            acao={
              <Link href="/admin/clientes" className="text-[.84rem] font-semibold text-blue hover:underline">
                Ver clientes
              </Link>
            }
          />
          {consumo.length === 0 ? (
            <Vazio
              titulo="Nenhum envio nos últimos 30 dias"
              descricao="Assim que um cliente disparar, o consumo aparece aqui separado por canal."
            />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Canal</Th>
                  <Th className="text-right">Envios</Th>
                  <Th className="text-right">Custo</Th>
                </tr>
              </thead>
              <tbody>
                {consumo.slice(0, 12).map((l) => (
                  <tr key={`${l.orgId}-${l.canal}`} className="transition-colors hover:bg-paper-alt/60">
                    <Td>
                      <Link
                        href={`/admin/clientes/${l.orgId}`}
                        className="font-semibold text-navy hover:text-blue"
                      >
                        {l.cliente}
                      </Link>
                    </Td>
                    <Td>
                      <Chip tom="azul">{CANAL_CURTO[l.canal]}</Chip>
                    </Td>
                    <Td className="tabular text-right">{numero(l.envios)}</Td>
                    <Td className="tabular text-right font-semibold">{moeda(l.custo)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Pad>

        <Pad>
          <PadTitulo titulo="O que aconteceu" descricao="Registro das ações do time e dos clientes." />
          {registros.length === 0 ? (
            <Vazio titulo="Nada registrado ainda" descricao="As ações do time aparecem aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {registros.map((r) => (
                <li key={r.id} className="px-6 py-3.5">
                  <p className="text-[.88rem] text-ink">
                    <b className="font-semibold text-navy">{r.autor ?? 'sistema'}</b>{' '}
                    {ACAO_LABEL[r.acao] ?? r.acao}
                    {r.cliente ? (
                      <>
                        {' — '}
                        <span className="text-muted">{r.cliente}</span>
                      </>
                    ) : null}
                  </p>
                  <Etiqueta className="mt-0.5 block">{quando(r.criadoEm)}</Etiqueta>
                </li>
              ))}
            </ul>
          )}
        </Pad>
      </div>
    </>
  )
}
