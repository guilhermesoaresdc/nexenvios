import type { Metadata } from 'next'
import Link from 'next/link'
import { Marca } from '@/components/ui/marca'
import { DOCUMENTOS } from '@/lib/juridico/documentos'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-navy-deep p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 0 0, rgba(0,176,248,.25), transparent 60%)',
          }}
        />
        <Link href="/" className="relative w-fit">
          <Marca size={30} claro />
        </Link>
        <div className="relative my-16 max-w-lg">
          <p className="font-mono text-xs tracking-[.16em] text-cyan uppercase">
            Sua operação, conectada
          </p>
          <h2 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.8rem)] leading-[1.08] font-bold text-white">
            Mais controle.
            <br />
            Do primeiro contato
            <br />
            <span className="text-cyan">ao resultado.</span>
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-[#c3d3f2]">
            Organize seus contatos, acompanhe campanhas e consulte seu saldo em um só lugar.
          </p>
          <div className="mt-10 rounded-2xl border border-white/15 bg-white/5 p-6">
            <p className="text-sm font-semibold text-white">Tudo no seu painel</p>
            <ul className="mt-4 space-y-3 text-sm text-[#c3d3f2]">
              {[
                'Contatos e listas da sua empresa',
                'Acompanhamento dos envios',
                'Saldo e histórico de consumo',
              ].map((x) => (
                <li key={x} className="flex gap-3">
                  <span aria-hidden="true" className="text-cyan">
                    ✓
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative text-xs text-[#8fa6d6]">
          Nex Envios · Sua comunicação em movimento.
        </p>
      </aside>
      <main className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Marca size={30} />
          </Link>
          {children}
          <div className="mt-10 border-t border-line pt-6">
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted">
              {DOCUMENTOS.map((d) => (
                <Link key={d.rota} href={d.rota} className="hover:text-navy">
                  {d.titulo}
                </Link>
              ))}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
