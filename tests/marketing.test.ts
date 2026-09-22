import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mensagemDoFormulario, urlFormulario } from '@/lib/marketing/config'
import { montarEvento, esquemaEvento } from '@/lib/marketing/servidor'
import * as servidor from '@/lib/marketing/servidor'

vi.mock('@/db', () => ({ sql: vi.fn() }))

describe('atribuição e isolamento do formulário', () => {
  it('repassa apenas UTMs e conserva o modo de embed', () => {
    const url = new URL(urlFormulario('https://crm.hediz.com', 'nex-envios-site-7q4zd',
      '?utm_source=facebook&utm_campaign=capta%C3%A7%C3%A3o&token=segredo&email=a@example.com&embed=lp'))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      embed: 'container', utm_source: 'facebook', utm_campaign: 'captação',
    })
  })
  it('recusa mensagens de outras janelas, origens e fluxos', () => {
    const janela = {} as Window
    const evento = { origin: 'https://crm.hediz.com', source: janela, data: { slug: 'nex' } }
    expect(mensagemDoFormulario(evento, evento.origin, janela, 'nex')).toBe(true)
    expect(mensagemDoFormulario({ ...evento, source: {} as Window }, evento.origin, janela, 'nex')).toBe(false)
    expect(mensagemDoFormulario({ ...evento, origin: 'https://outro.test' }, evento.origin, janela, 'nex')).toBe(false)
    expect(mensagemDoFormulario(evento, evento.origin, janela, 'outro')).toBe(false)
    expect(mensagemDoFormulario({ ...evento, data: null }, evento.origin, janela, 'nex')).toBe(false)
  })
})

const entrada = {
  event_name: 'Lead' as const,
  event_id: '12f1fb61-33d2-4131-8914-580ff2936dcb',
  fbp: 'fb.1.1789999999000.123456789',
  fbc: 'fb.1.1789999999000.clique_Meta123',
}

describe('payload da API de Conversões', () => {
  it('preserva o event_id e usa somente dados técnicos permitidos', () => {
    const headers = new Headers({ 'user-agent': 'NexTest/1', 'x-vercel-forwarded-for': '203.0.113.4',
      'x-forwarded-for': '198.51.100.1', referer: 'https://www.nexenvios.com.br/?email=segredo' })
    const evento = montarEvento(entrada, headers, 1790000000123)
    expect(evento.event_id).toBe(entrada.event_id)
    expect(evento.event_time).toBe(1790000000)
    expect(evento.event_source_url).toBe('https://www.nexenvios.com.br/')
    expect(evento.user_data).toEqual({ client_ip_address: '203.0.113.4', client_user_agent: 'NexTest/1', fbp: entrada.fbp, fbc: entrada.fbc })
    expect(JSON.stringify(evento)).not.toContain('segredo')
  })
  it('recusa compra inventada, PII arbitrária, URLs e cookies malformados', () => {
    expect(esquemaEvento.safeParse(entrada).success).toBe(true)
    for (const extra of [{ event_name: 'Purchase' }, { email: 'a@example.com' },
      { event_source_url: 'https://outro.test' }, { fbp: 'invalido' }, { event_id: 'id' }]) {
      expect(esquemaEvento.safeParse({ ...entrada, ...extra }).success).toBe(false)
    }
    expect(montarEvento(entrada, new Headers({ 'x-forwarded-for': 'malformado' })).user_data).not.toHaveProperty('client_ip_address')
  })
})

describe('controle da rota pública', () => {
  beforeEach(() => vi.restoreAllMocks())
  async function chamar(headers: Record<string, string>, body: unknown = entrada) {
    const { POST } = await import('@/app/api/marketing/meta/route')
    return POST(new NextRequest('https://www.nexenvios.com.br/api/marketing/meta', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'NexTest/1', ...headers },
      body: JSON.stringify(body),
    }))
  }
  it('não envia eventos de navegação antes do aceite ou após recusa', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    for (const cookie of ['', 'nex_marketing=denied']) {
      for (const event_name of ['PageView', 'ViewContent', 'Contact']) {
        expect((await chamar({ origin: 'https://www.nexenvios.com.br', cookie }, { ...entrada, event_name })).status).toBe(204)
      }
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(['', 'nex_marketing=denied'])('aceita Lead e remove identificadores de cookies sem aceite (%s)', async (cookie) => {
    vi.spyOn(servidor, 'excedeuLimite').mockResolvedValue(false)
    const enviar = vi.spyOn(servidor, 'enviarMeta').mockResolvedValue({ ok: true, events_received: 1 })
    const resposta = await chamar({ origin: 'https://www.nexenvios.com.br', cookie })
    expect(resposta.status).toBe(200)
    expect(enviar).toHaveBeenCalledWith({ event_name: 'Lead', event_id: entrada.event_id }, expect.any(Headers))
  })
  it('preserva identificadores para deduplicação e atribuição quando há aceite', async () => {
    vi.spyOn(servidor, 'excedeuLimite').mockResolvedValue(false)
    const enviar = vi.spyOn(servidor, 'enviarMeta').mockResolvedValue({ ok: true, events_received: 1 })
    expect((await chamar({ origin: 'https://www.nexenvios.com.br', cookie: 'nex_marketing=granted' })).status).toBe(200)
    expect(enviar).toHaveBeenCalledWith(entrada, expect.any(Headers))
  })
  it('recusa origens externas e payloads inválidos antes de acessar credenciais', async () => {
    expect((await chamar({ origin: 'https://externo.test', cookie: 'nex_marketing=granted' })).status).toBe(403)
    expect((await chamar({ origin: 'https://www.nexenvios.com.br', cookie: 'nex_marketing=granted' }, { ...entrada, event_name: 'Purchase' })).status).toBe(400)
  })
})
