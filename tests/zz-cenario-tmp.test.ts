import { describe, expect, it } from 'vitest'
import { lerMarkdown, textoCorrido } from '@/lib/juridico/markdown'

const mostrar = (s: string) => JSON.stringify(lerMarkdown(s), null, 1)

describe('cenarios do revisor', () => {
  it('(a) h4', () => { console.log('A:', mostrar('#### 4.1.2 Subitem juridico')) ; expect(1).toBe(1) })
  it('(b) enfase', () => { console.log('B:', mostrar('Texto com *enfase* e ***forte enfase*** e ~~riscado~~.')) })
  it('(c) sub-alinea', () => { console.log('C:', mostrar('- alinea a;\n  - sub-alinea a.1;\n  - sub-alinea a.2;\n- alinea b.')) })
  it('(d) citacao', () => { console.log('D:', mostrar('> citacao')) })
  it('(e) ol nao comeca em 1', () => { console.log('E:', mostrar('3. terceiro\n4. quarto')) })
})

/* O ponto que decide: a suite de FIDELIDADE existente pega esses casos? */
describe('a suite de fidelidade existente, aplicada aos casos hipoteticos', () => {
  const perdidas = (fonte: string) => {
    const rendido = textoCorrido(lerMarkdown(fonte))
    return fonte.split('\n').map((l) => l.trim())
      .filter((l) => l && !/^[-_*]{3,}$/.test(l))
      .map((l) => l.replace(/^#{1,3}\s+/, '').replace(/^([-*+]|\d+\.)\s+/, '').replace(/\*\*/g, '')
        .replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()).join(' ').trim())
      .filter((l) => l && !/^[\s:-]+$/.test(l))
      .filter((l) => !rendido.includes(l))
  }
  for (const [nome, fonte] of [
    ['a', '#### 4.1.2 Subitem juridico'],
    ['b', 'Texto com *enfase* e ***forte enfase*** e ~~riscado~~.'],
    ['c', '- alinea a;\n  - sub-alinea a.1;\n  - sub-alinea a.2;\n- alinea b.'],
    ['d', '> citacao'],
    ['e', '3. terceiro\n4. quarto'],
  ] as const) {
    it(`caso ${nome}: linhas perdidas`, () => { console.log(`FIDELIDADE ${nome}:`, JSON.stringify(perdidas(fonte))) })
  }
})
