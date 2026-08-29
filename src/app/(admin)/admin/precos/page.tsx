import type { Metadata } from 'next'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { listarClientes, tabelaDePrecos } from '@/db/queries/admin'
import { CANAL_CODIGO, CANAL_LABEL, type Channel } from '@/db/schema/enums'
import { Aviso, Pad, PadTitulo } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { Excecoes, PrecoPadrao } from './formularios'

export const metadata: Metadata = { title: 'Preços' }
export const dynamic = 'force-dynamic'

/** Como o cliente lê o preço: o que ele paga por unidade, e do quê. */
const UNIDADE: Record<Channel, string> = {
  whatsapp_oficial: 'por mensagem entregue',
  whatsapp_nao_oficial: 'por mensagem enviada',
  sms: 'por segmento de 160 caracteres',
  rcs: 'por mensagem',
  voz: 'por chamada completada',
}

export default async function Precos() {
  await exigirSuperadmin()

  const [precos, clientes] = await Promise.all([tabelaDePrecos(), listarClientes({ limite: 200 })])
  const padrao = precos.filter((p) => p.orgId === null)
  const excecoes = precos.filter((p) => p.orgId !== null)

  return (
    <>
      <Titulo
        titulo="Preços"
        descricao="Quanto cada canal custa ao cliente. O preço é congelado na criação da campanha — mudar aqui não altera nada que já foi criado."
      />

      <Aviso tom="info" className="mb-6">
        No SMS o preço é <b>por segmento</b>, não por mensagem: um texto acima de 160 caracteres — ou
        com um único acento fora da tabela GSM — vira dois ou três segmentos e custa proporcional.
        O orçamento na tela do cliente já mostra isso antes de ele confirmar.
      </Aviso>

      <div className="grid grid-cols-[1fr_1fr] gap-6 max-lg:grid-cols-1">
        <Pad>
          <PadTitulo
            titulo="Tabela padrão"
            descricao="Vale para todo cliente que não tiver exceção."
          />
          <ul className="divide-y divide-line">
            {padrao.map((p) => (
              <li key={p.canal} className="px-6 py-4">
                <PrecoPadrao
                  canal={p.canal}
                  rotulo={CANAL_LABEL[p.canal]}
                  codigo={CANAL_CODIGO[p.canal]}
                  unidade={UNIDADE[p.canal]}
                  preco={p.preco}
                />
              </li>
            ))}
          </ul>
        </Pad>

        <Excecoes excecoes={excecoes} clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
      </div>
    </>
  )
}
