import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  campanhasEmCurso,
  primeirosPassos,
  resumoDoPainel,
  serieDoPainel,
  usoPorCanal,
} from '@/db/queries/painel'
import {
  CANAL_CODIGO,
  CANAL_CURTO,
  CANAL_LABEL,
  STATUS_CAMPANHA_LABEL,
  type CampaignStatus,
  type Channel,
} from '@/db/schema/enums'
import { exigirUsuario } from '@/lib/auth/atual'
import { moeda, numero, porcento, quando } from '@/lib/ui'
import { Titulo } from '@/components/shell/casca'
import { IcCanais, IcContatos, IcDisparo } from '@/components/shell/icones'
import {
  Aviso,
  Barra,
  BotaoLink,
  Chip,
  Numero,
  Pad,
  PadTitulo,
  Vazio,
  type TomDoChip,
} from '@/components/ui/base'
import { BarrasHorizontais, COR, SerieDiaria } from '@/components/ui/graficos'

export const metadata: Metadata = { title: 'Painel' }

/** Abaixo disto o próximo disparo trava no meio — vale interromper a tela. */
const SALDO_MINIMO = 10

const COR_DO_CANAL: Record<Channel, string> = {
  whatsapp_oficial: COR.verde,
  whatsapp_nao_oficial: COR.navy,
  sms: COR.azul,
  rcs: COR.ciano,
  voz: COR.ambar,
}

const TOM_DO_STATUS: Record<string, TomDoChip> = {
  preparando: 'azul',
  agendada: 'ciano',
  enviando: 'verde',
  pausada: 'ambar',
}

export default async function Painel() {
  const usuario = await exigirUsuario()

  const [resumo, serie, canais, emCurso, passos] = await Promise.all([
    resumoDoPainel(usuario.orgId),
    serieDoPainel(usuario.orgId),
    usoPorCanal(usuario.orgId),
    campanhasEmCurso(usuario.orgId),
    primeirosPassos(usuario.orgId),
  ])

  const saldo = Number(resumo.saldo)
  const saldoBaixo = saldo < SALDO_MINIMO
  // Só quem teve desfecho conta na taxa: o que ainda está a caminho não é falha.
  const comDesfecho = resumo.entregues30 + resumo.falhas30
  const taxa = comDesfecho > 0 ? resumo.entregues30 / comDesfecho : null

  const avisoDeSaldo = saldoBaixo ? (
    <Aviso tom="alerta" titulo="Saldo baixo" className="mb-6">
      Você tem {moeda(resumo.saldo)} em créditos. Fale com o time Nex para recarregar antes do
      próximo disparo — sem saldo a fila para no meio do envio.
    </Aviso>
  ) : null

  if (!passos.temEnvio) {
    return (
      <>
        <Titulo
          titulo={`Bem-vindo, ${usuario.orgName}`}
          descricao="Sua conta está pronta. Faltam três passos para o primeiro disparo sair."
        />

        {avisoDeSaldo}

        <Pad>
          <Vazio
            icone={<IcDisparo className="h-6 w-6" />}
            titulo="Nenhum envio por aqui ainda"
            descricao="Assim que o primeiro disparo sair, esta tela mostra volume, entrega, custo e o andamento de cada campanha."
            acao={
              <BotaoLink href="/disparo" tamanho="lg">
                Criar o primeiro disparo
              </BotaoLink>
            }
          />

          <div className="grid gap-5 border-t border-line px-6 py-6 md:grid-cols-3">
            <Passo
              numero={1}
              titulo="Conectar um canal"
              descricao={
                usuario.isAdmin
                  ? 'Escolha por onde as mensagens saem: WhatsApp, SMS, RCS ou voz.'
                  : 'Peça a um administrador da conta para ligar o canal de envio.'
              }
              href={usuario.isAdmin ? '/canais' : undefined}
              acao="Ir para canais"
              pronto={passos.temCanal}
            />
            <Passo
              numero={2}
              titulo="Importar contatos"
              descricao="Suba uma planilha CSV com os números. A gente limpa duplicados e formata."
              href="/contatos/importar"
              acao="Importar planilha"
              pronto={passos.temContato}
            />
            <Passo
              numero={3}
              titulo="Criar o primeiro disparo"
              descricao="Escreva a mensagem, escolha o público e confira o orçamento antes de enviar."
              href="/disparo"
              acao="Novo disparo"
              pronto={false}
            />
          </div>
        </Pad>
      </>
    )
  }

  return (
    <>
      <Titulo
        titulo="Painel"
        descricao={`O que saiu de ${usuario.orgName} nos últimos 30 dias.`}
        acao={<BotaoLink href="/disparo">Novo disparo</BotaoLink>}
      />

      {avisoDeSaldo}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Numero
          rotulo="Enviados hoje"
          valor={numero(resumo.enviadosHoje)}
          nota="Desde a meia-noite"
        />
        <Numero
          rotulo="Enviados em 30 dias"
          valor={numero(resumo.enviados30)}
          nota={`${numero(resumo.respostas30)} responderam`}
        />
        <Numero
          rotulo="Taxa de entrega"
          valor={taxa === null ? '—' : porcento(resumo.entregues30, comDesfecho)}
          tom={taxa === null ? 'navy' : taxa >= 0.9 ? 'verde' : taxa >= 0.7 ? 'ambar' : 'vermelho'}
          nota={
            taxa === null
              ? 'Nenhum envio com desfecho no período'
              : `${numero(resumo.falhas30)} falharam`
          }
        />
        <Numero
          rotulo="Na fila"
          valor={numero(resumo.naFila)}
          tom={resumo.naFila > 0 ? 'blue' : 'navy'}
          nota={
            resumo.campanhasAtivas > 0
              ? `${numero(resumo.campanhasAtivas)} ${resumo.campanhasAtivas === 1 ? 'campanha em curso' : 'campanhas em curso'}`
              : 'Nada esperando saída'
          }
        />
        <Numero
          rotulo="Saldo"
          valor={moeda(resumo.saldo)}
          tom={saldoBaixo ? 'vermelho' : 'navy'}
          nota={saldoBaixo ? 'Recarregue para não travar' : 'Créditos disponíveis'}
        />
        <Numero
          rotulo="Gasto em 30 dias"
          valor={moeda(resumo.gasto30)}
          nota="Consumo de créditos no período"
        />
      </div>

      <Pad className="mt-5">
        <PadTitulo
          titulo="Volume dia a dia"
          descricao="Cada coluna é um dia. Passe o ponteiro para ver os números."
        />
        <div className="px-5 py-5 max-md:px-3">
          <SerieDiaria pontos={serie} />
        </div>
      </Pad>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Pad>
          <PadTitulo titulo="Uso por canal" descricao="Últimos 30 dias, com o custo de cada um." />
          <div className="px-6 py-5">
            {canais.length === 0 ? (
              <Vazio
                titulo="Nenhum consumo no período"
                descricao="Quando um disparo sair, o volume e o custo de cada canal aparecem aqui."
                acao={
                  <BotaoLink href="/disparo" tom="contorno" tamanho="sm">
                    Novo disparo
                  </BotaoLink>
                }
              />
            ) : (
              <BarrasHorizontais
                itens={canais.map((c) => ({
                  chave: c.canal,
                  rotulo: CANAL_LABEL[c.canal],
                  codigo: CANAL_CODIGO[c.canal],
                  valor: c.enviados,
                  cor: COR_DO_CANAL[c.canal],
                  nota: `${moeda(c.custo)} no período`,
                }))}
              />
            )}
          </div>
        </Pad>

        <Pad>
          <PadTitulo
            titulo="Campanhas em curso"
            descricao="O que está preparando, agendado, enviando ou pausado."
            acao={
              <BotaoLink href="/campanhas" tom="contorno" tamanho="sm">
                Ver todas
              </BotaoLink>
            }
          />
          {emCurso.length === 0 ? (
            <Vazio
              titulo="Nada em curso agora"
              descricao="Nenhuma campanha esperando, enviando ou pausada. Crie um disparo para começar."
              acao={
                <BotaoLink href="/disparo" tamanho="sm">
                  Novo disparo
                </BotaoLink>
              }
            />
          ) : (
            <ul>
              {emCurso.map((c) => {
                const entregues = c.entregues + c.lidos + c.respondidos
                const base = Math.max(c.total, entregues + c.enviados + c.falhas + c.pendentes, 1)

                return (
                  <li key={c.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/campanhas/${c.id}`}
                      className="block px-6 py-4 transition-colors hover:bg-paper-alt"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <span className="min-w-0 truncate text-[.95rem] font-semibold text-navy">
                          {c.nome}
                        </span>
                        <Chip
                          tom={TOM_DO_STATUS[c.status] ?? 'neutro'}
                          pulsando={c.status === 'enviando'}
                        >
                          {STATUS_CAMPANHA_LABEL[c.status as CampaignStatus] ?? c.status}
                        </Chip>
                      </div>

                      <p className="mt-1 text-[.78rem] text-muted">
                        {CANAL_CURTO[c.canal]} ·{' '}
                        {c.status === 'agendada' && c.agendadaPara
                          ? `sai ${quando(c.agendadaPara)}`
                          : c.total > 0
                            ? `${numero(c.total)} destinatários`
                            : 'preparando a base'}
                      </p>

                      <Barra
                        className="mt-3"
                        total={base}
                        fatias={[
                          { valor: entregues, cor: COR.verde, rotulo: 'Entregues' },
                          { valor: c.enviados, cor: COR.azul, rotulo: 'Enviados' },
                          { valor: c.falhas, cor: COR.vermelho, rotulo: 'Falhas' },
                        ]}
                      />

                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                        <Fatia cor={COR.verde} rotulo="Entregues" valor={entregues} />
                        <Fatia cor={COR.azul} rotulo="Enviados" valor={c.enviados} />
                        <Fatia cor={COR.vermelho} rotulo="Falhas" valor={c.falhas} />
                        <Fatia cor={COR.cinza} rotulo="Na fila" valor={c.pendentes} />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Pad>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Atalho
          href="/disparo"
          titulo="Novo disparo"
          descricao="Mensagem, público e orçamento em uma tela só."
          icone={<IcDisparo className="h-5 w-5" />}
        />
        <Atalho
          href="/contatos/importar"
          titulo="Importar contatos"
          descricao="Suba um CSV e a base cresce sem duplicado."
          icone={<IcContatos className="h-5 w-5" />}
        />
        {usuario.isAdmin ? (
          <Atalho
            href="/canais"
            titulo="Conectar canal"
            descricao="Ligue ou troque o provedor de cada canal de envio."
            icone={<IcCanais className="h-5 w-5" />}
          />
        ) : null}
      </div>
    </>
  )
}

function Fatia({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[.76rem] text-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      {rotulo}
      <b className="tabular font-mono font-semibold text-navy">{numero(valor)}</b>
    </span>
  )
}

function Atalho({
  href,
  titulo,
  descricao,
  icone,
}: {
  href: string
  titulo: string
  descricao: string
  icone: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-[18px] border border-line bg-white px-5 py-4 shadow-[0_10px_24px_-12px_rgba(0,32,88,.14)] transition-colors hover:border-blue"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-paper-alt text-blue transition-colors group-hover:bg-blue group-hover:text-white">
        {icone}
      </span>
      <span className="min-w-0">
        <span className="block text-[.95rem] font-semibold text-navy">{titulo}</span>
        <span className="mt-0.5 block text-[.8rem] leading-relaxed text-muted">{descricao}</span>
      </span>
    </Link>
  )
}

function Passo({
  numero: n,
  titulo,
  descricao,
  href,
  acao,
  pronto,
}: {
  numero: number
  titulo: string
  descricao: string
  href?: string
  acao: string
  pronto: boolean
}) {
  return (
    <div className="rounded-[12px] border border-line bg-paper px-5 py-4">
      <div className="flex items-center gap-3">
        <span
          className={
            pronto
              ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wa font-mono text-[.8rem] font-bold text-white'
              : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy font-mono text-[.8rem] font-bold text-white'
          }
        >
          {pronto ? '✓' : n}
        </span>
        <h3 className="text-[.95rem] font-semibold">{titulo}</h3>
      </div>

      <p className="mt-2 text-[.82rem] leading-relaxed text-muted">{descricao}</p>

      {pronto ? (
        <p className="mt-3">
          <Chip tom="verde">Feito</Chip>
        </p>
      ) : href ? (
        <p className="mt-3">
          <BotaoLink href={href} tom="contorno" tamanho="sm">
            {acao}
          </BotaoLink>
        </p>
      ) : null}
    </div>
  )
}
