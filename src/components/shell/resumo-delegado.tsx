import { sql } from '@/db'
import { exigirTimeNex, exigirUsuario } from '@/lib/auth/atual'
import { Numero } from '@/components/ui/base'
import { numero } from '@/lib/ui'
export async function ResumoDelegado({ global = false }: { global?: boolean }) {
  const usuario = global ? await exigirTimeNex() : await exigirUsuario()
  const [r] = await sql<
    { campanhas: number; confirmadas: number; aguardando: number; falhas: number }[]
  >`
    SELECT count(*)::int AS campanhas,COALESCE(sum(external_billed),0)::int AS confirmadas,
      count(*) FILTER(WHERE status='aguardando')::int AS aguardando,
      count(*) FILTER(WHERE external_sync_failures>0)::int AS falhas
    FROM campaigns WHERE external_provider IS NOT NULL AND (${global} OR org_id=${usuario.orgId})
  `
  if (!r?.campanhas) return null
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold text-navy">Envios pelo provedor</h2>
      <p className="mb-4 text-sm text-muted">
        Acumulado das campanhas delegadas. O provedor retorna totais por campanha; os indicadores
        diários abaixo consideram os envios individuais.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Processadas pelo provedor" valor={numero(r.confirmadas)} />
        <Numero rotulo="Campanhas aguardando" valor={numero(r.aguardando)} />
        <Numero
          rotulo="Com falha de acompanhamento"
          valor={numero(r.falhas)}
          tom={r.falhas ? 'vermelho' : 'navy'}
        />
      </div>
    </section>
  )
}
