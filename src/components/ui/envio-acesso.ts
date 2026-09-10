'use client'

import { useActionState, useRef, useState, type FormEvent } from 'react'

type Estado = { erro?: string; ok?: string } | undefined
/** HTTP com prazo no navegador; mantém a Server Action como fallback sem JS. */
export function useEnvioDeAcesso(
  acao: (anterior: Estado, form: FormData) => Promise<Estado>,
  endpoint: '/api/auth/recuperar' | '/api/auth/definir-senha',
) {
  const [nativo, enviarNativo, pendente] = useActionState(acao, undefined)
  const [estadoHttp, setEstado] = useState<Estado>()
  const [enviando, setEnviando] = useState(false)
  const ocupado = useRef(false)
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (ocupado.current) return
    ocupado.current = true
    setEnviando(true)
    setEstado({})
    const form = new FormData(evento.currentTarget)
    const controle = new AbortController()
    const timer = setTimeout(() => controle.abort(), 25_000)
    try {
      const resposta = await fetch(endpoint, {
        method: 'POST', body: form, credentials: 'same-origin',
        headers: { Accept: 'application/json' }, signal: controle.signal,
      })
      const resultado = await resposta.json()
      if (resposta.ok && typeof resultado.ok === 'string') setEstado({ ok: resultado.ok })
      else setEstado({ erro: typeof resultado.erro === 'string' ? resultado.erro : 'Não foi possível concluir agora. Tente novamente.' })
    } catch {
      setEstado({ erro: endpoint === '/api/auth/definir-senha'
        ? 'A conexão foi interrompida antes da confirmação. Tente entrar com a nova senha; se ela não funcionar, abra este link novamente.'
        : 'A conexão demorou ou foi interrompida. Tente novamente em instantes.' })
    } finally {
      clearTimeout(timer)
      ocupado.current = false
      setEnviando(false)
    }
  }
  return { estado: estadoHttp ?? nativo, enviar, enviarNativo, enviando: enviando || pendente }
}
