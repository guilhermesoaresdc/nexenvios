import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Os enums do banco, espelhados aqui para tipar as consultas.
 *
 * A fonte da verdade é o SQL em `drizzle/`. Se divergirem, o Postgres vence —
 * e o `tsc` não avisa. Mexeu num, mexa no outro na mesma alteração.
 */

export const orgStatusEnum = pgEnum('org_status', ['ativo', 'suspenso', 'cancelado'])
export const userRoleEnum = pgEnum('user_role', [
  'superadmin',
  'suporte',
  'admin',
  'operador',
  'visualizador',
])
export const channelEnum = pgEnum('channel', [
  'whatsapp_oficial',
  'whatsapp_nao_oficial',
  'sms',
  'rcs',
  'voz',
])
export const campaignStatusEnum = pgEnum('campaign_status', [
  'rascunho',
  // Materializando as linhas de envio. Uma base de um milhão não cabe numa
  // requisição — a campanha fica aqui enquanto o motor termina de prepará-la.
  'preparando',
  // Submetida a uma plataforma de fora e esperando a aprovação DELES. Não
  // depende mais de nós — só de alguém do outro lado liberar.
  'aguardando',
  'agendada',
  'enviando',
  'pausada',
  'concluida',
  'cancelada',
  'falhou',
])
export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'pendente',
  'enviando',
  'enviado',
  'entregue',
  'lido',
  'respondido',
  'falhou',
  'cancelado',
])
export const creditKindEnum = pgEnum('credit_kind', ['recarga', 'consumo', 'estorno', 'ajuste'])
export const instanceStatusEnum = pgEnum('instance_status', [
  'desconectado',
  'conectando',
  'conectado',
  'banido',
])

export type OrgStatus = (typeof orgStatusEnum.enumValues)[number]
export type UserRole = (typeof userRoleEnum.enumValues)[number]
export type Channel = (typeof channelEnum.enumValues)[number]
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number]
export type DispatchStatus = (typeof dispatchStatusEnum.enumValues)[number]
export type CreditKind = (typeof creditKindEnum.enumValues)[number]
export type InstanceStatus = (typeof instanceStatusEnum.enumValues)[number]

export const CANAIS: readonly Channel[] = channelEnum.enumValues

/** Como o canal se chama na tela (§ copy em pt-BR). */
export const CANAL_LABEL: Record<Channel, string> = {
  whatsapp_oficial: 'WhatsApp API Oficial',
  whatsapp_nao_oficial: 'WhatsApp API Não Oficial',
  sms: 'SMS',
  rcs: 'RCS',
  voz: 'Torpedo de Voz',
}

/** Rótulo curto, para caber em coluna de tabela e em chip. */
export const CANAL_CURTO: Record<Channel, string> = {
  whatsapp_oficial: 'WhatsApp Oficial',
  whatsapp_nao_oficial: 'WhatsApp API',
  sms: 'SMS',
  rcs: 'RCS',
  voz: 'Voz',
}

export const CANAL_CODIGO: Record<Channel, string> = {
  whatsapp_oficial: 'WA·01',
  whatsapp_nao_oficial: 'WA·02',
  sms: 'SMS·03',
  rcs: 'RCS·04',
  voz: 'VOZ·05',
}

/** Provedores que cada canal aceita. `generico` é HTTP configurável na tela. */
export const CANAL_PROVEDORES: Record<Channel, readonly string[]> = {
  whatsapp_oficial: ['meta_cloud', 'monitor_envios', 'generico'],
  whatsapp_nao_oficial: ['evolution', 'generico'],
  sms: ['smsdev', 'comtele', 'generico'],
  rcs: ['generico'],
  voz: ['generico'],
}

export const PROVEDOR_LABEL: Record<string, string> = {
  meta_cloud: 'Meta Cloud API',
  monitor_envios: 'Monitor de Envios',
  evolution: 'Evolution API',
  smsdev: 'SMSDev',
  comtele: 'Comtele',
  generico: 'Outro provedor (HTTP)',
}

export function nomeDoProvedor(provider: string): string {
  return PROVEDOR_LABEL[provider] ?? provider
}

export const STATUS_CAMPANHA_LABEL: Record<CampaignStatus, string> = {
  rascunho: 'Rascunho',
  preparando: 'Preparando',
  aguardando: 'Aguardando aprovação',
  agendada: 'Agendada',
  enviando: 'Enviando',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  falhou: 'Falhou',
}

export const STATUS_ENVIO_LABEL: Record<DispatchStatus, string> = {
  pendente: 'Na fila',
  enviando: 'Saindo',
  enviado: 'Enviado',
  entregue: 'Entregue',
  lido: 'Lido',
  respondido: 'Respondeu',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
}

export const PAPEL_LABEL: Record<UserRole, string> = {
  superadmin: 'Administrador Nex',
  suporte: 'Suporte Nex',
  admin: 'Administrador da conta',
  operador: 'Operador',
  visualizador: 'Visualizador',
}

/** O que cada papel pode, em uma frase — a tela mostra isto ao escolher. */
export const PAPEL_EXPLICA: Record<UserRole, string> = {
  superadmin: 'Tudo: clientes, crédito, preços e provedores da plataforma.',
  suporte: 'Vê todos os clientes e cuida de acesso. Não mexe em crédito, preço nem provedor.',
  admin: 'Administra a conta do cliente: canais, equipe e chaves de API.',
  operador: 'Cria e acompanha disparos. Não mexe em canais nem em equipe.',
  visualizador: 'Só leitura.',
}

/** Os papéis do time Nex Envios. Só um superadmin concede qualquer um deles. */
export const PAPEIS_DA_NEX: readonly UserRole[] = ['superadmin', 'suporte']

/** Os papéis que existem dentro da conta de um cliente. */
export const PAPEIS_DO_CLIENTE: readonly UserRole[] = ['admin', 'operador', 'visualizador']
