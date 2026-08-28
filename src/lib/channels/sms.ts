import { enviarGenerico, type ConfigGenerico } from './generico'
import { falhaDeRede, lerJson, postJson, semCredencial, type Destino, type Resultado } from './tipos'

/**
 * SMS. Três provedores: SMSDev, Comtele e "outro provedor" (HTTP configurável).
 *
 * Os dois nomeados existem porque são os que a operação usa hoje e têm
 * particularidades que um template genérico não expressa bem — o SMSDev
 * responde 200 com `situacao: "ERRO"`, e a Comtele quer o número sem o 55.
 */

export type ConfigSms = {
  provider: 'smsdev' | 'comtele' | 'generico'
  apiKey?: string
  /** Nome curto que aparece como remetente, onde o provedor permite. */
  remetente?: string
  generico?: ConfigGenerico
}

async function smsdev(destino: Destino, config: ConfigSms): Promise<Resultado> {
  if (!config.apiKey) return semCredencial('smsdev')

  let resposta: Response
  try {
    resposta = await postJson('https://api.smsdev.com.br/v1/send', {
      key: config.apiKey,
      type: 9,
      number: destino.para,
      msg: destino.corpo,
    })
  } catch (erro) {
    return falhaDeRede('smsdev', erro)
  }

  const corpo = (await lerJson(resposta)) as
    | { situacao?: string; id?: string | number; descricao?: string }
    | null

  if (!resposta.ok) {
    return {
      ok: false,
      provider: 'smsdev',
      codigo: resposta.status === 401 ? 'credencial_recusada' : 'provedor_indisponivel',
      mensagem: `o provedor respondeu ${resposta.status}`,
      reenviavel: resposta.status >= 500,
    }
  }

  // 200 com "situacao: ERRO" é o caminho normal de falha aqui.
  if (!corpo || corpo.situacao !== 'OK') {
    const descricao = corpo?.descricao ?? 'sem descrição'
    const semSaldo = /saldo/i.test(descricao)
    const numeroRuim = /n[uú]mero/i.test(descricao)
    return {
      ok: false,
      provider: 'smsdev',
      codigo: semSaldo ? 'saldo_insuficiente' : numeroRuim ? 'destino_invalido' : 'resposta_inesperada',
      mensagem: descricao.slice(0, 200),
      reenviavel: false,
    }
  }

  return { ok: true, provider: 'smsdev', providerMessageId: corpo.id ? String(corpo.id) : null }
}

async function comtele(destino: Destino, config: ConfigSms): Promise<Resultado> {
  if (!config.apiKey) return semCredencial('comtele')

  // A Comtele quer o número nacional, sem o código do país.
  const nacional = destino.para.startsWith('55') ? destino.para.slice(2) : destino.para

  let resposta: Response
  try {
    resposta = await postJson(
      'https://sms.comtele.com.br/api/v2/send',
      {
        Sender: config.remetente || undefined,
        Receivers: nacional,
        Content: destino.corpo,
      },
      { 'auth-key': config.apiKey },
    )
  } catch (erro) {
    return falhaDeRede('comtele', erro)
  }

  const corpo = (await lerJson(resposta)) as
    | { Success?: boolean; Object?: unknown; Message?: string }
    | null

  if (!resposta.ok || !corpo?.Success) {
    const mensagem = corpo?.Message ?? `o provedor respondeu ${resposta.status}`
    return {
      ok: false,
      provider: 'comtele',
      codigo:
        resposta.status === 401
          ? 'credencial_recusada'
          : /cr[ée]dito|saldo/i.test(mensagem)
            ? 'saldo_insuficiente'
            : resposta.status >= 500
              ? 'provedor_indisponivel'
              : 'resposta_inesperada',
      mensagem: String(mensagem).slice(0, 200),
      reenviavel: resposta.status >= 500,
    }
  }

  return {
    ok: true,
    provider: 'comtele',
    providerMessageId: corpo.Object ? String(corpo.Object) : null,
  }
}

export function enviarSms(destino: Destino, config: ConfigSms): Promise<Resultado> {
  switch (config.provider) {
    case 'smsdev':
      return smsdev(destino, config)
    case 'comtele':
      return comtele(destino, config)
    case 'generico':
      return config.generico
        ? enviarGenerico(destino, config.generico, 'generico')
        : Promise.resolve(semCredencial('generico'))
  }
}

export function smsConfigurado(config: ConfigSms): boolean {
  if (config.provider === 'generico') return Boolean(config.generico?.url)
  return Boolean(config.apiKey)
}
