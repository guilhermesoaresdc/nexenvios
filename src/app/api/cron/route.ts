import { NextResponse } from 'next/server'
import { bater, manutencao } from '@/lib/delivery/motor'
import { criarLog } from '@/lib/log'

/**
 * O batimento.
 *
 * Sem worker, é esta rota que faz o motor andar: envia o que venceu, devolve à
 * fila o que ficou preso, materializa campanha grande e roda a manutenção.
 *
 * **O intervalo real importa mais do que o pedido.** O cron da Vercel no plano
 * Hobby roda UMA VEZ POR DIA — serve de piso para a manutenção, não como
 * agendador de um motor de disparo. Para operar de verdade, aponte um
 * agendador externo de 1 minuto (cron-job.org, QStash, EasyCron) para cá com o
 * cabeçalho `Authorization: Bearer $CRON_SECRET`. Os dois podem conviver: quem
 * envia de fato é a reserva por comparação-e-troca, então duas invocações
 * sobrepostas nunca mandam a mesma mensagem duas vezes.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Teto do plano Hobby. No Pro dá para subir e processar lotes maiores.
export const maxDuration = 60

const log = criarLog('cron')

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  /*
   * Sem a variável configurada, a rota recusa TUDO — de propósito. Uma rota
   * que dispara mensagem em nome de todos os clientes não pode ficar aberta
   * por esquecimento de configuração.
   */
  if (!segredo) return false

  const cabecalho = req.headers.get('authorization') ?? ''
  if (cabecalho === `Bearer ${segredo}`) return true

  // A Vercel assina o próprio cron com este cabeçalho.
  return req.headers.get('x-vercel-cron') !== null && process.env.VERCEL === '1'
}

async function executar(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const comecou = Date.now()
  const url = new URL(req.url)
  const lote = Number(url.searchParams.get('lote')) || undefined
  const resultado: Record<string, unknown> = {}

  // Cada tarefa em try/catch próprio: uma falha de manutenção não pode
  // impedir o envio, que é o que o cliente está esperando.
  try {
    resultado.envio = await bater(lote)
  } catch (erro) {
    log.error('a batida falhou', { motivo: erro instanceof Error ? erro.message : 'desconhecido' })
    resultado.envio = { erro: true }
  }

  // A manutenção é diária; rodar a cada minuto seria desperdício. Uma vez por
  // hora, na virada, é folga suficiente.
  if (new Date().getUTCMinutes() < 2) {
    try {
      resultado.manutencao = await manutencao()
    } catch {
      resultado.manutencao = { erro: true }
    }
  }

  resultado.duracaoMs = Date.now() - comecou
  return NextResponse.json(resultado)
}

export const GET = executar
export const POST = executar
