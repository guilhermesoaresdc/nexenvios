import { Corpo, Indice } from './documento'
import { lerMarkdown } from '@/lib/juridico/markdown'
import type { Documento } from '@/lib/juridico/documentos'

/**
 * A página de um documento jurídico — a mesma para os dois.
 *
 * Termos e Política têm a mesma estrutura e o mesmo público; duas telas
 * separadas só criariam a chance de uma receber um ajuste que a outra não
 * recebe.
 */
export function PaginaJuridica({ documento }: { documento: Documento }) {
  const blocos = lerMarkdown(documento.fonte)

  return (
    /*
     * Sem tarja de "versão 1.0, vigente desde…" acima do título.
     *
     * Ela existiu por meia hora e foi tirada: os dois documentos JÁ declaram
     * versão e vigência na primeira linha, e a tarja repetia as duas
     * informações palavra por palavra logo acima. Num texto que vale como
     * compromisso, dois lugares dizendo a mesma data é um a mais para
     * divergir — basta alguém atualizar o `.md` e esquecer da constante.
     * A fonte é quem diz desde quando vale.
     */
    <div className="mx-auto grid max-w-[1120px] gap-12 px-6 py-12 max-sm:px-4 lg:grid-cols-[1fr_220px] lg:py-16">
      {/*
        `min-w-0` não é enfeite: item de grid não encolhe abaixo do próprio
        conteúdo (o padrão é `min-width: auto`), e a tabela de bases legais
        tem largura mínima de 520px para as duas colunas caberem. Sem isto a
        coluna inteira estica no celular e a PÁGINA passa a rolar de lado —
        a rolagem tem que ser da tabela, não do documento.
      */}
      <article className="flex min-w-0 max-w-[68ch] flex-col gap-5">
        <Corpo blocos={blocos} />
      </article>

      {/*
        O índice fica DEPOIS do texto na ordem do documento e é reposicionado
        pelo grid. Assim o leitor de tela e a navegação por teclado chegam ao
        conteúdo primeiro, sem passar por quinze links de atalho.
      */}
      <aside className="max-lg:hidden lg:col-start-2 lg:row-start-1">
        <div className="sticky top-8">
          <Indice blocos={blocos} />
        </div>
      </aside>
    </div>
  )
}
