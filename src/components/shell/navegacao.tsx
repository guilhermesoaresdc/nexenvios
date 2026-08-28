'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn, moeda } from '@/lib/ui'
import { Marca } from '@/components/ui/marca'
import {
  IcCampanhas,
  IcCanais,
  IcClientes,
  IcConfig,
  IcContatos,
  IcDisparo,
  IcFechar,
  IcHistorico,
  IcMenu,
  IcPainel,
  IcSaldo,
  IcSair,
} from './icones'

/**
 * A navegação do painel.
 *
 * Cliente e admin da Nex compartilham a casca e trocam de conjunto de links.
 * Um superadmin que entrou na conta de um cliente vê a navegação do cliente
 * com uma faixa em cima avisando de quem é a conta — sem esse aviso é fácil
 * disparar em nome de outra empresa achando que está na sua.
 */

type Item = {
  href: string
  texto: string
  Icone: (p: { className?: string }) => React.ReactElement
  /** Só para quem administra a conta. */
  soAdmin?: boolean
}

const DO_CLIENTE: Item[] = [
  { href: '/painel', texto: 'Painel', Icone: IcPainel },
  { href: '/disparo', texto: 'Novo disparo', Icone: IcDisparo },
  { href: '/campanhas', texto: 'Campanhas', Icone: IcCampanhas },
  { href: '/contatos', texto: 'Contatos', Icone: IcContatos },
  { href: '/historico', texto: 'Histórico', Icone: IcHistorico },
  { href: '/canais', texto: 'Canais', Icone: IcCanais, soAdmin: true },
  { href: '/configuracoes', texto: 'Configurações', Icone: IcConfig, soAdmin: true },
]

const DA_NEX: Item[] = [
  { href: '/admin', texto: 'Visão geral', Icone: IcPainel },
  { href: '/admin/clientes', texto: 'Clientes', Icone: IcClientes },
  { href: '/admin/envios', texto: 'Envios', Icone: IcHistorico },
  { href: '/admin/precos', texto: 'Preços', Icone: IcSaldo },
  { href: '/admin/provedores', texto: 'Provedores', Icone: IcCanais },
]

export type DadosDaCasca = {
  nome: string
  email: string
  papel: string
  orgNome: string
  orgSaldo: string
  isSuperadmin: boolean
  isAdmin: boolean
  personificando: boolean
}

function ativo(atual: string, href: string): boolean {
  if (href === '/painel' || href === '/admin') return atual === href
  return atual === href || atual.startsWith(`${href}/`)
}

export function Navegacao({
  usuario,
  area,
  sair,
  encerrarVisita,
}: {
  usuario: DadosDaCasca
  area: 'cliente' | 'nex'
  sair: () => Promise<void>
  encerrarVisita?: () => Promise<void>
}) {
  const caminho = usePathname()
  const [aberto, setAberto] = useState(false)

  const itens = (area === 'nex' ? DA_NEX : DO_CLIENTE).filter(
    (i) => !i.soAdmin || usuario.isAdmin,
  )

  const links = (
    <>
      <ul className="space-y-1">
        {itens.map(({ href, texto, Icone }) => {
          const marcado = ativo(caminho, href)
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setAberto(false)}
                aria-current={marcado ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[.9rem] font-semibold transition-colors',
                  marcado
                    ? 'bg-blue/10 text-blue'
                    : 'text-[#adc0e4] hover:bg-white/6 hover:text-white',
                )}
              >
                <Icone className="h-[18px] w-[18px] shrink-0" />
                {texto}
              </Link>
            </li>
          )
        })}
      </ul>

      {usuario.isSuperadmin ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="mb-2 px-3.5 font-mono text-[.66rem] tracking-[.1em] text-[#7186b3] uppercase">
            {area === 'nex' ? 'Sua conta' : 'Time Nex'}
          </p>
          <Link
            href={area === 'nex' ? '/painel' : '/admin'}
            onClick={() => setAberto(false)}
            className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[.9rem] font-semibold text-[#adc0e4] transition-colors hover:bg-white/6 hover:text-white"
          >
            <IcClientes className="h-[18px] w-[18px] shrink-0" />
            {area === 'nex' ? 'Ir para o painel' : 'Administração Nex'}
          </Link>
        </div>
      ) : null}
    </>
  )

  return (
    <>
      {/* Barra de celular */}
      <div className="sticky top-0 z-[60] flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <Marca size={26} />
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={aberto}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] text-navy"
        >
          {aberto ? <IcFechar className="h-5 w-5" /> : <IcMenu className="h-5 w-5" />}
        </button>
      </div>

      <aside
        className={cn(
          'flex w-[248px] shrink-0 flex-col bg-navy-deep px-4 py-6',
          'max-lg:fixed max-lg:inset-x-0 max-lg:top-[57px] max-lg:bottom-0 max-lg:z-[55] max-lg:w-full max-lg:overflow-y-auto max-lg:transition-transform',
          aberto ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
        )}
      >
        <div className="mb-7 px-2 max-lg:hidden">
          <Link href={area === 'nex' ? '/admin' : '/painel'}>
            <Marca size={28} claro />
          </Link>
          {area === 'nex' ? (
            <p className="mt-2 font-mono text-[.62rem] tracking-[.14em] text-cyan uppercase">
              Administração
            </p>
          ) : null}
        </div>

        <nav aria-label="Navegação do painel" className="flex-1">
          {links}
        </nav>

        <div className="mt-6 border-t border-white/10 pt-5">
          {area === 'cliente' ? (
            <div className="mb-4 rounded-[12px] bg-white/6 px-3.5 py-3">
              <p className="font-mono text-[.62rem] tracking-[.12em] text-[#7186b3] uppercase">
                Saldo
              </p>
              <p className="tabular mt-1 font-mono text-[1.15rem] font-semibold text-white">
                {moeda(usuario.orgSaldo)}
              </p>
            </div>
          ) : null}

          <div className="px-2">
            <p className="truncate text-[.88rem] font-semibold text-white">{usuario.nome}</p>
            <p className="truncate text-[.76rem] text-[#7186b3]">{usuario.papel}</p>
          </div>

          {usuario.personificando && encerrarVisita ? (
            <form action={encerrarVisita} className="mt-3">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-[12px] bg-cyan/15 px-3.5 py-2.5 text-[.86rem] font-semibold text-cyan transition-colors hover:bg-cyan/25"
              >
                <IcSair className="h-[18px] w-[18px] shrink-0" />
                Sair desta conta
              </button>
            </form>
          ) : null}

          <form action={sair} className="mt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[.86rem] font-semibold text-[#7186b3] transition-colors hover:bg-white/6 hover:text-white"
            >
              <IcSair className="h-[18px] w-[18px] shrink-0" />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
