import { formatarTelefone } from './telefone'

/**
 * Compilação da mensagem: variáveis, spintax e contagem de segmentos.
 *
 * Roda tanto no servidor (na hora de materializar os envios) quanto no cliente
 * (na prévia). Por isso não importa nada de `node:` nem toca no banco.
 */

export type VariaveisDoContato = {
  nome?: string | null
  primeiroNome?: string | null
  telefone?: string | null
  email?: string | null
  [chave: string]: unknown
}

/** As variáveis que a tela oferece por padrão, com o exemplo que aparece na prévia. */
export const VARIAVEIS_PADRAO = [
  { chave: 'nome', rotulo: 'Nome completo', exemplo: 'Maria Aparecida Souza' },
  { chave: 'primeiro_nome', rotulo: 'Primeiro nome', exemplo: 'Maria' },
  { chave: 'telefone', rotulo: 'Telefone', exemplo: '(11) 98765-4321' },
  { chave: 'email', rotulo: 'E-mail', exemplo: 'maria@exemplo.com.br' },
  { chave: 'saudacao', rotulo: 'Bom dia / Boa tarde / Boa noite', exemplo: 'Boa tarde' },
] as const

export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim()
  if (!limpo) return ''
  const parte = limpo.split(/\s+/)[0] ?? ''
  // "MARIA" numa mensagem parece grito; "maria" parece desleixo.
  return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase()
}

export function saudacaoDaHora(hora: number): string {
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Spintax: `{oi|olá|e aí}` sorteia uma das opções.
 *
 * Serve para que 10 mil mensagens não sejam 10 mil cópias idênticas — o que
 * filtro antisspam de operadora e do WhatsApp usam como sinal. Aceita
 * aninhamento: `{bom {dia|fim de semana}|olá}`.
 */
export function resolverSpintax(texto: string, sorteio: () => number = Math.random): string {
  let atual = texto
  // Resolve de dentro para fora: o regex casa só grupos sem chave interna.
  const grupo = /\{([^{}]*)\}/
  let voltas = 0
  while (grupo.test(atual)) {
    // Trava contra texto malformado: sem ela, `{a` num corpo de 100 mil
    // mensagens viraria laço infinito no meio de um disparo.
    if (voltas > 200) break
    voltas += 1
    atual = atual.replace(grupo, (_todo, dentro: string) => {
      const opcoes = dentro.split('|')
      if (opcoes.length === 1) return opcoes[0] ?? ''
      return opcoes[Math.floor(sorteio() * opcoes.length)] ?? opcoes[0] ?? ''
    })
  }
  return atual
}

/** Quantas variantes distintas o spintax pode produzir. A tela mostra isso. */
export function contarVariantes(texto: string): number {
  let total = 1
  const grupos = texto.match(/\{[^{}]*\}/g) ?? []
  for (const g of grupos) {
    const n = g.slice(1, -1).split('|').length
    if (n > 1) total *= n
  }
  return total
}

/** Troca `{{variavel}}` pelo valor. O que não existir vira string vazia. */
export function aplicarVariaveis(texto: string, valores: VariaveisDoContato): string {
  return texto.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_todo, chave: string) => {
    const bruto = valores[chave]
    if (bruto === null || bruto === undefined) return ''
    return String(bruto)
  })
}

export type ContextoDaMensagem = {
  nome?: string | null
  telefone?: string | null
  email?: string | null
  atributos?: Record<string, unknown>
  hora?: number
}

/** O caminho completo: variáveis primeiro, spintax depois. */
export function compilarMensagem(
  modelo: string,
  ctx: ContextoDaMensagem,
  sorteio: () => number = Math.random,
): string {
  const valores: VariaveisDoContato = {
    nome: ctx.nome ?? '',
    primeiro_nome: primeiroNome(ctx.nome),
    telefone: ctx.telefone ? formatarTelefone(ctx.telefone) : '',
    email: ctx.email ?? '',
    saudacao: saudacaoDaHora(ctx.hora ?? new Date().getHours()),
    ...(ctx.atributos ?? {}),
  }
  return resolverSpintax(aplicarVariaveis(modelo, valores), sorteio).trim()
}

/** Nomes das variáveis usadas no texto — a tela avisa quando falta uma. */
export function variaveisUsadas(texto: string): string[] {
  const achadas = texto.match(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g) ?? []
  return [...new Set(achadas.map((v) => v.replace(/[{}\s]/g, '')))]
}

// ───────────────────────────────────────────────────── contagem de SMS

/**
 * Alfabeto GSM 03.38. Um SMS só é de 160 caracteres se TODO ele couber aqui;
 * um único "ã" fora da tabela derruba o limite para 70 (UCS-2) e triplica o
 * custo de uma campanha grande sem aviso.
 */
const GSM_BASICO =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
// Estes ocupam DOIS caracteres cada, mesmo sendo um símbolo só.
const GSM_ESTENDIDO = '^{}\\[~]|€'

export type MedidaDoSms = {
  caracteres: number
  /** Unidades cobradas: o estendido conta por dois. */
  unidades: number
  alfabeto: 'gsm' | 'unicode'
  segmentos: number
  /** Quanto ainda cabe no segmento atual. */
  restam: number
  /** Caracteres que forçaram o unicode — a tela mostra quais para trocar. */
  forcaramUnicode: string[]
}

export function medirSms(texto: string): MedidaDoSms {
  let unidades = 0
  let unicode = false
  const culpados = new Set<string>()

  for (const ch of texto) {
    if (GSM_BASICO.includes(ch)) unidades += 1
    else if (GSM_ESTENDIDO.includes(ch)) unidades += 2
    else {
      unicode = true
      culpados.add(ch)
    }
  }

  const caracteres = [...texto].length
  if (unicode) {
    const porSegmento = caracteres <= 70 ? 70 : 67
    const segmentos = Math.max(1, Math.ceil(caracteres / porSegmento))
    return {
      caracteres,
      unidades: caracteres,
      alfabeto: 'unicode',
      segmentos,
      restam: segmentos * porSegmento - caracteres,
      forcaramUnicode: [...culpados].slice(0, 12),
    }
  }

  const porSegmento = unidades <= 160 ? 160 : 153
  const segmentos = Math.max(1, Math.ceil(unidades / porSegmento))
  return {
    caracteres,
    unidades,
    alfabeto: 'gsm',
    segmentos,
    restam: segmentos * porSegmento - unidades,
    forcaramUnicode: [],
  }
}

/** Troca acento por letra sem acento, para caber no GSM sem virar unicode. */
export function tirarAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
