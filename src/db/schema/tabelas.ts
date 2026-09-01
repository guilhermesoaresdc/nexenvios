import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  campaignStatusEnum,
  channelEnum,
  creditKindEnum,
  dispatchStatusEnum,
  instanceStatusEnum,
  orgStatusEnum,
  userRoleEnum,
} from './enums'

/**
 * Espelho das tabelas de `drizzle/*.sql`.
 *
 * Existe para tipar as consultas — não para gerar migration. As migrations são
 * SQL escrito à mão porque o gerador do drizzle-kit não expressa gatilho,
 * índice parcial nem política de RLS, e este schema depende dos três.
 */

const agora = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  document: text('document'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  status: orgStatusEnum('status').notNull().default('ativo'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  isPlatform: boolean('is_platform').notNull().default(false),
  credits: numeric('credits', { precision: 14, scale: 4 }).notNull().default('0'),
  creditLimit: numeric('credit_limit', { precision: 14, scale: 4 }).notNull().default('0'),
  dailyCap: integer('daily_cap'),
  notes: text('notes'),
  createdAt: agora(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: userRoleEnum('role').notNull().default('operador'),
    active: boolean('active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: agora(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), index('users_org_ix').on(t.orgId)],
)

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  actingOrgId: uuid('acting_org_id').references(() => organizations.id, { onDelete: 'set null' }),
  createdAt: agora(),
})

export const passwordTokens = pgTable('password_tokens', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: agora(),
})

export const creditLedger = pgTable('credit_ledger', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  kind: creditKindEnum('kind').notNull(),
  delta: numeric('delta', { precision: 14, scale: 4 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 14, scale: 4 }),
  description: text('description'),
  campaignId: uuid('campaign_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
})

export const channelPrices = pgTable('channel_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull(),
  price: numeric('price', { precision: 10, scale: 4 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  ip: text('ip'),
  createdAt: agora(),
})

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    phone: text('phone'),
    email: text('email'),
    name: text('name'),
    externalId: text('external_id'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`),
    optedOut: boolean('opted_out').notNull().default(false),
    optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
    optedOutReason: text('opted_out_reason'),
    source: text('source'),
    createdAt: agora(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contacts_org_ix').on(t.orgId, t.createdAt)],
)

export const contactLists = pgTable('contact_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  total: integer('total').notNull().default(0),
  /** A lista de teste da organização. No máximo uma, garantido por índice. */
  isTest: boolean('is_test').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contactListMembers = pgTable(
  'contact_list_members',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => contactLists.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.contactId] })],
)

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').references(() => contactLists.id, { onDelete: 'set null' }),
  filename: text('filename'),
  total: integer('total').notNull().default(0),
  imported: integer('imported').notNull().default(0),
  duplicates: integer('duplicates').notNull().default(0),
  invalid: integer('invalid').notNull().default(0),
  optedOut: integer('opted_out').notNull().default(0),
  sample: jsonb('sample').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
})

export const channelConfigs = pgTable('channel_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull(),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  credentials: text('credentials'),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  active: boolean('active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  brokenUntil: timestamp('broken_until', { withTimezone: true }),
  failureStreak: integer('failure_streak').notNull().default(0),
  createdAt: agora(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const whatsappInstances = pgTable('whatsapp_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  configId: uuid('config_id').references(() => channelConfigs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  instanceName: text('instance_name').notNull(),
  phone: text('phone'),
  status: instanceStatusEnum('status').notNull().default('desconectado'),
  qrCode: text('qr_code'),
  dailyCap: integer('daily_cap').notNull().default(300),
  sentToday: integer('sent_today').notNull().default(0),
  counterDay: date('counter_day').notNull(),
  minIntervalMs: integer('min_interval_ms').notNull().default(4000),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: agora(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    channel: channelEnum('channel').notNull(),
    configId: uuid('config_id').references(() => channelConfigs.id, { onDelete: 'set null' }),
    status: campaignStatusEnum('status').notNull().default('rascunho'),
    body: text('body').notNull().default(''),
    subject: text('subject'),
    mediaUrl: text('media_url'),
    mediaType: text('media_type'),
    buttons: jsonb('buttons').notNull().default(sql`'[]'::jsonb`),
    templateName: text('template_name'),
    audioUrl: text('audio_url'),
    audienceKind: text('audience_kind').notNull().default('lista'),
    audience: jsonb('audience').notNull().default(sql`'{}'::jsonb`),
    ratePerMinute: integer('rate_per_minute').notNull().default(60),
    jitterMs: integer('jitter_ms').notNull().default(1500),
    quietStart: smallint('quiet_start').notNull().default(8),
    quietEnd: smallint('quiet_end').notNull().default(21),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    total: integer('total').notNull().default(0),
    pending: integer('pending').notNull().default(0),
    sent: integer('sent').notNull().default(0),
    delivered: integer('delivered').notNull().default(0),
    read: integer('read').notNull().default(0),
    replied: integer('replied').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    unitPrice: numeric('unit_price', { precision: 10, scale: 4 }).notNull().default('0'),
    estimatedCost: numeric('estimated_cost', { precision: 14, scale: 4 }).notNull().default('0'),
    actualCost: numeric('actual_cost', { precision: 14, scale: 4 }).notNull().default('0'),
    // Materialização retomável: a base grande vira linhas ao longo de várias
    // batidas do motor, e o cursor guarda onde parou.
    materialized: boolean('materialized').notNull().default(true),
    materializeCursor: text('materialize_cursor'),
    materializeAt: timestamp('materialize_at', { withTimezone: true }),
    audienceLabels: jsonb('audience_labels').notNull().default(sql`'[]'::jsonb`),
    trimmed: boolean('trimmed').notNull().default(false),
    eleitoral: boolean('eleitoral').notNull().default(false),
    /*
     * Campanha entregue por uma plataforma de fora. Quando `externalCode`
     * existe, esta campanha NÃO tem linhas em `dispatches`: quem envia é o
     * outro lado, e o que temos é o código de acompanhamento e o progresso
     * agregado que o polling traz.
     */
    externalCode: text('external_code'),
    externalProvider: text('external_provider'),
    externalStatus: text('external_status'),
    externalReason: text('external_reason'),
    externalSyncedAt: timestamp('external_synced_at', { withTimezone: true }),
    /** Quanto já foi cobrado. O progresso deles é acumulado, não incremental. */
    externalBilled: integer('external_billed').notNull().default(0),
  /** Falhas seguidas de sincronização. Zera no primeiro sucesso. */
  externalSyncFailures: integer('external_sync_failures').notNull().default(0),
    profileName: text('profile_name'),
    profilePhotoUrl: text('profile_photo_url'),
    profileName2: text('profile_name_2'),
    profilePhotoUrl2: text('profile_photo_url_2'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: agora(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaigns_org_ix').on(t.orgId, t.createdAt)],
)

export const dispatches = pgTable(
  'dispatches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    channel: channelEnum('channel').notNull(),
    configId: uuid('config_id').references(() => channelConfigs.id, { onDelete: 'set null' }),
    instanceId: uuid('instance_id').references(() => whatsappInstances.id, {
      onDelete: 'set null',
    }),
    toAddress: text('to_address').notNull(),
    toName: text('to_name'),
    body: text('body').notNull(),
    mediaUrl: text('media_url'),
    status: dispatchStatusEnum('status').notNull().default('pendente'),
    attempts: smallint('attempts').notNull().default(0),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    provider: text('provider'),
    providerMessageId: text('provider_message_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    cost: numeric('cost', { precision: 10, scale: 4 }).notNull().default('0'),
    createdAt: agora(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dispatches_org_ix').on(t.orgId, t.createdAt),
    index('dispatches_campanha_ix').on(t.campaignId, t.status),
  ],
)

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  channel: channelEnum('channel'),
  category: text('category'),
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
  buttons: jsonb('buttons').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const savedDispatches = pgTable('saved_dispatches', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Nulo no rascunho: ele começa antes de a pessoa escolher o canal. */
  channel: channelEnum('channel'),
  payload: jsonb('payload').notNull(),
  /** Rascunho salvo sozinho pelo assistente — um por pessoa. */
  auto: boolean('auto').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const inboundMessages = pgTable('inbound_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull(),
  fromAddress: text('from_address').notNull(),
  body: text('body'),
  dispatchId: uuid('dispatch_id').references(() => dispatches.id, { onDelete: 'set null' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  raw: jsonb('raw').notNull().default(sql`'{}'::jsonb`),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: text('scopes').array().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
})

/**
 * Imagem, PDF ou áudio enviado pela tela.
 *
 * Os bytes ficam no banco de propósito — ver a migration 0010. `bytes` é
 * `bytea`, e o Drizzle não tem tipo próprio para ele: as leituras e escritas
 * passam por `lib/midia`, que usa SQL direto.
 */
export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  originalName: text('original_name'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: agora(),
})

export const webhookTokens = pgTable('webhook_tokens', {
  token: text('token').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull(),
  createdAt: agora(),
})

export type Organization = typeof organizations.$inferSelect
export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type ContactList = typeof contactLists.$inferSelect
export type ChannelConfig = typeof channelConfigs.$inferSelect
export type WhatsappInstance = typeof whatsappInstances.$inferSelect
export type Campaign = typeof campaigns.$inferSelect
export type Dispatch = typeof dispatches.$inferSelect
export type MessageTemplate = typeof messageTemplates.$inferSelect
export type SavedDispatch = typeof savedDispatches.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type CreditEntry = typeof creditLedger.$inferSelect
