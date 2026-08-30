'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn, moeda } from '@/lib/ui'
import { Marca, Simbolo } from '@/components/ui/marca'
import {
  IcCampanhas,
  IcCanais,
  IcClientes,
  IcConfig,
  IcContatos,
  IcDisparo,
  IcExpandir,
  IcFechar,
  IcHistorico,
  IcMenu,
  IcPainel,
  IcRecolher,
  IcSaldo,
  IcSair,
} from './icones'
import { COOKIE_MENU, MENU_ABERTO, MENU_ENCOLHIDO } from './preferencias'

/**
 * A navegação do painel.
 *
 * Cliente e admin da Nex compartilham a casca e trocam de conjunto de links.
 * Um superadmin que entrou na conta de um cliente vê a navegação do cliente
 * com uma faixa em cima avisando de quem é a conta — sem esse aviso é fácil
 * disparar em nome de outra empresa achando que está na sua.
 *
 * No computador o menu recolhe para uma faixa só de ícones. A escolha vai
 * para um cookie e volta pelo servidor: guardar em `localStorage` obrigaria a
 * renderizar aberto e corrigir depois de montar, que é justamente o pisca-pisca
 * a cada recarga que se está tentando evitar.
 */

type Item = {
  href: string
  texto: string
  Icone: (p: { className?: string }) => React.ReactElement
  /** Só para quem administra a conta. */
  soAdmin?: boolean
  /** Só para o Administrador Nex — suporte não mexe em preço nem provedor. */
  soPoderTotal?: boolean
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
  { href: '/admin/usuarios', texto: 'Usuários', Icone: IcContatos },
  { href: '/admin/equipe', texto: 'Time Nex', Icone: IcConfig },
  { href: '/admin/envios', texto: 'Envios', Icone: IcHistorico },
  { href: '/admin/precos', texto: 'Preços', Icone: IcSaldo, soPoderTotal: true },
  { href: '/admin/provedores', texto: 'Provedores', Icone: IcCanais, soPoderTotal: true },
]

export type DadosDaCasca = {
  nome: string
  email: string
  papel: string
  orgNome: string
  orgSaldo: string
  /** Superadmin ou suporte — é quem vê o atalho para a administração. */
  isTimeNex: boolean
  /** Só o superadmin mexe em crédito, preço e provedor da plataforma. */
  isSuperadmin: boolean
  isAdmin: boolean
  personificando: boolean
}

function ativo(atual: string, href: string): boolean {
  if (href === '/painel' || href === '/admin') return atual === href
  return atual === href || atual.startsWith(`${href}/`)
}

/**
 * A linha de um item, recolhida ou não.
 *
 * Recolhido, o texto continua no DOM como `sr-only`: sem ele o link ficaria
 * sem nome nenhum para quem usa leitor de tela, e um ícone não é um nome.
 */
function Linha({
  Icone,
  texto,
  encolhido,
  className,
}: {
  Icone: (p: { className?: string }) => React.ReactElement
  texto: string
  encolhido: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex items-center rounded-[12px] py-2.5 text-[.9rem] font-semibold transition-colors',
        encolhido ? 'justify-center px-0' : 'gap-3 px-3.5',
        className,
      )}
    >
      <Icone className="h-[18px] w-[18px] shrink-0" />
      <span className={encolhido ? 'sr-only' : undefined}>{texto}</span>
    </span>
  )
}

export function Navegacao({
  usuario,
  area,
  sair,
  encerrarVisita,
  encolhidoInicial = false,
}: {
  usuario: DadosDaCasca
  area: 'cliente' | 'nex'
  sair: () => Promise<void>
  encerrarVisita?: () => Promise<void>
  /** Vem do cookie, lido no layout, para não piscar na primeira pintura. */
  encolhidoInicial?: boolean
}) {
  const caminho = usePathname()
  const [aberto, setAberto] = useState(false)
  const [encolhido, setEncolhido] = useState(encolhidoInicial)

  const itens = (area === 'nex' ? DA_NEX : DO_CLIENTE).filter(
    (i) => (!i.soAdmin || usuario.isAdmin) && (!i.soPoderTotal || usuario.isSuperadmin),
  )

  function alternarLargura() {
    const proximo = !encolhido
    setEncolhido(proximo)
    // Um ano, no site inteiro. É preferência de aparência: nada aqui é segredo.
    document.cookie = `${COOKIE_MENU}=${proximo ? MENU_ENCOLHIDO : MENU_ABERTO}; path=/; max-age=31536000; samesite=lax`
  }

  // No celular a barra vira gaveta de tela cheia, onde recolher não faz
  // sentido: o gesto ali é abrir e fechar, não estreitar.
  const estreito = encolhido && !aberto

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
                title={estreito ? texto : undefined}
                className="block"
              >
                <Linha
                  Icone={Icone}
                  texto={texto}
                  encolhido={estreito}
                  className={
                    marcado
                      ? 'bg-blue/10 text-blue'
                      : 'text-[#adc0e4] hover:bg-white/6 hover:text-white'
                  }
                />
              </Link>
            </li>
          )
        })}
      </ul>

      {usuario.isTimeNex ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          {estreito ? null : (
            <p className="mb-2 px-3.5 font-mono text-[.66rem] tracking-[.1em] text-[#7186b3] uppercase">
              {area === 'nex' ? 'Sua conta' : 'Time Nex'}
            </p>
          )}
          <Link
            href={area === 'nex' ? '/painel' : '/admin'}
            onClick={() => setAberto(false)}
            title={estreito ? (area === 'nex' ? 'Ir para o painel' : 'Administração Nex') : undefined}
            className="block"
          >
            <Linha
              Icone={IcClientes}
              texto={area === 'nex' ? 'Ir para o painel' : 'Administração Nex'}
              encolhido={estreito}
              className="text-[#adc0e4] hover:bg-white/6 hover:text-white"
            />
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
          'flex shrink-0 flex-col bg-navy-deep py-6 transition-[width,padding] duration-200',
          estreito ? 'w-[74px] px-2.5' : 'w-[248px] px-4',
          'max-lg:fixed max-lg:inset-x-0 max-lg:top-[57px] max-lg:bottom-0 max-lg:z-[55] max-lg:w-full max-lg:overflow-y-auto max-lg:px-4 max-lg:transition-transform',
          aberto ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
        )}
      >
        <div className={cn('mb-7 max-lg:hidden', estreito ? 'flex justify-center' : 'px-2')}>
          <Link href={area === 'nex' ? '/admin' : '/painel'} aria-label="Nex Envios">
            {estreito ? <Simbolo size={30} /> : <Marca size={28} claro />}
          </Link>
          {area === 'nex' && !estreito ? (
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
            estreito ? (
              <div
                title={`Saldo: ${moeda(usuario.orgSaldo)}`}
                className="mb-4 flex flex-col items-center gap-1 rounded-[12px] bg-white/6 py-2.5"
              >
                <IcSaldo className="h-[18px] w-[18px] text-[#7186b3]" />
                <span className="sr-only">Saldo: {moeda(usuario.orgSaldo)}</span>
              </div>
            ) : (
              <div className="mb-4 rounded-[12px] bg-white/6 px-3.5 py-3">
                <p className="font-mono text-[.62rem] tracking-[.12em] text-[#7186b3] uppercase">
                  Saldo
                </p>
                <p className="tabular mt-1 font-mono text-[1.15rem] font-semibold text-white">
                  {moeda(usuario.orgSaldo)}
                </p>
              </div>
            )
          ) : null}

          {estreito ? null : (
            <div className="px-2">
              <p className="truncate text-[.88rem] font-semibold text-white">{usuario.nome}</p>
              <p className="truncate text-[.76rem] text-[#7186b3]">{usuario.papel}</p>
            </div>
          )}

          {usuario.personificando && encerrarVisita ? (
            <form action={encerrarVisita} className="mt-3">
              <button
                type="submit"
                title={estreito ? 'Sair desta conta' : undefined}
                className="w-full"
              >
                <Linha
                  Icone={IcSair}
                  texto="Sair desta conta"
                  encolhido={estreito}
                  className="bg-cyan/15 text-cyan hover:bg-cyan/25"
                />
              </button>
            </form>
          ) : null}

          <form action={sair} className="mt-2">
            <button type="submit" title={estreito ? 'Sair' : undefined} className="w-full">
              <Linha
                Icone={IcSair}
                texto="Sair"
                encolhido={estreito}
                className="text-[#7186b3] hover:bg-white/6 hover:text-white"
              />
            </button>
          </form>

          {/* Só no computador: no celular a barra é gaveta, não faixa. */}
          <button
            type="button"
            onClick={alternarLargura}
            aria-label={encolhido ? 'Expandir menu' : 'Recolher menu'}
            title={encolhido ? 'Expandir menu' : 'Recolher menu'}
            className="mt-2 w-full max-lg:hidden"
          >
            <Linha
              Icone={encolhido ? IcExpandir : IcRecolher}
              texto={encolhido ? 'Expandir menu' : 'Recolher menu'}
              encolhido={estreito}
              className="text-[#7186b3] hover:bg-white/6 hover:text-white"
            />
          </button>
        </div>
      </aside>
    </>
  )
}
