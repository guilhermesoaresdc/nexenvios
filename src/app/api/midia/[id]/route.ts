import { NextResponse } from 'next/server'
import { lerArquivo } from '@/lib/midia/servico'

/**
 * Serve um arquivo enviado pela tela.
 *
 * **Sem autenticação, de propósito.** O endereço precisa ser público: a mídia
 * da campanha é baixada pelo provedor de envio, que não tem sessão nossa, e a
 * foto de perfil é justamente o que todo destinatário vai ver. O que protege é
 * o id ser um uuid aleatório — não há listagem, e não dá para adivinhar.
 *
 * O conteúdo nunca muda depois de gravado (subir outra foto cria outro id),
 * então o cache é imutável e eterno.
 */

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  // O endereço traz a extensão para o provedor reconhecer o formato; quem
  // identifica o arquivo é só o uuid antes do ponto.
  const uuid = id.split('.')[0] ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 })
  }

  const arquivo = await lerArquivo(uuid)
  if (!arquivo) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 })

  return new NextResponse(new Uint8Array(arquivo.bytes), {
    headers: {
      'content-type': arquivo.mime,
      'content-length': String(arquivo.bytes.length),
      'cache-control': 'public, max-age=31536000, immutable',
      // O arquivo vem de quem cadastrou o canal. Servido do nosso domínio, um
      // SVG ou HTML disfarçado rodaria script na nossa origem — o nosniff e o
      // Content-Disposition fecham essa porta.
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  })
}
