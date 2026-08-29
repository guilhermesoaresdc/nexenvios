import type { Metadata } from 'next'
import { exigirEscrita, exigirUsuario } from '@/lib/auth/atual'
import { listarListas } from '@/db/queries/contatos'
import { BotaoLink } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { Painel } from './painel'

export const metadata: Metadata = { title: 'Importar contatos' }
export const dynamic = 'force-dynamic'

export default async function Importar() {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const listas = await listarListas(usuario.orgId)

  return (
    <>
      <Titulo
        titulo="Importar contatos"
        descricao="A planilha é lida no seu navegador, não sobe inteira para o servidor. Você vê o que entrou e o que ficou de fora antes de confirmar."
        acao={
          <BotaoLink href="/contatos" tom="contorno" tamanho="sm">
            Voltar
          </BotaoLink>
        }
      />
      <Painel listas={listas.map((l) => ({ id: l.id, nome: l.nome, total: l.total }))} />
    </>
  )
}
