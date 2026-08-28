import { cn } from '@/lib/ui'

/**
 * A marca, em SVG.
 *
 * Vetor e não PNG: o logotipo aparece do favicon de 16px ao cabeçalho da
 * landing, e um bitmap só fica bom num tamanho. Também mantém o repositório
 * sem binário e o primeiro carregamento sem uma requisição extra.
 */

/** O símbolo: o "N" recortado dentro do quadrado, com o rastro do disparo. */
export function Simbolo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="nex-fundo" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#002058" />
          <stop offset="1" stopColor="#0078f8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#nex-fundo)" />
      {/* O N */}
      <path
        d="M18 45V19h6.2l13.6 16.4V19H44v26h-6.2L24.2 28.6V45H18Z"
        fill="#fff"
      />
      {/* O rastro: três traços que saem do N, como a mensagem partindo. */}
      <path d="M48 24h8M48 32h6M48 40h8" stroke="#00b0f8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** O logotipo completo: símbolo + palavra. */
export function Marca({
  className,
  size = 30,
  claro,
  semSimbolo,
}: {
  className?: string
  size?: number
  /** Sobre fundo escuro. */
  claro?: boolean
  semSimbolo?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {semSimbolo ? null : <Simbolo size={size} />}
      <span
        className="font-display leading-none font-bold tracking-[-.02em]"
        style={{ fontSize: size * 0.72 }}
      >
        <span className={claro ? 'text-white' : 'text-navy'}>Nex</span>
        <span className="text-cyan">Envios</span>
      </span>
    </span>
  )
}
