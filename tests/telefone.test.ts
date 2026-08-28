import { describe, expect, it } from 'vitest'
import { formatarTelefone, normalizarTelefone, ocultarTelefone } from '@/lib/telefone'

/**
 * A normalização é a porta de entrada de tudo. Sem uma forma canônica, o mesmo
 * celular vira três contatos, o descadastro não pega e a mesma pessoa recebe
 * três vezes — cobrada três vezes.
 */

describe('normalizarTelefone', () => {
  it('aceita as formas em que um brasileiro digita o próprio número', () => {
    const esperado = '5511987654321'
    for (const entrada of [
      '11987654321',
      '(11) 98765-4321',
      '+55 11 98765-4321',
      '5511987654321',
      '011987654321',
      '+55 (11) 9 8765-4321',
      ' 11 9 8765 4321 ',
    ]) {
      const r = normalizarTelefone(entrada)
      expect(r.ok, `falhou em "${entrada}"`).toBe(true)
      if (r.ok) expect(r.e164, `errou em "${entrada}"`).toBe(esperado)
    }
  })

  it('recompõe o nono dígito de celular antigo', () => {
    const r = normalizarTelefone('1187654321')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.e164).toBe('5511987654321')
      expect(r.movel).toBe(true)
    }
  })

  it('não inventa nono dígito em telefone fixo', () => {
    const r = normalizarTelefone('1132654321')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.e164).toBe('551132654321')
      expect(r.movel).toBe(false)
    }
  })

  it('recusa com motivo específico, para a tela poder explicar', () => {
    expect(normalizarTelefone('')).toMatchObject({ ok: false, motivo: 'vazio' })
    expect(normalizarTelefone('11987')).toMatchObject({ ok: false, motivo: 'curto' })
    expect(normalizarTelefone('551198765432199')).toMatchObject({ ok: false, motivo: 'longo' })
    // 10 não é DDD válido no Brasil.
    expect(normalizarTelefone('1098765432')).toMatchObject({ ok: false, motivo: 'ddd' })
  })

  it('recusa celular de nove dígitos que não começa com 9', () => {
    expect(normalizarTelefone('11887654321')).toMatchObject({ ok: false, motivo: 'formato' })
  })

  it('é idempotente — normalizar duas vezes dá o mesmo', () => {
    const uma = normalizarTelefone('(11) 98765-4321')
    expect(uma.ok).toBe(true)
    if (!uma.ok) return
    const duas = normalizarTelefone(uma.e164)
    expect(duas.ok).toBe(true)
    if (duas.ok) expect(duas.e164).toBe(uma.e164)
  })
})

describe('formatarTelefone', () => {
  it('devolve o formato que o brasileiro lê', () => {
    expect(formatarTelefone('5511987654321')).toBe('(11) 98765-4321')
    expect(formatarTelefone('551132654321')).toBe('(11) 3265-4321')
    expect(formatarTelefone(null)).toBe('—')
  })

  it('esconde o miolo quando pedido', () => {
    expect(ocultarTelefone('5511987654321')).toBe('(11) 9****-4321')
  })
})
