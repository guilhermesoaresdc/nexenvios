import {
  falhaDeRede,
  lerJson,
  pegar,
  pedir,
  semCredencial,
  type CodigoErro,
  type Destino,
  type Resultado,
} from './tipos'

/**
 * O provedor genérico: qualquer API HTTP descrita na tela.
 *
 * Existe porque provedor de SMS, RCS e torpedo de voz no Brasil não tem
 * padrão. Cada um inventa o seu JSON. Sem isto, cada cliente novo com um
 * gateway diferente viraria um arquivo novo aqui dentro — e um deploy.
 *
 * O cliente descreve: endereço, método, como autentica, e um template de corpo
 * com `{{para}}`, `{{mensagem}}`, `{{nome}}` e `{{midia}}`. A resposta é lida
 * por caminho (`data.id`), também configurável.
 */

export type ConfigGenerico = {
  url: string
  metodo?: 'POST' | 'GET' | 'PUT'
  /** Como a credencial viaja. */
  auth?: 'bearer' | 'header' | 'query' | 'basic' | 'nenhum'
  authHeader?: string
  authQuery?: string
  apiKey?: string
  usuario?: string
  senha?: string
  headers?: Record<string, string>
  /** JSON com marcadores. Ex.: {"number":"{{para}}","msg":"{{mensagem}}"} */
  corpoTemplate?: string
  /** Query string com marcadores, para provedores que só aceitam GET. */
  queryTemplate?: string
  contentType?: 'json' | 'form'
  /** Onde achar o id da mensagem na resposta. Ex.: "data.messageId". */
  caminhoId?: string
  /** Onde achar o erro. Se o caminho existir e tiver valor, é falha. */
  caminhoErro?: string
  /** Texto que, presente na resposta, indica sucesso mesmo com HTTP 200 genérico. */
  marcaDeSucesso?: string
}

function preencher(template: string, destino: Destino): string {
  return template
    .replace(/\{\{\s*para\s*\}\}/g, destino.para)
    .replace(/\{\{\s*para_mais\s*\}\}/g, `+${destino.para}`)
    .replace(/\{\{\s*nome\s*\}\}/g, destino.nome ?? '')
    .replace(/\{\{\s*midia\s*\}\}/g, destino.mediaUrl ?? '')
    .replace(/\{\{\s*audio\s*\}\}/g, destino.audioUrl ?? '')
    .replace(/\{\{\s*mensagem\s*\}\}/g, destino.corpo)
    .replace(/\{\{\s*mensagem_json\s*\}\}/g, JSON.stringify(destino.corpo).slice(1, -1))
    .replace(/\{\{\s*mensagem_url\s*\}\}/g, encodeURIComponent(destino.corpo))
}

function classificar(status: number): { codigo: CodigoErro; reenviavel: boolean } {
  if (status === 401 || status === 403) return { codigo: 'credencial_recusada', reenviavel: false }
  if (status === 402) return { codigo: 'saldo_insuficiente', reenviavel: false }
  if (status === 404) return { codigo: 'resposta_inesperada', reenviavel: false }
  if (status === 422 || status === 400) return { codigo: 'destino_invalido', reenviavel: false }
  if (status === 429) return { codigo: 'limite_provedor', reenviavel: true }
  if (status >= 500) return { codigo: 'provedor_indisponivel', reenviavel: true }
  return { codigo: 'resposta_inesperada', reenviavel: false }
}

export async function enviarGenerico(
  destino: Destino,
  config: ConfigGenerico,
  provider = 'generico',
): Promise<Resultado> {
  if (!config.url) return semCredencial(provider)

  const metodo = config.metodo ?? 'POST'
  const cabecalhos: Record<string, string> = { ...(config.headers ?? {}) }
  let url = preencher(config.url, destino)

  switch (config.auth ?? 'bearer') {
    case 'bearer':
      if (config.apiKey) cabecalhos.authorization = `Bearer ${config.apiKey}`
      break
    case 'header':
      if (config.apiKey) cabecalhos[config.authHeader || 'x-api-key'] = config.apiKey
      break
    case 'basic':
      if (config.usuario) {
        const par = Buffer.from(`${config.usuario}:${config.senha ?? ''}`).toString('base64')
        cabecalhos.authorization = `Basic ${par}`
      }
      break
    case 'query':
      if (config.apiKey) {
        const sep = url.includes('?') ? '&' : '?'
        url += `${sep}${encodeURIComponent(config.authQuery || 'key')}=${encodeURIComponent(config.apiKey)}`
      }
      break
    case 'nenhum':
      break
  }

  if (config.queryTemplate) {
    const sep = url.includes('?') ? '&' : '?'
    url += sep + preencher(config.queryTemplate, destino)
  }

  const init: RequestInit = { method: metodo }

  if (metodo !== 'GET' && config.corpoTemplate) {
    const preenchido = preencher(config.corpoTemplate, destino)
    if ((config.contentType ?? 'json') === 'form') {
      cabecalhos['content-type'] = 'application/x-www-form-urlencoded'
      init.body = preenchido
    } else {
      cabecalhos['content-type'] = 'application/json'
      /*
       * O template é montado pelo cliente na tela e pode sair inválido depois
       * de receber um texto com aspas. Validar aqui transforma "JSON quebrado"
       * num erro claro em vez de um 400 críptico do provedor.
       */
      try {
        JSON.parse(preenchido)
      } catch {
        return {
          ok: false,
          provider,
          codigo: 'resposta_inesperada',
          mensagem: 'o corpo configurado não é um JSON válido depois de preenchido',
          reenviavel: false,
        }
      }
      init.body = preenchido
    }
  }

  init.headers = cabecalhos

  let resposta: Response
  try {
    resposta = await pedir(url, init)
  } catch (erro) {
    return falhaDeRede(provider, erro)
  }

  const corpo = await lerJson(resposta)

  if (!resposta.ok) {
    const { codigo, reenviavel } = classificar(resposta.status)
    return {
      ok: false,
      provider,
      codigo,
      mensagem: `o provedor respondeu ${resposta.status}`,
      reenviavel,
      esperarSegundos: Number(resposta.headers.get('retry-after')) || undefined,
    }
  }

  // HTTP 200 com erro no corpo é o padrão de metade dos gateways brasileiros.
  if (config.caminhoErro) {
    const erro = pegar(corpo, config.caminhoErro)
    if (erro !== undefined && erro !== null && erro !== '' && erro !== false && erro !== 0) {
      return {
        ok: false,
        provider,
        codigo: 'resposta_inesperada',
        mensagem: String(erro).slice(0, 200),
        reenviavel: false,
      }
    }
  }

  if (config.marcaDeSucesso) {
    const texto = JSON.stringify(corpo ?? '')
    if (!texto.includes(config.marcaDeSucesso)) {
      return {
        ok: false,
        provider,
        codigo: 'resposta_inesperada',
        mensagem: 'a resposta não trouxe a marca de sucesso configurada',
        reenviavel: false,
      }
    }
  }

  const id = config.caminhoId ? pegar(corpo, config.caminhoId) : undefined
  return { ok: true, provider, providerMessageId: id === undefined || id === null ? null : String(id) }
}
