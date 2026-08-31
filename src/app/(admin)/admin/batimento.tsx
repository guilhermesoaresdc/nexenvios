'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Aviso, Botao, Pad, PadTitulo } from '@/components/ui/base'
import { numero, quando } from '@/lib/ui'
import { rodarBatimento } from './acoes'
import type { EstadoDoBatimento } from '@/db/queries/admin'

/**
 * O sinal de vida do motor, com o botão de empurrar a fila.
 *
 * Uma fila parada e uma fila vazia se parecem na tela. O que separa as duas é
 * `vencidaDesde`: linha que já venceu e continua pendente só existe se ninguém
 * está batendo — ou seja, o agendador externo caiu. É o único lugar onde isso
 * aparece antes de virar reclamação de cliente.
 */

/** Acima disto, uma linha vencida parada deixou de ser atraso e virou defeito. */
const MINUTOS_ATE_SUSPEITAR = 5

function Rodar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tom="contorno" tamanho="sm" disabled={pending}>
      {pending ? 'Rodando…' : 'Rodar agora'}
    </Botao>
  )
}

export function Batimento({ estado }: { estado: EstadoDoBatimento }) {
  const [resultado, acao] = useActionState(rodarBatimento, undefined)

  const atrasoMin = estado.vencidaDesde
    ? Math.floor((Date.now() - new Date(estado.vencidaDesde).getTime()) / 60_000)
    : 0
  const travada = atrasoMin >= MINUTOS_ATE_SUSPEITAR

  return (
    <Pad>
      <PadTitulo
        titulo="O batimento"
        descricao="Quem faz o motor andar. Sem agendador de pé, nada sai da fila."
        acao={
          <form action={acao}>
            <Rodar />
          </form>
        }
      />

      <div className="space-y-3 px-6 py-5">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="font-mono text-[.66rem] tracking-[.1em] text-muted uppercase">Na fila</p>
            <p className="tabular mt-1 font-mono text-[1.3rem] font-semibold text-navy">
              {numero(estado.naFila)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[.66rem] tracking-[.1em] text-muted uppercase">
              Última batida
            </p>
            <p className="mt-1 text-[.92rem] font-semibold text-navy">
              {estado.ultimoEm ? quando(estado.ultimoEm) : 'nunca bateu'}
            </p>
            {estado.ultimoEm ? (
              <p className="text-[.78rem] text-muted">
                {estado.ultimoTentados === 0
                  ? 'nada para enviar'
                  : `${numero(estado.ultimoEnviados)} de ${numero(estado.ultimoTentados)} enviada(s)`}
              </p>
            ) : null}
          </div>
        </div>

        {resultado?.erro ? <Aviso tom="erro">{resultado.erro}</Aviso> : null}
        {resultado?.ok ? <Aviso tom="ok">{resultado.ok}</Aviso> : null}

        {travada ? (
          <Aviso tom="alerta" titulo="Tem mensagem vencida parada na fila">
            A mais antiga venceu há {numero(atrasoMin)} minuto(s) e ninguém a pegou. É o sinal de
            que o agendador externo não está chamando <code>/api/cron</code>. Rode agora para
            destravar e confira o agendador — o cron da Vercel no plano Hobby passa uma vez por
            dia e não serve sozinho.
          </Aviso>
        ) : null}
      </div>
    </Pad>
  )
}
