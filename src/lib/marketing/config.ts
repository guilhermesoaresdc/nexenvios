// O identificador do Pixel é público. O token da API nunca entra neste módulo.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '1897881374510392'
export const CONSENTIMENTO_COOKIE = 'nex_marketing'
export const EVENTO_CONSENTIMENTO = 'nex:marketing-consent'
export const EVENTOS_META = ['PageView', 'ViewContent', 'Lead', 'Contact'] as const
export type EventoMeta = (typeof EVENTOS_META)[number]
export const DADOS_EVENTO: Record<EventoMeta, Record<string, string>> = {
  PageView: {},
  ViewContent: { content_name: 'Formulario de proposta Nex Envios' },
  Lead: { content_name: 'Proposta Nex Envios', status: 'completed' },
  Contact: { content_name: 'WhatsApp Nex Envios' },
}

// Só atribuição de campanha. Nunca repassar parâmetros arbitrários, e-mails ou tokens.
export const PARAMETROS_CAMPANHA = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
] as const

export function urlFormulario(origem: string, slug: string, busca: string): string {
  const url = new URL(`/f/${slug}`, origem)
  url.searchParams.set('embed', 'container')
  const parametros = new URLSearchParams(busca)
  for (const nome of PARAMETROS_CAMPANHA) {
    const valor = parametros.get(nome)
    if (valor) url.searchParams.set(nome, valor.slice(0, 500))
  }
  return url.href
}

export function mensagemDoFormulario(
  evento: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  origem: string,
  janela: Window | null | undefined,
  slug: string,
): boolean {
  return !!janela && evento.source === janela && evento.origin === new URL(origem).origin &&
    !!evento.data && typeof evento.data === 'object' && evento.data.slug === slug
}
