import { paginaComBanco } from '@/db/escopo'
import Link from 'next/link'
import { sql } from '@/db'
import { exigirSuperadmin } from '@/lib/auth/atual'
import { estadoDoBatimento } from '@/db/queries/admin'
import { Titulo } from '@/components/shell/casca'
import { Aviso, Chip, Pad, PadTitulo, Tabela, Td, Th, Vazio } from '@/components/ui/base'
import { quando } from '@/lib/ui'
export const metadata = { title: 'Prontidão da operação' }
export const dynamic = 'force-dynamic'

async function Operacao() {
  await exigirSuperadmin()
  const [batimento, [base], pendencias] = await Promise.all([
    estadoDoBatimento(),
    sql<{ canais: number; semAdmin: number; precosZerados: number }[]>`
      SELECT (SELECT count(*)::int FROM channel_configs WHERE org_id IS NULL AND active AND credentials IS NOT NULL) AS canais,
      (SELECT count(*)::int FROM organizations o WHERE NOT is_platform AND status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.org_id=o.id AND u.active AND u.role='admin')) AS "semAdmin",
      (SELECT count(*)::int FROM channel_prices WHERE org_id IS NULL AND price <= 0) AS "precosZerados"
    `,
    sql<
      {
        id: string
        name: string
        cliente: string
        status: string
        motivo: string | null
        falhas: number
        codigo: string | null
      }[]
    >`
      SELECT c.id, c.name, o.name AS cliente, c.status, c.external_reason AS motivo,
        c.external_sync_failures AS falhas, c.external_code AS codigo
      FROM campaigns c JOIN organizations o ON o.id=c.org_id
      WHERE c.external_sync_failures > 0 OR (c.external_code IS NOT NULL AND c.status = 'falhou')
        OR (c.external_provider IS NOT NULL AND c.external_code IS NULL AND c.status = 'aguardando')
      ORDER BY c.updated_at DESC LIMIT 50
    `,
  ])
  const recente =
    !!batimento.ultimoEm && Date.now() - new Date(batimento.ultimoEm).getTime() < 5 * 60_000
  const itens = [
    {
      nome: 'Acompanhamento automático',
      ok: recente,
      detalhe: batimento.ultimoEm
        ? `Última execução ${quando(batimento.ultimoEm)}. O intervalo esperado é de até 1 minuto.`
        : 'Ainda não há execução registrada. Configure o agendador antes de iniciar os envios.',
      link: '/admin',
    },
    {
      nome: 'E-mail de acesso',
      ok: !!process.env.RESEND_API_KEY,
      detalhe: process.env.RESEND_API_KEY
        ? 'Credencial configurada. Confirme a entrega de convite e recuperação com uma conta de teste.'
        : 'Convites e recuperação por e-mail estão indisponíveis. Configure o remetente; o administrador pode gerar o link de acesso.',
      link: '/admin/usuarios',
    },
    {
      nome: 'Provedor para novos clientes',
      ok: (base?.canais ?? 0) > 0,
      detalhe: `${base?.canais ?? 0} canal(is) ativo(s) da plataforma. Canais da conta interna não são herdados pelos clientes.`,
      link: '/admin/provedores',
    },
    {
      nome: 'Tabela comercial',
      ok: base?.precosZerados === 0,
      detalhe: `${base?.precosZerados ?? 0} canal(is) com preço padrão zero. Confira os canais que serão comercializados.`,
      link: '/admin/precos',
    },
    {
      nome: 'Responsáveis pelas contas',
      ok: base?.semAdmin === 0,
      detalhe: `${base?.semAdmin ?? 0} conta(s) ativa(s) sem administrador ativo.`,
      link: '/admin/clientes',
    },
    {
      nome: 'Acompanhamento do provedor',
      ok: pendencias.length === 0,
      detalhe: `${pendencias.length} campanha(s) exigem conferência. Não repita o envio sem verificar o código externo.`,
      link: '/admin/envios',
    },
  ]
  return (
    <>
      <Titulo
        titulo="Prontidão da operação"
        descricao="O que os sócios precisam acompanhar antes de liberar clientes e envios."
      />
      <Aviso tom="info" className="mb-6">
        A configuração atual usa o Monitor de Envios. Credencial configurada não comprova entrega:
        confira saldo e campanhas em Provedores e valide uma campanha autorizada antes de operar com
        clientes.
      </Aviso>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {itens.map((i) => (
          <Pad key={i.nome} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-navy">{i.nome}</h2>
              <Chip tom={i.ok ? 'verde' : 'ambar'}>{i.ok ? 'Conferido' : 'Revisar'}</Chip>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{i.detalhe}</p>
            <Link href={i.link} className="mt-5 inline-block text-sm font-semibold text-blue">
              Abrir controle →
            </Link>
          </Pad>
        ))}
      </div>
      <Pad className="mt-6">
        <PadTitulo
          titulo="Envios que precisam de conferência"
          descricao="Falha de consulta não comprova que o envio falhou. O histórico original é preservado."
        />
        {pendencias.length === 0 ? (
          <Vazio
            titulo="Sem pendências de sincronização"
            descricao="Novos alertas aparecerão aqui."
          />
        ) : (
          <Tabela rotulo="Campanhas com pendências">
            <thead>
              <tr>
                <Th>Cliente / campanha</Th>
                <Th>Código externo</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {pendencias.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <span className="font-semibold">{c.cliente}</span>
                    <span className="block text-sm text-muted">{c.name}</span>
                  </Td>
                  <Td>
                    <code className="text-xs">{c.codigo ?? 'Sem confirmação'}</code>
                  </Td>
                  <Td>
                    <p className="text-sm">{c.motivo ?? 'Conferir no provedor'}</p>
                    <span className="text-xs text-muted">
                      {c.falhas} falha(s) de consulta · {c.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Pad>
    </>
  )
}

export default paginaComBanco('/admin/operacao', Operacao)
