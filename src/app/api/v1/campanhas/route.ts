import { z } from 'zod'
import { channelEnum } from '@/db/schema/enums'
import { erro, exigirChave } from '@/lib/api/chave'
import { criarCampanha } from '@/lib/campanhas/servico'
import { listarCampanhas } from '@/db/queries/campanhas'
import { canalPadrao } from '@/lib/canais/padrao'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const fonte = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('lista'), chave: z.string().uuid(), rotulo: z.string().optional() }),
  z.object({ tipo: z.literal('etiqueta'), chave: z.string().min(1).max(60), rotulo: z.string().optional() }),
  z.object({ tipo: z.literal('todos'), chave: z.literal('todos').optional(), rotulo: z.string().optional() }),
])

const corpo = z.object({
  nome: z.string().trim().min(2).max(120),
  canal: z.enum(channelEnum.enumValues),
  mensagem: z.string().trim().min(1).max(4_000),
  fontes: z.array(fonte).min(1, 'Informe ao menos uma fonte de público.'),
  configId: z.string().uuid().optional(),
  mediaUrl: z.string().url().optional(),
  ritmo: z.coerce.number().int().min(1).max(6_000).optional(),
  janelaInicio: z.coerce.number().int().min(0).max(23).optional(),
  janelaFim: z.coerce.number().int().min(1).max(24).optional(),
  agendarPara: z.string().datetime().optional(),
  /**
   * O perfil do WhatsApp, para canal de entrega delegada (Monitor de Envios).
   *
   * Opcional: sem ele vale o perfil padrão cadastrado no canal. Sem nenhum dos
   * dois a criação é recusada — e a mensagem diz qual dos caminhos usar.
   */
  perfil: z
    .object({
      nome: z.string().trim().min(1).max(25),
      fotoUrl: z.string().url(),
      nome2: z.string().trim().min(1).max(25),
      fotoUrl2: z.string().url(),
    })
    .optional(),
  /** Exigida quando `eleitoral` é true num canal de entrega delegada. */
  politica: z
    .object({
      documento: z.string().trim().min(11).max(20),
      partido: z.string().trim().min(1).max(60),
    })
    .optional(),
  eleitoral: z.boolean().optional(),
})

/** POST /api/v1/campanhas — cria um disparo em massa. */
export async function POST(req: Request) {
  const conferido = await exigirChave(req, 'envios:escrever')
  if ('resposta' in conferido) return conferido.resposta
  const { orgId } = conferido.auth

  let entrada: unknown
  try {
    entrada = await req.json()
  } catch {
    return erro('O corpo precisa ser um JSON válido.', 400, 'json_invalido')
  }

  const dados = corpo.safeParse(entrada)
  if (!dados.success) {
    return erro(dados.error.issues[0]?.message ?? 'Corpo inválido.', 422, 'corpo_invalido')
  }

  const configId = dados.data.configId ?? (await canalPadrao(orgId, dados.data.canal))
  if (!configId) {
    return erro(`Nenhum canal de ${dados.data.canal} configurado.`, 409, 'sem_canal')
  }

  const r = await criarCampanha(orgId, null, {
    nome: dados.data.nome,
    canal: dados.data.canal,
    configId,
    corpo: dados.data.mensagem,
    mediaUrl: dados.data.mediaUrl,
    fontes: dados.data.fontes.map((f) =>
      f.tipo === 'todos'
        ? { tipo: 'todos' as const, chave: 'todos' as const, rotulo: f.rotulo ?? 'Toda a base' }
        : { tipo: f.tipo, chave: f.chave, rotulo: f.rotulo ?? f.chave },
    ),
    ratePerMinute: dados.data.ritmo,
    quietStart: dados.data.janelaInicio,
    quietEnd: dados.data.janelaFim,
    eleitoral: dados.data.eleitoral,
    agendarPara: dados.data.agendarPara ? new Date(dados.data.agendarPara) : null,
    perfil: dados.data.perfil ?? null,
    politica: dados.data.politica ?? null,
  })

  if (!r.ok) {
    const semSaldo = r.erro.includes('Saldo insuficiente')
    return erro(r.erro, semSaldo ? 402 : 422, semSaldo ? 'sem_saldo' : 'nao_criada')
  }

  return Response.json(
    {
      id: r.campanhaId,
      destinatarios: r.destinatarios,
      custoEstimado: r.custo,
      aparado: r.aparado,
      status: 'preparando',
    },
    { status: 201 },
  )
}

/** GET /api/v1/campanhas — lista as campanhas da conta. */
export async function GET(req: Request) {
  const conferido = await exigirChave(req, 'envios:ler')
  if ('resposta' in conferido) return conferido.resposta

  const url = new URL(req.url)
  const limite = Math.min(Math.max(Number(url.searchParams.get('limite')) || 30, 1), 100)
  const pular = Math.max(Number(url.searchParams.get('pular')) || 0, 0)

  const linhas = await listarCampanhas(conferido.auth.orgId, { limite, pular })

  return Response.json({
    campanhas: linhas.map((c) => ({
      id: c.id,
      nome: c.nome,
      canal: c.canal,
      status: c.status,
      total: c.total,
      pendentes: c.pendentes,
      enviados: c.enviados,
      entregues: c.entregues,
      falhas: c.falhas,
      custoEstimado: Number(c.custoPrevisto),
      custoReal: Number(c.custoReal),
      fontes: c.fontes,
      criadaEm: c.criadaEm,
      agendadaPara: c.agendadaPara,
      terminadaEm: c.terminadaEm,
    })),
    limite,
    pular,
  })
}
