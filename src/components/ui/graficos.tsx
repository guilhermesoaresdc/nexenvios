import type { ReactNode } from 'react'
import { cn, numero } from '@/lib/ui'

/**
 * Os gráficos do painel, em SVG desenhado no servidor.
 *
 * Sem biblioteca de propósito: são duas formas — coluna empilhada e barra
 * horizontal — e qualquer pacote de gráfico mandaria dezenas de kB de
 * JavaScript ao navegador para posicionar retângulos que o servidor já sabe
 * posicionar. O `viewBox` cuida da responsividade e o `<title>` cuida da dica
 * de valor sem uma linha de estado.
 */

export const COR = {
  azul: '#0078f8',
  ciano: '#00b0f8',
  navy: '#002058',
  verde: '#25d366',
  ambar: '#d97706',
  vermelho: '#dc2626',
  cinza: '#9fb2d6',
} as const

// ────────────────────────────────────────────── série diária

export type PontoDaSerie = { dia: string; enviados: number; falhas: number }

const LARGURA = 780
const ALTURA = 236
const ESQ = 48
const DIR = 8
const TOPO = 14
const CHAO = 198

/** Um teto redondo (1, 2, 5 × potência de dez) para o eixo não ficar torto. */
function tetoBonito(valor: number): number {
  if (valor <= 5) return 5
  const escala = 10 ** Math.floor(Math.log10(valor))
  const passo = valor / escala
  const arredondado = passo <= 1 ? 1 : passo <= 2 ? 2 : passo <= 5 ? 5 : 10
  return Math.round(arredondado * escala)
}

function compacto(valor: number): string {
  if (valor < 1000) return numero(valor)
  if (valor < 1_000_000) {
    return `${(valor / 1000)
      .toFixed(valor < 10_000 ? 1 : 0)
      .replace('.', ',')
      .replace(/,0$/, '')} mil`
  }
  return `${(valor / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} mi`
}

/*
 * O dia vem como 'AAAA-MM-DD' e é fatiado como texto de propósito: passar por
 * `new Date` transformaria a data em meia-noite UTC e o fuso de São Paulo
 * puxaria o rótulo para o dia anterior.
 */
function pedacos(dia: string): { d: string; m: string; a: string } {
  const [a = '', m = '', d = ''] = dia.split('-')
  return { d, m, a }
}

function diaCurto(dia: string): string {
  const { d, m } = pedacos(dia)
  return `${d}/${m}`
}

function diaLongo(dia: string): string {
  const { d, m, a } = pedacos(dia)
  return `${d}/${m}/${a}`
}

export function SerieDiaria({ pontos, className }: { pontos: PontoDaSerie[]; className?: string }) {
  const teto = tetoBonito(Math.max(1, ...pontos.map((p) => p.enviados + p.falhas)))
  const quantos = Math.max(pontos.length, 1)
  const passo = (LARGURA - ESQ - DIR) / quantos
  const largura = Math.min(passo * 0.6, 16)
  const altura = (valor: number) => (valor / teto) * (CHAO - TOPO)
  const nivel = (fracao: number) => CHAO - fracao * (CHAO - TOPO)

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Legenda cor={COR.azul}>Enviados</Legenda>
        <Legenda cor={COR.vermelho}>Falhas</Legenda>
      </div>

      {/*
       * Trinta colunas não cabem legíveis num celular: o `viewBox` encolhe
       * tudo — inclusive as datas. Daí a largura mínima com rolagem lateral,
       * o mesmo acordo que a tabela do projeto faz.
       */}
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full min-w-[620px]"
          role="img"
          aria-label={`Envios e falhas por dia nos últimos ${pontos.length} dias`}
        >
          <defs>
            <linearGradient id="nex-serie-azul" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR.ciano} />
              <stop offset="100%" stopColor={COR.azul} />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((fracao) => (
            <g key={fracao}>
              <line
                x1={ESQ}
                y1={nivel(fracao)}
                x2={LARGURA - DIR}
                y2={nivel(fracao)}
                stroke="#dbe3f5"
                strokeWidth={1}
              />
              <text
                x={ESQ - 10}
                y={nivel(fracao)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[#5c6b8a] font-mono text-[11px]"
              >
                {compacto(Math.round(teto * fracao))}
              </text>
            </g>
          ))}

          {pontos.map((p, i) => {
            const centro = ESQ + passo * i + passo / 2
            const x = centro - largura / 2
            const hEnviados = p.enviados > 0 ? Math.max(altura(p.enviados), 2) : 0
            const hFalhas = p.falhas > 0 ? Math.max(altura(p.falhas), 2) : 0
            const marcarData = (pontos.length - 1 - i) % 7 === 0

            return (
              <g key={p.dia} className="group">
                <title>
                  {`${diaLongo(p.dia)} · ${numero(p.enviados)} enviados · ${numero(p.falhas)} falhas`}
                </title>

                <rect
                  x={ESQ + passo * i}
                  y={TOPO}
                  width={passo}
                  height={CHAO - TOPO}
                  fill={COR.azul}
                  className="opacity-0 transition-opacity group-hover:opacity-10"
                />

                {hEnviados > 0 ? (
                  <rect
                    x={x}
                    y={CHAO - hEnviados}
                    width={largura}
                    height={hEnviados}
                    rx={2}
                    fill="url(#nex-serie-azul)"
                  />
                ) : null}

                {hFalhas > 0 ? (
                  <rect
                    x={x}
                    y={CHAO - hEnviados - hFalhas}
                    width={largura}
                    height={hFalhas}
                    rx={2}
                    fill={COR.vermelho}
                  />
                ) : null}

                {marcarData ? (
                  <text
                    x={centro}
                    y={CHAO + 20}
                    textAnchor="middle"
                    className="fill-[#5c6b8a] font-mono text-[11px]"
                  >
                    {diaCurto(p.dia)}
                  </text>
                ) : null}

                {/* Alvo do ponteiro: o dia inteiro responde, não só a coluna. */}
                <rect
                  x={ESQ + passo * i}
                  y={TOPO}
                  width={passo}
                  height={CHAO - TOPO}
                  fill="transparent"
                />
              </g>
            )
          })}

          <line
            x1={ESQ}
            y1={CHAO}
            x2={LARGURA - DIR}
            y2={CHAO}
            stroke="#c7d3ea"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </div>
  )
}

export function Legenda({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[.78rem] font-semibold text-muted">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />
      {children}
    </span>
  )
}

// ───────────────────────────────────────── barras horizontais

export type LinhaDeBarra = {
  chave: string
  rotulo: string
  codigo?: string
  valor: number
  nota?: ReactNode
  cor?: string
}

/** Ranking em barras horizontais: rótulo à esquerda, número à direita. */
export function BarrasHorizontais({
  itens,
  className,
}: {
  itens: LinhaDeBarra[]
  className?: string
}) {
  const teto = Math.max(1, ...itens.map((i) => i.valor))

  return (
    <ul className={cn('space-y-4', className)}>
      {itens.map((item) => {
        const cor = item.cor ?? COR.azul
        // Uma fatia mínima visível: zero some, mas 3 envios em um milhão não.
        const largura = item.valor > 0 ? Math.max((item.valor / teto) * 100, 2) : 0

        return (
          <li key={item.chave}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />
                <span className="truncate text-[.88rem] font-semibold text-navy">
                  {item.rotulo}
                </span>
                {item.codigo ? (
                  <span className="shrink-0 font-mono text-[.66rem] tracking-[.1em] text-muted uppercase">
                    {item.codigo}
                  </span>
                ) : null}
              </span>
              <span className="tabular shrink-0 font-mono text-[.86rem] font-semibold text-navy">
                {numero(item.valor)}
              </span>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper-alt">
              <div
                className="h-full rounded-full"
                style={{ width: `${largura}%`, background: cor }}
              />
            </div>

            {item.nota ? <p className="mt-1.5 text-[.76rem] text-muted">{item.nota}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}
