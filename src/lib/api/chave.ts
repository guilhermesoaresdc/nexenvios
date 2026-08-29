import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { apiKeys, organizations } from '@/db/schema'

/**
 * Chaves da API pública.
 *
 * O segredo aparece UMA VEZ, na criação. O banco guarda o prefixo (que a tela
 * mostra para a pessoa reconhecer a chave) e o sha256 do resto. Um dump não
 * entrega chave de ninguém.
 *
 * Formato: nex_live_<8 caracteres de prefixo><32 bytes em base64url>
 */

const PREFIXO = 'nex_live_'
const TAMANHO_DO_ROTULO = 8

export const ESCOPOS = ['envios:escrever', 'envios:ler', 'contatos:escrever', 'contatos:ler'] as const
export type Escopo = (typeof ESCOPOS)[number]

export const ESCOPO_LABEL: Record<Escopo, string> = {
  'envios:escrever': 'Criar envios e campanhas',
  'envios:ler': 'Consultar envios e campanhas',
  'contatos:escrever': 'Criar e atualizar contatos',
  'contatos:ler': 'Consultar contatos',
}

function hash(valor: string): string {
  return createHash('sha256').update(valor).digest('hex')
}

export type ChaveCriada = { id: string; prefixo: string; chave: string }

export async function criarChave(
  orgId: string,
  autorId: string,
  nome: string,
  escopos: Escopo[],
): Promise<ChaveCriada> {
  const rotulo = randomBytes(6).toString('base64url').slice(0, TAMANHO_DO_ROTULO)
  const segredo = randomBytes(32).toString('base64url')
  const prefixo = `${PREFIXO}${rotulo}`

  const [linha] = await db
    .insert(apiKeys)
    .values({
      orgId,
      name: nome,
      prefix: prefixo,
      keyHash: hash(segredo),
      scopes: escopos.length > 0 ? escopos : ['envios:escrever', 'envios:ler'],
      createdBy: autorId,
    })
    .returning({ id: apiKeys.id })

  if (!linha) throw new Error('Não foi possível criar a chave.')
  return { id: linha.id, prefixo, chave: `${prefixo}.${segredo}` }
}

export async function revogarChave(orgId: string, chaveId: string): Promise<boolean> {
  const linhas = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, chaveId), eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  return linhas.length > 0
}

export type Autenticacao = {
  orgId: string
  escopos: string[]
  orgStatus: string
}

/**
 * Autentica uma requisição da API pública.
 *
 * Devolve `null` para qualquer falha — quem chama responde 401 sem dizer QUAL
 * parte falhou. Distinguir "chave não existe" de "chave revogada" ajudaria
 * quem está tentando adivinhar.
 */
export async function autenticar(req: Request): Promise<Autenticacao | null> {
  const cabecalho = req.headers.get('authorization') ?? ''
  if (!cabecalho.startsWith('Bearer ')) return null

  const bruta = cabecalho.slice(7).trim()
  const ponto = bruta.indexOf('.')
  if (ponto < 0) return null

  const prefixo = bruta.slice(0, ponto)
  const segredo = bruta.slice(ponto + 1)
  if (!prefixo.startsWith(PREFIXO) || segredo.length < 20) return null

  const [linha] = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      keyHash: apiKeys.keyHash,
      scopes: apiKeys.scopes,
      revokedAt: apiKeys.revokedAt,
      orgStatus: organizations.status,
    })
    .from(apiKeys)
    .innerJoin(organizations, eq(organizations.id, apiKeys.orgId))
    .where(eq(apiKeys.prefix, prefixo))
    .limit(1)

  if (!linha || linha.revokedAt) return null

  // Comparação em tempo constante: sem isso, o tempo de resposta entrega
  // quantos caracteres do hash bateram.
  const esperado = Buffer.from(linha.keyHash, 'hex')
  const recebido = Buffer.from(hash(segredo), 'hex')
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null

  // Carimbo do último uso, sem esperar: a resposta não deve atrasar por isto.
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, linha.id))

  return { orgId: linha.orgId, escopos: linha.scopes, orgStatus: linha.orgStatus }
}

export function temEscopo(auth: Autenticacao, escopo: Escopo): boolean {
  return auth.escopos.includes(escopo)
}

/** As respostas de erro da API, num formato só. */
export function erro(mensagem: string, status: number, codigo?: string): Response {
  return Response.json({ erro: mensagem, codigo }, { status })
}

export async function exigirChave(
  req: Request,
  escopo: Escopo,
): Promise<{ auth: Autenticacao } | { resposta: Response }> {
  const auth = await autenticar(req)
  if (!auth) {
    return {
      resposta: erro('Chave de API ausente ou inválida.', 401, 'nao_autorizado'),
    }
  }
  if (auth.orgStatus !== 'ativo') {
    return {
      resposta: erro('Esta conta está suspensa ou cancelada.', 403, 'conta_inativa'),
    }
  }
  if (!temEscopo(auth, escopo)) {
    return {
      resposta: erro(`Esta chave não tem o escopo "${escopo}".`, 403, 'sem_escopo'),
    }
  }
  return { auth }
}
