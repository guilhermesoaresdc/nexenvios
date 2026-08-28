import type { Channel } from '@/db/schema/enums'

/**
 * A interface comum dos cinco canais.
 *
 * Trocar de provedor tem de ser trocar uma configuração na tela — nunca mexer
 * em código de fila ou de campanha. Por isso o adaptador não conhece banco,
 * organização nem ritmo: recebe um destino, um texto e credenciais, e devolve
 * um resultado. Toda decisão (jitter, janela de silêncio, rodízio de número)
 * acontece antes, em `lib/delivery`.
 */

export type Destino = {
  /** E.164 sem '+': 5511987654321. */
  para: string
  nome?: string | null
  corpo: string
  mediaUrl?: string | null
  mediaType?: string | null
  /** Botões (WhatsApp oficial e RCS). */
  botoes?: { texto: string; url?: string; payload?: string }[]
  /** Nome do template aprovado — obrigatório no WhatsApp oficial fora da janela de 24h. */
  templateName?: string | null
  /** Áudio pronto para o torpedo de voz. */
  audioUrl?: string | null
  /** Simula digitação antes de mandar (WhatsApp não oficial). */
  delayMs?: number
}

export const CODIGOS_ERRO = [
  'sem_credencial',
  'credencial_recusada',
  'destino_invalido',
  'sem_whatsapp',
  'limite_provedor',
  'instancia_desconectada',
  'bloqueado_pelo_destino',
  'template_recusado',
  'saldo_insuficiente',
  'provedor_indisponivel',
  'rede',
  'resposta_inesperada',
] as const

export type CodigoErro = (typeof CODIGOS_ERRO)[number]

export const ERRO_LABEL: Record<CodigoErro, string> = {
  sem_credencial: 'canal sem configuração',
  credencial_recusada: 'credencial recusada pelo provedor',
  destino_invalido: 'número inválido',
  sem_whatsapp: 'o número não tem WhatsApp',
  limite_provedor: 'limite do provedor atingido',
  instancia_desconectada: 'o número não está conectado',
  bloqueado_pelo_destino: 'o destinatário bloqueou o envio',
  template_recusado: 'o modelo não foi aprovado',
  saldo_insuficiente: 'sem saldo no provedor',
  provedor_indisponivel: 'o provedor não respondeu',
  rede: 'falha de rede',
  resposta_inesperada: 'resposta que não soubemos ler',
}

export type Resultado =
  | { ok: true; providerMessageId: string | null; provider: string }
  | {
      ok: false
      provider: string
      codigo: CodigoErro
      mensagem: string
      /** Erro passageiro merece nova tentativa; permanente, não. */
      reenviavel: boolean
      /** Alguns provedores mandam quanto esperar num 429. Respeitar é obrigatório. */
      esperarSegundos?: number
    }

export type Adaptador<Config = unknown> = {
  canal: Channel
  provider: string
  enviar: (destino: Destino, config: Config) => Promise<Resultado>
}

export const TIMEOUT_MS = 15_000

/** Erro de rede vira resultado, não exceção: quem chama trata um tipo só. */
export function falhaDeRede(provider: string, erro: unknown): Resultado {
  const abortado = erro instanceof Error && (erro.name === 'AbortError' || erro.name === 'TimeoutError')
  return {
    ok: false,
    provider,
    codigo: abortado ? 'provedor_indisponivel' : 'rede',
    mensagem: abortado ? 'o provedor não respondeu a tempo' : 'falha de rede ao falar com o provedor',
    reenviavel: true,
  }
}

export function semCredencial(provider: string): Resultado {
  return {
    ok: false,
    provider,
    codigo: 'sem_credencial',
    mensagem: 'o canal não está configurado',
    reenviavel: false,
  }
}

export async function pedir(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

export function postJson(
  url: string,
  corpo: unknown,
  cabecalhos: Record<string, string> = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  return pedir(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
    },
    timeoutMs,
  )
}

/**
 * Lê o corpo sem estourar quando não é JSON.
 *
 * Provedor fora do ar devolve HTML de erro do balanceador, e um `JSON.parse`
 * cru transformaria "provedor caiu" numa exceção de mensagem inútil.
 */
export async function lerJson(resposta: Response): Promise<unknown> {
  const texto = await resposta.text()
  if (texto.trim() === '') return null
  try {
    return JSON.parse(texto)
  } catch {
    return { _texto: texto.slice(0, 500) }
  }
}

export function pegar(obj: unknown, caminho: string): unknown {
  if (!caminho) return undefined
  let atual: unknown = obj
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object') return undefined
    atual = (atual as Record<string, unknown>)[parte]
  }
  return atual
}
