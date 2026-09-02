import { describe, expect, it } from 'vitest'
import { canonizar } from '@/lib/site/origem'

/**
 * O host de onde saem os links absolutos.
 *
 * O defeito que isto existe para impedir é silencioso: o ápice
 * nexenvios.com.br responde 308 para o www, e um navegador segue o
 * redirecionamento sem que ninguém perceba. O robô do WhatsApp que busca a
 * `og:image`, não — ele desiste, e o link compartilhado sai sem imagem. Foi
 * assim que o problema apareceu: pela prévia vazia, não por um erro.
 */
describe('origem pública', () => {
  it('corrige o ápice para o www, que é quem responde 200', () => {
    expect(canonizar('https://nexenvios.com.br')).toBe('https://www.nexenvios.com.br')
    expect(canonizar('https://nexenvios.com.br/')).toBe('https://www.nexenvios.com.br')
  })

  it('deixa o www em paz', () => {
    expect(canonizar('https://www.nexenvios.com.br')).toBe('https://www.nexenvios.com.br')
  })

  it('não inventa www em outros domínios', () => {
    // Prévia da Vercel e desenvolvimento continuam valendo como estão.
    expect(canonizar('https://nexenvios.vercel.app')).toBe('https://nexenvios.vercel.app')
    expect(canonizar('http://localhost:3100')).toBe('http://localhost:3100')
  })

  it('tira a barra e o caminho — é origem, não endereço', () => {
    expect(canonizar('https://www.nexenvios.com.br/painel')).toBe('https://www.nexenvios.com.br')
  })

  it('APP_URL malformada cai no padrão em vez de derrubar a página', () => {
    expect(canonizar('isso-nao-e-url')).toBe('https://www.nexenvios.com.br')
    expect(canonizar('')).toBe('https://www.nexenvios.com.br')
  })
})
