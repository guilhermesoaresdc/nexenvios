'use client'

import { useState } from 'react'
import { CANAL_CURTO, type Channel } from '@/db/schema/enums'
import { compilarMensagem, contarVariantes } from '@/lib/mensagem'
import { cn } from '@/lib/ui'

/**
 * A bolha de prévia.
 *
 * Usa o MESMO `compilarMensagem` que o servidor usa ao materializar os envios.
 * É isso que garante que o texto visto aqui é o texto que chega no aparelho —
 * uma segunda implementação "só para a tela" mentiria no primeiro spintax.
 */

/** O contato de exemplo: os mesmos valores que `VARIAVEIS_PADRAO` documenta. */
const EXEMPLO = {
  nome: 'Maria Aparecida Souza',
  telefone: '5511987654321',
  email: 'maria@exemplo.com.br',
  /*
   * Hora fixa, e não `new Date()`: o relógio do servidor e o do navegador
   * caem em fusos diferentes, a saudação sairia diferente nos dois e a
   * hidratação quebraria.
   */
  hora: 14,
}

/**
 * O texto como vai sair, já com a exigência eleitoral colada no fim.
 *
 * Espelha `textoFinal()` de `lib/campanhas/servico.ts`, que é `server-only` e
 * portanto não pode ser importado por um componente de cliente. Mexeu lá,
 * mexa aqui — senão a prévia passa a prometer um texto e o disparo manda outro.
 */
export function textoQueSai(corpo: string, eleitoral: boolean, frase: string): string {
  if (!eleitoral) return corpo
  if (/\b(sair|descadastr|remover|pare)\b/i.test(corpo)) return corpo
  return `${corpo.trimEnd()}\n\n${frase}`
}

/**
 * Sorteio determinístico (mulberry32).
 *
 * `Math.random` dentro do render daria um texto no servidor e outro no
 * cliente. Com semente, a mesma semente dá sempre a mesma variante — e o
 * botão "outra variante" só troca a semente.
 */
function sorteador(semente: number): () => number {
  let a = semente + 0x6d2b79f5
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOTA_DO_CANAL: Partial<Record<Channel, string>> = {
  sms: 'O SMS não tem formatação: negrito, emoji e quebra de linha chegam como texto puro.',
  rcs: 'No RCS a operadora mostra o nome verificado do remetente acima da mensagem.',
  voz: 'No torpedo de voz este texto é o roteiro que o provedor transforma em áudio.',
}

export function Previa({
  canal,
  corpo,
  mediaUrl,
  eleitoral,
  frase,
}: {
  canal: Channel | null
  corpo: string
  mediaUrl: string
  eleitoral: boolean
  frase: string
}) {
  const [semente, setSemente] = useState(0)

  const modelo = textoQueSai(corpo, eleitoral, frase)
  const texto = compilarMensagem(modelo, EXEMPLO, sorteador(semente))
  const variantes = contarVariantes(modelo)
  const doWhatsapp = canal === 'whatsapp_oficial' || canal === 'whatsapp_nao_oficial'
  const nota = canal ? NOTA_DO_CANAL[canal] : undefined

  return (
    <div className="rounded-[18px] border border-line bg-paper-alt p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[.68rem] font-semibold tracking-[.1em] text-muted uppercase">
          Prévia {canal ? `· ${CANAL_CURTO[canal]}` : ''}
        </span>
        {variantes > 1 ? (
          <button
            type="button"
            onClick={() => setSemente((s) => s + 1)}
            className="text-[.76rem] font-semibold text-blue hover:underline"
          >
            Ver outra variante
          </button>
        ) : null}
      </div>

      <div className="flex justify-end">
        <div
          className={cn(
            'max-w-[86%] rounded-[18px] rounded-tr-[4px] border px-3.5 py-2.5 shadow-[0_6px_16px_-10px_rgba(0,32,88,.35)]',
            doWhatsapp ? 'border-wa/25 bg-wa/12' : 'border-line bg-white',
          )}
        >
          {mediaUrl.trim() ? (
            <div className="mb-2 rounded-[12px] border border-dashed border-line bg-white/70 px-3 py-5 text-center">
              <p className="text-[.74rem] font-semibold text-muted">Mídia anexada</p>
              <p className="mt-1 truncate font-mono text-[.68rem] text-muted">{mediaUrl.trim()}</p>
            </div>
          ) : null}

          {texto ? (
            <p className="text-[.9rem] leading-relaxed break-words whitespace-pre-wrap text-ink">
              {texto}
            </p>
          ) : (
            <p className="text-[.9rem] text-muted italic">A mensagem aparece aqui enquanto você escreve.</p>
          )}

          <p className="mt-1 flex items-center justify-end gap-1 text-[.66rem] text-muted">
            14:32
            {doWhatsapp ? <span className="font-semibold text-[#0a7ea8]">✓✓</span> : null}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[.76rem] leading-relaxed text-muted">
        Exemplo com o contato <b className="font-semibold text-navy">Maria Aparecida Souza</b>. Cada
        pessoa recebe com os dados dela.
        {nota ? ` ${nota}` : ''}
      </p>
    </div>
  )
}
