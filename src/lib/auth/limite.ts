import 'server-only'
import { createHash } from 'node:crypto'
import { sql } from '@/db'

/** Limite compartilhado entre instâncias, sem guardar IP ou e-mail em claro. */
export async function registrarTentativa(
  chave: string,
  conexao: typeof sql = sql,
): Promise<{ bloqueado: boolean; restam: number }> {
  const id = createHash('sha256').update(chave).digest('hex')
  const [linha] = await conexao<{ attempts: number }[]>`
    INSERT INTO auth_attempts (key, attempts, expires_at)
    VALUES (${id}, 1, now() + interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.expires_at <= now() THEN 1 ELSE auth_attempts.attempts + 1 END,
      expires_at = CASE WHEN auth_attempts.expires_at <= now() THEN now() + interval '15 minutes' ELSE auth_attempts.expires_at END
    RETURNING attempts
  `
  const n = linha?.attempts ?? 11
  return { bloqueado: n > 10, restam: Math.max(0, 10 - n) }
}

export async function limparTentativas(chave: string, conexao: typeof sql = sql): Promise<void> {
  const id = createHash('sha256').update(chave).digest('hex')
  await conexao`DELETE FROM auth_attempts WHERE key = ${id}`
}
