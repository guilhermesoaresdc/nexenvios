'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/ui'
import { Marca } from '@/components/ui/marca'
import { IconeFormulario, IconeMenu } from './icones'

/**
 * As três coisas da landing que precisam de navegador: o cabeçalho que muda
 * ao rolar, o menu de celular e as animações de entrada.
 *
 * Tudo aqui é melhoria progressiva. Sem JavaScript a página continua completa
 * e legível — o conteúdo nasce visível e só é escondido depois que o
 * observador entra em ação.
 */

export function Cabecalho({ acao }: { acao: string }) {
  const [rolou, setRolou] = useState(false)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 12)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  const links = [
    { href: '#canais', texto: 'Canais' },
    { href: '#beneficios', texto: 'Benefícios' },
    { href: '#nichos', texto: 'Nichos' },
    { href: '#contato', texto: 'Contato' },
  ]

  return (
    <header
      className={cn(
        'sticky top-0 z-[100] transition-all',
        rolou
          ? 'bg-paper/86 py-3 shadow-[0_1px_0_rgba(0,32,88,.09)] backdrop-blur-[14px]'
          : 'py-5',
      )}
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-5 px-6">
        <Link href="/" aria-label="Nex Envios — início" className="shrink-0">
          <Marca size={30} />
        </Link>

        <nav
          aria-label="Navegação principal"
          className={cn(
            'max-md:fixed max-md:top-[74px] max-md:right-4 max-md:left-4 max-md:z-[90] max-md:rounded-[18px] max-md:bg-white max-md:px-5 max-md:shadow-[0_24px_48px_-24px_rgba(0,32,88,.28)] max-md:transition-all',
            aberto
              ? 'max-md:visible max-md:translate-y-0 max-md:opacity-100'
              : 'max-md:invisible max-md:-translate-y-2.5 max-md:opacity-0',
          )}
        >
          <ul className="flex items-center gap-8 max-md:flex-col max-md:items-stretch max-md:gap-0">
            {links.map((l) => (
              <li key={l.href} className="max-md:border-b max-md:border-line max-md:last:border-0">
                <a
                  href={l.href}
                  onClick={() => setAberto(false)}
                  className="group relative block py-1.5 text-[.94rem] font-semibold text-navy max-md:py-4"
                >
                  {l.texto}
                  <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-blue transition-all group-hover:w-full max-md:hidden" />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/entrar"
            className="rounded-full border-2 border-line px-5 py-2.5 text-[.86rem] font-bold text-navy transition-colors hover:border-blue hover:text-blue max-[560px]:hidden"
          >
            Entrar
          </Link>
          <a
            href={acao}
            onClick={() => setAberto(false)}
            className="inline-flex items-center gap-2 rounded-full bg-blue px-[18px] py-[11px] text-[.86rem] font-bold text-white shadow-[0_12px_24px_-10px_rgba(0,120,248,.55)] transition-all hover:-translate-y-0.5 hover:bg-blue-dark max-[420px]:h-[42px] max-[420px]:w-[42px] max-[420px]:justify-center max-[420px]:p-0"
          >
            <IconeFormulario className="h-[19px] w-[19px] shrink-0" />
            <span className="max-[420px]:hidden">Solicitar proposta</span>
          </a>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            className="hidden h-[42px] w-[42px] items-center justify-center rounded-[12px] text-navy max-md:inline-flex"
          >
            <IconeMenu className="h-[22px] w-[22px]" />
          </button>
        </div>
      </div>
    </header>
  )
}

/**
 * O atalho flutuante para o formulário. Some quando o formulário está na tela:
 * ali ele não teria função e ainda cobriria o botão "Voltar" do fluxo, que é
 * fixo no mesmo canto de dentro do iframe.
 *
 * Sem JavaScript o botão fica visível o tempo todo — é um link, continua
 * levando ao lugar certo.
 */
export function AtalhoFormulario({ alvo }: { alvo: string }) {
  const [escondido, setEscondido] = useState(false)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const secao = document.querySelector(alvo)
    if (!secao) return

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) setEscondido(entrada.isIntersecting)
      },
      { threshold: 0.12 },
    )
    observador.observe(secao)
    return () => observador.disconnect()
  }, [alvo])

  return (
    <a
      href={alvo}
      aria-label="Solicitar proposta"
      aria-hidden={escondido}
      tabIndex={escondido ? -1 : undefined}
      className={cn(
        'fixed right-[22px] bottom-[22px] z-[200] flex h-15 w-15 items-center justify-center rounded-full bg-blue text-white shadow-[0_14px_30px_-8px_rgba(0,120,248,.6)] transition-all max-sm:right-4 max-sm:bottom-4 max-sm:h-[54px] max-sm:w-[54px]',
        escondido
          ? 'pointer-events-none translate-y-3 opacity-0'
          : 'opacity-100 hover:scale-107',
      )}
    >
      <span className={cn('absolute inset-0 rounded-full', escondido ? null : 'pulsa-azul')} />
      <IconeFormulario className="h-7 w-7 max-sm:h-[25px] max-sm:w-[25px]" />
    </a>
  )
}

/** Aparece ao entrar na tela. Sem observador, nasce e fica visível. */
export function AoAparecer({
  children,
  atraso = 0,
  className,
}: {
  children: ReactNode
  atraso?: number
  className?: string
}) {
  const alvo = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(true)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const no = alvo.current
    if (!no) return

    setVisivel(false)
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            setVisivel(true)
            observador.unobserve(entrada.target)
          }
        }
      },
      { threshold: 0.15 },
    )
    observador.observe(no)
    return () => observador.disconnect()
  }, [])

  return (
    <div
      ref={alvo}
      style={{ transitionDelay: `${atraso}ms` }}
      className={cn(
        'transition-all duration-500',
        visivel ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** O contador que sobe até 100 milhões quando entra na tela. */
export function Contador({ alvo, sufixo = '+' }: { alvo: number; sufixo?: string }) {
  const no = useRef<HTMLSpanElement>(null)
  const [valor, setValor] = useState(alvo)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const elemento = no.current
    if (!elemento) return

    const prefereParado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefereParado) return

    setValor(0)
    let quadro = 0
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue
          observador.unobserve(entrada.target)
          const comeco = performance.now()
          const duracao = 1800
          const passo = (agora: number) => {
            const p = Math.min((agora - comeco) / duracao, 1)
            // Desaceleração cúbica: sobe rápido e encosta devagar no número.
            setValor(Math.floor((1 - (1 - p) ** 3) * alvo))
            if (p < 1) quadro = requestAnimationFrame(passo)
            else setValor(alvo)
          }
          quadro = requestAnimationFrame(passo)
        }
      },
      { threshold: 0.5 },
    )
    observador.observe(elemento)
    return () => {
      observador.disconnect()
      cancelAnimationFrame(quadro)
    }
  }, [alvo])

  return (
    <span ref={no} className="tabular">
      {valor.toLocaleString('pt-BR')}
      {sufixo}
    </span>
  )
}
