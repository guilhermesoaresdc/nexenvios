'use client'

export function ErroDeCarregamento() {
  return (
    <section role="alert" className="rounded-2xl border border-line bg-white p-8">
      <h1 className="text-2xl font-semibold text-navy">Não foi possível carregar esta página</h1>
      <p className="mt-3 text-muted">
        A consulta não terminou. Você pode tentar novamente ou abrir outra opção do menu.
      </p>
      <button type="button" onClick={() => window.location.reload()}
        className="mt-6 rounded-full bg-blue px-6 py-3 font-semibold text-white">
        Tentar novamente
      </button>
    </section>
  )
}
