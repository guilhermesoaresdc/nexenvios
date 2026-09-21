import 'server-only'

import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { z } from 'zod'
import { sql } from '@/db'
import { criarLog } from '@/lib/log'
import { ORIGEM } from '@/lib/site/origem'
import { DADOS_EVENTO, EVENTOS_META, META_PIXEL_ID } from './config'

const log = criarLog('meta-capi')
const idNavegador = z.string().regex(/^fb\.\d\.\d{13}\.[A-Za-z0-9_-]{1,500}$/)
export const esquemaEvento = z.object({
  event_name: z.enum(EVENTOS_META),
  event_id: z.string().uuid(),
  fbp: idNavegador.optional(),
  fbc: idNavegador.optional(),
}).strict()
export type EntradaMeta = z.infer<typeof esquemaEvento>

export function montarEvento(entrada: EntradaMeta, cabecalhos: Headers, agora = Date.now()) {
  const bruto = (cabecalhos.get('x-vercel-forwarded-for') ?? cabecalhos.get('x-forwarded-for') ?? '')
    .split(',')[0]?.trim() ?? ''
  return {
    event_name: entrada.event_name,
    event_id: entrada.event_id,
    event_time: Math.floor(agora / 1000),
    action_source: 'website',
    // Landing canônica, sem query string, dados de formulário ou páginas privadas.
    event_source_url: `${ORIGEM}/`,
    user_data: {
      ...(isIP(bruto) ? { client_ip_address: bruto } : {}),
      client_user_agent: (cabecalhos.get('user-agent') ?? '').slice(0, 500),
      ...(entrada.fbp ? { fbp: entrada.fbp } : {}),
      ...(entrada.fbc ? { fbc: entrada.fbc } : {}),
    },
    custom_data: DADOS_EVENTO[entrada.event_name],
  }
}

let cache: { valor: string; ate: number } | undefined
async function tokenServidor() {
  if (process.env.META_CAPI_ACCESS_TOKEN) return process.env.META_CAPI_ACCESS_TOKEN
  if (cache && cache.ate > Date.now()) return cache.valor
  const [linha] = await sql<{ decrypted_secret: string }[]>`
    SELECT decrypted_secret FROM vault.decrypted_secrets
    WHERE name = 'nex_meta_capi_access_token' LIMIT 1
  `
  if (!linha?.decrypted_secret) throw new Error('Meta CAPI não configurada')
  cache = { valor: linha.decrypted_secret, ate: Date.now() + 60000 }
  return cache.valor
}

/** Usa o contador temporário já existente, com prefixo próprio e IP em hash. */
export async function excedeuLimite(cabecalhos: Headers): Promise<boolean> {
  const ip = cabecalhos.get('x-vercel-forwarded-for') ?? cabecalhos.get('x-forwarded-for') ?? 'unknown'
  const chave = createHash('sha256').update(`meta:${ip.split(',')[0]?.trim() ?? 'unknown'}`).digest('hex')
  const [linha] = await sql<{ attempts: number }[]>`
    INSERT INTO auth_attempts (key, attempts, expires_at)
    VALUES (${chave}, 1, now() + interval '1 minute')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.expires_at <= now() THEN 1 ELSE auth_attempts.attempts + 1 END,
      expires_at = CASE WHEN auth_attempts.expires_at <= now() THEN now() + interval '1 minute' ELSE auth_attempts.expires_at END
    RETURNING attempts
  `
  return !linha || linha.attempts > 120
}

export async function enviarMeta(entrada: EntradaMeta, cabecalhos: Headers) {
  const token = await tokenServidor()
  const resposta = await fetch(`https://graph.facebook.com/v23.0/${META_PIXEL_ID}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [montarEvento(entrada, cabecalhos)],
      ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
    }),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  const resultado = await resposta.json() as {
    events_received?: number; fbtrace_id?: string; error?: { code?: number; error_subcode?: number }
  }
  if (!resposta.ok || resultado.events_received !== 1) {
    // Não registrar respostas integrais: podem conter dados e credenciais.
    log.warn('Evento recusado', { status: resposta.status, codigo: resultado.error?.code, subcodigo: resultado.error?.error_subcode })
    return { ok: false as const }
  }
  log.info('Evento recebido pela Meta', { evento: entrada.event_name, event_id: entrada.event_id })
  return { ok: true as const, events_received: 1 }
}
