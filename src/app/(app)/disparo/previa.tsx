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
 *
 * A mídia aparece RENDERIZADA, não como endereço. Ver o link do arquivo não
 * responde a pergunta que a prévia existe para responder — se a imagem certa
 * vai junto, e se ela fica legível no tamanho em que chega. Uma foto trocada
 * só é barata de descobrir antes de mandar.
 */

/** O contato de exemplo: os mesmos valores que `VARIAVEIS_PADRAO` documenta. */
const EXEMPLO = {
  nome: 'Maria Aparecida Souza',
  telefone: '5511987654321',
  email: 'maria@exemplo.com.br',
}

/*
 * Hora fixa quando não há agendamento — e não `new Date()`.
 *
 * O relógio do servidor e o do navegador caem em fusos diferentes: a saudação
 * sairia diferente nos dois e a hidratação quebraria.
 */
const HORA_PADRAO = 14
const RELOGIO_PADRAO = '14:32'

/**
 * Quando a mensagem chega, lido do campo de agendamento.
 *
 * Não é enfeite: `{{saudacao}}` depende da HORA. Uma campanha marcada para as
 * 9h30 chega com "Bom dia", e a prévia que insistisse nas 14h fixas mostraria
 * "Boa tarde" — errando justamente no que ela existe para conferir. O valor
 * vem do formulário, então continua determinístico.
 */
function lerAgendamento(bruto?: string): { data: string; relogio: string; hora: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec((bruto ?? '').trim())
  if (!m) return null
  const [, ano, mes, dia, hh, mm] = m
  return { data: `${dia}/${mes}/${ano}`, relogio: `${hh}:${mm}`, hora: Number(hh) }
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

const EXTENSAO = /\.([a-z0-9]+)(?:[?#].*)?$/i

function tipoDaMidia(url: string): 'imagem' | 'audio' | 'video' | 'documento' {
  const ext = EXTENSAO.exec(url)?.[1]?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'imagem'
  if (['mp3', 'ogg', 'oga', 'm4a', 'aac', 'wav'].includes(ext)) return 'audio'
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video'
  return 'documento'
}

function nomeDoArquivo(url: string): string {
  try {
    const ultimo = new URL(url).pathname.split('/').pop()
    return ultimo || url
  } catch {
    return url.split('/').pop() || url
  }
}

const ROTULO_DA_MIDIA: Record<ReturnType<typeof tipoDaMidia>, string> = {
  imagem: 'Imagem',
  audio: 'Áudio',
  video: 'Vídeo',
  documento: 'Documento',
}

function Midia({ url }: { url: string }) {
  const [quebrou, setQuebrou] = useState(false)
  const tipo = tipoDaMidia(url)

  if (tipo === 'imagem' && !quebrou) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element --
         o arquivo é do cliente e vem da nossa rota ou de um link dele;
         `next/image` exigiria cadastrar domínio remoto para não otimizar nada. */
      <img
        src={url}
        alt="Mídia da mensagem"
        onError={() => setQuebrou(true)}
        className="mb-1.5 block max-h-[220px] w-full rounded-[10px] border border-black/5 object-cover"
      />
    )
  }

  return (
    <div className="mb-1.5 flex items-center gap-2.5 rounded-[10px] border border-black/5 bg-white/70 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-navy/8 font-mono text-[.6rem] font-semibold text-navy">
        {(EXTENSAO.exec(url)?.[1] ?? '?').slice(0, 4).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block text-[.78rem] font-semibold text-ink">{ROTULO_DA_MIDIA[tipo]}</span>
        <span className="block truncate text-[.7rem] text-muted">{nomeDoArquivo(url)}</span>
      </span>
    </div>
  )
}

export function Previa({
  canal,
  corpo,
  mediaUrl,
  eleitoral,
  frase,
  perfilNome,
  perfilFoto,
  agendadoPara,
}: {
  canal: Channel | null
  corpo: string
  mediaUrl: string
  eleitoral: boolean
  frase: string
  /** O nome que aparece no aparelho de quem recebe. */
  perfilNome?: string
  perfilFoto?: string
  /** O valor cru do campo de agendamento (`2026-09-15T09:30`), se houver. */
  agendadoPara?: string
}) {
  const [semente, setSemente] = useState(0)

  const agenda = lerAgendamento(agendadoPara)
  const modelo = textoQueSai(corpo, eleitoral, frase)
  const texto = compilarMensagem(
    modelo,
    { ...EXEMPLO, hora: agenda?.hora ?? HORA_PADRAO },
    sorteador(semente),
  )
  const variantes = contarVariantes(modelo)
  const doWhatsapp = canal === 'whatsapp_oficial' || canal === 'whatsapp_nao_oficial'
  const nota = canal ? NOTA_DO_CANAL[canal] : undefined
  const midia = mediaUrl.trim()
  const remetente = perfilNome?.trim() || 'Sua empresa'

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="font-mono text-[.68rem] font-semibold tracking-[.1em] text-muted uppercase">
          Prévia {canal ? `· ${CANAL_CURTO[canal]}` : ''}
        </span>
        {variantes > 1 ? (
          <button
            type="button"
            onClick={() => setSemente((s) => s + 1)}
            className="text-[.74rem] font-semibold text-blue hover:underline"
          >
            Outra variante
          </button>
        ) : null}
      </div>

      {/*
        O cabeçalho do aparelho. Nome e foto de perfil são o que o
        destinatário vê ANTES de ler a mensagem — mostrá-los aqui é o que
        transforma isto numa prévia do que chega, e não de um texto solto.
      */}
      {doWhatsapp ? (
        <div className="flex items-center gap-2.5 border-b border-line bg-navy px-4 py-2.5">
          {perfilFoto?.trim() ? (
            /* eslint-disable-next-line @next/next/no-img-element -- mesma razão de `Midia`. */
            <img
              src={perfilFoto.trim()}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full border border-white/25 object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-[.8rem] font-semibold text-white">
              {remetente.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[.84rem] font-semibold text-white">{remetente}</span>
            <span className="block text-[.68rem] text-white/60">online</span>
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          'space-y-2.5 px-4 py-4',
          doWhatsapp ? 'bg-[#e9e3db]' : 'bg-paper-alt',
        )}
      >
        <div className="flex justify-center">
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-[.66rem] font-semibold text-muted shadow-[0_1px_2px_rgba(0,32,88,.08)]">
            {agenda ? agenda.data : 'Hoje'}
          </span>
        </div>

        <div className="flex justify-end">
          <div
            className={cn(
              'max-w-[88%] min-w-[120px] rounded-[10px] rounded-tr-[3px] px-2 pt-2 pb-1 shadow-[0_1px_2px_rgba(0,32,88,.16)]',
              doWhatsapp ? 'bg-[#d9fdd3]' : 'border border-line bg-white',
            )}
          >
            {midia ? <Midia url={midia} /> : null}

            <div className="px-1">
              {texto ? (
                <p className="text-[.86rem] leading-relaxed break-words whitespace-pre-wrap text-ink">
                  {texto}
                </p>
              ) : (
                <p className="text-[.86rem] text-muted italic">
                  A mensagem aparece aqui enquanto você escreve.
                </p>
              )}

              <p className="mt-0.5 flex items-center justify-end gap-1 text-[.64rem] text-muted">
                {agenda ? agenda.relogio : RELOGIO_PADRAO}
                {doWhatsapp ? <span className="font-semibold text-[#0a7ea8]">✓✓</span> : null}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-line px-4 py-3 text-[.74rem] leading-relaxed text-muted">
        Exemplo com o contato <b className="font-semibold text-navy">Maria Aparecida Souza</b>. Cada
        pessoa recebe com os dados dela.
        {nota ? ` ${nota}` : ''}
      </p>
    </div>
  )
}
