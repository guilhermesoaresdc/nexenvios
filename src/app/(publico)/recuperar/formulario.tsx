'use client'

import { pedirRecuperacao } from '@/lib/auth/acoes'
import { Aviso, Botao, Campo, Entrada } from '@/components/ui/base'
import { useEnvioDeAcesso } from '@/components/ui/envio-acesso'

export function Formulario() {
  const { estado, enviar, enviarNativo, enviando } = useEnvioDeAcesso(pedirRecuperacao, '/api/auth/recuperar')

  // Sucesso troca o formulário pelo aviso: deixar o campo ali convida a
  // clicar de novo e gastar o limite de tentativas à toa.
  if (estado?.ok) {
    return (
      <div className="mt-8" role="status">
        <Aviso tom="ok" titulo="Solicitação recebida">
          {estado.ok}
        </Aviso>
      </div>
    )
  }

  return (
    <form action={enviarNativo} onSubmit={enviar} aria-busy={enviando} className="mt-8 space-y-5">
      {estado?.erro ? <div role="alert"><Aviso tom="erro">{estado.erro}</Aviso></div> : null}

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

      <Botao type="submit" bloco tamanho="lg" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar link de recuperação'}
      </Botao>
    </form>
  )
}
