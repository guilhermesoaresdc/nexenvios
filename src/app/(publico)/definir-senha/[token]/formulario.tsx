'use client'

import { definirSenha } from '@/lib/auth/acoes'
import { TAMANHO_MINIMO_SENHA } from '@/lib/auth/regras'
import { Senha } from '@/components/ui/senha'
import { Aviso, Botao } from '@/components/ui/base'
import { useEnvioDeAcesso } from '@/components/ui/envio-acesso'

export function Formulario({ token }: { token: string }) {
  const { estado, enviar, enviarNativo, enviando } = useEnvioDeAcesso(definirSenha, '/api/auth/definir-senha')

  if (estado?.ok) return (
    <div className="mt-8 space-y-5" role="status">
      <Aviso tom="ok" titulo="Senha salva">{estado.ok}</Aviso>
      <a href="/entrar" className="block rounded-full bg-blue px-6 py-4 text-center font-semibold text-white">
        Entrar na minha conta
      </a>
    </div>
  )

  return (
    <form action={enviarNativo} onSubmit={enviar} aria-busy={enviando} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />
      {estado?.erro ? <div role="alert"><Aviso tom="erro">{estado.erro}</Aviso></div> : null}

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

      <Botao type="submit" bloco tamanho="lg" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar nova senha'}
      </Botao>
    </form>
  )
}
