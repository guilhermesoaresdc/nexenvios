import Link from 'next/link'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth/atual'
import { Formulario } from '../formulario'
export const metadata = { title: 'Acesso do time Nex' }
export default async function EntradaNex() {
  const usuario = await usuarioAtual()
  if (usuario) redirect(usuario.isTimeNex ? '/admin' : '/painel')
  return (
    <>
      <p className="mb-4 text-xs font-semibold tracking-widest text-blue uppercase">
        Administração Nex
      </p>
      <h1 className="text-3xl leading-tight">Controle da operação</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Acesso dos sócios e do time autorizado. Gerencie clientes, acessos e acompanhe a operação.
      </p>
      <Formulario area="nex" />
      <p className="mt-8 text-center text-sm">
        <Link href="/entrar" className="font-semibold text-blue">
          ← Voltar ao acesso do cliente
        </Link>
      </p>
    </>
  )
}
