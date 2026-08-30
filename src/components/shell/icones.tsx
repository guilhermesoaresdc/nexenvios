/** Ícones da navegação. Traço de 1.8, 24×24 — o mesmo desenho da landing. */

type Props = { className?: string }

const t = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function IcPainel({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

export function IcDisparo({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M4 12 20 4l-3.5 16-4.5-6-8-2Z" />
      <path d="m12 14 8-10" />
    </svg>
  )
}

export function IcCampanhas({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M14.5 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  )
}

export function IcContatos({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M18 20a5.5 5.5 0 0 0-2-4.3" />
    </svg>
  )
}

export function IcHistorico({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function IcCanais({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.2 8.6 11 15.6M15.8 8.6 13 15.6M8.5 7h7" />
    </svg>
  )
}

export function IcConfig({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

export function IcClientes({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M3 21V8l6-4 6 4v13" />
      <path d="M15 12h6v9M3 21h18M7 11h2M7 15h2M12 11h.01M12 15h.01M18 15h.01M18 18h.01" />
    </svg>
  )
}

export function IcSaldo({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="17" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IcSair({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  )
}

export function IcMenu({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

export function IcFechar({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function IcVoltar({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

/** Recolher o menu: barra e seta apontando para ela. */
export function IcRecolher({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M4 5v14M20 12H10M14 8l-4 4 4 4" />
    </svg>
  )
}

/** Expandir o menu: a mesma peça, espelhada. */
export function IcExpandir({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...t} className={className} aria-hidden="true">
      <path d="M4 5v14M10 12h10M16 8l4 4-4 4" />
    </svg>
  )
}
