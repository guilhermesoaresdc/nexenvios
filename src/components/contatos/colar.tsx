'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importarLote } from '@/app/(app)/contatos/acoes'
import { ler, MOTIVO } from '@/lib/contatos/leitura'
import { AreaTexto, Aviso, Botao, Chip } from '@/components/ui/base'
import { numero } from '@/lib/ui'

/**
 * Colar números direto, sem planilha.
 *
 * Para dois ou três números de teste, exigir um arquivo é cerimônia que não
 * serve ao teste — e, como dá trabalho, o teste deixa de ser feito, que é o
 * pior desfecho possível num sistema que manda mensagem em nome de outra
 * pessoa.
 *
 * Lê pelo MESMO `ler()` da importação de planilha: um número colado passa pela
 * mesma normalização, a mesma recusa por DDD inexistente, a mesma remoção de
 * repetidos. Colar não é um caminho mais frouxo, é só outra porta.
 */

const LOTE = 2_000

export function ColarNumeros({
  listaId,
  aoTerminar,
  compacto,
}: {
  /** Para onde vão. Vazio = só cria contato, sem entrar em lista. */
  listaId?: string
  aoTerminar?: () => void
  compacto?: boolean
}) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const lido = useMemo(() => (texto.trim() ? ler(texto) : null), [texto])

  function enviar() {
    if (!lido || lido.validas.length === 0) return
    setErro(null)
    setFeito(null)

    iniciar(async () => {
      const soma = { novos: 0, atualizados: 0 }

      for (let i = 0; i < lido.validas.length; i += LOTE) {
        const r = await importarLote({
          linhas: lido.validas.slice(i, i + LOTE).map((l) => ({ telefone: l.telefone, nome: l.nome })),
          listaId: listaId ?? '',
          novaLista: '',
          etiquetas: '',
          arquivo: 'colado na tela',
          invalidos: lido.recusadas.length,
          continuando: i > 0,
        })
        if (!r.ok) {
          setErro(r.erro)
          return
        }
        soma.novos += r.novos
        soma.atualizados += r.atualizados
      }

      setTexto('')
      setFeito(
        soma.novos > 0 && soma.atualizados > 0
          ? `${numero(soma.novos)} novo(s) e ${numero(soma.atualizados)} já existente(s).`
          : soma.novos > 0
            ? `${numero(soma.novos)} contato(s) adicionado(s).`
            : `${numero(soma.atualizados)} já estavam na base e foram vinculados.`,
      )
      aoTerminar?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <AreaTexto
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={compacto ? 3 : 6}
        className="font-mono text-[.82rem]"
        placeholder={'11 98765-4321, Maria\n(88) 99264-0298, João\n5511912345678'}
      />

      <p className="text-[.78rem] text-muted">
        Um por linha. O nome depois da vírgula é opcional. Vale colar direto da planilha — a
        conferência é a mesma da importação.
      </p>

      {lido ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tom={lido.validas.length > 0 ? 'verde' : 'neutro'}>
            {numero(lido.validas.length)} válido(s)
          </Chip>
          {lido.recusadas.length > 0 ? (
            <Chip tom="vermelho">{numero(lido.recusadas.length)} recusado(s)</Chip>
          ) : null}
        </div>
      ) : null}

      {lido && lido.recusadas.length > 0 ? (
        <ul className="space-y-1 text-[.78rem] text-muted">
          {lido.recusadas.slice(0, 5).map((r) => (
            <li key={`${r.linha}-${r.original}`}>
              linha {r.linha}: <span className="font-mono">{r.original}</span> —{' '}
              {MOTIVO[r.motivo] ?? r.motivo}
            </li>
          ))}
          {lido.recusadas.length > 5 ? <li>e mais {lido.recusadas.length - 5}…</li> : null}
        </ul>
      ) : null}

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {feito ? <Aviso tom="ok">{feito}</Aviso> : null}

      <Botao
        type="button"
        tamanho="sm"
        disabled={enviando || !lido || lido.validas.length === 0}
        onClick={enviar}
      >
        {enviando
          ? 'Adicionando…'
          : lido && lido.validas.length > 0
            ? `Adicionar ${numero(lido.validas.length)}`
            : 'Adicionar'}
      </Botao>
    </div>
  )
}
