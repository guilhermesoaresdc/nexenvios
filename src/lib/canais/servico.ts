import 'server-only'
import { and, eq, isNull, or } from 'drizzle-orm'
import { db, sql } from '@/db'
import { auditLog, channelConfigs } from '@/db/schema'
import { entregaACampanhaInteira, type Channel } from '@/db/schema/enums'
import { guardarSegredo, lerSegredo } from '@/lib/cripto'
import { CAMPOS_DO_PROVEDOR } from './campos'
import { conferirNomeDePerfil } from '@/lib/channels/nome-perfil'

/**
 * Gravar e apagar a configuração de um canal.
 *
 * Serve à tela do cliente e à de provedores da plataforma — a única diferença
 * é `orgId` ser um uuid ou nulo. Uma função só evita que as duas telas
 * divirjam no tratamento do segredo, que é onde um deslize custa caro.
 */

export type Salvamento = { ok: true; id: string } | { ok: false; erro: string }

/**
 * Trocar o provedor de um canal com trabalho vivo mata a fila em silêncio.
 *
 * `montarConfig` recebe o canal CONGELADO na linha de envio e o provedor ATUAL
 * da configuração. Trocar um dos dois faz a combinação deixar de existir, e
 * daí em diante toda linha daquela fila falha com "canal sem configuração" —
 * sem erro na tela de quem trocou, sem erro no build, só mensagem nenhuma
 * saindo. Campanha delegada é pior: ela vive do polling, que lê a credencial
 * por aqui, e passaria a consultar uma plataforma que não é a dona da campanha.
 *
 * O certo é criar OUTRO canal com o provedor novo — trocar o de dentro
 * reescreve o passado de campanhas que já saíram por outro caminho. Rótulo,
 * credencial e o resto continuam livres: é assim que se gira um token.
 *
 * Devolve o motivo da recusa, ou nulo quando não há nada em risco.
 */
async function conferirTrocaDeProvedor(configId: string): Promise<string | null> {
  const [contagem] = await sql<{ mensagens: number; campanhas: number }[]>`
    SELECT
      (SELECT count(*) FROM dispatches
        WHERE config_id = ${configId}
          AND status IN ('pendente', 'enviando'))::int AS mensagens,
      (SELECT count(*) FROM campaigns
        WHERE config_id = ${configId}
          AND status IN ('preparando', 'aguardando', 'agendada', 'enviando', 'pausada'))::int
        AS campanhas
  `

  const mensagens = contagem?.mensagens ?? 0
  const campanhas = contagem?.campanhas ?? 0
  if (mensagens === 0 && campanhas === 0) return null

  const partes: string[] = []
  if (campanhas > 0) {
    partes.push(campanhas === 1 ? '1 campanha em andamento' : `${campanhas} campanhas em andamento`)
  }
  if (mensagens > 0) {
    partes.push(
      mensagens === 1
        ? '1 mensagem ainda na fila'
        : `${mensagens.toLocaleString('pt-BR')} mensagens ainda na fila`,
    )
  }

  return (
    `Este canal tem ${partes.join(' e ')}. Trocar o provedor agora faria tudo isso parar ` +
    'sem aviso. Espere terminar, ou crie um canal novo com o outro provedor.'
  )
}

export async function salvarCanal(opcoes: {
  /** Nulo = provedor da plataforma, herdado por todos os clientes. */
  orgId: string | null
  configId?: string | null
  canal: Channel
  provider: string
  rotulo: string
  valores: Record<string, string>
  ativo: boolean
  padrao: boolean
  autorId: string
}): Promise<Salvamento> {
  const campos = CAMPOS_DO_PROVEDOR[opcoes.provider]
  if (!campos) return { ok: false, erro: 'Provedor desconhecido.' }

  let anteriores: Record<string, unknown> = {}
  if (opcoes.configId) {
    const [atual] = await db
      .select({
        credentials: channelConfigs.credentials,
        orgId: channelConfigs.orgId,
        canal: channelConfigs.channel,
        provider: channelConfigs.provider,
      })
      .from(channelConfigs)
      .where(eq(channelConfigs.id, opcoes.configId))
      .limit(1)

    if (!atual) return { ok: false, erro: 'Este canal não existe mais.' }
    // Um canal da plataforma não pode ser editado pela tela do cliente, e o
    // canal de um cliente não pode ser editado pela tela de outro.
    if (atual.orgId !== opcoes.orgId) return { ok: false, erro: 'Você não pode editar este canal.' }
    anteriores = lerSegredo<Record<string, unknown>>(atual.credentials) ?? {}

    if (atual.canal !== opcoes.canal || atual.provider !== opcoes.provider) {
      const recusa = await conferirTrocaDeProvedor(opcoes.configId)
      if (recusa) return { ok: false, erro: recusa }
    }
  }

  const credenciais: Record<string, unknown> = {}
  for (const campo of campos) {
    const bruto = (opcoes.valores[campo.nome] ?? '').trim()

    if (campo.segredo && bruto === '') {
      /*
       * Campo de segredo vazio na edição significa "mantenha o que está lá".
       * Sem esta regra, abrir e salvar a tela apagaria a credencial — e o
       * canal quebraria em silêncio no meio do próximo disparo.
       */
      if (anteriores[campo.nome] !== undefined) credenciais[campo.nome] = anteriores[campo.nome]
      continue
    }

    if (bruto === '') {
      /*
       * Vazio na edição também mantém o que já estava — não só nos segredos.
       *
       * O formulário não recebe os valores guardados (a consulta dos canais
       * devolve só `temCredencial`), então TODO campo chega vazio ao reabrir a
       * tela. Sem esta linha, abrir o canal do Monitor para trocar o rótulo
       * apagava os quatro campos de perfil, em silêncio — e o próximo disparo
       * saía sem o perfil que a pessoa tinha cadastrado.
       *
       * O preço é não dar para esvaziar um campo opcional pela tela. É o lado
       * certo de errar: apagar sem querer custa mais do que não conseguir
       * apagar.
       */
      if (opcoes.configId && anteriores[campo.nome] !== undefined) {
        credenciais[campo.nome] = anteriores[campo.nome]
        continue
      }
      if (campo.padrao) credenciais[campo.nome] = campo.padrao
      continue
    }

    if (campo.obrigatorio && bruto === '') {
      return { ok: false, erro: `Informe ${campo.rotulo.toLowerCase()}.` }
    }

    credenciais[campo.nome] = bruto
  }

  for (const campo of campos) {
    if (campo.obrigatorio && !credenciais[campo.nome]) {
      return { ok: false, erro: `Informe ${campo.rotulo.toLowerCase()}.` }
    }
  }

  /*
   * O nome de perfil passa pela régua da Meta já no cadastro.
   *
   * Deixar para conferir só na hora do disparo faria a pessoa cadastrar o
   * canal, achar que está pronto, e descobrir o problema com a campanha
   * montada. Aqui custa uma linha.
   */
  if (entregaACampanhaInteira(opcoes.provider)) {
    for (const [chave, rotulo] of [
      ['perfilNome', 'principal'],
      ['perfilNome2', 'reserva'],
    ] as const) {
      const valor = credenciais[chave]
      if (typeof valor !== 'string' || !valor) continue
      const veredito = conferirNomeDePerfil(valor)
      if (!veredito.ok) return { ok: false, erro: `Perfil ${rotulo} — ${veredito.motivo}` }
    }
  }

  const valores = {
    orgId: opcoes.orgId,
    channel: opcoes.canal,
    provider: opcoes.provider,
    label: opcoes.rotulo,
    credentials: guardarSegredo(credenciais),
    active: opcoes.ativo,
    isDefault: opcoes.padrao,
    // Salvar é um ato de correção: religa o disjuntor.
    failureStreak: 0,
    brokenUntil: null,
  }

  let id: string
  if (opcoes.configId) {
    const [linha] = await db
      .update(channelConfigs)
      .set(valores)
      .where(eq(channelConfigs.id, opcoes.configId))
      .returning({ id: channelConfigs.id })
    if (!linha) return { ok: false, erro: 'Não foi possível salvar.' }
    id = linha.id
  } else {
    const [linha] = await db.insert(channelConfigs).values(valores).returning({ id: channelConfigs.id })
    if (!linha) return { ok: false, erro: 'Não foi possível criar o canal.' }
    id = linha.id
  }

  // Um padrão por canal e por dono: dois padrões fariam a escolha do motor
  // depender da ordem da consulta.
  if (opcoes.padrao) {
    await db
      .update(channelConfigs)
      .set({ isDefault: false })
      .where(
        and(
          eq(channelConfigs.channel, opcoes.canal),
          opcoes.orgId ? eq(channelConfigs.orgId, opcoes.orgId) : isNull(channelConfigs.orgId),
        ),
      )
    await db.update(channelConfigs).set({ isDefault: true }).where(eq(channelConfigs.id, id))
  }

  await db.insert(auditLog).values({
    orgId: opcoes.orgId,
    userId: opcoes.autorId,
    action: opcoes.configId ? 'canal.atualizado' : 'canal.criado',
    entity: 'channel_config',
    entityId: id,
    meta: { canal: opcoes.canal, provedor: opcoes.provider },
  })

  return { ok: true, id }
}

export async function removerCanal(
  orgId: string | null,
  configId: string,
  autorId: string,
): Promise<boolean> {
  const removidas = await db
    .delete(channelConfigs)
    .where(
      and(
        eq(channelConfigs.id, configId),
        orgId ? eq(channelConfigs.orgId, orgId) : isNull(channelConfigs.orgId),
      ),
    )
    .returning({ id: channelConfigs.id })

  if (removidas.length === 0) return false

  await db.insert(auditLog).values({
    orgId,
    userId: autorId,
    action: 'canal.removido',
    entity: 'channel_config',
    entityId: configId,
  })
  return true
}

/** Religa um canal desligado pelo disjuntor. */
export async function religarCanal(configId: string, autorId: string): Promise<void> {
  await db
    .update(channelConfigs)
    .set({ failureStreak: 0, brokenUntil: null, active: true })
    .where(eq(channelConfigs.id, configId))

  await db.insert(auditLog).values({
    userId: autorId,
    action: 'canal.religado',
    entity: 'channel_config',
    entityId: configId,
  })
}

/** O canal de uma organização OU da plataforma — o que o motor aceitaria. */
export async function canalUtilizavel(orgId: string, configId: string) {
  const [linha] = await db
    .select({
      id: channelConfigs.id,
      canal: channelConfigs.channel,
      provider: channelConfigs.provider,
      ativo: channelConfigs.active,
    })
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.id, configId),
        or(eq(channelConfigs.orgId, orgId), isNull(channelConfigs.orgId)),
      ),
    )
    .limit(1)
  return linha ?? null
}
