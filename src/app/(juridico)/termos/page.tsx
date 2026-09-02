import type { Metadata } from 'next'
import { PaginaJuridica } from '@/components/juridico/pagina'
import { TERMOS } from '@/lib/juridico/documentos'

/*
 * Estática, mas revalidando uma vez por dia.
 *
 * O texto é constante do build — uma nova versão do documento é um deploy, e é
 * assim que tem que ser, porque a data de vigência e o que está no ar precisam
 * contar a mesma história. O que NÃO é constante é o ano do © no rodapé:
 * com `force-static` ele ficava preso no ano do último deploy, e um aviso de
 * copyright desatualizado num documento jurídico é o tipo de descuido que
 * quem lê nota. Um dia é curto para o ano virar e longo para não custar nada.
 */
export const revalidate = 86400

export const metadata: Metadata = {
  title: TERMOS.titulo,
  description: TERMOS.descricao,
  alternates: { canonical: TERMOS.rota },
  /*
   * O `openGraph` da página SUBSTITUI o da raiz — não soma. Descobrimos pelo
   * HTML de produção: com só `title`, `description` e `type` aqui, estas duas
   * páginas iam para o ar sem `og:image`, sem `og:url` e sem `og:site_name`,
   * enquanto a home tinha os três. Quem manda o link da política no WhatsApp
   * via um cartão pelado. O que a raiz define e vale aqui, repete-se aqui.
   *
   * A imagem é apontada à mão, e não deixada por conta do arquivo
   * `opengraph-image`: a convenção do Next resolve por segmento e NÃO alcança
   * uma página que declara o próprio `openGraph`. Tentar pela convenção rendeu
   * uma segunda rota de imagem gerada e as páginas ainda sem `og:image` —
   * conferido no HTML. Um caminho explícito não depende de adivinhar a regra.
   */
  openGraph: {
    title: `${TERMOS.titulo} · Nex Envios`,
    description: TERMOS.descricao,
    url: TERMOS.rota,
    images: ['/opengraph-image'],
    type: 'article',
    locale: 'pt_BR',
    siteName: 'Nex Envios',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TERMOS.titulo} · Nex Envios`,
    description: TERMOS.descricao,
    images: ['/opengraph-image'],
  },
  robots: { index: true, follow: true },
}

export default function Pagina() {
  return <PaginaJuridica documento={TERMOS} />
}
