'use client'

import { useTransition } from 'react'
import { descadastrarNumero } from './acoes'
import { Botao } from '@/components/ui/base'

export function Descadastrar({ telefone }: { telefone: string }) {
  const [ocupado, iniciar] = useTransition()

  return (
    <Botao
      type="button"
      tom="fantasma"
      tamanho="sm"
      disabled={ocupado}
      onClick={() => {
        if (!confirm('Descadastrar este número? Ele sai de todas as campanhas na fila.')) return
        iniciar(() => void descadastrarNumero(telefone))
      }}
    >
      Descadastrar
    </Botao>
  )
}
