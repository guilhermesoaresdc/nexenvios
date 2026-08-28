import { PAPEL_LABEL } from '@/db/schema/enums'
import { sair } from '@/lib/auth/acoes'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { Casca } from '@/components/shell/casca'

/**
 * A área do time Nex Envios.
 *
 * `exigirSuperadmin` redireciona quem não é — a restrição não depende de o
 * menu estar escondido, porque digitar /admin na barra de endereços é o
 * primeiro teste que qualquer curioso faz.
 */
export default async function LayoutDoAdmin({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSuperadmin()

  return (
    <Casca
      area="nex"
      sair={sair}
      usuario={{
        nome: usuario.name,
        email: usuario.email,
        papel: PAPEL_LABEL[usuario.role],
        orgNome: usuario.orgName,
        orgSaldo: usuario.credits,
        isSuperadmin: true,
        isAdmin: true,
        personificando: false,
      }}
    >
      {children}
    </Casca>
  )
}
