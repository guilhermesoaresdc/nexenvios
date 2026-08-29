import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/auth/atual'
import { listarRespostas } from '@/db/queries/historico'
import { CANAL_CURTO } from '@/db/schema/enums'
import { Aviso, BotaoLink, Chip, Pad, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { formatarTelefone } from '@/lib/telefone'
import { dataHora } from '@/lib/ui'
import { Descadastrar } from './painel'

export const metadata: Metadata = { title: 'Respostas' }
export const dynamic = 'force-dynamic'

export default async function Respostas() {
  const usuario = await exigirUsuario()
  const respostas = await listarRespostas(usuario.orgId, 100)

  return (
    <>
      <Titulo
        titulo="Respostas"
        descricao="O que os destinatários responderam aos seus disparos."
        acao={
          <BotaoLink href="/historico" tom="contorno" tamanho="sm">
            Ver o histórico
          </BotaoLink>
        }
      />

      <Aviso tom="info" className="mb-5">
        Respostas com <b>PARE</b>, <b>SAIR</b>, <b>STOP</b> ou <b>DESCADASTRAR</b> descadastram o
        número sozinhas e cancelam o que ainda não saiu para ele. É o que mantém a operação dentro da
        lei — e o número longe da denúncia.
      </Aviso>

      <Pad>
        {respostas.length === 0 ? (
          <Vazio
            titulo="Nenhuma resposta ainda"
            descricao="Assim que alguém responder a um disparo, a mensagem aparece aqui. Isso depende do webhook de retorno estar configurado no canal."
            acao={
              usuario.isAdmin ? <BotaoLink href="/canais">Conferir os canais</BotaoLink> : undefined
            }
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>De</Th>
                <Th>Canal</Th>
                <Th>Mensagem</Th>
                <Th>Campanha</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {respostas.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td className="text-[.82rem] whitespace-nowrap text-muted">
                    {dataHora(r.recebidaEm)}
                  </Td>
                  <Td className="tabular text-[.88rem] whitespace-nowrap">
                    {formatarTelefone(r.de)}
                  </Td>
                  <Td>
                    <Chip tom="azul">{CANAL_CURTO[r.canal]}</Chip>
                  </Td>
                  <Td className="max-w-md text-[.88rem] leading-relaxed whitespace-pre-wrap">
                    {r.texto ?? <span className="text-muted">sem texto</span>}
                  </Td>
                  <Td className="max-w-[180px] truncate text-[.84rem] text-muted">
                    {r.campanha ?? '—'}
                  </Td>
                  <Td className="text-right">
                    {usuario.isLeitor ? null : <Descadastrar telefone={r.de} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Pad>
    </>
  )
}
