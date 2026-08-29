import type { Metadata } from 'next'
import { exigirAdmin } from '@/lib/auth/atual'
import { db } from '@/db'
import { apiKeys } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'
import { ESCOPO_LABEL, type Escopo } from '@/lib/api/chave'
import { BotaoLink, Chip, Pad, PadTitulo, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { dataHora, quando } from '@/lib/ui'
import { NovaChave, Revogar } from './painel'

export const metadata: Metadata = { title: 'API' }
export const dynamic = 'force-dynamic'

const BASE = process.env.APP_URL ?? 'https://nexenvios.com.br'

export default async function Api() {
  const usuario = await exigirAdmin()

  const chaves = await db
    .select({
      id: apiKeys.id,
      nome: apiKeys.name,
      prefixo: apiKeys.prefix,
      escopos: apiKeys.scopes,
      ultimoUso: apiKeys.lastUsedAt,
      revogadaEm: apiKeys.revokedAt,
      criadaEm: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, usuario.orgId))
    .orderBy(desc(apiKeys.createdAt))

  return (
    <>
      <Titulo
        titulo="API"
        descricao="Dispare pelo seu sistema, sem passar por esta tela."
        acao={
          <BotaoLink href="/configuracoes" tom="contorno" tamanho="sm">
            Voltar
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-[1.2fr_1fr] gap-6 max-lg:grid-cols-1">
        <div className="space-y-5">
          <Pad>
            <PadTitulo titulo="Suas chaves" />
            {chaves.length === 0 ? (
              <Vazio
                titulo="Nenhuma chave ainda"
                descricao="Crie uma chave ao lado para integrar seu sistema à Nex Envios."
              />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Chave</Th>
                    <Th>Escopos</Th>
                    <Th>Último uso</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {chaves.map((c) => (
                    <tr key={c.id} className="align-top">
                      <Td className="font-semibold text-navy">
                        {c.nome}
                        {c.revogadaEm ? (
                          <Chip tom="vermelho" className="ml-2">
                            Revogada
                          </Chip>
                        ) : null}
                        <span className="block text-[.74rem] font-normal text-muted">
                          criada em {dataHora(c.criadaEm)}
                        </span>
                      </Td>
                      <Td className="font-mono text-[.78rem] whitespace-nowrap">
                        {c.prefixo}
                        <span className="text-muted">.•••••••••</span>
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {c.escopos.map((e) => (
                            <Chip key={e} tom="neutro">
                              {e}
                            </Chip>
                          ))}
                        </span>
                      </Td>
                      <Td className="text-[.82rem] text-muted">{quando(c.ultimoUso)}</Td>
                      <Td className="text-right">
                        {c.revogadaEm ? null : <Revogar id={c.id} nome={c.nome} />}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Pad>

          <Pad>
            <PadTitulo titulo="Como usar" descricao="Autentique com a chave no cabeçalho." />
            <div className="space-y-5 p-6">
              <div>
                <p className="mb-2 text-[.86rem] font-semibold text-navy">Enviar uma mensagem</p>
                <pre className="overflow-x-auto rounded-[12px] bg-navy-deep p-4 font-mono text-[.76rem] leading-relaxed text-[#dbe6fb]">
{`curl -X POST ${BASE}/api/v1/envios \\
  -H "Authorization: Bearer nex_live_xxxx.SEGREDO" \\
  -H "Content-Type: application/json" \\
  -d '{
    "canal": "sms",
    "para": "11987654321",
    "mensagem": "Oi! Seu FGTS já pode ser antecipado."
  }'`}
                </pre>
              </div>

              <div>
                <p className="mb-2 text-[.86rem] font-semibold text-navy">Criar uma campanha</p>
                <pre className="overflow-x-auto rounded-[12px] bg-navy-deep p-4 font-mono text-[.76rem] leading-relaxed text-[#dbe6fb]">
{`curl -X POST ${BASE}/api/v1/campanhas \\
  -H "Authorization: Bearer nex_live_xxxx.SEGREDO" \\
  -H "Content-Type: application/json" \\
  -d '{
    "nome": "FGTS abril",
    "canal": "sms",
    "mensagem": "Oi {{primeiro_nome}}, seu FGTS liberou.",
    "fontes": [{ "tipo": "etiqueta", "chave": "fgts" }]
  }'`}
                </pre>
              </div>

              <div>
                <p className="mb-2 text-[.86rem] font-semibold text-navy">Consultar o saldo</p>
                <pre className="overflow-x-auto rounded-[12px] bg-navy-deep p-4 font-mono text-[.76rem] leading-relaxed text-[#dbe6fb]">
{`curl ${BASE}/api/v1/saldo \\
  -H "Authorization: Bearer nex_live_xxxx.SEGREDO"`}
                </pre>
              </div>

              <p className="text-[.82rem] leading-relaxed text-muted">
                Endpoints: <code className="font-mono">/api/v1/envios</code>,{' '}
                <code className="font-mono">/api/v1/campanhas</code>,{' '}
                <code className="font-mono">/api/v1/contatos</code>,{' '}
                <code className="font-mono">/api/v1/saldo</code>. A documentação completa está em{' '}
                <code className="font-mono">docs/api.md</code> no repositório.
              </p>
            </div>
          </Pad>
        </div>

        <NovaChave escopos={Object.entries(ESCOPO_LABEL) as [Escopo, string][]} />
      </div>
    </>
  )
}
