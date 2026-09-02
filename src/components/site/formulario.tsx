'use client'

import { useEffect, useState } from 'react'

/**
 * O formulário de proposta, servido pelo CRM Hédiz (módulo Fluxos) dentro de um
 * iframe. É o mesmo embed "container" que o CRM entrega pronto — só que escrito
 * aqui em vez de injetado por um script de terceiro: sem `document.write`, sem
 * JavaScript externo carregado na landing, e o `origin` da mensagem conferido.
 *
 * A página do fluxo publica a própria altura por `postMessage`. Sem escutar
 * isso o iframe ficaria travado numa altura fixa e cortaria a pergunta que tem
 * mais opções — que é justamente onde a pessoa desiste.
 */

const ORIGEM = process.env.NEXT_PUBLIC_FLUXO_ORIGEM ?? 'https://crm.hediz.com'
const SLUG = process.env.NEXT_PUBLIC_FLUXO_SLUG ?? 'nex-envios-site-7q4zd'

/** Alta o bastante para a pergunta com seis opções caber sem rolagem interna. */
const ALTURA_MINIMA = 620
/** Teto de sanidade: mensagem malformada não estica a página inteira. */
const ALTURA_MAXIMA = 1100

export function Formulario() {
  const [altura, setAltura] = useState(ALTURA_MINIMA)

  useEffect(() => {
    const aoReceber = (evento: MessageEvent) => {
      if (evento.origin !== ORIGEM) return
      const dado = evento.data as { tipo?: string; slug?: string; altura?: number } | null
      if (dado?.tipo !== 'hediz-fluxo-altura' || dado.slug !== SLUG) return
      const pedida = Number(dado.altura)
      if (!Number.isFinite(pedida)) return
      setAltura(Math.min(Math.max(pedida, ALTURA_MINIMA), ALTURA_MAXIMA))
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [])

  return (
    <iframe
      src={`${ORIGEM}/f/${SLUG}?embed=container`}
      title="Formulário para solicitar uma proposta da Nex Envios"
      allow="clipboard-write"
      style={{ height: altura }}
      className="block w-full border-0 bg-navy transition-[height] duration-300"
    />
  )
}
