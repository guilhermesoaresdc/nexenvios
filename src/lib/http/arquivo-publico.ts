import 'server-only'
import { lookup } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { isIP } from 'node:net'

export function enderecoPublico(ip: string): boolean {
  if (isIP(ip) === 6)
    return /^[23][0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith('2001:db8:')
  if (isIP(ip) !== 4) return false
  const [a, b] = ip.split('.').map(Number)
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** Resolve o endereço no próprio socket e verifica cada redirecionamento. */
export async function baixarArquivoPublico(
  endereco: string,
  teto = 25 * 1024 * 1024,
  saltos = 0,
): Promise<Blob> {
  const url = new URL(endereco)
  const localDeTeste = process.env.NODE_ENV === 'test' && url.hostname === '127.0.0.1'
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || saltos > 3)
    throw new Error('Endereço de mídia inválido.')
  const literal = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(literal) && !enderecoPublico(literal) && !localDeTeste)
    throw new Error('A mídia precisa estar em um endereço público.')
  return new Promise<Blob>((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(
      url,
      {
        signal: AbortSignal.timeout(20_000),
        lookup(host, options, callback) {
          lookup(host, { all: true }, (erro, enderecos) => {
            if (erro) return callback(erro, [])
            if (!enderecos.length || enderecos.some((e) => !enderecoPublico(e.address)))
              return callback(new Error('Endereço privado não permitido.'), [])
            if (options.all) callback(null, enderecos)
            else callback(null, enderecos[0]!.address, enderecos[0]!.family)
          })
        },
      },
      (res) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume()
          if (!res.headers.location) return reject(new Error('Redirecionamento sem destino.'))
          baixarArquivoPublico(new URL(res.headers.location, url).href, teto, saltos + 1).then(
            resolve,
            reject,
          )
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`Não foi possível obter a mídia (HTTP ${res.statusCode}).`))
        }
        if (Number(res.headers['content-length'] ?? 0) > teto) {
          res.destroy()
          return reject(new Error('A mídia excede o tamanho permitido.'))
        }
        const partes: Buffer[] = []
        let tamanho = 0
        res.on('data', (parte: Buffer) => {
          tamanho += parte.length
          if (tamanho > teto) {
            res.destroy()
            reject(new Error('A mídia excede o tamanho permitido.'))
            return
          }
          partes.push(parte)
        })
        res.on('end', () =>
          resolve(
            new Blob([Buffer.concat(partes)], {
              type: res.headers['content-type'] ?? 'application/octet-stream',
            }),
          ),
        )
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end()
  })
}
