import Link from 'next/link'
import { Marca } from '@/components/ui/marca'
import { DOCUMENTOS } from '@/lib/juridico/documentos'

/**
 * A casca das telas de porta: entrar, recuperar senha, definir senha.
 *
 * Metade azul-marinho com a promessa do produto, metade branca com o
 * formulário. No celular sobra só o formulário — quem está entrando pelo
 * telefone quer entrar, não ler.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy to-navy-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(600px 400px at 20% 10%, rgba(0,176,248,.22), transparent 60%), radial-gradient(500px 400px at 90% 90%, rgba(0,120,248,.18), transparent 60%)',
          }}
        />
        <Link href="/" className="relative">
          <Marca size={30} claro />
        </Link>

        <div className="relative max-w-md">
          <p className="font-mono text-[.72rem] tracking-[.13em] text-cyan uppercase">
            Disparos em massa
          </p>
          <p className="mt-4 font-display text-[2rem] leading-[1.15] font-bold text-white">
            Cinco canais. Uma única operação de disparo.
          </p>
          <p className="mt-4 text-[.98rem] leading-relaxed text-[#c3d3f2]">
            WhatsApp Oficial, API não oficial, SMS, RCS e Torpedo de Voz — com ritmo, janela de
            silêncio e descadastro respeitados em todos eles.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-x-8 gap-y-3 font-mono text-[.72rem] tracking-[.1em] text-[#8fa6d6] uppercase">
          <span>+100 milhões entregues</span>
          <span>Corban · iGaming · Escala</span>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Marca size={30} />
          </Link>
          {children}

          {/*
            Os documentos ficam à vista na porta de entrada.
            Quem cria conta aceita os Termos ao entrar; ter que sair procurando
            o que aceitou transforma o aceite em formalidade vazia.
          */}
          <p className="mt-10 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[.78rem] text-muted">
            {DOCUMENTOS.map((d) => (
              <Link key={d.rota} href={d.rota} className="transition-colors hover:text-navy">
                {d.titulo}
              </Link>
            ))}
          </p>
        </div>
      </main>
    </div>
  )
}
