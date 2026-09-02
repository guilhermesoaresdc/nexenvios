/**
 * O Markdown que os documentos jurídicos usam — e só ele.
 *
 * Política de Privacidade e Termos de Uso mudam de versão: a LGPD muda, o
 * endereço muda, entra um canal novo. O que chega para publicar é sempre o
 * mesmo formato — o `.md` que o jurídico escreveu. Transcrever isso para JSX à
 * mão a cada revisão é onde o erro nasce: uma alínea que não foi colada, uma
 * linha da tabela de bases legais que ficou para trás. Num documento que a
 * empresa é obrigada a cumprir, isso não é erro de formatação.
 *
 * Então o texto fica como texto, e a tela é derivada dele. Trocar de versão é
 * trocar a constante.
 *
 * NÃO é um Markdown completo, de propósito. É o subconjunto que estes
 * documentos usam — título, parágrafo, negrito, link, lista e tabela. Um
 * renderizador de verdade traria dependência, HTML arbitrário e uma superfície
 * grande demais para o que aqui são dois arquivos que nós mesmos escrevemos.
 *
 * A saída é DADO, não HTML: quem desenha monta elemento React a partir daqui.
 * Nada de `dangerouslySetInnerHTML` — o dia em que este módulo receber texto
 * que não é nosso, ele continua sendo incapaz de injetar marcação.
 */

export type Trecho = {
  texto: string
  /** Veio de `**negrito**`. */
  forte?: boolean
  /** Endereço, quando o trecho é link. */
  href?: string
}

export type Bloco =
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; id: string; trechos: Trecho[] }
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'lista'; ordenada: boolean; itens: Trecho[][] }
  | { tipo: 'tabela'; cabecalho: Trecho[][]; linhas: Trecho[][][] }

// ──────────────────────────────────────────────────────────────── inline

/**
 * Onde o link termina.
 *
 * A pontuação da frase gruda na URL: "o site https://nexenvios.com.br, suas
 * páginas" tem uma vírgula que NÃO faz parte do endereço. Levá-la junto
 * geraria um link quebrado bem no documento que precisa ser confiável.
 *
 * O parêntese fecha só quando não abriu dentro da própria URL.
 */
function aparar(url: string): string {
  let fim = url.length
  while (fim > 0) {
    const c = url[fim - 1]!
    if ('.,;:!?"\''.includes(c)) fim--
    else if (c === ')' && (url.slice(0, fim).match(/\(/g)?.length ?? 0) < (url.slice(0, fim).match(/\)/g)?.length ?? 0)) fim--
    else break
  }
  return url.slice(0, fim)
}

const URL_SOLTA = /https?:\/\/[^\s<>]+/g
const EMAIL_SOLTO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const LINK_MD = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** Quebra em `**negrito**` e resto, mantendo a ordem. */
function fatiarForte(texto: string): { texto: string; forte: boolean }[] {
  const partes: { texto: string; forte: boolean }[] = []
  let resto = texto
  for (;;) {
    const abre = resto.indexOf('**')
    if (abre < 0) break
    const fecha = resto.indexOf('**', abre + 2)
    // `**` sem par é asterisco literal, não início de negrito eterno.
    if (fecha < 0) break
    if (abre > 0) partes.push({ texto: resto.slice(0, abre), forte: false })
    partes.push({ texto: resto.slice(abre + 2, fecha), forte: true })
    resto = resto.slice(fecha + 2)
  }
  if (resto) partes.push({ texto: resto, forte: false })
  return partes.filter((p) => p.texto !== '')
}

/** Acha `[texto](url)`, URLs soltas e e-mails dentro de um pedaço já sem `**`. */
function fatiarLinks(texto: string): Trecho[] {
  type Achado = { inicio: number; fim: number; trecho: Trecho }
  const achados: Achado[] = []

  for (const m of texto.matchAll(LINK_MD)) {
    achados.push({
      inicio: m.index,
      fim: m.index + m[0].length,
      trecho: { texto: m[1]!, href: m[2]! },
    })
  }
  const ocupado = (i: number, f: number) => achados.some((a) => i < a.fim && f > a.inicio)

  for (const m of texto.matchAll(URL_SOLTA)) {
    const url = aparar(m[0])
    if (!url || ocupado(m.index, m.index + url.length)) continue
    achados.push({ inicio: m.index, fim: m.index + url.length, trecho: { texto: url, href: url } })
  }
  for (const m of texto.matchAll(EMAIL_SOLTO)) {
    const email = aparar(m[0])
    if (!email || ocupado(m.index, m.index + email.length)) continue
    achados.push({
      inicio: m.index,
      fim: m.index + email.length,
      trecho: { texto: email, href: `mailto:${email}` },
    })
  }

  achados.sort((a, b) => a.inicio - b.inicio)

  const trechos: Trecho[] = []
  let cursor = 0
  for (const a of achados) {
    if (a.inicio < cursor) continue
    if (a.inicio > cursor) trechos.push({ texto: texto.slice(cursor, a.inicio) })
    trechos.push(a.trecho)
    cursor = a.fim
  }
  if (cursor < texto.length) trechos.push({ texto: texto.slice(cursor) })
  return trechos
}

export function lerInline(texto: string): Trecho[] {
  return fatiarForte(texto).flatMap(({ texto: pedaco, forte }) =>
    fatiarLinks(pedaco).map((t) => (forte ? { ...t, forte: true } : t)),
  )
}

// ──────────────────────────────────────────────────────────────── blocos

/**
 * O identificador da seção, para dar endereço a ela.
 *
 * "## 9. Seus direitos como titular" vira `#​9-seus-direitos-como-titular`.
 * Existe porque o suporte precisa mandar o cliente para a cláusula, não para o
 * documento inteiro — e porque o número sozinho muda quando entra uma seção
 * nova, enquanto o texto costuma sobreviver.
 */
export function apelido(texto: string): string {
  return texto
    .normalize('NFD')
    // Escapes e não os caracteres em si: acento combinante é invisível no editor.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/*
 * A linha `| --- | --- |` que separa cabeçalho de corpo.
 *
 * Era `/^\|?[\s:|-]*-[\s:|-]*\|?$/`, e o `-` aparecia DENTRO da classe dos
 * dois lados: para uma linha só de hífens o motor tinha exponencialmente
 * muitas formas de dividir a mesma correspondência, e uma linha longa que não
 * casa fazia a expressão andar em círculos. Uma classe só, mais a exigência
 * de conter um hífen, decide o mesmo em tempo linear.
 */
const SO_TRACOS = /^[\s:|-]+$/

function eSeparadorDeTabela(linha: string): boolean {
  return linha.length > 0 && linha.includes('-') && SO_TRACOS.test(linha)
}

/** Régua horizontal: três ou mais do mesmo sinal, sozinhos na linha. */
function eRegua(linha: string): boolean {
  return /^(-{3,}|_{3,}|\*{3,})$/.test(linha)
}

export function lerMarkdown(fonte: string): Bloco[] {
  const linhas = fonte.replace(/\r\n?/g, '\n').split('\n')
  const blocos: Bloco[] = []
  let i = 0

  /* O parágrafo em aberto: linhas seguidas viram um só, separadas por espaço. */
  let acumulado: string[] = []
  const fecharParagrafo = () => {
    if (acumulado.length === 0) return
    blocos.push({ tipo: 'paragrafo', trechos: lerInline(acumulado.join(' ')) })
    acumulado = []
  }

  while (i < linhas.length) {
    const linha = linhas[i]!
    const cru = linha.trim()

    if (cru === '') {
      fecharParagrafo()
      i++
      continue
    }

    /*
     * A régua horizontal é descartada.
     *
     * Nos dois documentos ela aparece uma única vez, no fim, como sobra da
     * exportação — não separa nada. Desenhar um traço solto embaixo do último
     * parágrafo pareceria conteúdo cortado.
     */
    if (eRegua(cru)) {
      fecharParagrafo()
      i++
      continue
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(cru)
    if (titulo) {
      fecharParagrafo()
      const texto = titulo[2]!.trim()
      blocos.push({
        tipo: 'titulo',
        /*
         * Do h4 para baixo tudo vira nível 3.
         *
         * Antes só `#{1,3}` contava como título: um `#### 4.1.2` viraria
         * parágrafo COM os quatro jogos-da-velha à mostra na tela. Nenhum dos
         * dois documentos tem h4 hoje — mas o próximo pode ter, e o defeito
         * apareceria publicado, não no build.
         */
        nivel: Math.min(titulo[1]!.length, 3) as 1 | 2 | 3,
        id: apelido(texto),
        trechos: lerInline(texto),
      })
      i++
      continue
    }

    // Tabela: linha com barras seguida da linha de separação.
    if (cru.startsWith('|') && eSeparadorDeTabela(linhas[i + 1]?.trim() ?? '')) {
      fecharParagrafo()
      const cabecalho = celulas(cru).map(lerInline)
      i += 2
      const corpo: Trecho[][][] = []
      while (i < linhas.length && linhas[i]!.trim().startsWith('|')) {
        corpo.push(celulas(linhas[i]!).map(lerInline))
        i++
      }
      blocos.push({ tipo: 'tabela', cabecalho, linhas: corpo })
      continue
    }

    const marcador = /^([-*+]|\d+\.)\s+(.*)$/.exec(cru)
    if (marcador) {
      fecharParagrafo()
      const ordenada = /^\d/.test(marcador[1]!)
      const itens: Trecho[][] = []
      while (i < linhas.length) {
        const m = /^([-*+]|\d+\.)\s+(.*)$/.exec(linhas[i]!.trim())
        if (!m || /^\d/.test(m[1]!) !== ordenada) break
        /*
         * Continuação: a linha seguinte que não é item nem linha em branco
         * pertence ao item anterior. Sem isto, uma alínea quebrada em duas
         * linhas viraria um parágrafo solto fora da lista.
         */
        const pedacos = [m[2]!]
        i++
        while (i < linhas.length) {
          const proxima = linhas[i]!.trim()
          /*
           * Onde a alínea termina.
           *
           * A versão anterior só parava em linha vazia, outro marcador ou
           * `#{1,3}` — e engolia o que viesse colado depois. Uma tabela logo
           * abaixo de uma lista, sem linha em branco entre elas, virava texto
           * dentro da última alínea: as oito linhas da tabela de bases legais
           * sumiriam da página, emendadas numa frase. É o pior defeito
           * possível aqui, porque a tela continua parecendo íntegra.
           */
          if (
            proxima === '' ||
            /^([-*+]|\d+\.)\s+/.test(proxima) ||
            /^#{1,6}\s/.test(proxima) ||
            proxima.startsWith('|') ||
            eRegua(proxima)
          ) {
            break
          }
          pedacos.push(proxima)
          i++
        }
        itens.push(lerInline(pedacos.join(' ')))
      }
      blocos.push({ tipo: 'lista', ordenada, itens })
      continue
    }

    acumulado.push(cru)
    i++
  }

  fecharParagrafo()
  return blocos
}

/**
 * Todo o texto visível, sem marcação.
 *
 * É o que o teste de fidelidade compara com o `.md` de origem: publicar uma
 * política com uma cláusula a menos é o tipo de defeito que ninguém percebe
 * lendo a tela, e que só aparece quando alguém cobra o que foi prometido.
 */
export function textoCorrido(blocos: Bloco[]): string {
  const dos = (t: Trecho[]) => t.map((x) => x.texto).join('')
  return blocos
    .map((b) => {
      if (b.tipo === 'titulo' || b.tipo === 'paragrafo') return dos(b.trechos)
      if (b.tipo === 'lista') return b.itens.map(dos).join('\n')
      return [b.cabecalho, ...b.linhas].map((l) => l.map(dos).join(' ')).join('\n')
    })
    .join('\n')
}
