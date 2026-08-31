'use server'

import { revalidatePath } from 'next/cache'
import { exigirTimeNex } from '@/lib/auth/atual'
import { bater } from '@/lib/delivery/motor'
import { criarLog } from '@/lib/log'

const log = criarLog('admin')

export type EstadoDaBatida = { ok?: string; erro?: string } | undefined

/**
 * Roda uma batida do motor na mão.
 *
 * Existe porque o agendador é externo e pode não estar de pé — no plano Hobby
 * da Vercel o cron passa uma vez por dia. Sem este botão, conferir se o motor
 * funciona significaria esperar até amanhã, e derrubar um disparo por causa
 * disso é caro.
 *
 * Não é atalho para o cron: manda um lote e volta. Duas batidas sobrepostas
 * não mandam a mesma mensagem duas vezes — quem envia é a reserva por
 * comparação-e-troca —, então o pior que um clique a mais faz é gastar tempo.
 *
 * Suporte também pode: quando o agendador cai de madrugada, quem está de
 * plantão precisa poder empurrar a fila. Não é decisão sobre dinheiro, é
 * executar o que o cliente já contratou.
 */
export async function rodarBatimento(): Promise<EstadoDaBatida> {
  const usuario = await exigirTimeNex()

  try {
    const resumo = await bater()
    log.info('batimento na mão', { por: usuario.id, ...resumo })
    revalidatePath('/admin')

    if (resumo.tentados === 0) {
      return {
        ok:
          resumo.linhasCriadas > 0
            ? `Nada vencido para enviar ainda. ${resumo.linhasCriadas} linha(s) preparada(s).`
            : 'Nada vencido para enviar agora — a fila está em dia.',
      }
    }

    const partes = [`${resumo.enviados} enviada(s) de ${resumo.tentados}`]
    if (resumo.falhas > 0) partes.push(`${resumo.falhas} falha(s)`)
    if (resumo.campanhasConcluidas > 0) {
      partes.push(`${resumo.campanhasConcluidas} campanha(s) concluída(s)`)
    }
    return { ok: `${partes.join(' · ')}.` }
  } catch (erro) {
    log.error('o batimento na mão falhou', {
      motivo: erro instanceof Error ? erro.message : 'desconhecido',
    })
    return { erro: 'O batimento não completou. Veja os registros do servidor.' }
  }
}
