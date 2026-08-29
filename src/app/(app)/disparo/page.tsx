import type { Metadata } from 'next'
import { canaisDaOrg } from '@/db/queries/canais'
import { etiquetasEmUso, listarListas, resumoDaBase } from '@/db/queries/contatos'
import type { Channel } from '@/db/schema/enums'
import { exigirUsuario } from '@/lib/auth/atual'
import { FRASE_ELEITORAL, precoDoCanal } from '@/lib/campanhas/servico'
import { data, moeda } from '@/lib/ui'
import { Titulo } from '@/components/shell/casca'
import { IcCanais } from '@/components/shell/icones'
import { BotaoLink, Chip, Pad, Vazio } from '@/components/ui/base'
import { Assistente, type CanalDisponivel } from './assistente'

export const metadata: Metadata = { title: 'Novo disparo' }

export default async function NovoDisparo() {
  const usuario = await exigirUsuario()

  const [canais, listas, etiquetas, base] = await Promise.all([
    canaisDaOrg(usuario.orgId),
    listarListas(usuario.orgId),
    etiquetasEmUso(usuario.orgId),
    resumoDaBase(usuario.orgId),
  ])

  // Um preço por canal, não por configuração: dois cartões do mesmo canal
  // custam o mesmo, e a consulta é a mesma.
  const distintos = [...new Set(canais.map((c) => c.canal))]
  const precos = new Map<Channel, number>(
    await Promise.all(
      distintos.map(async (c) => [c, await precoDoCanal(usuario.orgId, c)] as const),
    ),
  )

  const agora = Date.now()
  const disponiveis: CanalDisponivel[] = canais.map((c) => ({
    id: c.id,
    canal: c.canal,
    rotulo: c.rotulo,
    provedor: c.provedor,
    preco: precos.get(c.canal) ?? 0,
    ativo: c.ativo,
    temCredencial: c.temCredencial,
    numeros: c.numeros,
    daPlataforma: c.orgId === null,
    instavel: c.quebradoAte ? c.quebradoAte.getTime() > agora : false,
  }))

  return (
    <>
      <Titulo
        titulo="Novo disparo"
        descricao="Canal, público, mensagem e ritmo. O custo aparece antes de você confirmar."
        acao={<Chip tom="navy">Saldo {moeda(usuario.credits)}</Chip>}
      />

      {disponiveis.length === 0 ? (
        <Pad>
          <Vazio
            titulo="Nenhum canal configurado"
            descricao="Um disparo precisa de um canal com credencial: WhatsApp, SMS, RCS ou torpedo de voz. Configure o primeiro e volte aqui."
            icone={<IcCanais className="h-6 w-6" />}
            acao={<BotaoLink href="/canais">Configurar um canal</BotaoLink>}
          />
        </Pad>
      ) : (
        <Assistente
          canais={disponiveis}
          listas={listas.map((l) => ({ id: l.id, nome: l.nome, total: l.total }))}
          etiquetas={etiquetas.map((e) => ({ etiqueta: e.etiqueta, total: e.total }))}
          ativosNaBase={base.ativos}
          saldo={Number(usuario.credits)}
          frase={FRASE_ELEITORAL}
          hoje={data(new Date())}
        />
      )}
    </>
  )
}
