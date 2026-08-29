import { redirect } from 'next/navigation'
import { PAPEL_LABEL } from '@/db/schema/enums'
import { sair } from '@/lib/auth/acoes'
import { exigirUsuario } from '@/lib/auth/atual'
import { encerrarVisita } from '@/lib/auth/visita'
import { Casca } from '@/components/shell/casca'

/** A área do cliente. Toda rota daqui para baixo exige sessão. */
export default async function LayoutDoApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario()

  // Conta encerrada não abre o painel — nem para quem ainda tem cookie válido.
  if (usuario.orgStatus === 'cancelado' && !usuario.isSuperadmin) redirect('/entrar')

  return (
    <Casca
      area="cliente"
      sair={sair}
      encerrarVisita={encerrarVisita}
      usuario={{
        nome: usuario.name,
        email: usuario.email,
        papel: usuario.personificando ? 'Time Nex · visitando' : PAPEL_LABEL[usuario.role],
        orgNome: usuario.orgName,
        orgSaldo: usuario.credits,
        isTimeNex: usuario.isTimeNex,
        isSuperadmin: usuario.isSuperadmin,
        isAdmin: usuario.isAdmin,
        personificando: usuario.personificando,
      }}
    >
      {children}
    </Casca>
  )
}
