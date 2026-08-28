import type { ReactNode } from 'react'
import { Navegacao, type DadosDaCasca } from './navegacao'

/**
 * A casca do painel: navegação à esquerda, conteúdo à direita, e a faixa de
 * visita quando um superadmin está dentro da conta de um cliente.
 */
export function Casca({
  usuario,
  area,
  sair,
  encerrarVisita,
  children,
}: {
  usuario: DadosDaCasca
  area: 'cliente' | 'nex'
  sair: () => Promise<void>
  encerrarVisita?: () => Promise<void>
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Navegacao usuario={usuario} area={area} sair={sair} encerrarVisita={encerrarVisita} />

      <div className="min-w-0 flex-1">
        {usuario.personificando ? (
          /*
           * Sem este aviso é fácil disparar em nome de outra empresa achando
           * que está na sua. Fica no topo, em amarelo, e não fecha.
           */
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[#fef3c7] px-4 py-2.5 text-center text-[.84rem] font-semibold text-[#92400e]">
            <span>
              Você está vendo a conta de <b>{usuario.orgNome}</b> como time Nex.
            </span>
            <span className="font-normal">Tudo que fizer aqui é registrado no seu nome.</span>
          </div>
        ) : null}

        <main className="mx-auto max-w-[1180px] px-6 py-8 max-md:px-4 max-md:py-6">{children}</main>
      </div>
    </div>
  )
}

/** O cabeçalho de uma tela: título, explicação e ações. */
export function Titulo({
  titulo,
  descricao,
  acao,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] leading-tight max-md:text-[1.35rem]">{titulo}</h1>
        {descricao ? (
          <p className="mt-1.5 max-w-2xl text-[.92rem] leading-relaxed text-muted">{descricao}</p>
        ) : null}
      </div>
      {acao ? <div className="flex shrink-0 flex-wrap items-center gap-2">{acao}</div> : null}
    </div>
  )
}
