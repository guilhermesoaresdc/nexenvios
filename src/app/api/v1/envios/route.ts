import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { contacts, creditLedger, dispatches, organizations } from '@/db/schema'
import { channelEnum, entregaACampanhaInteira, nomeDoProvedor } from '@/db/schema/enums'
import { erro, exigirChave } from '@/lib/api/chave'
import { canalPadrao, provedorDoCanal } from '@/lib/canais/padrao'
import { precoDoCanal } from '@/lib/campanhas/servico'
import { enviarAgora } from '@/lib/delivery/motor'
import { medirSms } from '@/lib/mensagem'
import { normalizarTelefone } from '@/lib/telefone'
import { listarHistorico } from '@/db/queries/historico'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const corpo = z.object({
  canal: z.enum(channelEnum.enumValues),
  para: z.string().min(8),
  mensagem: z.string().trim().min(1).max(4_000),
  nome: z.string().max(120).optional().nullable(),
  configId: z.string().uuid().optional(),
  mediaUrl: z.string().url().optional(),
})

/** POST /api/v1/envios — manda uma mensagem avulsa, agora. */
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

  const telefone = normalizarTelefone(dados.data.para)
  if (!telefone.ok) {
    return erro(`Número inválido: ${telefone.motivo}.`, 422, 'destino_invalido')
  }

  // O descadastro vale para a API também — senão ela seria a porta lateral
  // mais fácil para fora da LGPD.
  const [contato] = await db
    .select({ id: contacts.id, optedOut: contacts.optedOut, nome: contacts.name })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, telefone.e164)))
    .limit(1)

  if (contato?.optedOut) {
    return erro('Este número pediu para não receber mensagens.', 409, 'descadastrado')
  }

  // Sem configId, vale a regra única de escolha de canal.
  const configId =
    dados.data.configId ??
    (await canalPadrao(orgId, dados.data.canal, { precisaDeEnvioAvulso: true }))

  if (!configId) {
    return erro(`Nenhum canal de ${dados.data.canal} configurado.`, 409, 'sem_canal')
  }

  /*
   * Canal que entrega a campanha inteira não tem mensagem avulsa.
   *
   * Sem esta conferência o pedido caía em `enviarAgora`, que devolvia 502
   * "sem_credencial" — acusando a credencial, que está certa. Pior: a escolha
   * automática podia pegar o Monitor como canal padrão da conta e transformar
   * toda chamada de /envios num 502 sem explicação.
   */
  const provedor = await provedorDoCanal(orgId, configId)
  if (provedor && entregaACampanhaInteira(provedor)) {
    return erro(
      `O canal ${nomeDoProvedor(provedor)} não envia mensagem avulsa — ele recebe a campanha inteira. Use POST /campanhas, ou escolha outro canal com "configId".`,
      409,
      'sem_envio_avulso',
    )
  }

  const [org] = await db
    .select({ credits: organizations.credits, creditLimit: organizations.creditLimit })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  const segmentos = dados.data.canal === 'sms' ? medirSms(dados.data.mensagem).segmentos : 1
  const custo = (await precoDoCanal(orgId, dados.data.canal)) * segmentos

  if (Number(org?.credits ?? 0) + Number(org?.creditLimit ?? 0) < custo) {
    return erro('Saldo insuficiente.', 402, 'sem_saldo')
  }

  const resultado = await enviarAgora({
    orgId,
    configId,
    canal: dados.data.canal,
    para: telefone.e164,
    nome: dados.data.nome ?? contato?.nome ?? null,
    corpo: dados.data.mensagem,
    mediaUrl: dados.data.mediaUrl,
  })

  const [linha] = await db
    .insert(dispatches)
    .values({
      orgId,
      contactId: contato?.id ?? null,
      channel: dados.data.canal,
      configId,
      toAddress: telefone.e164,
      toName: dados.data.nome ?? contato?.nome ?? null,
      body: dados.data.mensagem,
      mediaUrl: dados.data.mediaUrl ?? null,
      status: resultado.ok ? 'enviado' : 'falhou',
      attempts: 1,
      sentAt: resultado.ok ? new Date() : null,
      provider: resultado.provider,
      providerMessageId: resultado.ok ? resultado.providerMessageId : null,
      errorCode: resultado.ok ? null : resultado.codigo,
      errorMessage: resultado.ok ? null : resultado.mensagem.slice(0, 500),
      cost: String(resultado.ok ? custo : 0),
    })
    .returning({ id: dispatches.id })

  // O crédito só sai quando a mensagem sai.
  if (resultado.ok && custo > 0) {
    await db.insert(creditLedger).values({
      orgId,
      kind: 'consumo',
      delta: String(-custo),
      description: 'Envio pela API',
    })
  }

  if (!resultado.ok) {
    return Response.json(
      {
        id: linha?.id,
        status: 'falhou',
        erro: resultado.mensagem,
        codigo: resultado.codigo,
        reenviavel: resultado.reenviavel,
      },
      { status: 502 },
    )
  }

  return Response.json(
    {
      id: linha?.id,
      status: 'enviado',
      canal: dados.data.canal,
      para: telefone.e164,
      providerMessageId: resultado.providerMessageId,
      custo,
    },
    { status: 201 },
  )
}

/** GET /api/v1/envios — lista os envios da conta. */
export async function GET(req: Request) {
  const conferido = await exigirChave(req, 'envios:ler')
  if ('resposta' in conferido) return conferido.resposta

  const url = new URL(req.url)
  const limite = Math.min(Math.max(Number(url.searchParams.get('limite')) || 50, 1), 200)
  const pular = Math.max(Number(url.searchParams.get('pular')) || 0, 0)

  const linhas = await listarHistorico(conferido.auth.orgId, { limite, pular })

  return Response.json({
    envios: linhas.map((l) => ({
      id: l.id,
      canal: l.canal,
      para: l.para,
      status: l.status,
      campanhaId: l.campanhaId,
      providerMessageId: l.provedor,
      erro: l.erroCodigo,
      custo: Number(l.custo),
      criadoEm: l.criadoEm,
      enviadoEm: l.enviadoEm,
      entregueEm: l.entregueEm,
    })),
    limite,
    pular,
  })
}
