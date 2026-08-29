import { describe, expect, it } from 'vitest'
import {
  dentroDaJanela,
  esperaDaRetentativa,
  horaLocal,
  montarCalendario,
  proximaAbertura,
} from '@/lib/delivery/janela'

/**
 * O calendário é a aritmética mais delicada do motor: é ele que decide se dez
 * mil mensagens saem espalhadas ao longo do dia ou de uma vez às três da manhã.
 */

const SP = 'America/Sao_Paulo'

describe('horaLocal', () => {
  it('converte para a hora do fuso da organização', () => {
    // 12:00 UTC = 09:00 em São Paulo (UTC-3).
    expect(horaLocal(new Date('2026-03-15T12:00:00Z'), SP)).toBe(9)
    expect(horaLocal(new Date('2026-03-15T02:00:00Z'), SP)).toBe(23)
  })
})

describe('dentroDaJanela', () => {
  it('trata o fim como exclusivo — 8–21 é das 8h às 20h59', () => {
    expect(dentroDaJanela(8, 8, 21)).toBe(true)
    expect(dentroDaJanela(20, 8, 21)).toBe(true)
    expect(dentroDaJanela(21, 8, 21)).toBe(false)
    expect(dentroDaJanela(7, 8, 21)).toBe(false)
  })

  it('aceita janela invertida, para quem manda de madrugada de propósito', () => {
    expect(dentroDaJanela(23, 22, 6)).toBe(true)
    expect(dentroDaJanela(3, 22, 6)).toBe(true)
    expect(dentroDaJanela(12, 22, 6)).toBe(false)
  })

  it('janela de início igual ao fim significa o dia inteiro', () => {
    expect(dentroDaJanela(3, 0, 0)).toBe(true)
  })
})

describe('proximaAbertura', () => {
  it('devolve o próprio instante quando já está dentro', () => {
    const agora = new Date('2026-03-15T13:00:00Z') // 10h em SP
    expect(proximaAbertura(agora, SP, 8, 21).getTime()).toBe(agora.getTime())
  })

  it('empurra para a abertura quando está fora', () => {
    const madrugada = new Date('2026-03-15T06:00:00Z') // 3h em SP
    const abre = proximaAbertura(madrugada, SP, 8, 21)
    expect(abre.getTime()).toBeGreaterThan(madrugada.getTime())
    expect(horaLocal(abre, SP)).toBe(8)
  })
})

describe('montarCalendario', () => {
  it('respeita o ritmo por minuto', () => {
    const inicio = new Date('2026-03-15T13:00:00Z') // 10h em SP
    const datas = montarCalendario({
      quantidade: 60,
      inicio,
      ratePerMinute: 60,
      jitterMs: 0,
      timezone: SP,
      quietStart: 0,
      quietEnd: 0,
    })

    expect(datas).toHaveLength(60)
    // 60 por minuto = uma por segundo.
    const intervalo = datas[1]!.getTime() - datas[0]!.getTime()
    expect(intervalo).toBe(1000)
    // A última sai 59 segundos depois da primeira.
    expect(datas[59]!.getTime() - datas[0]!.getTime()).toBe(59_000)
  })

  it('nunca agenda antes do início pedido', () => {
    const inicio = new Date('2026-03-15T13:00:00Z')
    const datas = montarCalendario({
      quantidade: 50,
      inicio,
      ratePerMinute: 600,
      jitterMs: 5000,
      timezone: SP,
      quietStart: 0,
      quietEnd: 0,
    })
    for (const d of datas) expect(d.getTime()).toBeGreaterThanOrEqual(inicio.getTime())
  })

  it('empurra para a manhã seguinte o que cairia dentro da janela de silêncio', () => {
    // Começa às 20h30 em SP com janela 8–21: as primeiras saem hoje, o resto
    // tem de pular a madrugada inteira.
    const inicio = new Date('2026-03-15T23:30:00Z') // 20h30 em SP
    const datas = montarCalendario({
      quantidade: 4000,
      inicio,
      ratePerMinute: 60,
      jitterMs: 0,
      timezone: SP,
      quietStart: 8,
      quietEnd: 21,
    })

    for (const d of datas) {
      const h = horaLocal(d, SP)
      expect(h, `agendou para ${h}h, fora da janela`).toBeGreaterThanOrEqual(8)
      expect(h).toBeLessThan(21)
    }
  })

  it('mantém a ordem crescente mesmo com jitter', () => {
    const datas = montarCalendario({
      quantidade: 200,
      inicio: new Date('2026-03-15T13:00:00Z'),
      ratePerMinute: 60,
      jitterMs: 1500,
      timezone: SP,
      quietStart: 0,
      quietEnd: 0,
    })
    // O jitter espalha, mas o passo é maior que o desvio: a fila não embaralha
    // a ponto de o motor pegar as linhas fora de ordem.
    for (let i = 1; i < datas.length; i += 1) {
      expect(datas[i]!.getTime()).toBeGreaterThanOrEqual(datas[i - 1]!.getTime() - 1500)
    }
  })

  it('lida com quantidade zero sem estourar', () => {
    expect(
      montarCalendario({
        quantidade: 0,
        inicio: new Date(),
        ratePerMinute: 60,
        jitterMs: 0,
        timezone: SP,
        quietStart: 8,
        quietEnd: 21,
      }),
    ).toEqual([])
  })
})

describe('esperaDaRetentativa', () => {
  it('cresce a cada tentativa', () => {
    expect(esperaDaRetentativa(1)).toBe(60_000)
    expect(esperaDaRetentativa(2)).toBe(300_000)
    expect(esperaDaRetentativa(3)).toBe(1_500_000)
  })

  it('respeita o retry-after do provedor quando ele manda um', () => {
    expect(esperaDaRetentativa(1, 30)).toBe(30_000)
  })

  it('não deixa o provedor pedir uma espera absurda', () => {
    expect(esperaDaRetentativa(1, 99_999)).toBe(3_600_000)
  })
})
