'use client'

export default function ErroDoLink() {
  return (
    <div className="space-y-5" role="alert">
      <h1 className="text-[1.75rem] leading-tight">Não foi possível conferir o link</h1>
      <p className="text-muted">A conexão demorou ou foi interrompida. Você pode tentar abrir este mesmo link novamente.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-blue px-6 py-3 font-semibold text-white">
        Tentar novamente
      </button>
    </div>
  )
}
