'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { definirSenha } from '@/lib/auth/acoes'
import { TAMANHO_MINIMO_SENHA } from '@/lib/auth/regras'
import { Senha } from '@/components/ui/senha'
import { Aviso, Botao } from '@/components/ui/base'

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" bloco tamanho="lg" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar e entrar'}
    </Botao>
  )
}

export function Formulario({ token }: { token: string }) {
  const [estado, acao] = useActionState(definirSenha, undefined)

  return (
    <form action={acao} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />
      {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}

      <Senha
        rotulo="Nova senha"
        name="senha"
        autoComplete="new-password"
        required
        autoFocus
        minLength={TAMANHO_MINIMO_SENHA}
        dica="Use pelo menos 10 caracteres."
      />
      <Senha
        rotulo="Repita a senha"
        name="confirmacao"
        autoComplete="new-password"
        required
        minLength={TAMANHO_MINIMO_SENHA}
      />

      <Enviar />
    </form>
  )
}
