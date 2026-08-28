import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Junta classes e resolve conflito do Tailwind (o último vence). */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas))
}

const REAL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const NUMERO = new Intl.NumberFormat('pt-BR')

export function moeda(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  return REAL.format(Number.isFinite(n) ? n : 0)
}

export function numero(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  return NUMERO.format(Number.isFinite(n) ? n : 0)
}

export function porcento(parte: number, total: number, casas = 1): string {
  if (!total) return '0%'
  return `${((parte / total) * 100).toFixed(casas).replace('.', ',')}%`
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})
const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function dataHora(valor: Date | string | null | undefined): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? '—' : DATA_HORA.format(d)
}

export function data(valor: Date | string | null | undefined): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? '—' : DATA.format(d)
}

/** "há 3 minutos", "em 2 horas". */
export function quando(valor: Date | string | null | undefined): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'

  const delta = d.getTime() - Date.now()
  const abs = Math.abs(delta)
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  if (abs < 60_000) return delta < 0 ? 'agora mesmo' : 'em instantes'
  if (abs < 3_600_000) return rtf.format(Math.round(delta / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(delta / 3_600_000), 'hour')
  if (abs < 2_592_000_000) return rtf.format(Math.round(delta / 86_400_000), 'day')
  return dataHora(d)
}

/** Duração legível: "2 h 14 min". */
export function duracao(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`
}

/** Um identificador legível para URL. */
export function apelido(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
