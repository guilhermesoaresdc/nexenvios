import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Pixel e API no navegador', () => {
  const fbq = vi.fn()
  const cookies = new Map<string, string>()
  beforeEach(() => {
    vi.resetModules()
    fbq.mockReset()
    cookies.clear()
    const documento = {
      get cookie() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      set cookie(valor: string) {
        const [par = ''] = valor.split(';')
        const igual = par.indexOf('=')
        const nome = par.slice(0, igual)
        if (valor.includes('Max-Age=0')) cookies.delete(nome)
        else cookies.set(nome, par.slice(igual + 1))
      },
    }
    vi.stubGlobal('document', documento)
    vi.stubGlobal('window', { fbq, dispatchEvent: vi.fn() })
    vi.stubGlobal('location', { hostname: 'www.nexenvios.com.br', pathname: '/', search: '?fbclid=Click123', protocol: 'https:' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('não inicializa o Pixel nem chama a API sem aceite', async () => {
    const { rastrear } = await import('@/lib/marketing/cliente')
    expect(rastrear('PageView')).toBe(false)
    expect(fbq).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('deduplica pelo mesmo event_id e conserva fbp/fbc nos dois eventos', async () => {
    cookies.set('nex_marketing', 'granted')
    const { rastrear } = await import('@/lib/marketing/cliente')
    const id = '12f1fb61-33d2-4131-8914-580ff2936dcb'
    expect(rastrear('Lead', id)).toBe(true)
    expect(fbq).toHaveBeenCalledWith('trackSingle', '1897881374510392', 'Lead', expect.any(Object), { eventID: id })
    const primeira = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string)
    expect(primeira.event_id).toBe(id)
    expect(primeira.fbc).toMatch(/^fb\.1\.\d{13}\.Click123$/)
    rastrear('Contact')
    const segunda = JSON.parse(vi.mocked(fetch).mock.calls[1]?.[1]?.body as string)
    expect(segunda.fbp).toBe(primeira.fbp)
    expect(segunda.fbc).toBe(primeira.fbc)
  })
  it('revoga os dois canais e remove cookies de publicidade', async () => {
    cookies.set('nex_marketing', 'granted')
    cookies.set('_fbp', 'fb.1.1789999999000.123')
    const { escolherConsentimento, rastrear } = await import('@/lib/marketing/cliente')
    escolherConsentimento(false)
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke')
    expect(cookies.has('_fbp')).toBe(false)
    expect(rastrear('Lead')).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('não envia eventos das páginas privadas', async () => {
    cookies.set('nex_marketing', 'granted')
    vi.stubGlobal('location', { hostname: 'www.nexenvios.com.br', pathname: '/admin' })
    const { rastrear } = await import('@/lib/marketing/cliente')
    expect(rastrear('PageView')).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
