'use client'

import { useRef, useState, useTransition } from 'react'
import { subirArquivo } from '@/lib/midia/acoes'
import { Botao } from './base'

/**
 * Escolher um arquivo do computador, ou colar um link.
 *
 * Os dois caminhos porque os dois existem de verdade: quem já tem a imagem
 * hospedada cola o endereço, e quem tem o arquivo na máquina não deveria
 * precisar hospedar em lugar nenhum antes de usar o produto.
 *
 * O valor final é sempre um endereço — é o que o provedor recebe. O upload não
 * muda o formato do dado, só passa a produzir esse endereço aqui dentro.
 */

export function CampoDeImagem({
  name,
  value,
  onChange,
  uso = 'perfil',
  daPlataforma,
  exemplo,
  obrigatorio,
}: {
  name: string
  value: string
  onChange: (url: string) => void
  uso?: 'perfil' | 'midia'
  daPlataforma?: boolean
  exemplo?: string
  obrigatorio?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [medida, setMedida] = useState<string | null>(null)
  const [subindo, iniciar] = useTransition()

  const aceita = uso === 'perfil' ? 'image/png,image/jpeg,image/webp' : 'image/*,application/pdf,audio/*,video/mp4'

  function escolher(arquivo: File) {
    setErro(null)
    setMedida(null)
    const form = new FormData()
    form.set('arquivo', arquivo)
    form.set('uso', uso)
    if (daPlataforma) form.set('daPlataforma', '1')

    iniciar(async () => {
      const r = await subirArquivo(undefined, form)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      onChange(r.url)
      if (r.largura && r.altura) setMedida(`${r.largura}×${r.altura}`)
    })
  }

  // Só a imagem enviada aqui tem miniatura garantida; um link colado pode ser
  // PDF ou áudio, e um <img> quebrado é pior do que miniatura nenhuma.
  const ehImagem = /\.(png|jpe?g|webp|gif)$/i.test(value)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {ehImagem ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             o arquivo é do cliente e vem da nossa rota; `next/image` exigiria
             configurar domínio remoto para não otimizar nada. */
          <img
            src={value}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-line bg-paper-alt object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-line bg-paper-alt text-[.7rem] text-muted">
            {value ? 'link' : 'sem foto'}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={entrada}
              type="file"
              accept={aceita}
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0]
                if (arquivo) escolher(arquivo)
                // Limpa para que escolher o MESMO arquivo de novo dispare de novo.
                e.target.value = ''
              }}
            />
            <Botao
              type="button"
              tom="contorno"
              tamanho="sm"
              disabled={subindo}
              onClick={() => entrada.current?.click()}
            >
              {subindo ? 'Enviando…' : value ? 'Trocar arquivo' : 'Escolher arquivo'}
            </Botao>
            {value ? (
              <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => onChange('')}>
                Remover
              </Botao>
            ) : null}
            {medida ? <span className="text-[.75rem] text-muted">{medida}</span> : null}
          </div>

          <input
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={obrigatorio}
            placeholder={exemplo ?? 'ou cole o link de uma imagem'}
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-[.82rem] text-ink transition-colors placeholder:text-[#9aa8c4] focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
          />
        </div>
      </div>

      {erro ? <p className="text-[.78rem] text-danger">{erro}</p> : null}
    </div>
  )
}
