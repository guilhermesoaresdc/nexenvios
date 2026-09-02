import Link from 'next/link'
import { Marca } from '@/components/ui/marca'
import { DOCUMENTOS } from '@/lib/juridico/documentos'

/**
 * A casca dos documentos jurídicos.
 *
 * Sóbria de propósito: sem animação, sem botão flutuante de WhatsApp, sem
 * chamada para ação. Quem chega aqui está conferindo um compromisso — de
 * dentro do produto, de um contrato ou do cadastro da Meta — e o que a página
 * precisa fazer é deixar ler e deixar sair.
 */
export default function LayoutJuridico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-6 py-4 max-sm:px-4">
          <Link href="/" aria-label="Nex Envios — início">
            <Marca size={28} />
          </Link>
          <nav aria-label="Documentos" className="flex items-center gap-5 text-[.86rem] font-medium">
            {DOCUMENTOS.map((d) => (
              <Link
                key={d.rota}
                href={d.rota}
                className="text-muted transition-colors hover:text-navy"
              >
                {d.titulo}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[.82rem] text-muted max-sm:px-4">
          <span>© {new Date().getFullYear()} NEX CREATIVE LTDA · CNPJ 58.132.444/0001-60</span>
          <Link href="/" className="font-medium text-navy transition-colors hover:text-blue">
            Voltar ao site
          </Link>
        </div>
      </footer>
    </div>
  )
}
