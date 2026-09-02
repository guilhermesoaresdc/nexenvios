'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { channelConfigs, whatsappInstances } from '@/db/schema'
import { channelEnum, entregaACampanhaInteira } from '@/db/schema/enums'
import { exigirAdmin, exigirEscrita } from '@/lib/auth/atual'
import { canalUtilizavel, removerCanal, salvarCanal } from '@/lib/canais/servico'
import { lerSegredo } from '@/lib/cripto'
import { enviarAgora } from '@/lib/delivery/motor'
import { conferirCredencialDoMonitor } from '@/lib/campanhas/externa'
import { ERRO_LABEL, type CodigoErro } from '@/lib/channels/tipos'
import {
  apagarInstancia,
  criarInstancia,
  estadoDaInstancia,
  pegarQrCode,
  type ConfigEvolution,
} from '@/lib/channels/whatsapp'
import { normalizarTelefone } from '@/lib/telefone'
import { tokenDeRetorno } from '@/lib/canais/retorno'

export type Estado = { erro?: string; ok?: string; qrcode?: string } | undefined

const guardar = z.object({
  configId: z.string().uuid().optional().or(z.literal('')),
  canal: z.enum(channelEnum.enumValues),
  provedor: z.string().min(2).max(40),
  rotulo: z.string().trim().min(2, 'Dê um nome a este canal.').max(80),
})

export async function guardarCanal(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = guardar.safeParse({
    configId: form.get('configId') ?? '',
    canal: form.get('canal'),
    provedor: form.get('provedor'),
    rotulo: form.get('rotulo'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  // Tudo que não é campo conhecido vira credencial; a validação por provedor
  // acontece no serviço, que conhece a lista de campos.
  const valores: Record<string, string> = {}
  for (const [chave, valor] of form.entries()) {
    if (['configId', 'canal', 'provedor', 'rotulo', 'ativo', 'padrao'].includes(chave)) continue
    if (typeof valor === 'string') valores[chave] = valor
  }

  const r = await salvarCanal({
    orgId: usuario.orgId,
    configId: dados.data.configId || null,
    canal: dados.data.canal,
    provider: dados.data.provedor,
    rotulo: dados.data.rotulo,
    valores,
    ativo: form.get('ativo') === 'on',
    padrao: form.get('padrao') === 'on',
    autorId: usuario.id,
  })

  if (!r.ok) return { erro: r.erro }

  revalidatePath('/canais')
  revalidatePath('/disparo')
  return { ok: 'Canal salvo.' }
}

export async function apagarCanal(configId: string): Promise<void> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)
  await removerCanal(usuario.orgId, configId, usuario.id)
  revalidatePath('/canais')
  revalidatePath('/disparo')
}

const teste = z.object({
  configId: z.string().uuid(),
  numero: z.string().trim().min(8, 'Informe o número que vai receber o teste.'),
  texto: z.string().trim().min(1).max(600),
})

export async function testarCanal(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = teste.safeParse({
    configId: form.get('configId'),
    numero: form.get('numero'),
    texto: form.get('texto') || 'Teste de canal da Nex Envios.',
  })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const telefone = normalizarTelefone(dados.data.numero)
  if (!telefone.ok) return { erro: 'Esse número não parece válido.' }

  // O canal precisa ser desta organização ou da plataforma — nunca de outro
  // cliente, mesmo com o id certo em mãos.
  const canal = await canalUtilizavel(usuario.orgId, dados.data.configId)
  if (!canal) return { erro: 'Canal não encontrado.' }

  /*
   * Provedor que entrega a campanha inteira não tem mensagem avulsa para
   * testar. Deixar cair em `enviarAgora` devolvia "canal sem configuração" —
   * uma acusação falsa contra a credencial, no mesmo cartão que diz
   * "credencial salva".
   */
  if (entregaACampanhaInteira(canal.provider)) {
    return {
      erro: 'O Monitor de Envios não recebe mensagem avulsa — só campanha inteira. Use “Conferir credencial” aqui do lado para saber se o token está certo.',
    }
  }

  const r = await enviarAgora({
    orgId: usuario.orgId,
    configId: dados.data.configId,
    canal: canal.canal,
    para: telefone.e164,
    corpo: dados.data.texto,
  })

  return r.ok
    ? { ok: 'Mensagem de teste enviada. Confira o aparelho.' }
    : { erro: `Não saiu: ${ERRO_LABEL[r.codigo as CodigoErro] ?? r.codigo}. ${r.mensagem}` }
}

/** As credenciais da Evolution do canal, já decifradas. */
async function evolutionDo(orgId: string, configId: string): Promise<ConfigEvolution | null> {
  const [linha] = await db
    .select({ credentials: channelConfigs.credentials, provider: channelConfigs.provider })
    .from(channelConfigs)
    .where(and(eq(channelConfigs.id, configId)))
    .limit(1)

  if (!linha || linha.provider !== 'evolution') return null
  const canal = await canalUtilizavel(orgId, configId)
  if (!canal) return null

  return lerSegredo<ConfigEvolution>(linha.credentials)
}

const numeroNovo = z.object({
  configId: z.string().uuid(),
  nome: z.string().trim().min(2, 'Dê um nome ao chip.').max(40),
})

export async function conectarNumero(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = numeroNovo.safeParse({ configId: form.get('configId'), nome: form.get('nome') })
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Confira os campos.' }

  const config = await evolutionDo(usuario.orgId, dados.data.configId)
  if (!config) return { erro: 'Configure a Evolution antes de conectar um número.' }

  // O nome da instância precisa ser único no servidor da Evolution, que pode
  // ser compartilhado entre clientes: o prefixo da organização evita colisão.
  const instancia = `nex-${usuario.orgSlug}-${dados.data.nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)}`

  /*
   * O webhook é registrado na criação da instância. Sem ele, o status de
   * entrega nunca volta e toda mensagem fica "enviada" para sempre na tela.
   */
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '')
  const token = await tokenDeRetorno(usuario.orgId, 'whatsapp_nao_oficial')

  const r = await criarInstancia(
    config,
    instancia,
    base ? `${base}/api/retorno/${token}` : undefined,
  )
  if (!r.ok) return { erro: `A Evolution recusou: ${r.mensagem}` }

  await db
    .insert(whatsappInstances)
    .values({
      orgId: usuario.orgId,
      configId: dados.data.configId,
      name: dados.data.nome,
      instanceName: instancia,
      status: 'conectando',
      qrCode: r.qrcode,
      counterDay: new Date().toISOString().slice(0, 10),
    })
    .onConflictDoNothing()

  revalidatePath('/canais')
  return { ok: 'Leia o QR Code no aplicativo do WhatsApp.', qrcode: r.qrcode ?? undefined }
}

export async function atualizarQr(instanciaId: string): Promise<string | null> {
  const usuario = await exigirAdmin()

  const [inst] = await db
    .select({
      id: whatsappInstances.id,
      instancia: whatsappInstances.instanceName,
      configId: whatsappInstances.configId,
    })
    .from(whatsappInstances)
    .where(and(eq(whatsappInstances.id, instanciaId), eq(whatsappInstances.orgId, usuario.orgId)))
    .limit(1)

  if (!inst?.configId) return null
  const config = await evolutionDo(usuario.orgId, inst.configId)
  if (!config) return null

  const qr = await pegarQrCode(config, inst.instancia)
  if (qr) {
    await db.update(whatsappInstances).set({ qrCode: qr }).where(eq(whatsappInstances.id, inst.id))
  }
  return qr
}

export async function conferirNumero(instanciaId: string): Promise<void> {
  const usuario = await exigirAdmin()

  const [inst] = await db
    .select({
      id: whatsappInstances.id,
      instancia: whatsappInstances.instanceName,
      configId: whatsappInstances.configId,
    })
    .from(whatsappInstances)
    .where(and(eq(whatsappInstances.id, instanciaId), eq(whatsappInstances.orgId, usuario.orgId)))
    .limit(1)

  if (!inst?.configId) return
  const config = await evolutionDo(usuario.orgId, inst.configId)
  if (!config) return

  const estado = await estadoDaInstancia(config, inst.instancia)
  await db
    .update(whatsappInstances)
    .set({
      status: estado.conectada ? 'conectado' : 'desconectado',
      phone: estado.telefone ?? undefined,
      lastSeenAt: new Date(),
      qrCode: estado.conectada ? null : undefined,
    })
    .where(eq(whatsappInstances.id, inst.id))

  revalidatePath('/canais')
}

const ajuste = z.object({
  instanciaId: z.string().uuid(),
  tetoDiario: z.coerce.number().int().min(1).max(20_000),
  intervaloMs: z.coerce.number().int().min(500).max(120_000),
})

export async function ajustarNumero(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const dados = ajuste.safeParse({
    instanciaId: form.get('instanciaId'),
    tetoDiario: form.get('tetoDiario'),
    intervaloMs: form.get('intervaloMs'),
  })
  if (!dados.success) return { erro: 'Valores fora do permitido.' }

  await db
    .update(whatsappInstances)
    .set({ dailyCap: dados.data.tetoDiario, minIntervalMs: dados.data.intervaloMs })
    .where(
      and(
        eq(whatsappInstances.id, dados.data.instanciaId),
        eq(whatsappInstances.orgId, usuario.orgId),
      ),
    )

  revalidatePath('/canais')
  return { ok: 'Ritmo do número ajustado.' }
}

export async function removerNumero(instanciaId: string): Promise<void> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const [inst] = await db
    .select({
      id: whatsappInstances.id,
      instancia: whatsappInstances.instanceName,
      configId: whatsappInstances.configId,
    })
    .from(whatsappInstances)
    .where(and(eq(whatsappInstances.id, instanciaId), eq(whatsappInstances.orgId, usuario.orgId)))
    .limit(1)

  if (!inst) return

  if (inst.configId) {
    const config = await evolutionDo(usuario.orgId, inst.configId)
    // Apaga lá primeiro; se a Evolution não responder, a linha some daqui de
    // qualquer forma — uma instância órfã do outro lado é menos ruim do que um
    // número fantasma que o motor continua tentando usar.
    if (config) await apagarInstancia(config, inst.instancia)
  }

  await db.delete(whatsappInstances).where(eq(whatsappInstances.id, inst.id))
  revalidatePath('/canais')
}

/**
 * Confere a credencial do Monitor de Envios consultando o saldo.
 *
 * O teste dos outros canais é mandar uma mensagem. Aqui não existe mensagem
 * avulsa, então o teste é a consulta mais barata que só passa com o token
 * certo — e ela devolve um número que a pessoa reconhece.
 */
export async function conferirCredencial(_anterior: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirAdmin()
  exigirEscrita(usuario)

  const configId = z.string().uuid().safeParse(form.get('configId'))
  if (!configId.success) return { erro: 'Canal não encontrado.' }

  const canal = await canalUtilizavel(usuario.orgId, configId.data)
  if (!canal) return { erro: 'Canal não encontrado.' }

  const r = await conferirCredencialDoMonitor(configId.data)
  if ('erro' in r) return { erro: r.erro }

  /*
   * O veredito é o do UPLOAD, não o do saldo.
   *
   * É o endpoint que a campanha usa. Já aconteceu de o saldo responder bem e a
   * campanha morrer com "Token inválido" — são caminhos diferentes, e dar a
   * credencial por boa olhando só o saldo mandou a operação discutir com o
   * suporte do outro lado sem dado nenhum na mão.
   */
  const partes = [`Token ${r.impressao}.`]

  if (r.upload?.aceito) {
    partes.push('O envio de campanha aceita este token.')
  } else if (r.upload) {
    partes.push(`O envio de campanha RECUSOU: "${r.upload.resposta}".`)
  } else {
    partes.push(`Não deu para testar o envio de campanha: ${r.erroDoUpload}.`)
  }

  /*
   * O que eles enxergam, dito por eles.
   *
   * É a linha que encerra a discussão de "mandamos" contra "não chegou": o
   * código que guardamos ou está na lista deles, ou não está.
   */
  if (r.laDeles) {
    partes.push(
      `O Monitor lista ${r.laDeles.total} campanha(s) nesta conta` +
        (r.laDeles.sumidas.length > 0
          ? `, e NÃO encontra ${r.laDeles.sumidas.length} das nossas: ${r.laDeles.sumidas.slice(0, 3).join(', ')}.`
          : r.laDeles.nossas > 0
            ? `, incluindo as ${r.laDeles.nossas} que enviamos.`
            : '.'),
    )
  }

  /*
   * O IP de saída, porque foi o que o suporte deles pediu.
   *
   * Eles mantêm lista de IPs autorizados e recusam quem está fora. Vem medido
   * na hora, e não de uma configuração nossa, justamente porque não é fixo:
   * conferir duas vezes e ver dois endereços é a resposta para "me passa seu
   * IP" — não dá um, dá uma faixa.
   */
  if (r.ipDeSaida) {
    partes.push(`Esta consulta saiu do IP ${r.ipDeSaida} (pode mudar a cada chamada).`)
  }

  if (r.saldo !== null) {
    partes.push(`Saldo no Monitor: ${r.saldo.toLocaleString('pt-BR')} envio(s).`)
  } else {
    partes.push(`A consulta de saldo falhou: ${r.erroDoSaldo}.`)
  }

  const passou = r.upload?.aceito === true
  if (!passou) {
    partes.push(
      'O Token de Acesso tem 40 caracteres e começa com zero; a Chave de Acesso, 32. Trocar um pelo outro dá exatamente esta recusa.',
    )
    return { erro: partes.join(' ') }
  }

  return { ok: partes.join(' ') }
}
