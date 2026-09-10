/** Mesma comparação Origin/Host usada nas rotas públicas de autenticação. */
export function mesmaOrigem(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false
  const origem = request.headers.get('origin')
  try {
    const url = new URL(origem ?? '')
    return url.origin === origem && url.host === request.headers.get('host')
  } catch { return false }
}
