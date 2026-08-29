import 'server-only'
import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, channelConfigs } from '@/db/schema'
import type { Channel } from '@/db/schema/enums'
import { guardarSegredo, lerSegredo } from '@/lib/cripto'
import { CAMPOS_DO_PROVEDOR } from './campos'

/**
 * Gravar e apagar a configuração de um canal.
 *
 * Serve à tela do cliente e à de provedores da plataforma — a única diferença
 * é `orgId` ser um uuid ou nulo. Uma função só evita que as duas telas
 * divirjam no tratamento do segredo, que é onde um deslize custa caro.
 */

export type Salvamento = { ok: true; id: string } | { ok: false; erro: string }

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
      .select({ credentials: channelConfigs.credentials, orgId: channelConfigs.orgId })
      .from(channelConfigs)
      .where(eq(channelConfigs.id, opcoes.configId))
      .limit(1)

    if (!atual) return { ok: false, erro: 'Este canal não existe mais.' }
    // Um canal da plataforma não pode ser editado pela tela do cliente, e o
    // canal de um cliente não pode ser editado pela tela de outro.
    if (atual.orgId !== opcoes.orgId) return { ok: false, erro: 'Você não pode editar este canal.' }
    anteriores = lerSegredo<Record<string, unknown>>(atual.credentials) ?? {}
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
