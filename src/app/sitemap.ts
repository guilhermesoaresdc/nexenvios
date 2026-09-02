import type { MetadataRoute } from 'next'
import { DOCUMENTOS } from '@/lib/juridico/documentos'

/**
 * O mapa do site.
 *
 * Existe por causa dos documentos jurídicos: eles não são linkados de fora e
 * quase não recebem visita, então dependem de estar declarados para serem
 * encontrados — inclusive por quem confere uma conta de WhatsApp Business,
 * que precisa achar a política de privacidade sozinho.
 *
 * Só as páginas públicas. Painel, admin e API ficam de fora: exigem sessão, e
 * anunciá-los não ajuda ninguém.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const raiz = (process.env.APP_URL ?? 'https://nexenvios.com.br').replace(/\/$/, '')

  return [
    { url: raiz, changeFrequency: 'weekly', priority: 1 },
    ...DOCUMENTOS.map((d) => ({
      url: `${raiz}${d.rota}`,
      lastModified: new Date(`${d.atualizadoEm}T12:00:00-03:00`),
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    })),
  ]
}
