'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { apagarLista, criarLista, marcarListaDeTeste, renomearLista } from '../acoes'
import { AreaTexto, Aviso, Botao, Campo, Chip, Entrada, Pad, PadTitulo } from '@/components/ui/base'
import { ColarNumeros } from '@/components/contatos/colar'
import { numero } from '@/lib/ui'

function Salvar({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tamanho="sm" disabled={pending}>
      {pending ? 'Salvando…' : texto}
    </Botao>
  )
}

export function NovaLista() {
  const [estado, acao] = useActionState(criarLista, undefined)

  return (
    <Pad className="lg:sticky lg:top-6 self-start">
      <PadTitulo titulo="Nova lista" />
      <form action={acao} className="space-y-4 p-6">
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

        <Campo rotulo="Nome" obrigatorio>
          <Entrada name="nome" required placeholder="FGTS — março" />
        </Campo>
        <Campo rotulo="Descrição" dica="Para você lembrar de onde veio esse público.">
          <AreaTexto name="descricao" rows={2} placeholder="Base trabalhada de saque-aniversário" />
        </Campo>
        <Salvar texto="Criar lista" />
      </form>
    </Pad>
  )
}

export function Lista({
  lista,
  podeEditar,
}: {
  lista: {
    id: string
    nome: string
    descricao: string | null
    total: number
    criadaEm: string
    autor: string | null
    deTeste: boolean
  }
  podeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [colando, setColando] = useState(false)
  const [estado, acao] = useActionState(renomearLista, undefined)
  const [ocupado, iniciar] = useTransition()

  if (editando) {
    return (
      <form action={acao} className="space-y-3">
        <input type="hidden" name="listaId" value={lista.id} />
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        <Campo rotulo="Nome">
          <Entrada name="nome" defaultValue={lista.nome} required />
        </Campo>
        <Campo rotulo="Descrição">
          <Entrada name="descricao" defaultValue={lista.descricao ?? ''} />
        </Campo>
        <div className="flex gap-2">
          <Salvar texto="Salvar" />
          <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Botao>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/contatos?lista=${lista.id}`}
            className="text-[.98rem] font-semibold text-navy hover:text-blue"
          >
            {lista.nome}
          </Link>
          {lista.deTeste ? <Chip tom="azul">Lista de teste</Chip> : null}
        </p>
        <p className="mt-0.5 text-[.84rem] text-muted">
          <b className="tabular font-semibold text-navy">{numero(lista.total)}</b> contato(s)
          {lista.descricao ? ` · ${lista.descricao}` : ''}
        </p>
        <p className="text-[.76rem] text-muted">
          criada em {lista.criadaEm}
          {lista.autor ? ` por ${lista.autor}` : ''}
        </p>
      </div>

      {podeEditar ? (
        <div className="flex shrink-0 gap-1.5">
          <Botao type="button" tom="contorno" tamanho="sm" onClick={() => setColando((v) => !v)}>
            {colando ? 'Fechar' : 'Colar números'}
          </Botao>
          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            disabled={ocupado}
            onClick={() => iniciar(() => void marcarListaDeTeste(lista.id, !lista.deTeste))}
            title={
              lista.deTeste
                ? 'Deixa de ser a lista usada para testar disparos.'
                : 'Passa a ser a lista que aparece primeiro na hora de testar um disparo.'
            }
          >
            {lista.deTeste ? 'Não é mais teste' : 'Usar como teste'}
          </Botao>
          <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => setEditando(true)}>
            Renomear
          </Botao>
          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            disabled={ocupado}
            onClick={() => {
              if (
                !confirm(
                  `Apagar a lista "${lista.nome}"? Os contatos continuam na base — só o agrupamento some.`,
                )
              )
                return
              iniciar(() => void apagarLista(lista.id))
            }}
          >
            Apagar
          </Botao>
        </div>
      ) : null}
    </div>

      {colando ? (
        <div className="rounded-[12px] border border-line bg-paper-alt/50 p-4">
          <ColarNumeros listaId={lista.id} compacto aoTerminar={() => setColando(false)} />
        </div>
      ) : null}
    </div>
  )
}
