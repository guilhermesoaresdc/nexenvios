'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { CANAIS, CANAL_LABEL, STATUS_ENVIO_LABEL, type DispatchStatus } from '@/db/schema/enums'
import { Botao, Campo, Chip, Entrada, Pad, Selecao } from '@/components/ui/base'

/**
 * A barra de filtros.
 *
 * Só empurra a URL: o estado do filtro mora nos parâmetros, não aqui. Assim
 * recarregar, voltar e compartilhar o link levam ao mesmo recorte — e a rota do
 * CSV recebe exatamente os mesmos parâmetros.
 */
export function Filtros({ campanhas }: { campanhas: { id: string; nome: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<DispatchStatus[]>(
    params.getAll('status') as DispatchStatus[],
  )

  function aplicar(form: FormData) {
    const q = new URLSearchParams()
    for (const chave of ['busca', 'canal', 'campanha', 'desde', 'ate']) {
      const v = String(form.get(chave) ?? '').trim()
      if (v) q.set(chave, v)
    }
    for (const s of status) q.append('status', s)
    router.push(q.toString() ? `/historico?${q}` : '/historico')
  }

  const alternar = (s: DispatchStatus) =>
    setStatus((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]))

  const temFiltro = status.length > 0 || [...params.keys()].some((k) => k !== 'pagina')

  return (
    <Pad className="p-4">
      <form action={aplicar} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Buscar" className="min-w-[200px] flex-1">
            <Entrada
              name="busca"
              defaultValue={params.get('busca') ?? ''}
              placeholder="Telefone ou nome"
            />
          </Campo>
          <Campo rotulo="Canal" className="min-w-[160px]">
            <Selecao name="canal" defaultValue={params.get('canal') ?? ''}>
              <option value="">Todos</option>
              {CANAIS.map((c) => (
                <option key={c} value={c}>
                  {CANAL_LABEL[c]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Campanha" className="min-w-[180px]">
            <Selecao name="campanha" defaultValue={params.get('campanha') ?? ''}>
              <option value="">Todas</option>
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="De" className="w-[150px]">
            <Entrada name="desde" type="date" defaultValue={params.get('desde') ?? ''} />
          </Campo>
          <Campo rotulo="Até" className="w-[150px]">
            <Entrada name="ate" type="date" defaultValue={params.get('ate') ?? ''} />
          </Campo>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[.8rem] font-semibold text-navy">Status:</span>
          {(Object.keys(STATUS_ENVIO_LABEL) as DispatchStatus[]).map((s) => (
            <button key={s} type="button" onClick={() => alternar(s)}>
              <Chip tom={status.includes(s) ? 'azul' : 'neutro'}>{STATUS_ENVIO_LABEL[s]}</Chip>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Botao type="submit" tom="contorno" tamanho="sm">
            Aplicar
          </Botao>
          {temFiltro ? (
            <Botao
              type="button"
              tom="fantasma"
              tamanho="sm"
              onClick={() => {
                setStatus([])
                router.push('/historico')
              }}
            >
              Limpar
            </Botao>
          ) : null}
        </div>
      </form>
    </Pad>
  )
}
