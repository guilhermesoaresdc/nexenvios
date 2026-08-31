import { describe, expect, it } from 'vitest'
import {
  BONS,
  conferirNomeDePerfil,
  REGRAS,
  TAMANHO_MAXIMO,
  TAMANHO_MINIMO,
} from '@/lib/channels/nome-perfil'

/**
 * O validador contra a própria lista de exemplos deles.
 *
 * Os casos não são inventados: são exatamente os nomes que a página de regras
 * do Monitor mostra como bons e como recusados. Se eles mudarem a régua e a
 * gente não acompanhar, é aqui que quebra — que é melhor do que descobrir com
 * a campanha travada no meio do disparo.
 */

describe('nome de perfil', () => {
  it('aprova todos os exemplos bons da página deles', () => {
    for (const nome of BONS) {
      expect(conferirNomeDePerfil(nome), `"${nome}" deveria passar`).toMatchObject({ ok: true })
    }
  })

  it('recusa todos os exemplos ruins, pela regra certa', () => {
    for (const regra of REGRAS) {
      for (const nome of regra.ruins) {
        const veredito = conferirNomeDePerfil(nome)
        expect(veredito.ok, `"${nome}" deveria ser recusado`).toBe(false)
        if (veredito.ok) continue
        expect(veredito.regra, `"${nome}" caiu na regra errada`).toBe(regra.id)
      }
    }
  })

  it('pega "bet" colado, que é o que mais escapa', () => {
    for (const nome of ['Turbobet', 'Betzone', 'Alfa Bet', 'Casa Betmania']) {
      const v = conferirNomeDePerfil(nome)
      expect(v.ok).toBe(false)
      if (!v.ok) expect(v.regra).toBe('bet')
    }
  })

  it('pega "pix" colado', () => {
    for (const nome of ['Turbopix', 'PixFacil', 'Pixluz']) {
      const v = conferirNomeDePerfil(nome)
      expect(v.ok).toBe(false)
      if (!v.ok) expect(v.regra).toBe('promessa')
    }
  })

  it('genérico só reprova quando o nome inteiro é genérico', () => {
    // "Central de Vendas" é tudo genérico.
    expect(conferirNomeDePerfil('Central de Vendas').ok).toBe(false)
    // "Loja Bellini" tem uma palavra genérica e um nome próprio: passa.
    expect(conferirNomeDePerfil('Loja Bellini')).toMatchObject({ ok: true })
  })

  it('respeita o tamanho de 3 a 20', () => {
    expect(conferirNomeDePerfil('Ab').ok).toBe(false)
    expect(conferirNomeDePerfil('a'.repeat(TAMANHO_MAXIMO + 1)).ok).toBe(false)
    expect(conferirNomeDePerfil('a'.repeat(TAMANHO_MINIMO))).toMatchObject({ ok: true })
  })

  it('recusa código, número, site e emoji', () => {
    for (const nome of ['Promo 84213', 'Kt429wq Com', 'loja.com.br', 'Silva 🎉', 'R$ Facil']) {
      expect(conferirNomeDePerfil(nome).ok, `"${nome}"`).toBe(false)
    }
  })

  it('aceita acento, hífen e & — nome de empresa tem isso', () => {
    for (const nome of ['Ótica Bellini', 'Casa & Cia', 'Auto Peças Kruger', 'Vila-Nova Móveis']) {
      expect(conferirNomeDePerfil(nome), `"${nome}"`).toMatchObject({ ok: true })
    }
  })

  it('não confunde palavra que contém um verbo de ação', () => {
    // "Gancho" contém "ganh", mas não é "ganhe": ação casa palavra inteira.
    expect(conferirNomeDePerfil('Gancho Azul')).toMatchObject({ ok: true })
  })
})
