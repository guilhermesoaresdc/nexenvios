'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importarLote } from '../acoes'
import { ler, MOTIVO } from '@/lib/contatos/leitura'
import {
  AreaTexto,
  Aviso,
  Botao,
  Campo,
  Chip,
  Entrada,
  Etiqueta,
  Numero,
  Pad,
  PadTitulo,
  Selecao,
  Tabela,
  Td,
  Th,
} from '@/components/ui/base'
import { numero } from '@/lib/ui'

const LOTE = 2_000

export function Painel({ listas }: { listas: { id: string; nome: string; total: number }[] }) {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [modo, setModo] = useState<'arquivo' | 'colar'>('arquivo')
  const [colado, setColado] = useState('')
  const [lido, setLido] = useState<ReturnType<typeof ler> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [resultado, setResultado] = useState<{
    novos: number
    atualizados: number
    repetidos: number
    descadastrados: number
  } | null>(null)
  const [enviando, iniciar] = useTransition()

  function trocarModo(novo: 'arquivo' | 'colar') {
    // Trocar de porta zera a leitura: deixar a conferência da planilha na tela
    // enquanto a caixa de colar está vazia faria a pessoa importar o que
    // achava ter descartado.
    setModo(novo)
    setLido(null)
    setErro(null)
    setResultado(null)
    setArquivo(null)
    setColado('')
  }

  function aoColar(texto: string) {
    setColado(texto)
    setErro(null)
    setResultado(null)
    setArquivo(texto.trim() ? 'colado na tela' : null)
    setLido(texto.trim() ? ler(texto) : null)
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setErro(null)
    setResultado(null)
    setArquivo(f.name)
    try {
      const texto = await f.text()
      const r = ler(texto)
      if (r.total === 0) setErro('O arquivo está vazio.')
      setLido(r)
    } catch {
      setErro('Não consegui ler este arquivo. Salve como CSV e tente de novo.')
    }
  }

  function importar(form: FormData) {
    if (!lido || lido.validas.length === 0) return
    setErro(null)

    iniciar(async () => {
      const listaId = String(form.get('listaId') ?? '')
      const novaLista = String(form.get('novaLista') ?? '')
      const etiquetas = String(form.get('etiquetas') ?? '')

      const soma = { novos: 0, atualizados: 0, repetidos: 0, descadastrados: 0 }
      let listaCriada: string | null = listaId || null

      for (let i = 0; i < lido.validas.length; i += LOTE) {
        const fatia = lido.validas.slice(i, i + LOTE)
        setProgresso(Math.round((i / lido.validas.length) * 100))

        const r = await importarLote({
          linhas: fatia.map((l) => ({ telefone: l.telefone, nome: l.nome })),
          listaId: listaCriada ?? '',
          novaLista,
          etiquetas,
          arquivo: arquivo ?? '',
          invalidos: lido.recusadas.length,
          continuando: i > 0,
        })

        if (!r.ok) {
          setErro(r.erro)
          setProgresso(null)
          return
        }

        // A lista criada no primeiro lote recebe os seguintes.
        listaCriada = r.listaId
        soma.novos += r.novos
        soma.atualizados += r.atualizados
        soma.repetidos += r.repetidos
        soma.descadastrados += r.descadastrados
      }

      setProgresso(null)
      setResultado(soma)
      setLido(null)
      router.refresh()
    })
  }

  if (resultado) {
    return (
      <Pad>
        <PadTitulo titulo="Importação concluída" />
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-4 gap-4 max-sm:grid-cols-2">
            <Numero rotulo="Novos" valor={numero(resultado.novos)} tom="verde" />
            <Numero rotulo="Atualizados" valor={numero(resultado.atualizados)} tom="blue" />
            <Numero rotulo="Repetidos" valor={numero(resultado.repetidos)} />
            <Numero rotulo="Descadastrados" valor={numero(resultado.descadastrados)} tom="ambar" />
          </div>
          {resultado.descadastrados > 0 ? (
            <Aviso tom="alerta">
              {numero(resultado.descadastrados)} número(s) da planilha já tinham pedido para sair.
              Eles <b>não</b> foram reativados — quem se descadastrou só volta se você reativar na
              tela de contatos, um a um.
            </Aviso>
          ) : null}
          <div className="flex gap-2">
            <Botao type="button" onClick={() => router.push('/contatos')}>
              Ver a base
            </Botao>
            <Botao type="button" tom="contorno" onClick={() => setResultado(null)}>
              Importar outra planilha
            </Botao>
          </div>
        </div>
      </Pad>
    )
  }

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 max-lg:grid-cols-1">
      <div className="space-y-5">
        <Pad>
          <PadTitulo
            titulo="1. De onde vêm os números"
            descricao="CSV ou TXT. Reconhece as colunas telefone, celular, whatsapp, número — e nome."
          />
          <div className="space-y-4 p-6">
            <div className="flex gap-2">
              <Botao
                type="button"
                tom={modo === 'arquivo' ? 'primario' : 'contorno'}
                tamanho="sm"
                onClick={() => trocarModo('arquivo')}
              >
                Planilha
              </Botao>
              <Botao
                type="button"
                tom={modo === 'colar' ? 'primario' : 'contorno'}
                tamanho="sm"
                onClick={() => trocarModo('colar')}
              >
                Colar números
              </Botao>
            </div>

            {modo === 'arquivo' ? (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed border-line bg-paper-alt/40 px-6 py-10 text-center transition-colors hover:border-blue hover:bg-blue/4">
                <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={aoEscolher} />
                <span className="text-[.95rem] font-semibold text-navy">
                  {arquivo ?? 'Clique para escolher a planilha'}
                </span>
                <span className="mt-1 text-[.82rem] text-muted">
                  Um número por linha. Com ou sem cabeçalho.
                </span>
              </label>
            ) : (
              <div className="space-y-2">
                <AreaTexto
                  value={colado}
                  onChange={(e) => aoColar(e.target.value)}
                  rows={7}
                  className="font-mono text-[.82rem]"
                  placeholder={'11 98765-4321, Maria\n(88) 99264-0298, João\n5511912345678'}
                />
                <p className="text-[.78rem] text-muted">
                  Um por linha; o nome depois da vírgula é opcional. Passa pela mesma conferência
                  da planilha — colar não é caminho mais frouxo.
                </p>
              </div>
            )}

            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
          </div>
        </Pad>

        {lido ? (
          <Pad>
            <PadTitulo
              titulo="2. Confira o que entrou"
              descricao="Nada foi gravado ainda. Estes são os números que sobraram depois da limpeza."
            />
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
                <Numero rotulo="Linhas lidas" valor={numero(lido.total)} />
                <Numero rotulo="Válidos" valor={numero(lido.validas.length)} tom="verde" />
                <Numero
                  rotulo="Fora"
                  valor={numero(lido.recusadas.length)}
                  tom={lido.recusadas.length > 0 ? 'ambar' : 'navy'}
                />
              </div>

              {lido.recusadas.length > 0 ? (
                <div>
                  <Etiqueta className="mb-2 block">
                    O que não entrou — e por quê (primeiras 20)
                  </Etiqueta>
                  <Tabela>
                    <thead>
                      <tr>
                        <Th className="w-16">Linha</Th>
                        <Th>Conteúdo</Th>
                        <Th>Motivo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lido.recusadas.slice(0, 20).map((r, i) => (
                        <tr key={`${r.linha}-${i}`}>
                          <Td className="tabular text-muted">{r.linha}</Td>
                          <Td className="max-w-[280px] truncate font-mono text-[.78rem]">
                            {r.original}
                          </Td>
                          <Td>
                            <Chip tom="ambar">{MOTIVO[r.motivo] ?? r.motivo}</Chip>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                  {lido.recusadas.length > 20 ? (
                    <p className="mt-2 text-[.8rem] text-muted">
                      e mais {numero(lido.recusadas.length - 20)}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {lido.validas.length > 0 ? (
                <div>
                  <Etiqueta className="mb-2 block">Amostra do que vai entrar</Etiqueta>
                  <ul className="space-y-1">
                    {lido.validas.slice(0, 5).map((v) => (
                      <li key={v.telefone} className="tabular font-mono text-[.82rem] text-muted">
                        {v.telefone}
                        {v.nome ? ` — ${v.nome}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Pad>
        ) : null}
      </div>

      <Pad className="self-start lg:sticky lg:top-6">
        <PadTitulo titulo="3. Onde guardar" />
        <form action={importar} className="space-y-4 p-6">
          <Campo rotulo="Adicionar a uma lista" dica="Opcional. Ajuda a escolher o público no disparo.">
            <Selecao name="listaId" defaultValue="">
              <option value="">Não vincular a nenhuma lista</option>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({numero(l.total)})
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Ou criar uma lista nova" dica="Deixe em branco se escolheu uma acima.">
            <Entrada name="novaLista" placeholder="FGTS — abril" />
          </Campo>

          <Campo rotulo="Etiquetas" dica="Separadas por vírgula. Somam às que o contato já tem.">
            <Entrada name="etiquetas" placeholder="fgts, quente" />
          </Campo>

          {progresso !== null ? (
            <div className="rounded-[12px] bg-paper-alt px-4 py-3 text-[.86rem] font-semibold text-navy">
              Enviando… {progresso}%
            </div>
          ) : null}

          <Botao
            type="submit"
            bloco
            tamanho="lg"
            disabled={enviando || !lido || lido.validas.length === 0}
          >
            {enviando
              ? 'Importando…'
              : lido
                ? `Importar ${numero(lido.validas.length)} contato(s)`
                : 'Escolha um arquivo'}
          </Botao>

          <p className="text-[.78rem] leading-relaxed text-muted">
            Quem já pediu para sair não é reativado pela importação. É o que mantém a operação dentro
            da lei — e o número longe da denúncia.
          </p>
        </form>
      </Pad>
    </div>
  )
}
