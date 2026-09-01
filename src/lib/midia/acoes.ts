'use server'

import { headers } from 'next/headers'
import { exigirEscrita, exigirUsuario } from '@/lib/auth/atual'
import { guardarArquivo, type Guardado, type Uso } from './servico'

/**
 * O upload, servindo às três telas que pediam link.
 *
 * Mora em `lib` e não numa pasta de rota porque quem chama são três: o
 * formulário de canal do cliente, o de provedores da plataforma e o assistente
 * de disparo. Três cópias divergiriam justamente nas regras de tamanho e
 * formato, que é onde o erro só aparece com a campanha já submetida.
 */

/**
 * A origem pública, para o link ficar absoluto.
 *
 * Absoluto porque o endereço sai do nosso domínio: o provedor HTTP genérico
 * baixa a mídia da campanha por conta própria, e um caminho relativo não
 * significa nada para ele.
 *
 * `APP_URL` manda porque é o nome canônico, e o endereço fica gravado no
 * cadastro para sempre — vale apontar para o domínio de verdade e não para o
 * alias por onde a pessoa entrou naquele dia. Mas só quando aponta para fora:
 * um `APP_URL` esquecido em `localhost` (acontece — é o que estava no .env de
 * desenvolvimento, numa porta que nem era mais a usada) gravaria um link morto
 * em todo arquivo enviado, sem erro nenhum na tela. Nesse caso vale o host da
 * requisição, que é onde a pessoa está de fato.
 */
function eLocal(host: string): boolean {
  return /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host)
}

async function origemPublica(): Promise<string> {
  const configurada = (process.env.APP_URL ?? '').trim().replace(/\/$/, '')
  if (configurada) {
    try {
      if (!eLocal(new URL(configurada).hostname)) return configurada
    } catch {
      // APP_URL malformada cai no host da requisição, como se não existisse.
    }
  }

  const h = await headers()
  const host = h.get('host')
  if (!host) return configurada
  return `${eLocal(host) ? 'http' : 'https'}://${host}`
}

export async function subirArquivo(_anterior: unknown, form: FormData): Promise<Guardado> {
  const usuario = await exigirUsuario()
  exigirEscrita(usuario)

  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File)) return { ok: false, erro: 'Escolha um arquivo.' }

  const uso: Uso = form.get('uso') === 'perfil' ? 'perfil' : 'midia'

  /*
   * Arquivo do time da Nex fica sem dono, como o provedor da plataforma.
   *
   * `daPlataforma` só vale para quem é do time Nex — sem essa conferência, um
   * cliente marcaria o campo no formulário e penduraria o arquivo dele na
   * organização da plataforma.
   */
  const daPlataforma = form.get('daPlataforma') === '1' && usuario.isTimeNex
  const origem = await origemPublica()
  if (!origem) {
    return { ok: false, erro: 'Não consegui montar o endereço do arquivo. Avise o suporte.' }
  }

  return await guardarArquivo({
    orgId: daPlataforma ? null : usuario.orgId,
    autorId: usuario.id,
    arquivo,
    uso,
    origem,
  })
}
