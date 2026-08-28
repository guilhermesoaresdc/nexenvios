'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { definirSenha } from '@/lib/auth/acoes'
import { TAMANHO_MINIMO_SENHA } from '@/lib/auth/regras'
import { Aviso, Botao, Campo, Entrada } from '@/components/ui/base'

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

      <Campo
        rotulo="Nova senha"
        dica={`Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres. O comprimento protege mais do que símbolo obrigatório.`}
      >
        <Entrada
          name="senha"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={TAMANHO_MINIMO_SENHA}
          placeholder="••••••••••"
        />
      </Campo>

      <Campo rotulo="Repita a senha">
        <Entrada
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          minLength={TAMANHO_MINIMO_SENHA}
          placeholder="••••••••••"
        />
      </Campo>

      <Enviar />
    </form>
  )
}
