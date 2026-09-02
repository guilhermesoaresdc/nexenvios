import { Fragment } from 'react'
import type { Bloco, Trecho } from '@/lib/juridico/markdown'

/**
 * O desenho dos documentos jurídicos.
 *
 * Recebe DADO — a saída de `lerMarkdown` — e monta elemento React. Nunca HTML
 * em string: mesmo sendo texto nosso, o caminho que aceita marcação crua é o
 * caminho que um dia aceita a marcação de outra pessoa.
 *
 * A régua aqui é legibilidade, não sofisticação: linha curta, entrelinha
 * larga, hierarquia clara. Uma política de privacidade que ninguém consegue
 * ler cumpre a lei no papel e falha no que a lei quer.
 */

function Texto({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => {
        const conteudo = t.forte ? (
          <b className="font-semibold text-navy">{t.texto}</b>
        ) : (
          t.texto
        )

        if (!t.href) return <Fragment key={i}>{conteudo}</Fragment>

        const externo = /^https?:\/\//.test(t.href) && !t.href.includes('nexenvios.com.br')
        return (
          <a
            key={i}
            href={t.href}
            {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="font-medium text-blue underline decoration-blue/30 underline-offset-2 transition-colors hover:decoration-blue"
          >
            {conteudo}
          </a>
        )
      })}
    </>
  )
}

export function Corpo({ blocos }: { blocos: Bloco[] }) {
  return (
    <>
      {blocos.map((bloco, i) => {
        switch (bloco.tipo) {
          case 'titulo': {
            /*
             * O H1 do arquivo vira o título da página, desenhado maior; os
             * demais entram na hierarquia. O `id` dá endereço à cláusula — o
             * suporte manda o cliente para a seção, não para o documento.
             */
            if (bloco.nivel === 1) {
              return (
                <h1 key={i} id={bloco.id} className="text-[2rem] leading-[1.15] max-sm:text-[1.6rem]">
                  <Texto trechos={bloco.trechos} />
                </h1>
              )
            }
            if (bloco.nivel === 2) {
              return (
                <h2
                  key={i}
                  id={bloco.id}
                  className="scroll-mt-24 border-t border-line pt-8 text-[1.25rem] first:border-0 first:pt-0"
                >
                  <Texto trechos={bloco.trechos} />
                </h2>
              )
            }
            return (
              <h3 key={i} id={bloco.id} className="scroll-mt-24 text-[1.02rem]">
                <Texto trechos={bloco.trechos} />
              </h3>
            )
          }

          case 'paragrafo':
            return (
              <p key={i} className="text-[.96rem] leading-[1.75] text-ink/85">
                <Texto trechos={bloco.trechos} />
              </p>
            )

          case 'lista': {
            const Marcador = bloco.ordenada ? 'ol' : 'ul'
            return (
              <Marcador
                key={i}
                className={
                  bloco.ordenada
                    ? 'ml-5 flex list-decimal flex-col gap-2.5 marker:font-semibold marker:text-blue'
                    : 'ml-5 flex list-disc flex-col gap-2.5 marker:text-blue'
                }
              >
                {bloco.itens.map((item, j) => (
                  <li key={j} className="pl-1 text-[.96rem] leading-[1.7] text-ink/85">
                    <Texto trechos={item} />
                  </li>
                ))}
              </Marcador>
            )
          }

          case 'tabela':
            return (
              /*
               * A rolagem é do quadro, nunca da página.
               *
               * A tabela de bases legais tem duas colunas de texto corrido e
               * não cabe num celular. Deixar a página inteira rolar de lado
               * para acomodá-la estraga a leitura de tudo que vem antes.
               */
              <div key={i} className="-mx-1 overflow-x-auto rounded-[12px] border border-line">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead>
                    <tr className="bg-paper-alt">
                      {bloco.cabecalho.map((celula, j) => (
                        <th
                          key={j}
                          scope="col"
                          className="border-b border-line px-4 py-3 font-mono text-[.7rem] font-semibold tracking-[.08em] text-navy uppercase"
                        >
                          <Texto trechos={celula} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bloco.linhas.map((linha, j) => (
                      <tr key={j} className="border-b border-line last:border-0">
                        {linha.map((celula, k) => (
                          <td
                            key={k}
                            className="px-4 py-3 align-top text-[.9rem] leading-[1.6] text-ink/85"
                          >
                            <Texto trechos={celula} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </>
  )
}

/**
 * O índice das seções, fixo ao lado no desktop.
 *
 * São 13 a 15 cláusulas. Quem abre este documento quase sempre vem atrás de
 * UMA — o prazo de retenção, o foro, como pedir exclusão dos dados — e rolar
 * sete telas procurando é o que faz a pessoa desistir e abrir um chamado.
 */
export function Indice({ blocos }: { blocos: Bloco[] }) {
  // O predicado é explícito porque `filter` sozinho não estreita a união.
  const secoes = blocos.filter(
    (b): b is Extract<Bloco, { tipo: 'titulo' }> => b.tipo === 'titulo' && b.nivel === 2,
  )
  if (secoes.length === 0) return null

  return (
    <nav aria-label="Seções do documento" className="text-[.84rem]">
      <p className="mb-3 font-mono text-[.68rem] font-semibold tracking-[.1em] text-muted uppercase">
        Nesta página
      </p>
      <ul className="flex flex-col gap-1.5 border-l border-line">
        {secoes.map((s, i) => (
          <li key={i}>
            <a
              href={`#${s.id}`}
              className="-ml-px block border-l border-transparent py-0.5 pl-3 leading-snug text-muted transition-colors hover:border-blue hover:text-blue"
            >
              {s.trechos.map((t) => t.texto).join('')}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
