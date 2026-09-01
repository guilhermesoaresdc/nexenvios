import 'server-only'
import { sql } from '@/db'
import { entregaACampanhaInteira, type Channel, type InstanceStatus } from '@/db/schema/enums'
import { lerSegredo } from '@/lib/cripto'

/** Consultas das telas de canal. */

export type CanalConfigurado = {
  id: string
  canal: Channel
  provedor: string
  rotulo: string
  ativo: boolean
  padrao: boolean
  /** Nulo quando é o provedor da plataforma, herdado por todos os clientes. */
  orgId: string | null
  temCredencial: boolean
  quebradoAte: Date | null
  falhasSeguidas: number
  atualizadoEm: Date
  /** Quantos números conectados, quando o canal é WhatsApp não oficial. */
  numeros: number
  /**
   * O perfil padrão do Monitor de Envios, para o assistente já vir preenchido.
   *
   * Sai da credencial cifrada de propósito, mas NÃO é segredo: nome e foto do
   * perfil são exatamente o que o destinatário vê no WhatsApp. O token, esse
   * nunca sai — só estes quatro campos.
   */
  perfilPadrao: {
    nome: string
    fotoUrl: string
    nome2: string
    fotoUrl2: string
  } | null
}

/**
 * Os canais que esta organização pode usar: os dela e os da plataforma.
 *
 * A credencial NUNCA sai daqui — só `temCredencial`. Mandar o segredo para a
 * tela e escondê-lo com CSS é o mesmo que publicá-lo.
 */
export async function canaisDaOrg(orgId: string): Promise<CanalConfigurado[]> {
  const linhas = await sql<(Omit<CanalConfigurado, 'perfilPadrao'> & { credenciais: string | null })[]>`
    SELECT c.id, c.channel AS canal, c.provider AS provedor, c.label AS rotulo,
           c.active AS ativo, c.is_default AS padrao, c.org_id AS "orgId",
           (c.credentials IS NOT NULL) AS "temCredencial",
           c.broken_until AS "quebradoAte", c.failure_streak AS "falhasSeguidas",
           c.updated_at AS "atualizadoEm",
           c.credentials AS credenciais,
           (SELECT count(*)::int FROM whatsapp_instances w
             WHERE w.config_id = c.id AND w.active AND w.status = 'conectado') AS numeros
      FROM channel_configs c
     WHERE c.org_id = ${orgId} OR c.org_id IS NULL
     ORDER BY (c.org_id IS NULL), c.channel, c.label
  `

  return linhas.map(({ credenciais, ...canal }) => ({
    ...canal,
    // A credencial some aqui. Só os quatro campos de perfil seguem, e só para
    // o provedor que os usa.
    perfilPadrao: entregaACampanhaInteira(canal.provedor) ? perfilDe(credenciais) : null,
  }))
}

/** Só o perfil, decifrado. O token fica para trás. */
function perfilDe(credenciais: string | null): CanalConfigurado['perfilPadrao'] {
  const segredo = lerSegredo<Record<string, unknown>>(credenciais)
  if (!segredo) return null
  const texto = (chave: string) => (typeof segredo[chave] === 'string' ? (segredo[chave] as string) : '')
  const perfil = {
    nome: texto('perfilNome'),
    fotoUrl: texto('perfilFoto'),
    nome2: texto('perfilNome2'),
    fotoUrl2: texto('perfilFoto2'),
  }
  return perfil.nome || perfil.fotoUrl || perfil.nome2 || perfil.fotoUrl2 ? perfil : null
}

export type NumeroConectado = {
  id: string
  nome: string
  instancia: string
  telefone: string | null
  status: InstanceStatus
  tetoDiario: number
  enviadosHoje: number
  intervaloMs: number
  ultimoEnvio: Date | null
  vistoEm: Date | null
}

export async function numerosDaOrg(orgId: string): Promise<NumeroConectado[]> {
  return sql<NumeroConectado[]>`
    SELECT id, name AS nome, instance_name AS instancia, phone AS telefone,
           status, daily_cap AS "tetoDiario",
           CASE WHEN counter_day < (now() AT TIME ZONE 'America/Sao_Paulo')::date
                THEN 0 ELSE sent_today END AS "enviadosHoje",
           min_interval_ms AS "intervaloMs",
           last_sent_at AS "ultimoEnvio", last_seen_at AS "vistoEm"
      FROM whatsapp_instances
     WHERE org_id = ${orgId} AND active
     ORDER BY created_at
  `
}
