'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Senha } from '@/components/ui/senha'
import { Aviso, Botao, Campo, Entrada } from '@/components/ui/base'

export function Formulario({ erroInicial }: { erroInicial?: string }) {
  const [erro, setErro] = useState(erroInicial)
  const [enviando, setEnviando] = useState(false)
  const ocupado = useRef(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (ocupado.current) return
    ocupado.current = true
    setEnviando(true)
    setErro(undefined)
    const dados = new FormData(evento.currentTarget)
    const controle = new AbortController()
    const timer = setTimeout(() => controle.abort(), 20_000)
    try {
      const resposta = await fetch('/api/auth/entrar', {
        method: 'POST', body: dados, credentials: 'same-origin',
        headers: { Accept: 'application/json' }, signal: controle.signal,
      })
      const resultado = await resposta.json()
      if (!resposta.ok) {
        setErro(typeof resultado.erro === 'string' ? resultado.erro : 'Não foi possível entrar agora. Tente novamente.')
      } else if (resultado.destino === '/admin' || resultado.destino === '/painel') {
        window.location.assign(resultado.destino)
      } else {
        setErro('Não foi possível abrir o painel. Tente novamente.')
      }
    } catch {
      setErro('A conexão demorou ou foi interrompida. Tente entrar novamente.')
    } finally {
      clearTimeout(timer)
      ocupado.current = false
      setEnviando(false)
    }
  }

  return (
    <form action="/api/auth/entrar" method="post" onSubmit={enviar} aria-busy={enviando} className="mt-8 space-y-5">
      {erro ? (
        <div role="alert">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      ) : null}

      <Campo rotulo="E-mail">
        <Entrada
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="voce@empresa.com.br"
        />
      </Campo>

      <Senha
        rotulo="Senha"
        name="senha"
        autoComplete="current-password"
        required
        placeholder="Sua senha"
      />

      <Botao type="submit" bloco tamanho="lg" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </Botao>

      <p className="text-center">
        <a href="/recuperar" className="text-[.86rem] font-semibold text-muted hover:text-blue">
          Esqueci minha senha
        </a>
      </p>
    </form>
  )
}
