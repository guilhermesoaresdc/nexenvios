import { ImageResponse } from 'next/og'

/**
 * A imagem que aparece quando alguém manda o link.
 *
 * O site não tinha `og:image` nenhum — conferido no HTML de produção. Por
 * isso a prévia do WhatsApp saía só com título e descrição, num retângulo
 * vazio onde deveria estar a marca. E link comercial vive de ser mandado:
 * a primeira impressão da Nex Envios acontece dentro da conversa de outra
 * pessoa, antes de qualquer clique.
 *
 * Gerada no build, e não commitada como PNG: o repositório não tem binário
 * (a marca é SVG pelo mesmo motivo), e uma imagem gerada do mesmo código não
 * envelhece separada da identidade.
 */

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Nex Envios — disparos em massa por WhatsApp, SMS, RCS e voz'

/*
 * Sem fonte customizada de propósito.
 *
 * Space Grotesk só entraria aqui baixando o arquivo da fonte durante o
 * build. Isso troca uma imagem bonita por um build que depende do Google
 * estar no ar — e por um deploy que falha por um motivo que ninguém vai
 * adivinhar. A marca já carrega a identidade; o resto é legibilidade.
 */
export default function Imagem() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '38px',
          padding: '64px',
          backgroundColor: '#002058',
          backgroundImage:
            'radial-gradient(900px 620px at 50% -10%, rgba(0,176,248,.30), transparent 62%), radial-gradient(900px 700px at 50% 115%, rgba(0,120,248,.34), transparent 60%)',
          color: '#ffffff',
        }}
      >
        {/*
          Tudo centralizado, e não alinhado à esquerda como na landing.
          O WhatsApp mostra esta imagem inteira no cartão grande, mas recorta
          um QUADRADO CENTRAL na versão compacta — e num recorte desses a
          marca no canto superior esquerdo simplesmente não aparece. Composição
          centralizada sobrevive aos dois formatos.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <svg width="78" height="78" viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="f" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0b3a8f" />
                <stop offset="1" stopColor="#0078f8" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="16" fill="url(#f)" />
            <path d="M18 45V19h6.2l13.6 16.4V19H44v26h-6.2L24.2 28.6V45H18Z" fill="#fff" />
            <path
              d="M48 24h8M48 32h6M48 40h8"
              stroke="#00b0f8"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div
            style={{ display: 'flex', fontSize: '56px', fontWeight: 700, letterSpacing: '-1.5px' }}
          >
            <span style={{ color: '#ffffff' }}>Nex</span>
            <span style={{ color: '#00b0f8' }}>Envios</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            maxWidth: '940px',
            fontSize: '62px',
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: '-1.8px',
            textAlign: 'center',
          }}
        >
          Cinco canais. Uma única operação de disparo.
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {['WhatsApp', 'SMS', 'RCS', 'Voz'].map((canal) => (
            <div
              key={canal}
              style={{
                display: 'flex',
                padding: '11px 26px',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,.26)',
                backgroundColor: 'rgba(255,255,255,.09)',
                fontSize: '27px',
                fontWeight: 600,
                color: '#dbe6fb',
              }}
            >
              {canal}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
