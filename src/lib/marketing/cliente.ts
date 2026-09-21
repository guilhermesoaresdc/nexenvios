'use client'

import {
  CONSENTIMENTO_COOKIE, DADOS_EVENTO, EVENTO_CONSENTIMENTO, META_PIXEL_ID,
  type EventoMeta,
} from './config'

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: Fbq
  loaded: boolean
  version: string
}
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

export function lerCookie(nome: string): string | undefined {
  return document.cookie.split('; ').find((c) => c.startsWith(`${nome}=`))?.slice(nome.length + 1)
}

export function consentiu(): boolean {
  return lerCookie(CONSENTIMENTO_COOKIE) === 'granted'
}

function gravarCookie(nome: string, valor: string, dias: number) {
  document.cookie = `${nome}=${valor}; Path=/; Max-Age=${dias * 86400}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

export function escolherConsentimento(permitir: boolean) {
  gravarCookie(CONSENTIMENTO_COOKIE, permitir ? 'granted' : 'denied', 180)
  window.fbq?.('consent', permitir ? 'grant' : 'revoke')
  if (!permitir) {
    for (const nome of ['_fbp', '_fbc']) {
      gravarCookie(nome, '', 0)
      // O Pixel pode gravar no domínio pai, enquanto nossos cookies são host-only.
      const partes = location.hostname.split('.')
      for (let i = 0; i < partes.length - 1; i++) {
        document.cookie = `${nome}=; Path=/; Max-Age=0; Domain=.${partes.slice(i).join('.')}; SameSite=Lax`
      }
    }
  }
  window.dispatchEvent(new Event(EVENTO_CONSENTIMENTO))
}

let inicializado = false
function iniciarPixel() {
  if (inicializado) return
  if (!window.fbq) {
    const fila = function (...args: unknown[]) {
      if (fila.callMethod) fila.callMethod(...args)
      else fila.queue.push(args)
    } as Fbq
    fila.queue = []
    fila.push = fila
    fila.loaded = true
    fila.version = '2.0'
    window.fbq = fila
    window._fbq ??= fila
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }
  window.fbq('consent', 'grant')
  window.fbq('set', 'autoConfig', false, META_PIXEL_ID)
  window.fbq('init', META_PIXEL_ID)
  inicializado = true
}

function identificadores() {
  let fbp = lerCookie('_fbp')
  if (!fbp) {
    const numero = crypto.getRandomValues(new Uint32Array(1))[0]
    fbp = `fb.1.${Date.now()}.${numero}`
    gravarCookie('_fbp', fbp, 90)
  }
  let fbc = lerCookie('_fbc')
  const clique = new URLSearchParams(location.search).get('fbclid')
  if (clique && /^[A-Za-z0-9_-]{1,500}$/.test(clique) && !fbc?.endsWith(`.${clique}`)) {
    fbc = `fb.1.${Date.now()}.${clique}`
    gravarCookie('_fbc', fbc, 90)
  }
  return { fbp, fbc }
}

export function rastrear(evento: EventoMeta, eventId = crypto.randomUUID()): boolean {
  if (!consentiu()) return false
  // Só a landing pública; nunca coletar páginas de clientes ou da administração.
  if (location.pathname !== '/') return false
  if (!['www.nexenvios.com.br', 'nexenvios.com.br'].includes(location.hostname) &&
      process.env.NODE_ENV !== 'development') return false
  const ids = identificadores()
  iniciarPixel()
  window.fbq?.('trackSingle', META_PIXEL_ID, evento, DADOS_EVENTO[evento], { eventID: eventId })
  const corpo = JSON.stringify({ event_name: evento, event_id: eventId, ...ids })
  // Mesmo ID em ambos os canais e no retry: a Meta deduplica o par.
  const enviar = () => fetch('/api/marketing/meta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: corpo, keepalive: true, credentials: 'same-origin',
  })
  void enviar().then((r) => {
    if (r.status >= 500 && consentiu()) return enviar()
  }).catch(() => { /* Falha de marketing não interfere no formulário. */ })
  return true
}
