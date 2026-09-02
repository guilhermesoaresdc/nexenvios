import { describe, expect, it } from 'vitest'
import { apelido, lerInline, lerMarkdown, textoCorrido } from '@/lib/juridico/markdown'
import type { Bloco, Trecho } from '@/lib/juridico/markdown'
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

  /*
   * Onde a alínea termina.
   *
   * Uma tabela colada numa lista, sem linha em branco entre elas, era engolida
   * inteira pela última alínea: as oito linhas da tabela de bases legais
   * virariam texto corrido dentro de uma frase, e a tela continuaria parecendo
   * íntegra. É o defeito mais caro que este arquivo pode ter.
   */
  it('a lista não engole a tabela que vem colada nela', () => {
    const blocos = lerMarkdown(
      ['- alínea única;', '| Finalidade | Base legal |', '| --- | --- |', '| Enviar | art. 7º, V |'].join('\n'),
    )
    expect(blocos.map((b) => b.tipo)).toEqual(['lista', 'tabela'])
    if (blocos[1]?.tipo !== 'tabela') throw new Error('esperava tabela')
    expect(blocos[1].linhas).toHaveLength(1)
  })

  it('a lista não engole a régua nem o título que vêm colados', () => {
    expect(lerMarkdown('- alínea;\n---\n## 5. Outra seção').map((b) => b.tipo)).toEqual([
      'lista',
      'titulo',
    ])
    expect(lerMarkdown('- alínea;\n#### 4.1.2 Subitem').map((b) => b.tipo)).toEqual([
      'lista',
      'titulo',
    ])
  })

  it('título de quarto nível vira título, e não parágrafo com "####" à mostra', () => {
    const [bloco] = lerMarkdown('#### 4.1.2 Subitem jurídico')
    expect(bloco).toMatchObject({ tipo: 'titulo', nivel: 3 })
    expect(textoCorrido([bloco!])).toBe('4.1.2 Subitem jurídico')
  })

  it('dá endereço estável às seções', () => {
    expect(apelido('9. Seus direitos como titular')).toBe('9-seus-direitos-como-titular')
    expect(apelido('## Transferência internacional')).toBe('transferencia-internacional')
  })
})

/**
 * A fidelidade.
 *
 * A primeira versão disto passava por prova e não era. Ela espremia a fonte
 * inteira com `replace(/\s+/g, ' ')` e perguntava se cada bloco rendido
 * estava CONTIDO nela — e espremer dissolve as linhas em branco, que é
 * justamente o que separa um bloco do outro. Numa fonte virada em linha
 * única, qualquer emenda de dois trechos vizinhos está contida por
 * construção. Uma revisão adversarial provou seis defeitos passando: emendar
 * dois parágrafos, emendar o fim de uma seção no título da seguinte, duplicar
 * um parágrafo, perder o negrito de "Dados sensíveis:", transformar as dez
 * alíneas do art. 18 em dez parágrafos soltos, e mover a seção 5 para depois
 * da 12. O comentário de então afirmava cobrir exatamente esses casos.
 *
 * O que passa a valer é uma DERIVAÇÃO INDEPENDENTE: o teste monta, com o seu
 * próprio código, a sequência de unidades que a fonte descreve — tipo, texto
 * e negritos — e exige igualdade com a sequência que o leitor produziu.
 * Igualdade de sequência, não de conjunto e não de substring: por isso pega
 * perda, invenção, emenda, duplicação, troca de ordem e lista virando
 * parágrafo, que são coisas diferentes e todas silenciosas na tela.
 *
 * Dois parsers dizendo a mesma coisa não é duplicação à toa: é o único jeito
 * de um teste discordar do código que ele testa.
 */

type Unidade = {
  tipo: 'titulo' | 'item' | 'paragrafo'
  texto: string
  /** Os trechos que a fonte marcou com `**`, na ordem. */
  fortes: string[]
}

const REGUA = /^(-{3,}|_{3,}|\*{3,})$/
const MARCADOR = /^([-*+]|\d+\.)\s+(.*)$/
const TITULO = /^(#{1,6})\s+(.*)$/

/** Tira `**` e `[rótulo](url)`, guardando o que estava em negrito. */
function semMarcacao(bruto: string): { texto: string; fortes: string[] } {
  const fortes: string[] = []
  const texto = bruto
    .replace(/\*\*([^*]+)\*\*/g, (_, dentro: string) => {
      fortes.push(dentro)
      return dentro
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, rotulo: string) => rotulo)
  return { texto, fortes }
}

/** O que a FONTE diz que a página deve ter. Tabela fica de fora — vai à parte. */
function unidadesDaFonte(fonte: string): Unidade[] {
  const linhas = fonte.replace(/\r\n?/g, '\n').split('\n')
  const unidades: Unidade[] = []
  let paragrafo: string[] = []

  const fechar = () => {
    if (paragrafo.length === 0) return
    const { texto, fortes } = semMarcacao(paragrafo.join(' '))
    unidades.push({ tipo: 'paragrafo', texto, fortes })
    paragrafo = []
  }

  let i = 0
  while (i < linhas.length) {
    const l = linhas[i]!.trim()

    if (l === '' || REGUA.test(l)) {
      fechar()
      i++
      continue
    }

    const t = TITULO.exec(l)
    if (t) {
      fechar()
      const { texto, fortes } = semMarcacao(t[2]!.trim())
      unidades.push({ tipo: 'titulo', texto, fortes })
      i++
      continue
    }

    // Tabela inteira: pulada aqui, conferida no teste próprio dela.
    if (l.startsWith('|')) {
      fechar()
      while (i < linhas.length && linhas[i]!.trim().startsWith('|')) i++
      continue
    }

    const m = MARCADOR.exec(l)
    if (m) {
      fechar()
      const pedacos = [m[2]!]
      i++
      while (i < linhas.length) {
        const p = linhas[i]!.trim()
        if (p === '' || MARCADOR.test(p) || TITULO.test(p) || p.startsWith('|') || REGUA.test(p)) break
        pedacos.push(p)
        i++
      }
      const { texto, fortes } = semMarcacao(pedacos.join(' '))
      unidades.push({ tipo: 'item', texto, fortes })
      continue
    }

    paragrafo.push(l)
    i++
  }

  fechar()
  return unidades
}

/** O mesmo, lido do que o leitor devolveu. */
function unidadesDoRender(blocos: Bloco[]): Unidade[] {
  /*
   * Negritos vizinhos são juntados de volta.
   *
   * `**Site: https://nexenvios.com.br**` vira DOIS trechos no leitor — o texto
   * e o link, ambos `forte` — enquanto a fonte tem um `**...**` só. Sem
   * remendar isso o teste acusaria diferença onde não há.
   */
  const ler = (trechos: Trecho[]): { texto: string; fortes: string[] } => {
    const fortes: string[] = []
    let corrente = ''
    for (const t of trechos) {
      if (t.forte) corrente += t.texto
      else if (corrente) {
        fortes.push(corrente)
        corrente = ''
      }
    }
    if (corrente) fortes.push(corrente)
    return { texto: trechos.map((t) => t.texto).join(''), fortes }
  }

  return blocos.flatMap((b): Unidade[] => {
    if (b.tipo === 'titulo') return [{ tipo: 'titulo', ...ler(b.trechos) }]
    if (b.tipo === 'paragrafo') return [{ tipo: 'paragrafo', ...ler(b.trechos) }]
    if (b.tipo === 'lista') return b.itens.map((i) => ({ tipo: 'item' as const, ...ler(i) }))
    return []
  })
}

describe.each(DOCUMENTOS.map((d) => [d.titulo, d] as const))('%s', (_titulo, doc) => {
  const blocos = lerMarkdown(doc.fonte)

  it('publica exatamente o que a fonte descreve — nada a mais, nada a menos, na mesma ordem', () => {
    expect(unidadesDoRender(blocos)).toEqual(unidadesDaFonte(doc.fonte))
  })

  it('a tabela sai com todas as linhas e todas as células', () => {
    const daFonte = doc.fonte
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|'))
      .filter((l) => !/^\|?[\s:|-]+$/.test(l) || !l.includes('-') || /[a-zA-Z]/.test(l))
      .map((l) =>
        l
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => semMarcacao(c.trim()).texto),
      )

    const daTela = blocos.flatMap((b) =>
      b.tipo === 'tabela'
        ? [b.cabecalho, ...b.linhas].map((linha) =>
            linha.map((celula) => celula.map((t) => t.texto).join('')),
          )
        : [],
    )

    expect(daTela).toEqual(daFonte)
  })

  it('todo link tem destino, e o destino existe na fonte', () => {
    const hrefs = blocos.flatMap(function achar(b): string[] {
      const de = (t: Trecho[]) => t.flatMap((x) => (x.href ? [x.href] : []))
      if (b.tipo === 'titulo' || b.tipo === 'paragrafo') return de(b.trechos)
      if (b.tipo === 'lista') return de(b.itens.flat())
      return de([...b.cabecalho, ...b.linhas.flat()].flat())
    })

    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).toMatch(/^(https?:\/\/|mailto:)\S+$/)
      // O endereço não pode ter sido inventado: sai literal da fonte.
      expect(doc.fonte).toContain(href.replace(/^mailto:/, ''))
    }
  })

  it('tem versão, data válida e rota absoluta', () => {
    expect(doc.versao).toMatch(/^\d+\.\d+$/)
    expect(doc.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(new Date(doc.atualizadoEm).getTime())).toBe(false)
    expect(doc.rota.startsWith('/')).toBe(true)
  })

  it('abre com um H1 e organiza o resto em seções com endereço próprio', () => {
    expect(blocos[0]).toMatchObject({ tipo: 'titulo', nivel: 1 })
    const secoes = blocos.filter(
      (b): b is Extract<Bloco, { tipo: 'titulo' }> => b.tipo === 'titulo' && b.nivel === 2,
    )
    expect(secoes.length).toBeGreaterThanOrEqual(10)
    // Endereço duplicado faria dois links do índice caírem no mesmo lugar.
    const ids = secoes.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).not.toBe('')
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
