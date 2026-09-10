import { describe, expect, it } from 'vitest'
import { enderecoPublico, baixarArquivoPublico } from '@/lib/http/arquivo-publico'
describe('mídia remota', () => {
  it('recusa redes privadas, metadata e IPv6 local/mapeado', () => {
    for (const ip of [
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
      'fe80::1',
    ])
      expect(enderecoPublico(ip)).toBe(false)
    expect(enderecoPublico('1.1.1.1')).toBe(true)
    expect(enderecoPublico('2606:4700:4700::1111')).toBe(true)
  })
  it('recusa protocolo e credenciais embutidas antes de abrir conexão', async () => {
    await expect(baixarArquivoPublico('file:///etc/passwd')).rejects.toThrow()
    await expect(baixarArquivoPublico('https://user:password@example.com/a.png')).rejects.toThrow()
    await expect(baixarArquivoPublico('http://169.254.169.254/a.png')).rejects.toThrow()
  })
})
