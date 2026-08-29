'use client'

import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { apagarProvedor, guardarProvedor, religar } from './acoes'
import { FormularioDeCanal, type CanalParaEditar } from '@/components/canais/formulario'
import { Botao, Chip } from '@/components/ui/base'
import { numero, quando } from '@/lib/ui'

export function Cartao({
  provedor,
  titulo,
  clientes,
  envios30,
  quebradoAte,
  falhasSeguidas,
}: {
  provedor: CanalParaEditar
  titulo: ReactNode
  clientes: number
  envios30: number
  quebradoAte: string | null
  falhasSeguidas: number
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao] = useActionState(guardarProvedor, undefined)
  const [ocupado, iniciar] = useTransition()

  const quebrado = quebradoAte && new Date(quebradoAte).getTime() > Date.now()

  return (
    <div className="rounded-[12px] border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[.98rem] font-semibold text-navy">{provedor.rotulo}</p>
          <p className="mt-1 text-[.84rem] text-muted">{titulo}</p>
          <p className="mt-1 text-[.82rem] text-muted">
            {numero(clientes)} cliente(s) · {numero(envios30)} envio(s) em 30 dias
            {provedor.temCredencial ? ' · credencial salva' : ' · sem credencial'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {provedor.padrao ? <Chip tom="azul">Padrão</Chip> : null}
            {!provedor.ativo ? <Chip tom="neutro">Desativado</Chip> : null}
            {quebrado ? (
              <Chip tom="vermelho">
                Desligado por {falhasSeguidas} falhas — volta {quando(quebradoAte)}
              </Chip>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {quebrado ? (
            <Botao
              type="button"
              tamanho="sm"
              disabled={ocupado}
              onClick={() => iniciar(() => void religar(provedor.id))}
            >
              Religar agora
            </Botao>
          ) : null}
          <Botao type="button" tom="contorno" tamanho="sm" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Fechar' : 'Editar'}
          </Botao>
          <Botao
            type="button"
            tom="perigo"
            tamanho="sm"
            disabled={ocupado}
            onClick={() => {
              if (
                !confirm(
                  `Remover "${provedor.rotulo}"? Clientes que dependem deste provedor param de enviar.`,
                )
              )
                return
              iniciar(() => void apagarProvedor(provedor.id))
            }}
          >
            Remover
          </Botao>
        </div>
      </div>

      {aberto ? (
        <div className="mt-5 border-t border-line pt-5">
          <FormularioDeCanal acao={acao} estado={estado} editando={provedor} daPlataforma />
        </div>
      ) : null}
    </div>
  )
}

export function Novo() {
  const [estado, acao] = useActionState(guardarProvedor, undefined)
  return <FormularioDeCanal acao={acao} estado={estado} daPlataforma />
}
