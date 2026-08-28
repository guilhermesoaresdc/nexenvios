/**
 * Normalização de telefone brasileiro para E.164 sem o '+'.
 *
 * Tudo que entra no sistema passa por aqui: planilha, API, formulário. Sem uma
 * forma canônica, o mesmo celular vira três contatos e o descadastro não pega.
 *
 * O caso chato é o nono dígito. Números móveis brasileiros ganharam um '9' na
 * frente; bases antigas ainda têm o formato de oito dígitos. Como o DDD manda
 * no assunto e a regra hoje é nacional, acrescentamos o nono quando o número
 * tem 8 dígitos e o primeiro deles indica celular (6, 7, 8 ou 9).
 */

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export type TelefoneNormalizado =
  | { ok: true; e164: string; ddd: number; movel: boolean }
  | { ok: false; motivo: 'vazio' | 'curto' | 'longo' | 'ddd' | 'formato' }

export function normalizarTelefone(bruto: string | null | undefined): TelefoneNormalizado {
  if (!bruto) return { ok: false, motivo: 'vazio' }

  let digitos = String(bruto).replace(/\D/g, '')
  if (digitos.length === 0) return { ok: false, motivo: 'vazio' }

  // Zeros de discagem internacional/interurbana que colam na base.
  digitos = digitos.replace(/^00+/, '')
  if (digitos.length > 11 && digitos.startsWith('0')) digitos = digitos.slice(1)

  // Número já em E.164 com o 55 na frente.
  if (digitos.length >= 12 && digitos.startsWith('55')) digitos = digitos.slice(2)
  // 0 de operadora antes do DDD (021, 015…).
  if (digitos.length === 12 && digitos.startsWith('0')) digitos = digitos.slice(2)
  if (digitos.length === 11 && digitos.startsWith('0')) digitos = digitos.slice(1)

  if (digitos.length < 10) return { ok: false, motivo: 'curto' }
  if (digitos.length > 11) return { ok: false, motivo: 'longo' }

  const ddd = Number(digitos.slice(0, 2))
  if (!DDDS_VALIDOS.has(ddd)) return { ok: false, motivo: 'ddd' }

  let assinante = digitos.slice(2)

  if (assinante.length === 8 && /^[6-9]/.test(assinante)) {
    // Celular antigo, de oito dígitos: recompõe o nono.
    assinante = `9${assinante}`
  }

  if (assinante.length === 9 && !/^9/.test(assinante)) return { ok: false, motivo: 'formato' }
  if (assinante.length === 8 && !/^[2-5]/.test(assinante)) return { ok: false, motivo: 'formato' }

  return {
    ok: true,
    e164: `55${ddd}${assinante}`,
    ddd,
    movel: assinante.length === 9,
  }
}

/** "5511987654321" → "(11) 98765-4321". */
export function formatarTelefone(e164: string | null | undefined): string {
  if (!e164) return '—'
  const d = e164.replace(/\D/g, '')
  const nacional = d.startsWith('55') ? d.slice(2) : d
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`
  return e164
}

/** Esconde o miolo: "(11) 9****-4321". Usado onde o número não deve aparecer. */
export function ocultarTelefone(e164: string | null | undefined): string {
  const bonito = formatarTelefone(e164)
  return bonito.replace(/(\d)\d{3,4}(-)/, '$1****$2')
}
