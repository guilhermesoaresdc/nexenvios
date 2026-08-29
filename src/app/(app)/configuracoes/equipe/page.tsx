import type { Metadata } from 'next'
import { exigirAdmin } from '@/lib/auth/atual'
import { usuariosDaOrg } from '@/db/queries/admin'
import { PAPEL_LABEL, type UserRole } from '@/db/schema/enums'
import { BotaoLink, Chip, Pad, PadTitulo, Tabela, Td, Th } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { quando } from '@/lib/ui'
import { Convidar, LinhaDoUsuario } from './painel'

export const metadata: Metadata = { title: 'Equipe' }
export const dynamic = 'force-dynamic'

export default async function Equipe() {
  const usuario = await exigirAdmin()
  const equipe = await usuariosDaOrg(usuario.orgId)
  const admins = equipe.filter((u) => u.papel === 'admin' && u.ativo).length

  return (
    <>
      <Titulo
        titulo="Equipe"
        descricao="Quem tem acesso à conta e o que cada um pode fazer."
        acao={
          <BotaoLink href="/configuracoes" tom="contorno" tamanho="sm">
            Voltar
          </BotaoLink>
        }
      />

      <Pad>
        <PadTitulo
          titulo="Usuários"
          descricao="Operador cria e acompanha disparos. Visualizador só lê. Administrador mexe em canais, equipe e chaves."
        />
        <Tabela>
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Papel</Th>
              <Th>Senha</Th>
              <Th>Último acesso</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {equipe.map((u) => (
              <tr key={u.id} className="align-top">
                <Td>
                  <span className="font-semibold text-navy">{u.nome}</span>
                  {u.id === usuario.id ? (
                    <Chip tom="azul" className="ml-2">
                      você
                    </Chip>
                  ) : null}
                  {!u.ativo ? (
                    <Chip tom="neutro" className="ml-2">
                      Desativado
                    </Chip>
                  ) : null}
                  <span className="block text-[.8rem] text-muted">{u.email}</span>
                </Td>
                <Td>
                  <LinhaDoUsuario
                    usuario={{
                      id: u.id,
                      papel: u.papel as UserRole,
                      ativo: u.ativo,
                      temSenha: u.temSenha,
                      eu: u.id === usuario.id,
                    }}
                    /* O último administrador ativo não pode ser rebaixado nem
                       desativado — a conta ficaria sem ninguém que consiga
                       liberar canal, equipe ou chave. */
                    ultimoAdmin={u.papel === 'admin' && u.ativo && admins <= 1}
                    modo="papel"
                  />
                </Td>
                <Td>
                  {u.temSenha ? (
                    <Chip tom="verde">Definida</Chip>
                  ) : (
                    <Chip tom="ambar">Convite pendente</Chip>
                  )}
                </Td>
                <Td className="text-[.84rem] text-muted">{quando(u.ultimoAcesso)}</Td>
                <Td className="text-right">
                  <LinhaDoUsuario
                    usuario={{
                      id: u.id,
                      papel: u.papel as UserRole,
                      ativo: u.ativo,
                      temSenha: u.temSenha,
                      eu: u.id === usuario.id,
                    }}
                    ultimoAdmin={u.papel === 'admin' && u.ativo && admins <= 1}
                    modo="acoes"
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>

        <div className="border-t border-line p-6">
          <Convidar />
        </div>
      </Pad>

      <p className="mt-5 text-[.82rem] leading-relaxed text-muted">
        O papel <b>{PAPEL_LABEL.superadmin}</b> pertence ao time Nex Envios e não pode ser dado por
        esta tela.
      </p>
    </>
  )
}
