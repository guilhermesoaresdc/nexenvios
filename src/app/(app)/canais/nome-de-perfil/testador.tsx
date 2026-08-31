'use client'

import { useMemo, useState } from 'react'
import {
  BONS,
  conferirNomeDePerfil,
  REGRAS,
  TAMANHO_MAXIMO,
  TAMANHO_MINIMO,
} from '@/lib/channels/nome-perfil'
import { cn } from '@/lib/ui'
import { Aviso, Campo, Entrada, Pad, PadTitulo } from '@/components/ui/base'

/**
 * O testador de nome de perfil.
 *
 * Roda inteiro no navegador, contra as mesmas regras que o servidor aplica
 * antes de subir a campanha. Conferir aqui leva dez segundos; destravar uma
 * campanha reprovada no meio do disparo, não.
 */
export function Testador() {
  const [nome, setNome] = useState('')
  const veredito = useMemo(() => (nome.trim() ? conferirNomeDePerfil(nome) : null), [nome])

  return (
    <>
      <Pad className="mb-6">
        <PadTitulo
          titulo="Teste o nome agora"
          descricao={`Digite e confira na hora. Entre ${TAMANHO_MINIMO} e ${TAMANHO_MAXIMO} caracteres.`}
        />
        <div className="p-6">
          <Campo rotulo="Nome do perfil">
            <Entrada
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Moveis Silva"
              autoFocus
              aria-describedby="veredito"
            />
          </Campo>

          <div id="veredito" aria-live="polite" className="mt-4">
            {veredito === null ? (
              <p className="text-[.86rem] text-muted">
                O resultado aparece aqui conforme você digita.
              </p>
            ) : veredito.ok ? (
              <Aviso tom="ok" titulo="Esse nome passa nas regras conhecidas">
                Nada aqui é garantia: quem decide é a Meta, e o Monitor de Envios aplica a régua
                deles no momento do envio. Mas os motivos que mais reprovam já foram conferidos.
              </Aviso>
            ) : (
              <Aviso tom="erro" titulo="Esse nome não passa">
                {veredito.motivo}
              </Aviso>
            )}
          </div>

          <div className="mt-6">
            <p className="mb-2 font-mono text-[.66rem] tracking-[.1em] text-muted uppercase">
              Exemplos que passam
            </p>
            <div className="flex flex-wrap gap-2">
              {BONS.map((bom) => (
                <button
                  key={bom}
                  type="button"
                  onClick={() => setNome(bom)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-[.82rem] font-semibold text-navy transition-colors hover:border-blue hover:text-blue"
                >
                  {bom}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Pad>

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        {REGRAS.map((regra) => (
          <Pad key={regra.id}>
            <div className="p-6">
              <p
                className={cn(
                  'text-[1rem] font-semibold',
                  veredito && !veredito.ok && veredito.regra === regra.id
                    ? 'text-danger'
                    : 'text-navy',
                )}
              >
                {regra.titulo}
              </p>
              <p className="mt-1.5 text-[.88rem] leading-relaxed text-muted">{regra.explica}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                {regra.ruins.map((ruim) => (
                  <button
                    key={ruim}
                    type="button"
                    onClick={() => setNome(ruim)}
                    className="text-[.84rem] font-semibold text-muted line-through decoration-danger/60 transition-colors hover:text-danger"
                    title="Testar este exemplo"
                  >
                    {ruim}
                  </button>
                ))}
              </div>
            </div>
          </Pad>
        ))}
      </div>
    </>
  )
}
