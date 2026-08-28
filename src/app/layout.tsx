import type { Metadata, Viewport } from 'next'
import { Inter, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'

/**
 * As três fontes da identidade: Space Grotesk nos títulos, Inter no texto,
 * IBM Plex Mono nos números e códigos. Carregadas pelo `next/font` para não
 * depender do Google em tempo de execução — e para não vazar o IP de quem
 * visita para um terceiro.
 */

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'https://nexenvios.com.br'),
  title: {
    default: 'Nex Envios — Disparos em Massa que Geram Resultado',
    template: '%s · Nex Envios',
  },
  description:
    'WhatsApp Oficial, API não oficial, SMS, RCS e Torpedo de Voz. Mais de 100 milhões de mensagens entregues. Estratégia de disparo para Corban, iGaming e campanhas em escala.',
  openGraph: {
    title: 'Nex Envios — Disparos em Massa que Geram Resultado',
    description:
      'WhatsApp Oficial, API não oficial, SMS, RCS e Torpedo de Voz em uma única operação de disparo.',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Nex Envios',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#002058',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
