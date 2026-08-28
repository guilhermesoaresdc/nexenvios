import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth/atual'
import { Formulario } from './formulario'

export const metadata: Metadata = { title: 'Entrar' }

export default async function Entrar() {
  // Quem já está dentro não vê a porta.
  if (await usuarioAtual()) redirect('/painel')

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight">Entrar no painel</h1>
      <p className="mt-2 text-[.95rem] leading-relaxed text-muted">
        Acompanhe seus disparos, sua base e seu saldo.
      </p>

      <Formulario />

      <p className="mt-8 text-center text-[.86rem] text-muted">
        Ainda não é cliente?{' '}
        <Link href="/#contato" className="font-semibold text-blue hover:underline">
          Fale com a gente
        </Link>
      </p>
    </>
  )
}
