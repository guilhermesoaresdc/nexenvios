import { alt, contentType, imagemDeCompartilhamento, size } from '@/lib/site/og'

/*
 * A rota é casca: a arte vive em `lib/site/og` porque precisa valer também
 * para as páginas jurídicas, que têm a sua própria rota de imagem.
 */
export { alt, contentType, size }

export default function Imagem() {
  return imagemDeCompartilhamento()
}
