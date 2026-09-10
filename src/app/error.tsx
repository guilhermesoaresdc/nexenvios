'use client'

export default function ErroDaPagina() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <section role="alert" className="max-w-lg rounded-2xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold text-navy">Não foi possível carregar esta página</h1>
        <p className="mt-3 text-muted">
          Ocorreu uma falha temporária. Tente carregar novamente em instantes.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-full bg-blue px-6 py-3 font-semibold text-white"
        >
          Tentar novamente
        </button>
      </section>
    </main>
  )
}
