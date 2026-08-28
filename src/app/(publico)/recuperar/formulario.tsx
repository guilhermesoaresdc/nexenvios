'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { pedirRecuperacao } from '@/lib/auth/acoes'
import { Aviso, Botao, Campo, Entrada } from '@/components/ui/base'

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" bloco tamanho="lg" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar link de recuperação'}
    </Botao>
  )
}

export function Formulario() {
  const [estado, acao] = useActionState(pedirRecuperacao, undefined)

  // Sucesso troca o formulário pelo aviso: deixar o campo ali convida a
  // clicar de novo e gastar o limite de tentativas à toa.
  if (estado?.ok) {
    return (
      <div className="mt-8">
        <Aviso tom="ok" titulo="Link enviado">
          {estado.ok}
        </Aviso>
      </div>
    )
  }

  return (
    <form action={acao} className="mt-8 space-y-5">
      {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}

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

      <Enviar />
    </form>
  )
}
