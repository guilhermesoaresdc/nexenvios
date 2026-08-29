import { z } from 'zod'
import { erro, exigirChave } from '@/lib/api/chave'
import { importarContatos } from '@/lib/contatos/importar'
import { listarContatos } from '@/db/queries/contatos'
import { normalizarTelefone } from '@/lib/telefone'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const corpo = z.object({
  contatos: z
    .array(
      z.object({
        telefone: z.string().min(8),
        nome: z.string().max(120).optional().nullable(),
        email: z.string().email().optional().nullable(),
        etiquetas: z.array(z.string().max(40)).max(10).optional(),
      }),
    )
    .min(1)
    .max(1_000),
  listaId: z.string().uuid().optional(),
})

/** POST /api/v1/contatos — cria ou atualiza contatos em lote. */
export async function POST(req: Request) {
  const conferido = await exigirChave(req, 'contatos:escrever')
  if ('resposta' in conferido) return conferido.resposta

  let entrada: unknown
  try {
    entrada = await req.json()
  } catch {
    return erro('O corpo precisa ser um JSON válido.', 400, 'json_invalido')
  }

  const dados = corpo.safeParse(entrada)
  if (!dados.success) {
    return erro(dados.error.issues[0]?.message ?? 'Corpo inválido.', 422, 'corpo_invalido')
  }

  const recusados: { telefone: string; motivo: string }[] = []
  const validos: { telefone: string; nome: string | null; email: string | null }[] = []
  const etiquetas = new Set<string>()

  for (const c of dados.data.contatos) {
    const norm = normalizarTelefone(c.telefone)
    if (!norm.ok) {
      recusados.push({ telefone: c.telefone, motivo: norm.motivo })
      continue
    }
    validos.push({ telefone: norm.e164, nome: c.nome ?? null, email: c.email ?? null })
    for (const e of c.etiquetas ?? []) etiquetas.add(e.trim().toLowerCase())
  }

  if (validos.length === 0) {
    return Response.json({ erro: 'Nenhum número válido.', recusados }, { status: 422 })
  }

  const r = await importarContatos({
    orgId: conferido.auth.orgId,
    autorId: null,
    linhas: validos,
    listaId: dados.data.listaId ?? null,
    etiquetas: [...etiquetas].slice(0, 10),
    origem: 'api',
  })

  return Response.json(
    {
      recebidos: dados.data.contatos.length,
      novos: r.novos,
      atualizados: r.atualizados,
      repetidos: r.repetidos,
      // Quem pediu para sair não volta pela API, como não volta pela planilha.
      descadastrados: r.descadastrados,
      recusados,
    },
    { status: 200 },
  )
}

/** GET /api/v1/contatos — lista a base. */
export async function GET(req: Request) {
  const conferido = await exigirChave(req, 'contatos:ler')
  if ('resposta' in conferido) return conferido.resposta

  const url = new URL(req.url)
  const limite = Math.min(Math.max(Number(url.searchParams.get('limite')) || 50, 1), 200)
  const pular = Math.max(Number(url.searchParams.get('pular')) || 0, 0)
  const busca = url.searchParams.get('busca') ?? undefined
  const etiqueta = url.searchParams.get('etiqueta') ?? undefined

  const linhas = await listarContatos(conferido.auth.orgId, {
    limite,
    pular,
    busca,
    etiqueta,
    descadastrados: 'incluir',
  })

  return Response.json({
    contatos: linhas.map((c) => ({
      id: c.id,
      telefone: c.telefone,
      nome: c.nome,
      email: c.email,
      etiquetas: c.etiquetas,
      descadastrado: c.descadastrado,
      criadoEm: c.criadoEm,
    })),
    limite,
    pular,
  })
}
