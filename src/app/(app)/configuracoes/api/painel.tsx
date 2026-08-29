'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { Escopo } from '@/lib/api/chave'
import { gerarChave, revogar } from '../acoes'
import { Aviso, Botao, Campo, Entrada, Pad, PadTitulo } from '@/components/ui/base'

function Criar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" bloco disabled={pending}>
      {pending ? 'Gerando…' : 'Gerar chave'}
    </Botao>
  )
}

export function NovaChave({ escopos }: { escopos: [Escopo, string][] }) {
  const [estado, acao] = useActionState(gerarChave, undefined)
  const [copiado, setCopiado] = useState(false)

  return (
    <Pad className="self-start lg:sticky lg:top-6">
      <PadTitulo titulo="Nova chave" />
      <form action={acao} className="space-y-4 p-6">
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}

        {estado?.chave ? (
          <Aviso tom="alerta" titulo="Copie agora — esta chave não aparece de novo">
            <p className="mt-1 mb-3 text-[.84rem]">
              Guardamos só o resumo criptográfico dela. Se você perder, terá de gerar outra.
            </p>
            <code className="block break-all rounded-[8px] bg-white px-3 py-2 font-mono text-[.76rem] text-navy">
              {estado.chave}
            </code>
            <Botao
              type="button"
              tamanho="sm"
              tom="contorno"
              className="mt-3"
              onClick={() => {
                navigator.clipboard?.writeText(estado.chave!).then(
                  () => setCopiado(true),
                  () => setCopiado(false),
                )
              }}
            >
              {copiado ? 'Copiado' : 'Copiar chave'}
            </Botao>
          </Aviso>
        ) : null}

        <Campo rotulo="Nome" dica="Para você saber qual sistema usa esta chave." obrigatorio>
          <Entrada name="nome" required placeholder="Integração do CRM" />
        </Campo>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[.8rem] font-semibold text-navy">O que ela pode fazer</legend>
          {escopos.map(([chave, rotulo]) => (
            <label key={chave} className="flex items-start gap-2 text-[.86rem] text-ink">
              <input
                type="checkbox"
                name={`escopo:${chave}`}
                defaultChecked={chave.startsWith('envios')}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                {rotulo}
                <span className="block font-mono text-[.72rem] text-muted">{chave}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Criar />
      </form>
    </Pad>
  )
}

export function Revogar({ id, nome }: { id: string; nome: string }) {
  const [ocupado, iniciar] = useTransition()

  return (
    <Botao
      type="button"
      tom="fantasma"
      tamanho="sm"
      disabled={ocupado}
      onClick={() => {
        if (!confirm(`Revogar a chave "${nome}"? Quem usa ela para de conseguir enviar na hora.`))
          return
        iniciar(() => void revogar(id))
      }}
    >
      Revogar
    </Botao>
  )
}
