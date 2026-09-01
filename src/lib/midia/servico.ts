import 'server-only'
import { sql } from '@/db'
import { dimensoesDaImagem } from './dimensoes'

/**
 * Arquivo enviado pela tela: guardar, ler e recusar.
 *
 * O que existia era só um campo de link. Isso empurrava para fora do produto
 * um passo obrigatório — hospedar a imagem em algum lugar — e o "algum lugar"
 * acabava sendo um serviço gratuito qualquer, com o link morrendo semanas
 * depois e derrubando a campanha seguinte sem ninguém entender por quê.
 *
 * As regras daqui são as do Monitor de Envios, aplicadas no upload e não na
 * submissão: foto reprovada não barra o cadastro, trava a campanha NO MEIO do
 * disparo, e destravar exige cadastrar outra e esperar nova aprovação deles.
 */

/**
 * Os tetos, como o Monitor de Envios os define.
 *
 * Imagem e foto de perfil vão a 5 MB; vídeo vai a 16 MB. Um teto único de 5 MB
 * recusava um MP4 de 10 MB que eles aceitam sem reclamar.
 */
export const TETO_BYTES = 5 * 1024 * 1024
export const TETO_VIDEO_BYTES = 16 * 1024 * 1024

/** Os lados de uma foto de perfil, pela régua deles: 192 a 4096, quadrada. */
export const LADO_MINIMO = 192
export const LADO_MAXIMO = 4096

/**
 * Quanto o retrato pode fugir do quadrado.
 *
 * Eles pedem quadrada. Recusar 1000×1001 seria implicância — o WhatsApp corta
 * em círculo de qualquer jeito. 2% deixa passar o arredondamento de quem
 * recortou à mão e ainda barra a foto deitada, que é a que sai errada.
 */
const TOLERANCIA_QUADRADO = 0.02

/**
 * As imagens que o Monitor aceita: jpg, jpeg, png, webp.
 *
 * GIF ficou de fora de propósito — estava na lista e não está na deles. Uma
 * foto de perfil em GIF passava aqui e tomava 400 depois do upload, que é o
 * pior lugar para descobrir.
 */
export const IMAGENS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Vídeo da campanha. Teto próprio de 16 MB. */
const VIDEOS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

/**
 * O que só vale fora do Monitor.
 *
 * `midia_campanha` deles aceita imagem e vídeo — PDF e áudio não estão na
 * lista. Continuam aqui porque o provedor HTTP genérico manda esses tipos sem
 * problema; quem barra é a conferência por canal, na hora de submeter.
 */
const OUTROS: Record<string, string> = {
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
}

export type Uso = 'perfil' | 'midia'

export type Guardado =
  | { ok: true; url: string; largura: number | null; altura: number | null; bytes: number }
  | { ok: false; erro: string }

function extensao(mime: string): string {
  return IMAGENS[mime] ?? VIDEOS[mime] ?? OUTROS[mime] ?? 'bin'
}

export async function guardarArquivo(opcoes: {
  orgId: string | null
  autorId: string | null
  arquivo: File
  uso: Uso
  /** Origem pública para montar o endereço. Sem ela, o link não sai daqui. */
  origem: string
}): Promise<Guardado> {
  const { arquivo, uso } = opcoes

  if (!arquivo || arquivo.size === 0) return { ok: false, erro: 'Escolha um arquivo.' }

  const mime = (arquivo.type || '').toLowerCase()
  const aceitos = uso === 'perfil' ? IMAGENS : { ...IMAGENS, ...VIDEOS, ...OUTROS }
  if (!aceitos[mime]) {
    return {
      ok: false,
      erro:
        uso === 'perfil'
          ? 'A foto precisa ser PNG, JPG ou WebP.'
          : 'Formato não aceito. Vale imagem (PNG, JPG, WebP), vídeo (MP4, MOV), PDF ou áudio.',
    }
  }

  // O vídeo tem teto próprio, maior. Ver TETO_VIDEO_BYTES.
  const teto = VIDEOS[mime] ? TETO_VIDEO_BYTES : TETO_BYTES
  if (arquivo.size > teto) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1).replace('.', ',')
    return {
      ok: false,
      erro: `O arquivo tem ${mb} MB e o limite é ${teto / 1024 / 1024} MB.`,
    }
  }

  const dados = new Uint8Array(await arquivo.arrayBuffer())
  let largura: number | null = null
  let altura: number | null = null

  if (IMAGENS[mime]) {
    const medida = dimensoesDaImagem(dados)
    if (!medida) {
      // Extensão de imagem sem cabeçalho de imagem: ou o arquivo está
      // corrompido, ou não é o que diz ser. Nos dois casos não sobe.
      return { ok: false, erro: 'Não consegui ler esta imagem. Tente exportar de novo, em PNG ou JPG.' }
    }
    largura = medida.largura
    altura = medida.altura

    if (uso === 'perfil') {
      if (largura < LADO_MINIMO || altura < LADO_MINIMO) {
        return {
          ok: false,
          erro: `A foto tem ${largura}×${altura}. O Monitor de Envios exige no mínimo ${LADO_MINIMO}×${LADO_MINIMO}.`,
        }
      }
      if (largura > LADO_MAXIMO || altura > LADO_MAXIMO) {
        return {
          ok: false,
          erro: `A foto tem ${largura}×${altura}. O máximo é ${LADO_MAXIMO}×${LADO_MAXIMO} — reduza antes de subir.`,
        }
      }
      const desvio = Math.abs(largura - altura) / Math.max(largura, altura)
      if (desvio > TOLERANCIA_QUADRADO) {
        return {
          ok: false,
          erro: `A foto tem ${largura}×${altura} e precisa ser quadrada. Recorte antes de subir.`,
        }
      }
    }
  }

  const [linha] = await sql<{ id: string }[]>`
    INSERT INTO media_files (org_id, mime, bytes, byte_size, width, height, original_name, created_by)
    VALUES (${opcoes.orgId}, ${mime}, ${Buffer.from(dados)}, ${dados.length},
            ${largura}, ${altura}, ${arquivo.name?.slice(0, 200) ?? null}, ${opcoes.autorId})
    RETURNING id
  `
  if (!linha) return { ok: false, erro: 'Não foi possível guardar o arquivo.' }

  const raiz = opcoes.origem.replace(/\/$/, '')
  return {
    ok: true,
    // A extensão no fim é cosmética para quem lê o link, mas o Monitor usa o
    // nome do arquivo que mandamos — e um nome sem extensão confunde o lado
    // deles na hora de identificar o formato.
    url: `${raiz}/api/midia/${linha.id}.${extensao(mime)}`,
    largura,
    altura,
    bytes: dados.length,
  }
}

export type ArquivoGuardado = { bytes: Buffer; mime: string; nome: string | null }

export async function lerArquivo(id: string): Promise<ArquivoGuardado | null> {
  const [linha] = await sql<{ bytes: Buffer; mime: string; nome: string | null }[]>`
    SELECT bytes, mime, original_name AS nome FROM media_files WHERE id = ${id} LIMIT 1
  `
  return linha ?? null
}
