import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ bater: vi.fn(), manutencao: vi.fn() }))
vi.mock('@/lib/delivery/motor', () => mocks)
import { GET } from '@/app/api/cron/route'

describe('autorização do processamento', () => {
  it('não aceita x-vercel-cron falsificado sem segredo', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-de-teste')
    vi.stubEnv('VERCEL', '1')
    const r = await GET(
      new Request('https://nex.example/api/cron', { headers: { 'x-vercel-cron': '1' } }),
    )
    expect(r.status).toBe(401)
    expect(mocks.bater).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
  it('aceita o bearer correto e limita o lote', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-de-teste')
    mocks.bater.mockResolvedValue({ enviados: 0 })
    const r = await GET(
      new Request('https://nex.example/api/cron?lote=999999', {
        headers: { authorization: 'Bearer segredo-de-teste' },
      }),
    )
    expect(r.status).toBe(200)
    expect(mocks.bater).toHaveBeenCalledWith(100)
    vi.unstubAllEnvs()
  })
})
