'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CampaignStatus } from '@/db/schema/enums'
import { Botao } from '@/components/ui/base'
import {
  cancelarCampanha,
  pausarCampanha,
  retomarCampanha,
  type EstadoDoControle,
} from '../acoes'

/**
 * Os botões que mexem numa campanha em curso.
 *
 * Cancelar acontece em duas etapas de propósito: o botão vira "Confirmar
 * cancelamento" antes de agir. Pausar dá para desfazer retomando; cancelar
 * mata a fila e não tem volta — um clique acidental custaria a campanha.
 */

const PAUSAVEIS: readonly CampaignStatus[] = ['preparando', 'agendada', 'enviando']
const CANCELAVEIS: readonly CampaignStatus[] = [
  'rascunho',
  'preparando',
  'agendada',
  'enviando',
  'pausada',
]

export function Controles({
  campanhaId,
  status,
}: {
  campanhaId: string
  status: CampaignStatus
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [estado, setEstado] = useState<EstadoDoControle | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const podePausar = PAUSAVEIS.includes(status)
  const podeRetomar = status === 'pausada'
  const podeCancelar = CANCELAVEIS.includes(status)

  function rodar(acao: () => Promise<EstadoDoControle>) {
    setConfirmando(false)
    iniciar(async () => {
      const resposta = await acao()
      setEstado(resposta)
      // O servidor é quem sabe o estado novo: recarrega em vez de adivinhar.
      router.refresh()
    })
  }

  // Sem nada a fazer e sem nada a dizer, o bloco some.
  if (!podePausar && !podeRetomar && !podeCancelar && !estado) return null

  return (
    <div className="flex max-w-sm flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {podePausar ? (
          <Botao
            type="button"
            tom="contorno"
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => pausarCampanha(campanhaId))}
          >
            {pendente ? 'Pausando…' : 'Pausar'}
          </Botao>
        ) : null}

        {podeRetomar ? (
          <Botao
            type="button"
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => retomarCampanha(campanhaId))}
          >
            {pendente ? 'Retomando…' : 'Retomar'}
          </Botao>
        ) : null}

        {podeCancelar ? (
          confirmando ? (
            <>
              <Botao
                type="button"
                tom="fantasma"
                tamanho="sm"
                disabled={pendente}
                onClick={() => setConfirmando(false)}
              >
                Deixar como está
              </Botao>
              <Botao
                type="button"
                tom="perigo"
                tamanho="sm"
                disabled={pendente}
                onClick={() => rodar(() => cancelarCampanha(campanhaId))}
              >
                {pendente ? 'Cancelando…' : 'Confirmar cancelamento'}
              </Botao>
            </>
          ) : (
            <Botao
              type="button"
              tom="perigo"
              tamanho="sm"
              disabled={pendente}
              onClick={() => setConfirmando(true)}
            >
              Cancelar campanha
            </Botao>
          )
        ) : null}
      </div>

      {confirmando ? (
        <p className="text-right text-[.78rem] leading-snug text-danger">
          Cancelar mata tudo que ainda não saiu. O que já foi enviado continua cobrado.
        </p>
      ) : null}

      {estado?.erro ? (
        <p className="text-right text-[.78rem] leading-snug font-semibold text-danger">
          {estado.erro}
        </p>
      ) : null}
      {estado?.ok ? (
        <p className="text-right text-[.78rem] leading-snug font-semibold text-[#0f6b34]">
          {estado.ok}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Enquanto a base está sendo preparada, a tela se recarrega sozinha.
 *
 * A materialização acontece no motor, fora deste pedido: sem isto a pessoa
 * ficaria olhando um número parado e apertando F5 para saber se andou.
 */
export function AtualizaSozinho({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter()

  useEffect(() => {
    const relogio = setInterval(() => router.refresh(), segundos * 1000)
    return () => clearInterval(relogio)
  }, [router, segundos])

  return null
}
