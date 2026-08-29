'use client'

import { useTransition } from 'react'
import { descadastrarContato, reativarContato } from './acoes'
import { Botao } from '@/components/ui/base'

/** Descadastrar e reativar, por linha da tabela. */
export function Acoes({ id, descadastrado }: { id: string; descadastrado: boolean }) {
  const [ocupado, iniciar] = useTransition()

  return descadastrado ? (
    <Botao
      type="button"
      tom="fantasma"
      tamanho="sm"
      disabled={ocupado}
      onClick={() => iniciar(() => void reativarContato(id))}
    >
      Reativar
    </Botao>
  ) : (
    <Botao
      type="button"
      tom="fantasma"
      tamanho="sm"
      disabled={ocupado}
      onClick={() => {
        if (!confirm('Descadastrar este contato? Ele sai de todas as campanhas na fila.')) return
        iniciar(() => void descadastrarContato(id))
      }}
    >
      Descadastrar
    </Botao>
  )
}
