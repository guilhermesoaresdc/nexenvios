import type { Metadata } from 'next'
import Link from 'next/link'
import { Formulario } from './formulario'

export const metadata: Metadata = { title: 'Recuperar senha' }

export default function Recuperar() {
  return (
    <>
      <h1 className="text-[1.75rem] leading-tight">Recuperar senha</h1>
      <p className="mt-2 text-[.95rem] leading-relaxed text-muted">
        Informe o e-mail da sua conta. Enviamos um link para você definir uma senha nova.
      </p>

      <Formulario />

      <p className="mt-8 text-center text-[.86rem] text-muted">
        Lembrou?{' '}
        <Link href="/entrar" className="font-semibold text-blue hover:underline">
          Voltar para o login
        </Link>
      </p>
    </>
  )
}
