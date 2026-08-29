'use client'

import { useActionState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { PrecoDoCanal } from '@/db/queries/admin'
import { CANAL_LABEL, CANAIS, type Channel } from '@/db/schema/enums'
import { removerExcecao, salvarExcecao, salvarPrecoPadrao } from './acoes'
import {
  Aviso,
  Botao,
  Campo,
  Chip,
  Entrada,
  Etiqueta,
  Pad,
  PadTitulo,
  Selecao,
  Vazio,
} from '@/components/ui/base'
import { moeda } from '@/lib/ui'

function Salvar({ texto = 'Salvar' }: { texto?: string }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tamanho="sm" disabled={pending}>
      {pending ? '…' : texto}
    </Botao>
  )
}

export function PrecoPadrao({
  canal,
  rotulo,
  codigo,
  unidade,
  preco,
}: {
  canal: Channel
  rotulo: string
  codigo: string
  unidade: string
  preco: string
}) {
  const [estado, acao] = useActionState(salvarPrecoPadrao, undefined)

  return (
    <form action={acao} className="flex flex-wrap items-end justify-between gap-3">
      <input type="hidden" name="canal" value={canal} />
      <div className="min-w-0">
        <Etiqueta>{codigo}</Etiqueta>
        <p className="text-[.95rem] font-semibold text-navy">{rotulo}</p>
        <p className="text-[.78rem] text-muted">
          {moeda(preco)} {unidade}
        </p>
        {estado?.ok ? <p className="mt-1 text-[.76rem] font-semibold text-[#0f6b34]">Salvo.</p> : null}
        {estado?.erro ? <p className="mt-1 text-[.76rem] font-semibold text-danger">{estado.erro}</p> : null}
      </div>
      <div className="flex items-end gap-2">
        <Entrada
          name="preco"
          type="number"
          step="0.0001"
          min={0}
          defaultValue={preco}
          className="w-28"
          aria-label={`Preço de ${rotulo}`}
        />
        <Salvar />
      </div>
    </form>
  )
}

export function Excecoes({
  excecoes,
  clientes,
}: {
  excecoes: PrecoDoCanal[]
  clientes: { id: string; nome: string }[]
}) {
  const [estado, acao] = useActionState(salvarExcecao, undefined)
  const [removendo, iniciarRemocao] = useTransition()

  return (
    <Pad>
      <PadTitulo
        titulo="Exceções por cliente"
        descricao="Preço combinado que sobrescreve a tabela padrão."
      />

      {excecoes.length === 0 ? (
        <Vazio
          titulo="Nenhuma exceção"
          descricao="Todos os clientes pagam a tabela padrão. Crie uma exceção abaixo quando fechar um preço diferente."
        />
      ) : (
        <ul className="divide-y divide-line">
          {excecoes.map((e) => (
            <li key={e.id ?? `${e.orgId}-${e.canal}`} className="flex items-center justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-[.9rem] font-semibold text-navy">{e.cliente}</p>
                <p className="text-[.78rem] text-muted">
                  {CANAL_LABEL[e.canal]} · <b className="text-navy">{moeda(e.preco)}</b>
                </p>
              </div>
              <Botao
                type="button"
                tom="fantasma"
                tamanho="sm"
                disabled={removendo || !e.id}
                onClick={() => e.id && iniciarRemocao(() => void removerExcecao(e.id!))}
              >
                Remover
              </Botao>
            </li>
          ))}
        </ul>
      )}

      <form action={acao} className="space-y-4 border-t border-line p-6">
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

        <p className="text-[.82rem] font-semibold text-navy">Nova exceção</p>
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Cliente" className="min-w-[180px] flex-1">
            <Selecao name="orgId" required defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Canal" className="min-w-[160px]">
            <Selecao name="canal" defaultValue="sms">
              {CANAIS.map((c) => (
                <option key={c} value={c}>
                  {CANAL_LABEL[c]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Preço" className="w-28">
            <Entrada name="preco" type="number" step="0.0001" min={0} required defaultValue="0.05" />
          </Campo>
          <Salvar texto="Criar" />
        </div>
        {clientes.length === 0 ? (
          <Chip tom="ambar">Cadastre um cliente antes de criar exceção.</Chip>
        ) : null}
      </form>
    </Pad>
  )
}
