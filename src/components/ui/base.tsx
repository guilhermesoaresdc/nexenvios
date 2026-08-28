import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/ui'

/**
 * As primitivas da interface.
 *
 * Componente de servidor por padrão — nenhuma delas tem estado. O que precisa
 * de `"use client"` mora no arquivo da tela que o usa, não aqui.
 */

// ─────────────────────────────────────────────────────────── Pad

export function Pad({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[18px] border border-line bg-white shadow-[0_10px_24px_-12px_rgba(0,32,88,.14)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function PadTitulo({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[1.05rem] font-semibold text-navy">{titulo}</h2>
        {descricao ? <p className="mt-1 text-sm leading-relaxed text-muted">{descricao}</p> : null}
      </div>
      {acao ? <div className="flex shrink-0 items-center gap-2">{acao}</div> : null}
    </div>
  )
}

// ──────────────────────────────────────────────────────── Botões

const BOTAO_BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-all disabled:cursor-not-allowed disabled:opacity-55'

const TOM = {
  primario: 'bg-blue text-white hover:bg-[#0064d4] shadow-[0_12px_24px_-12px_rgba(0,120,248,.6)]',
  wa: 'bg-wa text-white hover:bg-wa-dark shadow-[0_12px_24px_-12px_rgba(37,211,102,.6)]',
  navy: 'bg-navy text-white hover:bg-navy-deep',
  contorno: 'border-2 border-line bg-transparent text-navy hover:border-blue hover:text-blue',
  fantasma: 'bg-transparent text-muted hover:bg-paper-alt hover:text-navy',
  perigo: 'border-2 border-[#f4b8b8] bg-transparent text-danger hover:bg-[#fef2f2]',
} as const

const TAMANHO = {
  sm: 'px-4 py-2 text-[.82rem]',
  md: 'px-6 py-3 text-[.9rem]',
  lg: 'px-8 py-4 text-[1rem]',
} as const

export type TomDoBotao = keyof typeof TOM

type BotaoProps = ComponentProps<'button'> & {
  tom?: TomDoBotao
  tamanho?: keyof typeof TAMANHO
  bloco?: boolean
}

export function Botao({
  tom = 'primario',
  tamanho = 'md',
  bloco,
  className,
  ...props
}: BotaoProps) {
  return (
    <button
      className={cn(BOTAO_BASE, TOM[tom], TAMANHO[tamanho], bloco && 'w-full', className)}
      {...props}
    />
  )
}

type BotaoLinkProps = ComponentProps<typeof Link> & {
  tom?: TomDoBotao
  tamanho?: keyof typeof TAMANHO
  bloco?: boolean
}

export function BotaoLink({
  tom = 'primario',
  tamanho = 'md',
  bloco,
  className,
  ...props
}: BotaoLinkProps) {
  return (
    <Link
      className={cn(BOTAO_BASE, TOM[tom], TAMANHO[tamanho], bloco && 'w-full', className)}
      {...props}
    />
  )
}

// ────────────────────────────────────────────────────────── Campos

export function Campo({
  rotulo,
  dica,
  erro,
  obrigatorio,
  children,
  className,
}: {
  rotulo: ReactNode
  dica?: ReactNode
  erro?: ReactNode
  obrigatorio?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[.8rem] font-semibold text-navy">
        {rotulo}
        {obrigatorio ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
      {erro ? (
        <span className="mt-1.5 block text-[.78rem] font-medium text-danger">{erro}</span>
      ) : dica ? (
        <span className="mt-1.5 block text-[.78rem] leading-relaxed text-muted">{dica}</span>
      ) : null}
    </label>
  )
}

const CAMPO_BASE =
  'w-full rounded-[12px] border border-line bg-white px-4 py-3 text-[.92rem] text-ink transition-colors placeholder:text-[#9aa8c4] focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10 disabled:bg-paper-alt disabled:text-muted'

export function Entrada({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CAMPO_BASE, className)} {...props} />
}

export function AreaTexto({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CAMPO_BASE, 'min-h-32 resize-y leading-relaxed', className)} {...props} />
}

export function Selecao({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(CAMPO_BASE, 'appearance-none pr-10', className)} {...props}>
      {children}
    </select>
  )
}

// ────────────────────────────────────────────────────────── Chips

const CHIP = {
  neutro: 'bg-paper-alt text-muted',
  azul: 'bg-blue/10 text-blue',
  ciano: 'bg-cyan/12 text-[#0a7ea8]',
  verde: 'bg-wa/12 text-[#128a41]',
  ambar: 'bg-[#fef3c7] text-[#a16207]',
  vermelho: 'bg-[#fee2e2] text-danger',
  navy: 'bg-navy/8 text-navy',
} as const

export type TomDoChip = keyof typeof CHIP

export function Chip({
  tom = 'neutro',
  pulsando,
  className,
  children,
}: {
  tom?: TomDoChip
  pulsando?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[.74rem] font-semibold',
        CHIP[tom],
        className,
      )}
    >
      {pulsando ? (
        <span className="pulsa inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  )
}

export function Etiqueta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono text-[.68rem] font-semibold tracking-[.1em] text-muted uppercase',
        className,
      )}
    >
      {children}
    </span>
  )
}

// ──────────────────────────────────────────────────────── Avisos

export function Aviso({
  tom = 'info',
  titulo,
  children,
  className,
}: {
  tom?: 'info' | 'alerta' | 'erro' | 'ok'
  titulo?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const tons = {
    info: 'border-blue/25 bg-blue/6 text-navy',
    alerta: 'border-[#fcd34d] bg-[#fffbeb] text-[#92400e]',
    erro: 'border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]',
    ok: 'border-wa/35 bg-wa/8 text-[#0f6b34]',
  } as const

  return (
    <div className={cn('rounded-[12px] border px-4 py-3 text-[.86rem] leading-relaxed', tons[tom], className)}>
      {titulo ? <p className="mb-0.5 font-bold">{titulo}</p> : null}
      {children}
    </div>
  )
}

/** O estado vazio de uma tela. Sempre diz o que fazer, nunca só "sem dados". */
export function Vazio({
  titulo,
  descricao,
  acao,
  icone,
}: {
  titulo: string
  descricao: string
  acao?: ReactNode
  icone?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icone ? (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-paper-alt text-blue">
          {icone}
        </div>
      ) : null}
      <h3 className="text-[1.05rem] font-semibold text-navy">{titulo}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{descricao}</p>
      {acao ? <div className="mt-6">{acao}</div> : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────── Tabelas

export function Tabela({ className, children, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function Th({ className, children, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'border-b border-line bg-paper-alt px-4 py-3 font-mono text-[.68rem] font-semibold tracking-[.1em] text-muted uppercase',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className, children, ...props }: ComponentProps<'td'>) {
  return (
    <td className={cn('border-b border-line px-4 py-3.5 align-middle', className)} {...props}>
      {children}
    </td>
  )
}

// ──────────────────────────────────────────────────── Indicadores

export function Numero({
  rotulo,
  valor,
  nota,
  tom = 'navy',
  className,
}: {
  rotulo: string
  valor: ReactNode
  nota?: ReactNode
  tom?: 'navy' | 'blue' | 'verde' | 'ambar' | 'vermelho'
  className?: string
}) {
  const cores = {
    navy: 'text-navy',
    blue: 'text-blue',
    verde: 'text-[#0f6b34]',
    ambar: 'text-[#a16207]',
    vermelho: 'text-danger',
  } as const

  return (
    <Pad className={cn('px-5 py-4', className)}>
      <Etiqueta>{rotulo}</Etiqueta>
      <p className={cn('tabular mt-2 font-mono text-[1.7rem] leading-none font-semibold', cores[tom])}>
        {valor}
      </p>
      {nota ? <p className="mt-2 text-[.78rem] leading-snug text-muted">{nota}</p> : null}
    </Pad>
  )
}

/** Barra de progresso com as fatias do disparo. */
export function Barra({
  fatias,
  total,
  className,
}: {
  fatias: { valor: number; cor: string; rotulo: string }[]
  total: number
  className?: string
}) {
  const base = Math.max(total, 1)
  return (
    <div className={cn('flex h-2.5 w-full overflow-hidden rounded-full bg-paper-alt', className)}>
      {fatias.map((f) =>
        f.valor > 0 ? (
          <div
            key={f.rotulo}
            className="h-full transition-all"
            style={{ width: `${(f.valor / base) * 100}%`, background: f.cor }}
            title={`${f.rotulo}: ${f.valor}`}
          />
        ) : null,
      )}
    </div>
  )
}
