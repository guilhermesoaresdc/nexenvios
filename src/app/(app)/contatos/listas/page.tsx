import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/auth/atual'
import { importacoesRecentes, listarListas } from '@/db/queries/contatos'
import { BotaoLink, Pad, PadTitulo, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { data, numero } from '@/lib/ui'
import { Lista, NovaLista } from './painel'

export const metadata: Metadata = { title: 'Listas' }
export const dynamic = 'force-dynamic'

export default async function Listas() {
  const usuario = await exigirUsuario()
  const [listas, importacoes] = await Promise.all([
    listarListas(usuario.orgId),
    importacoesRecentes(usuario.orgId, 8),
  ])

  return (
    <>
      <Titulo
        titulo="Listas"
        descricao="Agrupam contatos para o disparo. Apagar uma lista não apaga contato nenhum."
        acao={
          <>
            <BotaoLink href="/contatos" tom="contorno" tamanho="sm">
              Voltar aos contatos
            </BotaoLink>
            <BotaoLink href="/contatos/importar" tamanho="sm">
              Importar planilha
            </BotaoLink>
          </>
        }
      />

      <div className="grid grid-cols-[1.4fr_1fr] gap-6 max-lg:grid-cols-1">
        <div className="space-y-5">
          <Pad>
            <PadTitulo titulo="Suas listas" />
            {listas.length === 0 ? (
              <Vazio
                titulo="Nenhuma lista ainda"
                descricao="Crie uma lista para separar públicos — por produto, por origem, por onda de disparo."
              />
            ) : (
              <ul className="divide-y divide-line">
                {listas.map((l) => (
                  <li key={l.id} className="px-6 py-4">
                    <Lista
                      lista={{
                        id: l.id,
                        nome: l.nome,
                        descricao: l.descricao,
                        total: l.total,
                        criadaEm: data(l.criadaEm),
                        autor: l.autor,
                        deTeste: l.deTeste,
                      }}
                      podeEditar={!usuario.isLeitor}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Pad>

          <Pad>
            <PadTitulo
              titulo="Importações recentes"
              descricao="Explica a diferença entre o que você subiu e o que entrou."
            />
            {importacoes.length === 0 ? (
              <Vazio titulo="Nenhuma importação" descricao="O resultado de cada planilha aparece aqui." />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Quando</Th>
                    <Th>Arquivo</Th>
                    <Th>Lista</Th>
                    <Th className="text-right">Linhas</Th>
                    <Th className="text-right">Entraram</Th>
                    <Th className="text-right">Repetidos</Th>
                    <Th className="text-right">Inválidos</Th>
                    <Th className="text-right">Descad.</Th>
                  </tr>
                </thead>
                <tbody>
                  {importacoes.map((i) => (
                    <tr key={i.id}>
                      <Td className="text-[.84rem] whitespace-nowrap text-muted">{data(i.criadaEm)}</Td>
                      <Td className="max-w-[180px] truncate text-[.86rem]">{i.arquivo ?? '—'}</Td>
                      <Td className="text-[.86rem]">{i.lista ?? '—'}</Td>
                      <Td className="tabular text-right">{numero(i.total)}</Td>
                      <Td className="tabular text-right font-semibold text-[#0f6b34]">
                        {numero(i.importados)}
                      </Td>
                      <Td className="tabular text-right text-muted">{numero(i.repetidos)}</Td>
                      <Td className="tabular text-right text-muted">{numero(i.invalidos)}</Td>
                      <Td className="tabular text-right text-muted">{numero(i.descadastrados)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Pad>
        </div>

        {usuario.isLeitor ? null : <NovaLista />}
      </div>
    </>
  )
}
