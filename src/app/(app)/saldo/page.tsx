import { paginaComBanco } from '@/db/escopo'
import { sql } from '@/db'
import { exigirUsuario } from '@/lib/auth/atual'
import { Titulo } from '@/components/shell/casca'
import { Aviso, Numero, Pad, PadTitulo, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { moeda, dataHora } from '@/lib/ui'
export const metadata = { title: 'Saldo e extrato' }
export const dynamic = 'force-dynamic'
async function Saldo() {
  const usuario = await exigirUsuario()
  const [[saldo], extrato] = await Promise.all([
    sql<{ saldo: string; limite: string; reservado: string }[]>`
      SELECT credits::text AS saldo, credit_limit::text AS limite,
        (SELECT COALESCE(sum(greatest(estimated_cost-actual_cost,0)),0)::text FROM campaigns
          WHERE org_id=${usuario.orgId} AND status IN ('preparando','agendada','aguardando','enviando','pausada')) AS reservado
      FROM organizations WHERE id=${usuario.orgId}
    `,
    sql<
      {
        id: string
        kind: string
        delta: string
        balance_after: string
        description: string | null
        created_at: Date
      }[]
    >`
      SELECT id,kind,delta::text,balance_after::text,description,created_at
      FROM credit_ledger WHERE org_id=${usuario.orgId} ORDER BY created_at DESC,id DESC LIMIT 100
    `,
  ])
  const reservado = Number(saldo?.reservado ?? 0)
  return (
    <>
      <Titulo
        titulo="Saldo e extrato"
        descricao="Acompanhe seus créditos, compromissos e últimos lançamentos."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Saldo da conta" valor={moeda(saldo?.saldo ?? 0)} />
        <Numero
          rotulo="Comprometido em campanhas"
          valor={moeda(reservado)}
          nota="Ainda não debitado"
        />
        <Numero
          rotulo="Disponível para novos envios"
          valor={moeda(Number(saldo?.saldo ?? 0) + Number(saldo?.limite ?? 0) - reservado)}
          nota={`Inclui limite de ${moeda(saldo?.limite ?? 0)}`}
        />
      </div>
      <Aviso tom="info" className="my-6">
        Para adicionar créditos, fale com a Nex Envios. Campanhas em andamento comprometem saldo; a
        cobrança aparece no extrato conforme o processamento confirmado.
      </Aviso>
      <Pad>
        <PadTitulo
          titulo="Últimos 100 lançamentos"
          descricao="Recargas, consumo, ajustes e estornos da sua conta."
        />
        {!extrato.length ? (
          <Vazio
            titulo="Nenhum lançamento ainda"
            descricao="Os movimentos de saldo aparecerão aqui."
          />
        ) : (
          <Tabela rotulo="Saldo e extrato">
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Valor</Th>
                <Th>Saldo após</Th>
              </tr>
            </thead>
            <tbody>
              {extrato.map((l) => (
                <tr key={l.id}>
                  <Td>{dataHora(l.created_at)}</Td>
                  <Td>{l.description ?? l.kind}</Td>
                  <Td className={Number(l.delta) < 0 ? 'text-danger' : 'text-green-700'}>
                    {moeda(l.delta)}
                  </Td>
                  <Td>{moeda(l.balance_after)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Pad>
    </>
  )
}

export default paginaComBanco('/saldo', Saldo)
