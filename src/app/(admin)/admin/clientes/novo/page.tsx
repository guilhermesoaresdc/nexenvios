import type { Metadata } from 'next'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { Titulo } from '@/components/shell/casca'
import { BotaoLink } from '@/components/ui/base'
import { Formulario } from './formulario'

export const metadata: Metadata = { title: 'Novo cliente' }

export default async function NovoCliente() {
  await exigirSuperadmin()

  return (
    <>
      <Titulo
        titulo="Novo cliente"
        descricao="Cria a conta, o primeiro administrador e o crédito inicial. O administrador recebe um link para definir a própria senha."
        acao={
          <BotaoLink href="/admin/clientes" tom="contorno" tamanho="sm">
            Voltar
          </BotaoLink>
        }
      />
      <Formulario />
    </>
  )
}
