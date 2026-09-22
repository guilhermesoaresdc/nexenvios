'use client'

import { useEffect, useRef, useState } from 'react'
import { CONSENTIMENTO_COOKIE, EVENTO_CONSENTIMENTO } from '@/lib/marketing/config'
import { escolherConsentimento, lerCookie, rastrear } from '@/lib/marketing/cliente'

export function Marketing() {
  const [aberto, setAberto] = useState(false)
  const paginaEnviada = useRef(false)
  const formularioVisto = useRef(false)

  useEffect(() => {
    setAberto(!lerCookie(CONSENTIMENTO_COOKIE))
    const pagina = () => {
      if (!paginaEnviada.current) paginaEnviada.current = rastrear('PageView')
      const proposta = document.getElementById('proposta')
      const rect = proposta?.getBoundingClientRect()
      if (!formularioVisto.current && rect && rect.top < innerHeight && rect.bottom > 0) {
        formularioVisto.current = rastrear('ViewContent')
      }
    }
    pagina()
    window.addEventListener(EVENTO_CONSENTIMENTO, pagina)
    const proposta = document.getElementById('proposta')
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada?.isIntersecting && !formularioVisto.current) {
        formularioVisto.current = rastrear('ViewContent')
      }
    }, { threshold: 0.2 })
    if (proposta) observador.observe(proposta)
    const aoClicar = (evento: MouseEvent) => {
      const link = evento.target instanceof Element ? evento.target.closest('a') : null
      if (!link) return
      const url = new URL(link.href, location.origin)
      if (url.hostname === 'wa.me') rastrear('Contact')
    }
    document.addEventListener('click', aoClicar)
    return () => {
      observador.disconnect()
      window.removeEventListener(EVENTO_CONSENTIMENTO, pagina)
      document.removeEventListener('click', aoClicar)
    }
  }, [])

  function escolher(permitir: boolean) {
    escolherConsentimento(permitir)
    setAberto(false)
  }

  return aberto ? (
    <section aria-label="Preferências de cookies" className="fixed inset-x-4 bottom-4 z-[80] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-800 shadow-xl">
      <p>Podemos usar cookies para medir visitas e melhorar nossos anúncios?</p>
      <details className="mt-2 text-xs text-slate-600">
        <summary className="w-fit cursor-pointer rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue">Ver detalhes</summary>
        <div className="mt-3 space-y-2">
          <p>Os cookies da Meta ajudam a medir visitas e anúncios. Você pode alterar sua escolha a qualquer momento no botão “Cookies”.</p>
          <p>A conclusão de propostas é informada à Meta pelo servidor mesmo sem cookies, com IP e informações do navegador.</p>
          <a href="/privacidade" className="inline-block underline">Política de Privacidade</a>
        </div>
      </details>
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" onClick={() => escolher(false)} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Recusar</button>
        <button type="button" onClick={() => escolher(true)} className="rounded-lg bg-blue px-4 py-2 font-semibold text-white">Aceitar cookies</button>
      </div>
    </section>
  ) : (
    <button type="button" onClick={() => setAberto(true)} className="fixed bottom-3 left-3 z-[70] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm">Cookies</button>
  )
}
