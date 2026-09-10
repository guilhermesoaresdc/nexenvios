import Link from 'next/link'
import { Formulario } from '../recuperar/formulario'
export const metadata = { title: 'Primeiro acesso' }
export default function PrimeiroAcesso() {
  return (
    <>
      <h1 className="text-3xl">Vamos começar</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Se sua conta já foi criada pela Nex ou pelo administrador da sua empresa, informe o e-mail
        cadastrado para definir sua senha.
      </p>
      <Formulario />
      <p className="mt-6 text-sm text-muted">
        Ainda não tem uma conta?{' '}
        <Link href="/#contato" className="font-semibold text-blue">
          Fale com a Nex
        </Link>
        .
      </p>
      <p className="mt-6 text-center text-sm">
        <Link href="/entrar" className="font-semibold text-blue">
          ← Voltar para entrar
        </Link>
      </p>
    </>
  )
}
