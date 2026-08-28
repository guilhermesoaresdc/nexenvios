/** Os ícones da landing, inline. Sem biblioteca: são doze e não mudam. */

type Props = { className?: string }

export function IconeWhatsapp({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.6 14.3c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1a13 13 0 0 1-5.6-4 6.6 6.6 0 0 1-1.4-3.5c0-1 .3-1.8 1-2.4.2-.2.5-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6c-.1.2-.2.3 0 .6.4.8 1 1.5 1.7 2 .3.2.6.4.9.6.2.1.4.1.5-.1l.6-.7c.2-.2.4-.3.6-.2l1.9.9c.2.1.4.2.5.3.1.2.1.7-.1 1.2Z" />
    </svg>
  )
}

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function IconeEscudo({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export function IconeRaio({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M13 3 5 13h6l-1 8 8-11h-6l1-7Z" />
    </svg>
  )
}

export function IconeCelular({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M10 18h4M9 6.5h6M9 9.5h6M9 12.5h4" />
    </svg>
  )
}

export function IconeRcs({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <rect x="3" y="4" width="14" height="10" rx="2" />
      <circle cx="7.3" cy="7.8" r="1" fill="currentColor" stroke="none" />
      <path d="M4 12.3l3.2-2.8 2.8 2.3L14 8.3" />
      <path d="M8 18h9l3 3v-9" />
    </svg>
  )
}

export function IconeVoz({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
    </svg>
  )
}

export function IconeAlcance({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  )
}

export function IconeCusto({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M7 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-3-3V10l3-3Z" />
      <circle cx="14" cy="12" r="2" />
    </svg>
  )
}

export function IconeAbertura({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M3 6h18v12H3V6Z" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function IconePersonalizacao({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M4 6h6M4 18h4" />
      <circle cx="14" cy="6" r="2" />
      <path d="M4 12h10" />
      <circle cx="18" cy="18" r="2" />
      <path d="M14 18h2" />
    </svg>
  )
}

export function IconeMulticanal({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  )
}

export function IconeAutomacao({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M4 4v5h5" />
      <path d="M20 20v-5h-5" />
      <path d="M5.5 9a7 7 0 0 1 12-3.5L20 8M18.5 15a7 7 0 0 1-12 3.5L4 16" />
    </svg>
  )
}

export function IconeBanco({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v9M19 10v9M9 19v-6h6v6M3 19h18" />
    </svg>
  )
}

export function IconeDado({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconeEscala({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  )
}

export function IconeSeta({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  )
}

export function IconeMenu({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" {...traco} aria-hidden="true" className={className}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}
