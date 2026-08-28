import type { Channel } from '@/db/schema/enums'
import { enviarGenerico, type ConfigGenerico } from './generico'
import { enviarSms, smsConfigurado, type ConfigSms } from './sms'
import {
  enviarWhatsappEvolution,
  enviarWhatsappOficial,
  type ConfigEvolution,
  type ConfigOficial,
} from './whatsapp'
import { semCredencial, type Destino, type Resultado } from './tipos'

/**
 * Os cinco canais atrás de uma interface comum.
 *
 * Nada fora de `lib/channels` deve conhecer a Evolution, a Meta ou o SMSDev.
 * Trocar de provedor é trocar a configuração de um canal na tela; uma mudança
 * de contrato do provedor é um patch dentro de um arquivo só.
 */

export * from './tipos'
export * from './generico'
export * from './sms'
export * from './whatsapp'

export type ConfigDoCanal =
  | { canal: 'whatsapp_oficial'; provider: 'meta_cloud'; config: ConfigOficial }
  | { canal: 'whatsapp_oficial'; provider: 'generico'; config: ConfigGenerico }
  | { canal: 'whatsapp_nao_oficial'; provider: 'evolution'; config: ConfigEvolution }
  | { canal: 'whatsapp_nao_oficial'; provider: 'generico'; config: ConfigGenerico }
  | { canal: 'sms'; provider: 'smsdev' | 'comtele' | 'generico'; config: ConfigSms }
  | { canal: 'rcs'; provider: 'generico'; config: ConfigGenerico }
  | { canal: 'voz'; provider: 'generico'; config: ConfigGenerico }

/** O único ponto de entrada do envio. */
export function enviarPeloCanal(destino: Destino, alvo: ConfigDoCanal): Promise<Resultado> {
  switch (alvo.canal) {
    case 'whatsapp_oficial':
      return alvo.provider === 'meta_cloud'
        ? enviarWhatsappOficial(destino, alvo.config)
        : enviarGenerico(destino, alvo.config, 'generico')
    case 'whatsapp_nao_oficial':
      return alvo.provider === 'evolution'
        ? enviarWhatsappEvolution(destino, alvo.config)
        : enviarGenerico(destino, alvo.config, 'generico')
    case 'sms':
      return enviarSms(destino, alvo.config)
    case 'rcs':
    case 'voz':
      return enviarGenerico(destino, alvo.config, 'generico')
  }
}

/** Tem credencial suficiente para sequer tentar? A tela usa isto no cartão. */
export function canalConfigurado(alvo: ConfigDoCanal): boolean {
  switch (alvo.canal) {
    case 'whatsapp_oficial':
      return alvo.provider === 'meta_cloud'
        ? Boolean(alvo.config.phoneNumberId && alvo.config.accessToken)
        : Boolean(alvo.config.url)
    case 'whatsapp_nao_oficial':
      return alvo.provider === 'evolution'
        ? Boolean(alvo.config.url && alvo.config.apikey)
        : Boolean(alvo.config.url)
    case 'sms':
      return smsConfigurado(alvo.config)
    case 'rcs':
    case 'voz':
      return Boolean(alvo.config.url)
  }
}

/**
 * Monta o alvo a partir do que está guardado em `channel_configs`.
 *
 * As credenciais chegam já decifradas — quem chama passou por `lerSegredo`.
 * Devolve `null` quando a combinação canal+provedor não existe, o que só
 * acontece com linha antiga depois de o catálogo mudar.
 */
export function montarConfig(
  canal: Channel,
  provider: string,
  credenciais: Record<string, unknown>,
): ConfigDoCanal | null {
  const c = credenciais as never

  switch (canal) {
    case 'whatsapp_oficial':
      if (provider === 'meta_cloud') return { canal, provider, config: c as ConfigOficial }
      if (provider === 'generico') return { canal, provider, config: c as ConfigGenerico }
      return null
    case 'whatsapp_nao_oficial':
      if (provider === 'evolution') return { canal, provider, config: c as ConfigEvolution }
      if (provider === 'generico') return { canal, provider, config: c as ConfigGenerico }
      return null
    case 'sms':
      if (provider === 'smsdev' || provider === 'comtele' || provider === 'generico') {
        return { canal, provider, config: { provider, ...(c as object) } as ConfigSms }
      }
      return null
    case 'rcs':
    case 'voz':
      if (provider === 'generico') return { canal, provider, config: c as ConfigGenerico }
      return null
  }
}

export function canalSemConfiguracao(provider: string): Resultado {
  return semCredencial(provider)
}
