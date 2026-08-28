import type { Metadata } from 'next'
import Link from 'next/link'
import { conferirToken } from '@/lib/auth/tokens'
import { MOTIVO_DO_LINK } from '@/lib/auth/regras'
import { Aviso } from '@/components/ui/base'
import { Formulario } from './formulario'

export const metadata: Metadata = { title: 'Definir senha' }
export const dynamic = 'force-dynamic'

export default async function DefinirSenha({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const conferido = await conferirToken(token)

  if (!conferido.ok) {
    return (
      <>
        <h1 className="text-[1.75rem] leading-tight">Link inválido</h1>
        <div className="mt-6">
          <Aviso tom="erro">{MOTIVO_DO_LINK[conferido.motivo] ?? 'Este link não serve mais.'}</Aviso>
        </div>
        <p className="mt-8 text-center text-[.86rem] text-muted">
          <Link href="/recuperar" className="font-semibold text-blue hover:underline">
            Pedir um link novo
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight">
        {conferido.proposito === 'convite' ? 'Bem-vindo à Nex Envios' : 'Nova senha'}
      </h1>
      <p className="mt-2 text-[.95rem] leading-relaxed text-muted">
        {conferido.proposito === 'convite'
          ? `Olá, ${conferido.nome.split(' ')[0]}. Defina sua senha para entrar no painel.`
          : 'Escolha uma senha nova. Ao salvar, todas as sessões abertas são encerradas.'}
      </p>

      <Formulario token={token} />
    </>
  )
}
