'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { entrar } from '@/lib/auth/acoes'
import { Senha } from '@/components/ui/senha'
import { Aviso, Botao, Campo, Entrada } from '@/components/ui/base'

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" bloco tamanho="lg" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </Botao>
  )
}

export function Formulario({ area = 'cliente' }: { area?: 'cliente' | 'nex' }) {
  const [estado, acao] = useActionState(entrar, undefined)

  return (
    <form action={acao} className="mt-8 space-y-5">
      <input type="hidden" name="area" value={area} />
      {estado?.erro ? (
        <div role="alert">
          <Aviso tom="erro">{estado.erro}</Aviso>
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

      <Enviar />

      <p className="text-center">
        <Link href="/recuperar" className="text-[.86rem] font-semibold text-muted hover:text-blue">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  )
}
