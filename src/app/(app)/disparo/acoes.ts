'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { canaisDaOrg } from '@/db/queries/canais'
import { channelEnum } from '@/db/schema/enums'
import { exigirEscrita, exigirUsuario, type UsuarioAutenticado } from '@/lib/auth/atual'
import { conferirFontes } from '@/lib/campanhas/publico'
import { criarCampanha, orcar, textoFinal, type Orcamento } from '@/lib/campanhas/servico'
import { ERRO_LABEL } from '@/lib/channels'
import { enviarAgora } from '@/lib/delivery/motor'
import { compilarMensagem } from '@/lib/mensagem'
import { normalizarTelefone } from '@/lib/telefone'

/**
 * As três ações do assistente de disparo: orçar, testar e criar.
 *
 * Nenhuma delas aceita `orgId` de fora. O único id de organização que vale é o
 * de `exigirUsuario()` — e as fontes passam por `conferirFontes` antes de
 * virarem SQL, que é o que impede um id de lista adivinhado de alcançar a base
 * de outro cliente.
 */

const fonte = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('lista'), chave: z.uuid(), rotulo: z.string().min(1).max(160) }),
  z.object({
    tipo: z.literal('etiqueta'),
    chave: z.string().min(1).max(160),
    rotulo: z.string().min(1).max(160),
  }),
  z.object({
    tipo: z.literal('todos'),
    chave: z.literal('todos'),
    rotulo: z.string().min(1).max(160),
  }),
])

const canal = z.enum(channelEnum.enumValues)

const urlDeMidia = z
  .string()
  .trim()
  .max(600)
  .nullable()
  .refine(
    (v) => v === null || v === '' || /^https?:\/\/\S+$/i.test(v),
    'A URL da mídia precisa começar com http:// ou https://',
  )

/** Leitor não dispara. Vira mensagem na tela em vez de exceção. */
function conferirEscrita(usuario: UsuarioAutenticado): string | null {
  try {
    exigirEscrita(usuario)
    return null
  } catch (erro) {
    return erro instanceof Error ? erro.message : 'Seu acesso é somente leitura.'
  }
}

function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? 'Confira os campos do disparo.'
}

/** A hora local da conta — a saudação depende dela, e o servidor roda em UTC. */
function horaDaConta(timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      new Date(),
    ),
  )
}

// ────────────────────────────────────────────────────────────── orçar

const esquemaOrcamento = z.object({
  canal,
  corpo: z.string().max(4000),
  fontes: z.array(fonte).max(120),
  eleitoral: z.boolean(),
})

export type EntradaDoOrcamento = z.infer<typeof esquemaOrcamento>

export type RespostaDoOrcamento = { ok: true; orcamento: Orcamento } | { ok: false; erro: string }

export async function orcarDisparo(entrada: EntradaDoOrcamento): Promise<RespostaDoOrcamento> {
  const usuario = await exigirUsuario()
  const barrado = conferirEscrita(usuario)
  if (barrado) return { ok: false, erro: barrado }

  const dados = esquemaOrcamento.safeParse(entrada)
  if (!dados.success) return { ok: false, erro: primeiroErro(dados.error) }
  if (dados.data.fontes.length === 0) {
    return { ok: false, erro: 'Escolha ao menos uma lista, etiqueta ou a base inteira.' }
  }

  const fontes = await conferirFontes(usuario.orgId, dados.data.fontes)
  if (fontes.length === 0) {
    return { ok: false, erro: 'As listas escolhidas não existem mais nesta conta.' }
  }

  const orcamento = await orcar(
    usuario.orgId,
    dados.data.canal,
    dados.data.corpo,
    fontes,
    dados.data.eleitoral,
  )
  return { ok: true, orcamento }
}

// ───────────────────────────────────────────────────────────── testar

const esquemaTeste = z.object({
  canal,
  configId: z.uuid(),
  numero: z.string().min(1, 'Informe o número que vai receber o teste.'),
  corpo: z.string().trim().min(1, 'Escreva a mensagem antes de mandar o teste.').max(4000),
  mediaUrl: urlDeMidia,
  eleitoral: z.boolean(),
})

export type EntradaDoTeste = z.infer<typeof esquemaTeste>

export type EstadoDoTeste = { ok?: string; erro?: string } | undefined

const MOTIVO_DO_NUMERO = {
  vazio: 'Informe o número que vai receber o teste.',
  curto: 'Número curto demais. Use DDD + número.',
  longo: 'Número comprido demais. Use DDD + número.',
  ddd: 'Esse DDD não existe. Confira os dois primeiros dígitos.',
  formato: 'Número fora do formato brasileiro. Confira o DDD e o número.',
} as const

export async function enviarTeste(
  _anterior: EstadoDoTeste,
  entrada: EntradaDoTeste,
): Promise<EstadoDoTeste> {
  const usuario = await exigirUsuario()
  const barrado = conferirEscrita(usuario)
  if (barrado) return { erro: barrado }

  const dados = esquemaTeste.safeParse(entrada)
  if (!dados.success) return { erro: primeiroErro(dados.error) }

  const numero = normalizarTelefone(dados.data.numero)
  if (!numero.ok) return { erro: MOTIVO_DO_NUMERO[numero.motivo] }

  /*
   * O canal precisa ser desta conta (ou da plataforma). `enviarAgora` usa a
   * credencial do id que receber sem perguntar de quem ele é — sem esta
   * conferência, um id adivinhado enviaria pelo provedor de outro cliente.
   */
  const canais = await canaisDaOrg(usuario.orgId)
  const escolhido = canais.find((c) => c.id === dados.data.configId && c.canal === dados.data.canal)
  if (!escolhido) return { erro: 'O canal escolhido não está disponível nesta conta.' }
  if (!escolhido.ativo) return { erro: 'Este canal está desativado. Reative em Canais.' }
  if (!escolhido.temCredencial) {
    return { erro: 'Este canal ainda não tem credencial. Configure em Canais.' }
  }

  const corpo = compilarMensagem(textoFinal(dados.data.corpo, dados.data.eleitoral), {
    telefone: numero.e164,
    hora: horaDaConta(usuario.timezone),
  })

  const resultado = await enviarAgora({
    orgId: usuario.orgId,
    configId: escolhido.id,
    canal: dados.data.canal,
    para: numero.e164,
    corpo,
    mediaUrl: dados.data.mediaUrl || null,
  })

  if (!resultado.ok) return { erro: `O teste não saiu: ${ERRO_LABEL[resultado.codigo]}.` }
  return { ok: 'Teste enviado. Confira o aparelho — o teste não desconta do saldo.' }
}

// ────────────────────────────────────────────────────────────── criar

const esquemaCriacao = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao disparo.').max(160),
  canal,
  configId: z.uuid(),
  corpo: z.string().trim().min(1, 'Escreva a mensagem do disparo.').max(4000),
  mediaUrl: urlDeMidia,
  fontes: z.array(fonte).min(1, 'Escolha quem vai receber.').max(120),
  ritmo: z.number().int().min(1).max(600),
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
  eleitoral: z.boolean(),
  /** ISO absoluto, montado no navegador — nulo é "começa agora". */
  agendarPara: z.string().nullable(),
  /**
   * O perfil do WhatsApp, exigido pelo Monitor de Envios.
   *
   * Nulo nos outros canais: lá o perfil é do número, não do disparo.
   */
  perfil: z
    .object({
      nome: z.string().trim().min(1).max(25),
      fotoUrl: z.url(),
      nome2: z.string().trim().min(1).max(25),
      fotoUrl2: z.url(),
    })
    .nullable()
    .optional(),
})

export type EntradaDaCriacao = z.infer<typeof esquemaCriacao>

export type EstadoDaCriacao = { erro?: string } | undefined

export async function criarDisparo(
  _anterior: EstadoDaCriacao,
  entrada: EntradaDaCriacao,
): Promise<EstadoDaCriacao> {
  const usuario = await exigirUsuario()
  const barrado = conferirEscrita(usuario)
  if (barrado) return { erro: barrado }

  const dados = esquemaCriacao.safeParse(entrada)
  if (!dados.success) return { erro: primeiroErro(dados.error) }

  const canais = await canaisDaOrg(usuario.orgId)
  const escolhido = canais.find((c) => c.id === dados.data.configId && c.canal === dados.data.canal)
  if (!escolhido) return { erro: 'O canal escolhido não está disponível nesta conta.' }
  if (!escolhido.ativo) return { erro: 'Este canal está desativado. Reative em Canais.' }
  if (!escolhido.temCredencial) {
    return { erro: 'Este canal ainda não tem credencial. Configure em Canais.' }
  }

  const fontes = await conferirFontes(usuario.orgId, dados.data.fontes)
  if (fontes.length === 0) {
    return { erro: 'As listas escolhidas não existem mais nesta conta.' }
  }

  let agendarPara: Date | null = null
  if (dados.data.agendarPara) {
    const quando = new Date(dados.data.agendarPara)
    if (Number.isNaN(quando.getTime())) return { erro: 'A data do agendamento não é válida.' }
    // Um minuto de folga: o relógio do navegador raramente bate com o do servidor.
    if (quando.getTime() < Date.now() - 60_000) {
      return { erro: 'O agendamento precisa ser num horário futuro.' }
    }
    agendarPara = quando
  }

  const resultado = await criarCampanha(usuario.orgId, usuario.id, {
    nome: dados.data.nome,
    canal: dados.data.canal,
    configId: dados.data.configId,
    corpo: dados.data.corpo,
    mediaUrl: dados.data.mediaUrl || null,
    fontes,
    ratePerMinute: dados.data.ritmo,
    quietStart: dados.data.quietStart,
    quietEnd: dados.data.quietEnd,
    eleitoral: dados.data.eleitoral,
    agendarPara,
    perfil: dados.data.perfil ?? null,
  })

  if (!resultado.ok) return { erro: resultado.erro }

  revalidatePath('/campanhas')
  revalidatePath('/painel')
  redirect(`/campanhas/${resultado.campanhaId}`)
}
