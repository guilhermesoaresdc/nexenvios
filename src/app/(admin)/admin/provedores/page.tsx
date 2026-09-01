import type { Metadata } from 'next'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { sql } from '@/db'
import { CANAL_CODIGO, CANAL_LABEL, PROVEDOR_LABEL, type Channel } from '@/db/schema/enums'
import { Aviso, Etiqueta, Pad, PadTitulo } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { Cartao, Novo } from './painel'
import { entregaACampanhaInteira } from '@/db/schema/enums'
import { lerSegredo } from '@/lib/cripto'

export const metadata: Metadata = { title: 'Provedores' }
export const dynamic = 'force-dynamic'

type ProvedorDaPlataforma = {
  id: string
  canal: Channel
  provedor: string
  rotulo: string
  ativo: boolean
  padrao: boolean
  temCredencial: boolean
  quebradoAte: Date | null
  falhasSeguidas: number
  /** Quantos clientes distintos enviaram por ele nos últimos 30 dias. */
  clientes: number
  envios30: number
  credenciais: string | null
}

/**
 * Só o perfil, decifrado — o token fica para trás.
 *
 * Nome e foto de perfil são o que o destinatário vê; não há segredo neles, e
 * devolvê-los evita que abrir a edição pareça ter apagado o cadastro. Espelha
 * o mesmo recorte de `queries/canais.ts`.
 */
function perfilDe(credenciais: string | null) {
  const segredo = lerSegredo<Record<string, unknown>>(credenciais)
  if (!segredo) return null
  const texto = (c: string) => (typeof segredo[c] === 'string' ? (segredo[c] as string) : '')
  const perfil = {
    nome: texto('perfilNome'),
    fotoUrl: texto('perfilFoto'),
    nome2: texto('perfilNome2'),
    fotoUrl2: texto('perfilFoto2'),
  }
  return perfil.nome || perfil.fotoUrl || perfil.nome2 || perfil.fotoUrl2 ? perfil : null
}

export default async function Provedores() {
  await exigirSuperadmin()

  const linhas = await sql<ProvedorDaPlataforma[]>`
    SELECT c.id, c.channel AS canal, c.provider AS provedor, c.label AS rotulo,
           c.active AS ativo, c.is_default AS padrao,
           (c.credentials IS NOT NULL) AS "temCredencial",
           c.credentials AS credenciais,
           c.broken_until AS "quebradoAte", c.failure_streak AS "falhasSeguidas",
           (SELECT count(DISTINCT d.org_id)::int FROM dispatches d
             WHERE d.config_id = c.id AND d.created_at >= now() - interval '30 days') AS clientes,
           (SELECT count(*)::int FROM dispatches d
             WHERE d.config_id = c.id AND d.created_at >= now() - interval '30 days') AS "envios30"
      FROM channel_configs c
     WHERE c.org_id IS NULL
     ORDER BY c.channel, c.label
  `

  return (
    <>
      <Titulo
        titulo="Provedores da plataforma"
        descricao="As credenciais da própria Nex Envios. Todo cliente que não trouxer o canal dele envia por aqui."
      />

      <Aviso tom="alerta" className="mb-6">
        Uma credencial errada nesta tela derruba o disparo de <b>todos</b> os clientes que dependem
        dela. O cliente que configura o próprio canal não é afetado.
      </Aviso>

      <div className="space-y-5">
        {linhas.length > 0 ? (
          <Pad>
            <PadTitulo titulo="Configurados" descricao="Uso nos últimos 30 dias." />
            <div className="space-y-4 p-6">
              {linhas.map((p) => (
                <Cartao
                  key={p.id}
                  provedor={{
                    id: p.id,
                    canal: p.canal,
                    provedor: p.provedor,
                    rotulo: p.rotulo,
                    ativo: p.ativo,
                    padrao: p.padrao,
                    temCredencial: p.temCredencial,
                    perfil: entregaACampanhaInteira(p.provedor) ? perfilDe(p.credenciais) : null,
                  }}
                  titulo={
                    <span className="flex flex-wrap items-center gap-2">
                      <Etiqueta>{CANAL_CODIGO[p.canal]}</Etiqueta>
                      {CANAL_LABEL[p.canal]} · {PROVEDOR_LABEL[p.provedor] ?? p.provedor}
                    </span>
                  }
                  clientes={p.clientes}
                  envios30={p.envios30}
                  quebradoAte={p.quebradoAte ? p.quebradoAte.toISOString() : null}
                  falhasSeguidas={p.falhasSeguidas}
                />
              ))}
            </div>
          </Pad>
        ) : null}

        <Pad>
          <PadTitulo
            titulo="Novo provedor"
            descricao="Escolha o canal e o provedor, e informe a credencial da Nex Envios."
          />
          <div className="p-6">
            <Novo />
          </div>
        </Pad>
      </div>
    </>
  )
}
