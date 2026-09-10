import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth/atual'
import { ERROS_ENTRADA } from '@/lib/auth/entrada'
import { Aviso } from '@/components/ui/base'
import { Formulario } from './formulario'

export const metadata: Metadata = { title: 'Entrar' }

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string; senha?: string }> }) {
  // Quem já está dentro não vê a porta.
  const usuario = await usuarioAtual()
  if (usuario) redirect(usuario.isTimeNex && !usuario.personificando ? '/admin' : '/painel')
  const { erro, senha } = await searchParams
  const erroInicial = erro && Object.hasOwn(ERROS_ENTRADA, erro)
    ? ERROS_ENTRADA[erro as keyof typeof ERROS_ENTRADA] : undefined

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight">Acesse sua conta</h1>
      <p className="mt-2 text-[.95rem] leading-relaxed text-muted">
        Acompanhe seus disparos, sua base e seu saldo.
      </p>

      {senha === 'alterada' ? <div className="mt-6" role="status"><Aviso tom="ok">Senha alterada. Entre usando sua nova senha.</Aviso></div> : null}
      <Formulario erroInicial={erroInicial} />
      <p className="mt-6 text-center text-sm text-muted">
        Recebeu um convite?{' '}
        <Link href="/primeiro-acesso" className="font-semibold text-blue">
          Primeiro acesso
        </Link>
      </p>
      <p className="mt-8 text-center text-[.86rem] text-muted">
        Ainda não é cliente?{' '}
        <Link href="/#contato" className="font-semibold text-blue hover:underline">
          Fale com a gente
        </Link>
      </p>
    </>
  )
}
