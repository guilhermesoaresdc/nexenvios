/**
 * A leitura da planilha, ou do que a pessoa colou.
 *
 * Roda no NAVEGADOR. Subir cem mil linhas para o servidor só para descobrir
 * que metade é inválida é caro e lento; e o erro por linha só é útil se vier
 * com a linha ORIGINAL, para a pessoa achar no Excel. Depois de conferir, só
 * os números já normalizados sobem, em lotes.
 *
 * Mora fora da tela de importação porque agora há dois lugares que leem a
 * mesma coisa — a importação de planilha e a caixa de colar números. Duas
 * cópias divergiriam justamente na normalização, que é o que decide se a
 * mensagem chega.
 */

import { normalizarTelefone } from '@/lib/telefone'

const CABECALHOS_TELEFONE = [
  'telefone',
  'celular',
  'whatsapp',
  'fone',
  'numero',
  'número',
  'number',
  'phone',
  'msisdn',
  'tel',
]
const CABECALHOS_NOME = ['nome', 'name', 'contato', 'cliente', 'razao', 'razão']

export const MOTIVO: Record<string, string> = {
  vazio: 'sem número',
  curto: 'dígitos de menos',
  longo: 'dígitos demais',
  ddd: 'DDD que não existe',
  formato: 'não parece um telefone',
  repetido: 'repetido na planilha',
}

export type Valida = { telefone: string; nome: string | null; linha: number }
export type Recusada = { original: string; motivo: string; linha: number }

function separar(linha: string): string[] {
  // Ponto-e-vírgula primeiro: é o separador que o Excel brasileiro usa.
  const sep = linha.includes(';') ? ';' : linha.includes('\t') ? '\t' : ','
  return linha.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
}

export function ler(texto: string): { validas: Valida[]; recusadas: Recusada[]; total: number } {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (linhas.length === 0) return { validas: [], recusadas: [], total: 0 }

  const primeira = separar(linhas[0]!).map((c) => c.toLowerCase())
  const temCabecalho = primeira.some(
    (c) => CABECALHOS_TELEFONE.includes(c) || CABECALHOS_NOME.includes(c),
  )

  let colTelefone = 0
  let colNome = -1
  if (temCabecalho) {
    colTelefone = primeira.findIndex((c) => CABECALHOS_TELEFONE.includes(c))
    colNome = primeira.findIndex((c) => CABECALHOS_NOME.includes(c))
    if (colTelefone < 0) colTelefone = 0
  }

  const validas: Valida[] = []
  const recusadas: Recusada[] = []
  const vistos = new Set<string>()

  for (let i = temCabecalho ? 1 : 0; i < linhas.length; i += 1) {
    const numeroDaLinha = i + 1
    const colunas = separar(linhas[i]!)
    const bruto = colunas[colTelefone] ?? ''
    const nome = colNome >= 0 ? (colunas[colNome] ?? null) : (colunas[1] ?? null)

    const norm = normalizarTelefone(bruto)
    if (!norm.ok) {
      recusadas.push({ original: linhas[i]!.slice(0, 60), motivo: norm.motivo, linha: numeroDaLinha })
      continue
    }
    if (vistos.has(norm.e164)) {
      recusadas.push({ original: linhas[i]!.slice(0, 60), motivo: 'repetido', linha: numeroDaLinha })
      continue
    }
    vistos.add(norm.e164)
    validas.push({ telefone: norm.e164, nome: nome?.trim() || null, linha: numeroDaLinha })
  }

  return { validas, recusadas, total: linhas.length - (temCabecalho ? 1 : 0) }
}
