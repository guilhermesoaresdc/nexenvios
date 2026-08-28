/**
 * Janela de silêncio e ritmo — as duas regras que decidem QUANDO uma linha sai.
 *
 * Não têm nada de banco nem de rede de propósito: são as únicas partes do
 * motor com aritmética delicada, e assim dá para exercitá-las direto.
 */

/** A hora local (0–23) de um instante, no fuso da organização. */
export function horaLocal(quando: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(quando)
  const hora = partes.find((p) => p.type === 'hour')?.value
  return Number(hora ?? 0) % 24
}

/**
 * Está dentro do horário em que pode enviar?
 *
 * Aceita janela invertida (22 → 6), que é o caso de quem manda de madrugada
 * de propósito. `fim` é exclusivo: 8–21 significa "das 8h às 20h59".
 */
export function dentroDaJanela(hora: number, inicio: number, fim: number): boolean {
  if (inicio === fim) return true
  if (inicio < fim) return hora >= inicio && hora < fim
  return hora >= inicio || hora < fim
}

/**
 * Quando a janela reabre, a partir de `agora`.
 *
 * Devolve o próximo instante em que `dentroDaJanela` é verdadeiro. Como não dá
 * para fazer aritmética de fuso confiável só com o offset (horário de verão
 * existe), a busca é por hora cheia — no máximo 48 tentativas.
 */
export function proximaAbertura(
  agora: Date,
  timezone: string,
  inicio: number,
  fim: number,
): Date {
  if (dentroDaJanela(horaLocal(agora, timezone), inicio, fim)) return agora

  const candidato = new Date(agora)
  candidato.setUTCMinutes(0, 0, 0)
  for (let i = 1; i <= 48; i += 1) {
    candidato.setUTCHours(candidato.getUTCHours() + 1)
    if (dentroDaJanela(horaLocal(candidato, timezone), inicio, fim)) return candidato
  }
  // Janela impossível não deveria passar pela validação; se passou, não segura
  // a campanha para sempre.
  return agora
}

/**
 * O calendário do disparo.
 *
 * Espalha `quantidade` envios respeitando o ritmo por minuto, o jitter e a
 * janela de silêncio. Devolve o instante de cada linha — é isto que vai para
 * `dispatches.scheduled_for`, e é por isso que o motor não precisa de fila
 * externa: o "quando" já está no banco.
 */
export function montarCalendario(opcoes: {
  quantidade: number
  inicio: Date
  ratePerMinute: number
  jitterMs: number
  timezone: string
  quietStart: number
  quietEnd: number
  sorteio?: () => number
}): Date[] {
  const {
    quantidade,
    inicio,
    ratePerMinute,
    jitterMs,
    timezone,
    quietStart,
    quietEnd,
    sorteio = Math.random,
  } = opcoes

  const passo = 60_000 / Math.max(ratePerMinute, 1)
  const saida: Date[] = []

  let cursor = proximaAbertura(inicio, timezone, quietStart, quietEnd)
  let horaDoCursor = horaLocal(cursor, timezone)
  // Recalcular a hora local a cada linha custaria um Intl.DateTimeFormat por
  // mensagem — em 500 mil linhas, isso é minutos de CPU. Só reconferimos ao
  // virar a hora.
  let proximaConferencia = Math.ceil((cursor.getTime() + 1) / 3_600_000) * 3_600_000

  for (let i = 0; i < quantidade; i += 1) {
    const desvio = jitterMs > 0 ? (sorteio() - 0.5) * jitterMs : 0
    let instante = cursor.getTime() + desvio

    if (instante >= proximaConferencia) {
      const conferido = new Date(instante)
      horaDoCursor = horaLocal(conferido, timezone)
      proximaConferencia = Math.ceil((instante + 1) / 3_600_000) * 3_600_000

      if (!dentroDaJanela(horaDoCursor, quietStart, quietEnd)) {
        const reabre = proximaAbertura(conferido, timezone, quietStart, quietEnd)
        instante = reabre.getTime()
        proximaConferencia = Math.ceil((instante + 1) / 3_600_000) * 3_600_000
        horaDoCursor = horaLocal(reabre, timezone)
      }
    }

    saida.push(new Date(Math.max(instante, inicio.getTime())))
    cursor = new Date(Math.max(instante, cursor.getTime()) + passo)
  }

  return saida
}

/** Backoff da retentativa: 1min, 5min, 25min. Depois disso, desiste. */
export const MAX_TENTATIVAS = 3

export function esperaDaRetentativa(tentativa: number, esperarSegundos?: number): number {
  if (esperarSegundos && esperarSegundos > 0) return Math.min(esperarSegundos * 1000, 3_600_000)
  return Math.min(60_000 * 5 ** Math.max(tentativa - 1, 0), 1_800_000)
}
