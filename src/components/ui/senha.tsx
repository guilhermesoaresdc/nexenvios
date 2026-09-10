'use client'
import { useState, type ComponentProps } from 'react'
import { Entrada } from './base'

export function Senha({
  rotulo,
  dica,
  ...props
}: ComponentProps<'input'> & { rotulo: string; dica?: string }) {
  const [visivel, setVisivel] = useState(false)
  const id = props.id ?? props.name
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[.8rem] font-semibold text-navy">
        {rotulo}
      </label>
      <div className="relative">
        <Entrada
          {...props}
          id={id}
          type={visivel ? 'text' : 'password'}
          maxLength={200}
          className="pr-24"
        />
        <button
          type="button"
          aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLowerCase()}`}
          aria-pressed={visivel}
          onClick={() => setVisivel(!visivel)}
          className="absolute inset-y-0 right-3 px-2 text-xs font-semibold text-blue"
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {dica ? <p className="mt-2 text-xs leading-relaxed text-muted">{dica}</p> : null}
    </div>
  )
}
