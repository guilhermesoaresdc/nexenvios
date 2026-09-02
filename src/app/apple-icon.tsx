import { ImageResponse } from 'next/og'

/**
 * O ícone que o iOS usa quando alguém salva o site na tela de início.
 *
 * Existia como `apple-icon.svg` e não fazia nada: a convenção do Next aceita
 * png, jpg e jpeg — não SVG. O arquivo estava no repositório, com a marca
 * desenhada certinho, e nenhuma tag `apple-touch-icon` chegava ao HTML.
 * Quem salvasse o site no iPhone ficava com o retângulo cinza de captura de
 * tela no lugar do logotipo.
 *
 * Gerado, e não commitado como PNG, pela mesma razão da imagem de
 * compartilhamento: a marca já é vetor no repositório e não vale a pena ter
 * um bitmap para envelhecer sozinho.
 */

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function Icone() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          /*
           * Fundo cheio, sem canto arredondado nosso: o iOS aplica a própria
           * máscara por cima, e um canto redondo dentro de outro deixa uma
           * borda escura em volta do ícone.
           */
          backgroundImage: 'linear-gradient(135deg, #002058 0%, #0078f8 100%)',
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64" fill="none">
          <path d="M18 45V19h6.2l13.6 16.4V19H44v26h-6.2L24.2 28.6V45H18Z" fill="#fff" />
          <path
            d="M48 24h8M48 32h6M48 40h8"
            stroke="#00b0f8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  )
}
