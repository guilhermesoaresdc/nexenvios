import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/auth/atual'
import { db } from '@/db'
import { organizations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { extratoDaOrg } from '@/db/queries/admin'
import {
  Aviso,
  BotaoLink,
  Chip,
  Numero,
  Pad,
  PadTitulo,
  Tabela,
  Td,
  Th,
  Vazio,
} from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { dataHora, moeda } from '@/lib/ui'
import { FormularioDaConta } from './painel'

export const metadata: Metadata = { title: 'Configurações' }
export const dynamic = 'force-dynamic'

const TIPO_LABEL: Record<string, string> = {
  recarga: 'Recarga',
  consumo: 'Consumo',
  estorno: 'Estorno',
  ajuste: 'Ajuste',
}

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP ?? '5588992640298'

export default async function Configuracoes() {
  const usuario = await exigirUsuario()

  const [[org], extrato] = await Promise.all([
    db
      .select({
        nome: organizations.name,
        documento: organizations.document,
        contatoNome: organizations.contactName,
        contatoEmail: organizations.contactEmail,
        contatoTelefone: organizations.contactPhone,
        fuso: organizations.timezone,
        saldo: organizations.credits,
        limite: organizations.creditLimit,
        status: organizations.status,
      })
      .from(organizations)
      .where(eq(organizations.id, usuario.orgId))
      .limit(1),
    extratoDaOrg(usuario.orgId, 30),
  ])

  if (!org) return null

  const saldo = Number(org.saldo)

  return (
    <>
      <Titulo
        titulo="Configurações"
        descricao="Os dados da sua conta, o saldo e o extrato."
        acao={
          <>
            <BotaoLink href="/configuracoes/equipe" tom="contorno" tamanho="sm">
              Equipe
            </BotaoLink>
            <BotaoLink href="/configuracoes/api" tom="contorno" tamanho="sm">
              API
            </BotaoLink>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
        <Numero
          rotulo="Saldo em créditos"
          valor={moeda(saldo)}
          tom={saldo <= 0 ? 'vermelho' : saldo < 50 ? 'ambar' : 'verde'}
          nota={Number(org.limite) > 0 ? `+ ${moeda(org.limite)} de limite de confiança` : undefined}
        />
        <Numero
          rotulo="Status da conta"
          valor={org.status === 'ativo' ? 'Ativa' : org.status === 'suspenso' ? 'Suspensa' : 'Encerrada'}
          tom={org.status === 'ativo' ? 'verde' : 'ambar'}
        />
        <Numero rotulo="Fuso dos disparos" valor={org.fuso.split('/')[1]?.replace('_', ' ') ?? org.fuso} />
      </div>

      {saldo < 50 ? (
        <Aviso tom={saldo <= 0 ? 'erro' : 'alerta'} className="mt-5">
          {saldo <= 0
            ? 'Seu saldo acabou. Novos disparos ficam barrados até a recarga.'
            : 'Seu saldo está baixo. Vale recarregar antes da próxima campanha.'}{' '}
          A recarga é feita pela equipe Nex Envios —{' '}
          <a
            href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
              'Olá! Quero recarregar créditos na Nex Envios.',
            )}`}
            target="_blank"
            rel="noopener"
            className="font-semibold underline"
          >
            fale com a gente pelo WhatsApp
          </a>
          .
        </Aviso>
      ) : null}

      <div className="mt-6 grid grid-cols-[1.2fr_1fr] gap-6 max-lg:grid-cols-1">
        {usuario.isAdmin ? (
          <FormularioDaConta conta={org} />
        ) : (
          <Pad>
            <PadTitulo titulo="Dados da conta" />
            <dl className="divide-y divide-line">
              {[
                ['Empresa', org.nome],
                ['Documento', org.documento],
                ['Contato', org.contatoNome],
                ['E-mail', org.contatoEmail],
                ['Telefone', org.contatoTelefone],
                ['Fuso', org.fuso],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between px-6 py-3">
                  <dt className="text-[.86rem] text-muted">{rotulo}</dt>
                  <dd className="text-[.88rem] font-semibold text-navy">{valor ?? '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-line p-6">
              <Aviso tom="info">
                Só quem administra a conta edita estes dados. Peça a um administrador da sua equipe.
              </Aviso>
            </div>
          </Pad>
        )}

        <Pad>
          <PadTitulo titulo="Extrato" descricao="Cada crédito que entrou e cada envio que saiu." />
          {extrato.length === 0 ? (
            <Vazio titulo="Sem movimentação" descricao="Assim que houver recarga ou envio, aparece aqui." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Tipo</Th>
                  <Th className="text-right">Valor</Th>
                  <Th className="text-right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {extrato.map((l) => {
                  const valor = Number(l.valor)
                  return (
                    <tr key={l.id}>
                      <Td className="text-[.82rem] whitespace-nowrap text-muted">
                        {dataHora(l.criadoEm)}
                      </Td>
                      <Td>
                        <Chip tom={valor >= 0 ? 'verde' : 'neutro'}>
                          {TIPO_LABEL[l.tipo] ?? l.tipo}
                        </Chip>
                        {l.descricao ? (
                          <span className="block text-[.74rem] text-muted">{l.descricao}</span>
                        ) : null}
                      </Td>
                      <Td
                        className={`tabular text-right font-semibold ${
                          valor >= 0 ? 'text-[#0f6b34]' : 'text-muted'
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
      </div>
    </>
  )
}
