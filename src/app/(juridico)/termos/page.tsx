import type { Metadata } from 'next'
import { PaginaJuridica } from '@/components/juridico/pagina'
import { TERMOS } from '@/lib/juridico/documentos'

/*
 * Estática e sem revalidação por tempo: o texto é constante do build. Uma nova
 * versão do documento é um deploy — e é assim que tem que ser, porque a data
 * de vigência e o que está no ar precisam contar a mesma história.
 */
export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: TERMOS.titulo,
  description: TERMOS.descricao,
  alternates: { canonical: TERMOS.rota },
  openGraph: {
    title: `${TERMOS.titulo} · Nex Envios`,
    description: TERMOS.descricao,
    type: 'article',
  },
  robots: { index: true, follow: true },
}

export default function Pagina() {
  return <PaginaJuridica documento={TERMOS} />
}
