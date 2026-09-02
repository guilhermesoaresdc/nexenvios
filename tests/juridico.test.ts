import { describe, expect, it } from 'vitest'
import { apelido, lerInline, lerMarkdown, textoCorrido } from '@/lib/juridico/markdown'
import { DOCUMENTOS, PRIVACIDADE, TERMOS } from '@/lib/juridico/documentos'

/**
 * Os documentos jurídicos.
 *
 * O defeito que importa aqui não é visual: é conteúdo que se perde no caminho
 * entre o `.md` que o jurídico escreveu e a página que vai ao ar. Uma alínea
 * do art. 18 que não foi renderizada, uma linha da tabela de bases legais que
 * ficou de fora — ninguém percebe lendo a tela, e a empresa passa a publicar
 * um compromisso diferente do que assinou.
 *
 * Por isso o teste central é de FIDELIDADE, e ele é bruto de propósito: cada
 * linha não vazia da fonte tem que aparecer no texto renderizado.
 */

describe('trechos em linha', () => {
  it('reconhece negrito', () => {
    expect(lerInline('inscrita no CNPJ sob o nº **58.132.444/0001-60**, com sede')).toEqual([
      { texto: 'inscrita no CNPJ sob o nº ' },
      { texto: '58.132.444/0001-60', forte: true },
      { texto: ', com sede' },
    ])
  })

  it('não deixa a pontuação da frase entrar no link', () => {
    // O caso real: "o site https://nexenvios.com.br, suas páginas".
    const t = lerInline('o site https://nexenvios.com.br, suas páginas')
    expect(t[1]).toEqual({ texto: 'https://nexenvios.com.br', href: 'https://nexenvios.com.br' })
    expect(t[2]).toEqual({ texto: ', suas páginas' })
  })

  it('transforma e-mail em mailto, e só o e-mail', () => {
    const t = lerInline('enviadas para nexenviosdocs@nexenvios.com.br e serão respondidas')
    expect(t[1]).toEqual({
      texto: 'nexenviosdocs@nexenvios.com.br',
      href: 'mailto:nexenviosdocs@nexenvios.com.br',
    })
  })

  it('não confunde o ponto final com parte do endereço', () => {
    const t = lerInline('Contato do Encarregado: nexenviosdocs@nexenvios.com.br.')
    expect(t.at(-2)?.href).toBe('mailto:nexenviosdocs@nexenvios.com.br')
    expect(t.at(-1)).toEqual({ texto: '.' })
  })

  it('aceita link de markdown e mantém o texto visível', () => {
    expect(lerInline('veja [a ANPD](https://gov.br/anpd) para reclamar')[1]).toEqual({
      texto: 'a ANPD',
      href: 'https://gov.br/anpd',
    })
  })

  it('asterisco sem par continua sendo asterisco', () => {
    expect(lerInline('taxa de 2**')).toEqual([{ texto: 'taxa de 2**' }])
  })

  it('negrito e link convivem', () => {
    const t = lerInline('**Site: https://nexenvios.com.br**')
    expect(t).toEqual([
      { texto: 'Site: ', forte: true },
      { texto: 'https://nexenvios.com.br', href: 'https://nexenvios.com.br', forte: true },
    ])
  })
})

describe('blocos', () => {
  it('lê título, parágrafo, lista e tabela', () => {
    const blocos = lerMarkdown(
      [
        '## 3. Finalidades e bases legais',
        '',
        'Texto de abertura.',
        '',
        '| Finalidade | Base legal (LGPD) |',
        '| --- | --- |',
        '| Processar contratações | Execução de contrato — art. 7º, V |',
        '| Prevenir fraudes | Legítimo interesse — art. 7º, IX |',
        '',
        '- primeiro item',
        '- segundo item',
      ].join('\n'),
    )

    expect(blocos.map((b) => b.tipo)).toEqual(['titulo', 'paragrafo', 'tabela', 'lista'])

    const tabela = blocos[2]
    if (tabela?.tipo !== 'tabela') throw new Error('esperava tabela')
    expect(tabela.cabecalho).toHaveLength(2)
    expect(tabela.linhas).toHaveLength(2)
    expect(tabela.linhas[1]![0]![0]!.texto).toBe('Prevenir fraudes')
  })

  it('separa lista numerada de lista com marcador', () => {
    const blocos = lerMarkdown('1. um\n2. dois\n\n- outro\n')
    expect(blocos[0]).toMatchObject({ tipo: 'lista', ordenada: true })
    expect(blocos[1]).toMatchObject({ tipo: 'lista', ordenada: false })
  })

  it('junta a continuação de um item na mesma alínea', () => {
    const blocos = lerMarkdown('- dados fiscais e de faturamento:\n  5 anos, nos termos da lei\n')
    if (blocos[0]?.tipo !== 'lista') throw new Error('esperava lista')
    expect(blocos[0].itens).toHaveLength(1)
    expect(textoCorrido(blocos)).toContain('5 anos, nos termos da lei')
  })

  it('descarta a régua solta do fim do arquivo', () => {
    expect(lerMarkdown('Último parágrafo.\n\n---\n').map((b) => b.tipo)).toEqual(['paragrafo'])
  })

  it('dá endereço estável às seções', () => {
    expect(apelido('9. Seus direitos como titular')).toBe('9-seus-direitos-como-titular')
    expect(apelido('## Transferência internacional')).toBe('transferencia-internacional')
  })
})

/**
 * A fidelidade. Se um destes quebrar, alguma coisa do documento não está no ar.
 */
describe.each(DOCUMENTOS.map((d) => [d.titulo, d] as const))('%s', (_titulo, doc) => {
  const blocos = lerMarkdown(doc.fonte)
  const rendido = textoCorrido(blocos)

  it('publica cada linha da fonte, sem perder nenhuma', () => {
    const perdidas = doc.fonte
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^[-_*]{3,}$/.test(l))
      .map((l) =>
        // Tira só a marcação; o que sobra é texto e tem que estar na página.
        l
          .replace(/^#{1,3}\s+/, '')
          .replace(/^([-*+]|\d+\.)\s+/, '')
          .replace(/\*\*/g, '')
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
          .join(' ')
          .trim(),
      )
      .filter((l) => l && !/^[\s:-]+$/.test(l))
      .filter((l) => !rendido.includes(l))

    expect(perdidas).toEqual([])
  })

  /*
   * O contrário do teste anterior, e tão importante quanto.
   *
   * "Não perdeu nada" passaria também se a página duplicasse um parágrafo ou
   * emendasse o fim de uma cláusula no começo da seguinte — e um documento
   * jurídico que promete duas vezes coisas diferentes é pior do que um
   * incompleto. Cada bloco rendido tem que existir, inteiro, na fonte.
   *
   * A tabela fica de fora porque suas células são unidas por espaço aqui e
   * separadas por barra lá: a comparação seria sobre a formatação, não sobre
   * o conteúdo, e é a fonte que manda no conteúdo.
   */
  it('não inventa nem emenda: cada bloco existe inteiro na fonte', () => {
    const espremer = (s: string) => s.replace(/\s+/g, ' ').trim()
    const naFonte = espremer(doc.fonte.replace(/\*\*/g, '').replace(/^#{1,3}\s+/gm, ''))

    const soltos = blocos.flatMap((b) => {
      if (b.tipo === 'titulo' || b.tipo === 'paragrafo') {
        return [espremer(b.trechos.map((t) => t.texto).join(''))]
      }
      if (b.tipo === 'lista') {
        return b.itens.map((i) => espremer(i.map((t) => t.texto).join('')))
      }
      return []
    })

    expect(soltos.length).toBeGreaterThan(20)
    expect(soltos.filter((t) => t && !naFonte.includes(t))).toEqual([])
  })

  it('tem versão, data válida e rota absoluta', () => {
    expect(doc.versao).toMatch(/^\d+\.\d+$/)
    expect(doc.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(new Date(doc.atualizadoEm).getTime())).toBe(false)
    expect(doc.rota.startsWith('/')).toBe(true)
  })

  it('abre com um H1 e organiza o resto em seções', () => {
    expect(blocos[0]).toMatchObject({ tipo: 'titulo', nivel: 1 })
    const secoes = blocos.filter((b) => b.tipo === 'titulo' && b.nivel === 2)
    expect(secoes.length).toBeGreaterThanOrEqual(10)
    // Endereço duplicado faria dois links do índice caírem no mesmo lugar.
    const ids = secoes.map((s) => (s.tipo === 'titulo' ? s.id : ''))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo link tem destino utilizável', () => {
    const hrefs = blocos.flatMap(function achar(b): string[] {
      if (b.tipo === 'titulo' || b.tipo === 'paragrafo') {
        return b.trechos.flatMap((t) => (t.href ? [t.href] : []))
      }
      if (b.tipo === 'lista') {
        return b.itens.flat().flatMap((t) => (t.href ? [t.href] : []))
      }
      return [...b.cabecalho, ...b.linhas.flat()]
        .flat()
        .flatMap((t) => (t.href ? [t.href] : []))
    })
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toMatch(/^(https?:\/\/|mailto:)\S+$/)
  })
})

describe('os dois documentos, juntos', () => {
  it('não dividem a mesma rota', () => {
    expect(new Set(DOCUMENTOS.map((d) => d.rota)).size).toBe(DOCUMENTOS.length)
  })

  it('trazem o CNPJ e o contato de quem responde', () => {
    for (const doc of [PRIVACIDADE, TERMOS]) {
      expect(doc.fonte).toContain('58.132.444/0001-60')
      expect(doc.fonte).toContain('NEX CREATIVE LTDA')
    }
    // A LGPD exige canal do encarregado; sem ele o art. 18 vira letra morta.
    expect(PRIVACIDADE.fonte).toContain('nexenviosdocs@nexenvios.com.br')
  })
})
