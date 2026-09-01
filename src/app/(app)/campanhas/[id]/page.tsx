import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { falhasDaCampanha, terminoPrevisto, verCampanha } from '@/db/queries/campanhas'
import {
  CANAL_LABEL,
  STATUS_CAMPANHA_LABEL,
  type CampaignStatus,
  type Channel,
} from '@/db/schema/enums'
import { exigirUsuario } from '@/lib/auth/atual'
import { TETO_DA_BASE } from '@/lib/campanhas/publico'
import { ERRO_LABEL } from '@/lib/channels/tipos'
import { dataHora, moeda, numero, porcento, quando } from '@/lib/ui'
import { Titulo } from '@/components/shell/casca'
import { IcVoltar } from '@/components/shell/icones'
import {
  Aviso,
  Barra,
  BotaoLink,
  Chip,
  Etiqueta,
  Numero,
  Pad,
  PadTitulo,
  Tabela,
  Td,
  Th,
  type TomDoChip,
} from '@/components/ui/base'
import { COR } from '@/components/ui/graficos'
import { AtualizaSozinho, Controles } from './controles'

export const metadata: Metadata = { title: 'Campanha' }

const TOM_DO_STATUS: Record<CampaignStatus, TomDoChip> = {
  rascunho: 'neutro',
  preparando: 'azul',
  aguardando: 'ambar',
  agendada: 'ciano',
  enviando: 'verde',
  pausada: 'ambar',
  concluida: 'navy',
  cancelada: 'neutro',
  falhou: 'vermelho',
}

const TOM_DO_CANAL: Record<Channel, TomDoChip> = {
  whatsapp_oficial: 'verde',
  whatsapp_nao_oficial: 'verde',
  sms: 'azul',
  rcs: 'ciano',
  voz: 'ambar',
}

/** O rótulo humano do código de falha; o próprio código quando não conhecemos. */
const ROTULO_DA_FALHA: Record<string, string> = ERRO_LABEL

function hora(valor: number): string {
  return `${String(valor).padStart(2, '0')}h`
}

export default async function Campanha({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario()
  const { id } = await params

  const campanha = await verCampanha(usuario.orgId, id)
  if (!campanha) notFound()

  const [falhas, fimPrevisto] = await Promise.all([
    falhasDaCampanha(campanha.id),
    terminoPrevisto(campanha.id),
  ])

  /*
   * Os contadores da campanha guardam o estado ATUAL de cada envio: quem foi
   * entregue já saiu de `enviados`, quem leu já saiu de `entregues`. O funil só
   * fecha somando de baixo para cima — sem isso, "enviados" encolheria à medida
   * que as confirmações chegassem, que é o oposto do que a tela promete.
   */
  const lidos = campanha.lidos + campanha.respostas
  const entregues = campanha.entregues + lidos
  const saidos = campanha.enviados + entregues
  const base = Math.max(campanha.total, saidos + campanha.falhas + campanha.pendentes, 1)

  /*
   * Campanha entregue por fora.
   *
   * O que muda na tela não é enfeite: os números daqui vêm de um progresso
   * AGREGADO, e várias frases desta página afirmam coisas que só valem quando
   * cada mensagem tem linha própria. Onde não sabemos, esta página passa a não
   * afirmar.
   */
  const delegada = Boolean(campanha.externalCode)

  const preparando = campanha.status === 'preparando'
  const temReal = Number(campanha.custoReal) > 0
  const semJanela = campanha.janelaInicio === campanha.janelaFim

  return (
    <>
      <Link
        href="/campanhas"
        className="mb-4 inline-flex items-center gap-1.5 text-[.84rem] font-semibold text-muted hover:text-blue"
      >
        <IcVoltar className="h-4 w-4" />
        Todas as campanhas
      </Link>

      <Titulo
        titulo={campanha.nome}
        descricao={
          <>
            {CANAL_LABEL[campanha.canal]}
            {campanha.canalNome ? ` · ${campanha.canalNome}` : ''}
            {campanha.autor ? ` · criada por ${campanha.autor}` : ''} · {quando(campanha.criadaEm)}
          </>
        }
        acao={
          <Controles
            campanhaId={campanha.id}
            status={campanha.status}
            delegada={Boolean(campanha.externalCode)}
          />
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip tom={TOM_DO_STATUS[campanha.status]} pulsando={campanha.status === 'enviando'}>
          {STATUS_CAMPANHA_LABEL[campanha.status]}
        </Chip>
        <Chip tom={TOM_DO_CANAL[campanha.canal]}>{CANAL_LABEL[campanha.canal]}</Chip>
        {campanha.eleitoral ? <Chip tom="ambar">Propaganda eleitoral</Chip> : null}

        <span className="ml-1 text-[.78rem] text-muted">Público:</span>
        {campanha.fontes.length > 0 ? (
          campanha.fontes.map((fonte) => (
            <Chip key={fonte} tom="navy">
              {fonte}
            </Chip>
          ))
        ) : (
          <Chip tom="neutro">sem fonte registrada</Chip>
        )}
      </div>

      {preparando ? (
        <>
          <AtualizaSozinho />
          <Aviso tom="info" titulo="Preparando a base…" className="mb-5">
            {numero(campanha.pendentes)} de {numero(campanha.total)} linhas prontas. Bases grandes
            levam alguns minutos para virar fila — esta tela se atualiza sozinha, pode deixar aberta.
          </Aviso>
        </>
      ) : null}

      {/*
        Campanha que o Monitor recusou na própria submissão não tem código —
        ela nunca chegou a existir do lado deles. O motivo fica em
        `externalReason`, e sem este primeiro caso a tela mostrava só "Falhou",
        escondendo justamente a explicação que a pessoa precisa para corrigir.
      */}
      {!campanha.externalCode && campanha.externalReason ? (
        <Aviso tom="erro" titulo="O Monitor de Envios não aceitou este disparo" className="mb-5">
          {campanha.externalReason}
          <span className="mt-2 block">
            Nada foi cobrado. Ajuste o que foi apontado e crie o disparo de novo.
          </span>
        </Aviso>
      ) : null}

      {campanha.externalCode ? (
        <>
          {campanha.externalStatus === 'aguardando' ? <AtualizaSozinho /> : null}
          <Aviso
            tom={
              campanha.externalStatus === 'rejeitado'
                ? 'erro'
                : campanha.externalStatus === 'aprovado'
                  ? 'ok'
                  : 'alerta'
            }
            titulo={
              campanha.externalStatus === 'rejeitado'
                ? 'O Monitor de Envios recusou este disparo'
                : campanha.externalStatus === 'aprovado'
                  ? 'Aprovado e rodando no Monitor de Envios'
                  : 'Na fila de aprovação do Monitor de Envios'
            }
            className="mb-5"
          >
            {campanha.externalStatus === 'rejeitado' ? (
              <>
                Motivo: <b>{campanha.externalReason ?? 'não informado'}</b>. Ajuste o que foi
                apontado e crie o disparo de novo — nada foi cobrado.
              </>
            ) : campanha.externalStatus === 'aprovado' ? (
              <>
                Quem controla o ritmo agora é a plataforma deles. Os números abaixo vêm de lá e
                atualizam a cada batida do motor
                {campanha.externalSyncedAt ? ` — última conferência ${quando(campanha.externalSyncedAt)}` : ''}.
              </>
            ) : (
              <>
                Este disparo foi entregue e espera a análise de um administrador do Monitor. Nada
                sai e nada é cobrado até lá.
              </>
            )}
            <span className="mt-2 block font-mono text-[.74rem] opacity-75">
              código {campanha.externalCode}
            </span>
          </Aviso>
        </>
      ) : null}

      {campanha.aparado ? (
        <Aviso tom="alerta" titulo="A base foi aparada" className="mb-5">
          O público passava do teto de {numero(TETO_DA_BASE)} destinatários por campanha. Os que
          sobraram não entraram nesta fila — quebre em campanhas menores para alcançar todo mundo.
        </Aviso>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Numero
          rotulo="Total"
          valor={numero(campanha.total)}
          nota={preparando ? 'Estimado — a base ainda está sendo preparada' : 'Destinatários da fila'}
        />
        <Numero
          rotulo="Enviados"
          valor={numero(saidos)}
          tom="blue"
          nota={`${porcento(saidos, base)} do total`}
        />
        <Numero
          rotulo="Entregues"
          valor={numero(entregues)}
          tom={entregues > 0 ? 'verde' : 'navy'}
          nota={saidos > 0 ? `${porcento(entregues, saidos)} do que saiu` : 'Nada saiu ainda'}
        />
        <Numero
          rotulo="Lidos"
          valor={numero(lidos)}
          nota={entregues > 0 ? `${porcento(lidos, entregues)} do que chegou` : '—'}
        />
        <Numero
          rotulo="Respostas"
          valor={numero(campanha.respostas)}
          tom={campanha.respostas > 0 ? 'verde' : 'navy'}
          nota={
            delegada
              ? 'Trazidas do Monitor a cada conferência'
              : saidos > 0
                ? `${porcento(campanha.respostas, saidos)} de quem recebeu`
                : '—'
          }
        />
        <Numero
          rotulo="Falhas"
          valor={numero(campanha.falhas)}
          tom={campanha.falhas > 0 ? 'vermelho' : 'navy'}
          nota={
            campanha.falhas > 0
              ? 'Veja os motivos abaixo'
              : delegada
                ? 'O Monitor não informa falha por mensagem'
                : 'Nenhuma falha até agora'
          }
        />
      </div>

      <Pad className="mt-5">
        <PadTitulo
          titulo="Andamento"
          descricao={
            delegada
              ? `${numero(campanha.pendentes)} ainda não processados pelo Monitor de Envios. Aqui não há envio linha a linha para abrir.`
              : `${numero(campanha.pendentes)} ${campanha.pendentes === 1 ? 'envio ainda na fila' : 'envios ainda na fila'}.`
          }
          acao={
            delegada ? null : (
              <BotaoLink href={`/historico?campanha=${campanha.id}`} tom="contorno" tamanho="sm">
                Ver os envios desta campanha
              </BotaoLink>
            )
          }
        />
        <div className="px-6 py-5">
          <Barra
            className="h-4"
            total={base}
            fatias={[
              { valor: entregues, cor: COR.verde, rotulo: 'Entregues' },
              { valor: campanha.enviados, cor: COR.azul, rotulo: 'Enviados' },
              { valor: campanha.falhas, cor: COR.vermelho, rotulo: 'Falhas' },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            <Fatia cor={COR.verde} rotulo="Entregues" valor={entregues} />
            <Fatia cor={COR.azul} rotulo="Saíram, sem confirmação" valor={campanha.enviados} />
            <Fatia cor={COR.vermelho} rotulo="Falhas" valor={campanha.falhas} />
            <Fatia cor={COR.cinza} rotulo="Na fila" valor={campanha.pendentes} />
          </div>
        </div>
      </Pad>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Pad>
          <PadTitulo
            titulo="A mensagem que saiu"
            descricao={
              delegada
                ? 'Este é o texto submetido ao Monitor de Envios. Em campanha política, eles acrescentam no fim a frase de descadastro exigida por lei — ela não aparece aqui.'
                : 'Este é o texto do disparo. As variáveis são trocadas por destinatário na hora de montar a fila.'
            }
          />
          <div className="px-6 py-5">
            <pre className="rounded-[12px] border border-line bg-paper px-4 py-3.5 font-sans text-[.9rem] leading-relaxed whitespace-pre-wrap text-ink">
              {campanha.corpo}
            </pre>

            {campanha.mediaUrl ? (
              <p className="mt-3 text-[.8rem] break-all text-muted">
                <Etiqueta>Mídia anexada</Etiqueta>{' '}
                <a
                  href={campanha.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-blue hover:underline"
                >
                  {campanha.mediaUrl}
                </a>
              </p>
            ) : null}
          </div>
        </Pad>

        <Pad>
          <PadTitulo
            titulo="Ritmo e janela"
            descricao={
              delegada
                ? 'Quem controla o ritmo desta campanha é o Monitor de Envios.'
                : 'Como esta campanha ocupa o dia.'
            }
          />
          <dl className="divide-y divide-line">
            {/*
              Os valores de ritmo, jitter e janela ficam gravados na campanha
              delegada porque a coluna existe para todas — mas eles não foram
              usados: o Monitor entrega no ritmo dele. Mostrá-los seria dizer
              que a campanha respeitou uma regra que ninguém aplicou.
            */}
            <Linha rotulo="Ritmo">
              {delegada ? (
                'Definido pelo Monitor de Envios'
              ) : (
                <>
                  {numero(campanha.ritmo)} por minuto
                  <span className="block text-[.78rem] text-muted">
                    com variação de até {numero(Math.round(campanha.jitter / 1000))} s entre uma
                    mensagem e outra, para não parecer robô
                  </span>
                </>
              )}
            </Linha>
            <Linha rotulo="Janela de silêncio">
              {delegada ? (
                'Definida pelo Monitor de Envios'
              ) : semJanela ? (
                'Sem janela — envia a qualquer hora'
              ) : (
                <>
                  Só envia das {hora(campanha.janelaInicio)} às {hora(campanha.janelaFim)}
                  <span className="block text-[.78rem] text-muted">
                    Fora desse horário a fila espera até a janela reabrir.
                  </span>
                </>
              )}
            </Linha>
            <Linha rotulo="Término previsto">
              {delegada ? (
                'Sem previsão nossa — o ritmo é do Monitor'
              ) : fimPrevisto ? (
                <>
                  {quando(fimPrevisto)}
                  <span className="block text-[.78rem] text-muted">{dataHora(fimPrevisto)}</span>
                </>
              ) : campanha.pendentes === 0 ? (
                'Tudo já saiu da fila'
              ) : (
                'Assim que a base terminar de ser preparada'
              )}
            </Linha>
            <Linha rotulo="Agendada para">{dataHora(campanha.agendadaPara)}</Linha>
            <Linha rotulo="Começou">{dataHora(campanha.iniciadaEm)}</Linha>
            <Linha rotulo="Terminou">{dataHora(campanha.terminadaEm)}</Linha>
            <Linha rotulo="Custo">
              {moeda(temReal ? campanha.custoReal : campanha.custoPrevisto)}
              <span className="block text-[.78rem] text-muted">
                {temReal ? 'Cobrado até agora' : 'Previsto na criação'} ·{' '}
                {moeda(campanha.precoUnitario)} por mensagem
              </span>
            </Linha>
          </dl>
        </Pad>
      </div>

      {falhas.length > 0 ? (
        <Pad className="mt-5">
          <PadTitulo
            titulo="Por que falhou"
            descricao="Agrupado por motivo, com um exemplo do que o provedor respondeu. É por aqui que se decide o que refazer."
            acao={
              <BotaoLink
                href={`/historico?campanha=${campanha.id}&status=falhou`}
                tom="contorno"
                tamanho="sm"
              >
                Ver as falhas uma a uma
              </BotaoLink>
            }
          />
          <Tabela>
            <thead>
              <tr>
                <Th>Motivo</Th>
                <Th className="text-right">Envios</Th>
                <Th>O que o provedor respondeu</Th>
              </tr>
            </thead>
            <tbody>
              {falhas.map((f) => (
                <tr key={f.codigo ?? 'sem-codigo'}>
                  <Td className="font-semibold text-navy">
                    {f.codigo ? (ROTULO_DA_FALHA[f.codigo] ?? f.codigo) : 'Sem código do provedor'}
                  </Td>
                  <Td className="tabular text-right font-mono">{numero(f.total)}</Td>
                  <Td className="text-[.82rem] text-muted">{f.exemplo ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Pad>
      ) : null}
    </>
  )
}

function Fatia({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[.78rem] text-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      {rotulo}
      <b className="tabular font-mono font-semibold text-navy">{numero(valor)}</b>
    </span>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 px-6 py-3.5">
      <dt className="pt-0.5">
        <Etiqueta>{rotulo}</Etiqueta>
      </dt>
      <dd className="max-w-[62%] text-right text-[.9rem] font-semibold text-navy">{children}</dd>
    </div>
  )
}
