import { enviarGenerico, type ConfigGenerico } from './generico'
import {
  falhaDeRede,
  lerJson,
  pedir,
  postJson,
  semCredencial,
  type Destino,
  type Resultado,
} from './tipos'

/**
 * WhatsApp, nos dois modos que a Nex Envios oferece.
 *
 * OFICIAL (Meta Cloud API): número verificado, selo de negócio, entregabilidade
 * alta. Fora da janela de 24 horas só sai template aprovado — por isso o
 * `templateName`. É o canal para quem não pode correr risco de bloqueio.
 *
 * NÃO OFICIAL (Evolution API): roda sobre o protocolo do WhatsApp Web. Escala
 * mais rápido e custa menos, mas **o número pode ser banido, e um número
 * banido raramente volta**. É por isso que o motor respeita teto diário e
 * intervalo mínimo por instância — ver `whatsapp_instances`.
 */

// ─────────────────────────────────────────────── oficial (Meta Cloud)

export type ConfigOficial = {
  /** ID do número no WhatsApp Business. */
  phoneNumberId: string
  accessToken: string
  /** Versão da Graph API. Fixar evita quebra silenciosa quando a Meta muda. */
  versao?: string
  /** Idioma dos templates aprovados. */
  idioma?: string
}

export async function enviarWhatsappOficial(
  destino: Destino,
  config: ConfigOficial,
): Promise<Resultado> {
  if (!config.phoneNumberId || !config.accessToken) return semCredencial('meta_cloud')

  const versao = config.versao ?? 'v21.0'
  const url = `https://graph.facebook.com/${versao}/${config.phoneNumberId}/messages`

  /*
   * Com template, a Meta aceita o envio a qualquer momento. Sem ele, só dentro
   * da janela de 24 horas desde a última mensagem do contato — e um disparo em
   * massa, por definição, está fora dela. A tela avisa; aqui a gente respeita
   * o que foi escolhido.
   */
  const corpo = destino.templateName
    ? {
        messaging_product: 'whatsapp',
        to: destino.para,
        type: 'template',
        template: {
          name: destino.templateName,
          language: { code: config.idioma ?? 'pt_BR' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: destino.corpo }],
            },
          ],
        },
      }
    : destino.mediaUrl
      ? {
          messaging_product: 'whatsapp',
          to: destino.para,
          type: destino.mediaType?.startsWith('video') ? 'video' : 'image',
          [destino.mediaType?.startsWith('video') ? 'video' : 'image']: {
            link: destino.mediaUrl,
            caption: destino.corpo,
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: destino.para,
          type: 'text',
          text: { preview_url: true, body: destino.corpo },
        }

  let resposta: Response
  try {
    resposta = await postJson(url, corpo, { authorization: `Bearer ${config.accessToken}` })
  } catch (erro) {
    return falhaDeRede('meta_cloud', erro)
  }

  const dados = (await lerJson(resposta)) as
    | { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
    | null

  if (!resposta.ok) {
    const codigoMeta = dados?.error?.code
    const mensagem = dados?.error?.message ?? `a Meta respondeu ${resposta.status}`
    return {
      ok: false,
      provider: 'meta_cloud',
      codigo:
        resposta.status === 401 || codigoMeta === 190
          ? 'credencial_recusada'
          : codigoMeta === 131_026 || codigoMeta === 131_047 || codigoMeta === 131_051
            ? 'sem_whatsapp'
            : codigoMeta === 132_000 || codigoMeta === 132_001 || codigoMeta === 132_012
              ? 'template_recusado'
              : resposta.status === 429 || codigoMeta === 130_429 || codigoMeta === 131_048
                ? 'limite_provedor'
                : resposta.status >= 500
                  ? 'provedor_indisponivel'
                  : 'resposta_inesperada',
      mensagem: String(mensagem).slice(0, 200),
      reenviavel: resposta.status === 429 || resposta.status >= 500,
    }
  }

  return {
    ok: true,
    provider: 'meta_cloud',
    providerMessageId: dados?.messages?.[0]?.id ?? null,
  }
}

// ───────────────────────────────────────── não oficial (Evolution API)

export type ConfigEvolution = {
  /** Endereço da Evolution. Ex.: https://evo.suaempresa.com.br */
  url: string
  apikey: string
  /** Nome da instância (o chip). Preenchido pelo motor a cada envio. */
  instancia?: string
}

function limparUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export async function enviarWhatsappEvolution(
  destino: Destino,
  config: ConfigEvolution,
): Promise<Resultado> {
  if (!config.url || !config.apikey || !config.instancia) return semCredencial('evolution')

  const base = limparUrl(config.url)
  const cabecalhos = { apikey: config.apikey }

  const rota = destino.mediaUrl
    ? `${base}/message/sendMedia/${encodeURIComponent(config.instancia)}`
    : `${base}/message/sendText/${encodeURIComponent(config.instancia)}`

  const corpo = destino.mediaUrl
    ? {
        number: destino.para,
        mediatype: destino.mediaType?.startsWith('video')
          ? 'video'
          : destino.mediaType?.startsWith('audio')
            ? 'audio'
            : 'image',
        media: destino.mediaUrl,
        caption: destino.corpo,
        delay: destino.delayMs ?? 1200,
      }
    : {
        number: destino.para,
        text: destino.corpo,
        // `delay` + presença "digitando" deixa o envio menos robótico, o que
        // reduz denúncia — que é o que bane o número.
        delay: destino.delayMs ?? 1200,
        linkPreview: true,
      }

  let resposta: Response
  try {
    resposta = await postJson(rota, corpo, cabecalhos, 30_000)
  } catch (erro) {
    return falhaDeRede('evolution', erro)
  }

  const dados = (await lerJson(resposta)) as
    | { key?: { id?: string }; message?: unknown; error?: unknown; response?: { message?: unknown } }
    | null

  if (!resposta.ok) {
    const texto = JSON.stringify(dados ?? {}).slice(0, 300)
    const desconectada = /not.?connected|close|disconnect/i.test(texto)
    const semZap = /exists.*false|not.*whatsapp|invalid.*number/i.test(texto)
    return {
      ok: false,
      provider: 'evolution',
      codigo:
        resposta.status === 401 || resposta.status === 403
          ? 'credencial_recusada'
          : desconectada
            ? 'instancia_desconectada'
            : semZap
              ? 'sem_whatsapp'
              : resposta.status === 404
                ? 'instancia_desconectada'
                : resposta.status >= 500
                  ? 'provedor_indisponivel'
                  : 'resposta_inesperada',
      mensagem: texto,
      reenviavel: resposta.status >= 500 || desconectada,
    }
  }

  return { ok: true, provider: 'evolution', providerMessageId: dados?.key?.id ?? null }
}

// ─────────────────────────────────── administração das instâncias

export type EstadoDaInstancia = {
  conectada: boolean
  estado: string
  telefone?: string | null
}

/** Cria a instância na Evolution e devolve o QR Code para ler na tela. */
export async function criarInstancia(
  config: ConfigEvolution,
  nome: string,
  webhookUrl?: string,
): Promise<{ ok: true; qrcode: string | null } | { ok: false; mensagem: string }> {
  if (!config.url || !config.apikey) return { ok: false, mensagem: 'Evolution não configurada.' }

  try {
    const resposta = await postJson(
      `${limparUrl(config.url)}/instance/create`,
      {
        instanceName: nome,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        ...(webhookUrl
          ? {
              webhook: {
                url: webhookUrl,
                byEvents: false,
                events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'],
              },
            }
          : {}),
      },
      { apikey: config.apikey },
      30_000,
    )

    const dados = (await lerJson(resposta)) as
      | { qrcode?: { base64?: string; code?: string }; error?: unknown; response?: unknown }
      | null

    if (!resposta.ok) {
      return { ok: false, mensagem: JSON.stringify(dados ?? {}).slice(0, 300) }
    }
    return { ok: true, qrcode: dados?.qrcode?.base64 ?? dados?.qrcode?.code ?? null }
  } catch {
    return { ok: false, mensagem: 'A Evolution não respondeu.' }
  }
}

/** Busca um QR novo — o anterior vence em segundos. */
export async function pegarQrCode(
  config: ConfigEvolution,
  nome: string,
): Promise<string | null> {
  if (!config.url || !config.apikey) return null
  try {
    const resposta = await pedir(
      `${limparUrl(config.url)}/instance/connect/${encodeURIComponent(nome)}`,
      { headers: { apikey: config.apikey } },
      20_000,
    )
    const dados = (await lerJson(resposta)) as { base64?: string; code?: string } | null
    return dados?.base64 ?? dados?.code ?? null
  } catch {
    return null
  }
}

export async function estadoDaInstancia(
  config: ConfigEvolution,
  nome: string,
): Promise<EstadoDaInstancia> {
  if (!config.url || !config.apikey) return { conectada: false, estado: 'sem configuração' }
  try {
    const resposta = await pedir(
      `${limparUrl(config.url)}/instance/connectionState/${encodeURIComponent(nome)}`,
      { headers: { apikey: config.apikey } },
      15_000,
    )
    const dados = (await lerJson(resposta)) as
      | { instance?: { state?: string; owner?: string } }
      | null
    const estado = dados?.instance?.state ?? 'desconhecido'
    return {
      conectada: estado === 'open',
      estado,
      telefone: dados?.instance?.owner?.split('@')[0] ?? null,
    }
  } catch {
    return { conectada: false, estado: 'sem resposta' }
  }
}

export async function apagarInstancia(config: ConfigEvolution, nome: string): Promise<boolean> {
  if (!config.url || !config.apikey) return false
  try {
    const resposta = await pedir(
      `${limparUrl(config.url)}/instance/delete/${encodeURIComponent(nome)}`,
      { method: 'DELETE', headers: { apikey: config.apikey } },
      20_000,
    )
    return resposta.ok
  } catch {
    return false
  }
}

export type ConfigWhatsappGenerico = { generico: ConfigGenerico }

export function enviarWhatsappGenerico(
  destino: Destino,
  config: ConfigWhatsappGenerico,
): Promise<Resultado> {
  return enviarGenerico(destino, config.generico, 'generico')
}
