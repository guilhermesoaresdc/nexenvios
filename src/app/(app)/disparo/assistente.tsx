'use client'

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  CANAL_CODIGO,
  CANAL_CURTO,
  CANAL_LABEL,
  nomeDoProvedor,
  type Channel,
} from '@/db/schema/enums'
import type { Fonte } from '@/lib/campanhas/publico'
import type { Orcamento } from '@/lib/campanhas/servico'
import { contarVariantes, medirSms, VARIAVEIS_PADRAO } from '@/lib/mensagem'
import { cn, duracao, moeda, numero } from '@/lib/ui'
import { IcContatos } from '@/components/shell/icones'
import {
  AreaTexto,
  Aviso,
  Botao,
  BotaoLink,
  Campo,
  Chip,
  Entrada,
  Etiqueta,
  Pad,
  PadTitulo,
  Selecao,
  Vazio,
} from '@/components/ui/base'
import { conferirNomeDePerfil, TAMANHO_MAXIMO } from '@/lib/channels/nome-perfil'
import { criarDisparo, enviarTeste, orcarDisparo } from './acoes'
import { Previa, textoQueSai } from './previa'

/**
 * O assistente de disparo.
 *
 * Quatro passos numa página só: trocar de rota entre eles perderia o rascunho
 * a cada volta do navegador. O orçamento acompanha a escolha em tempo real —
 * ninguém deveria descobrir o custo de uma campanha depois de criá-la.
 */

export type CanalDisponivel = {
  id: string
  canal: Channel
  rotulo: string
  provedor: string
  preco: number
  ativo: boolean
  temCredencial: boolean
  /** Números conectados, quando o canal é WhatsApp não oficial. */
  numeros: number
  daPlataforma: boolean
  instavel: boolean
}

export type ListaDisponivel = { id: string; nome: string; total: number }
export type EtiquetaDisponivel = { etiqueta: string; total: number }

const PASSOS = ['Canal', 'Público', 'Mensagem', 'Ritmo e envio'] as const
const RITMOS = [30, 60, 120, 300] as const
const HORAS = Array.from({ length: 24 }, (_, h) => h)

// ─────────────────────────────────────────────────────── peças da tela

function Indicador({
  passo,
  maximo,
  ir,
}: {
  passo: number
  maximo: number
  ir: (n: number) => void
}) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2">
      {PASSOS.map((texto, i) => {
        const n = i + 1
        const liberado = n <= maximo
        const atual = n === passo
        return (
          <li key={texto} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!liberado}
              onClick={() => ir(n)}
              aria-current={atual ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[.84rem] font-semibold transition-colors',
                atual ? 'bg-navy text-white' : 'text-muted',
                liberado && !atual && 'hover:bg-paper-alt hover:text-navy',
                !liberado && 'cursor-not-allowed opacity-45',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full font-mono text-[.72rem]',
                  atual ? 'bg-white/20 text-white' : n < passo ? 'bg-blue text-white' : 'bg-paper-alt text-muted',
                )}
              >
                {n}
              </span>
              {texto}
            </button>
            {n < PASSOS.length ? <span className="h-px w-5 bg-line max-sm:hidden" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function CartaoDeCanal({
  canal,
  escolhido,
  escolher,
}: {
  canal: CanalDisponivel
  escolhido: boolean
  escolher: () => void
}) {
  const bloqueado = !canal.ativo || !canal.temCredencial
  const semNumero = canal.canal === 'whatsapp_nao_oficial' && canal.numeros === 0

  const miolo = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Etiqueta>{CANAL_CODIGO[canal.canal]}</Etiqueta>
        {canal.daPlataforma ? <Chip tom="navy">Provedor da Nex</Chip> : null}
        {canal.instavel ? <Chip tom="vermelho">Provedor instável</Chip> : null}
        {canal.canal === 'whatsapp_nao_oficial' && !bloqueado ? (
          <Chip tom={canal.numeros > 0 ? 'verde' : 'ambar'}>
            {canal.numeros > 0
              ? `${canal.numeros} ${canal.numeros === 1 ? 'número conectado' : 'números conectados'}`
              : 'Sem número conectado'}
          </Chip>
        ) : null}
      </div>

      <p className="mt-2 text-[.98rem] font-semibold text-navy">{CANAL_LABEL[canal.canal]}</p>
      <p className="mt-0.5 text-[.82rem] leading-snug text-muted">
        {canal.rotulo} · {nomeDoProvedor(canal.provedor)}
      </p>

      <p className="tabular mt-3 font-mono text-[1.1rem] font-semibold text-navy">
        {moeda(canal.preco)}
        <span className="ml-1.5 font-sans text-[.76rem] font-medium text-muted">por mensagem</span>
      </p>
    </>
  )

  if (bloqueado) {
    return (
      <div className="rounded-[18px] border-2 border-dashed border-line bg-paper-alt/60 p-4">
        <div className="opacity-70">{miolo}</div>
        <p className="mt-3 text-[.8rem] leading-snug text-muted">
          {canal.ativo ? 'Este canal ainda não tem credencial.' : 'Este canal está desativado.'}
        </p>
        <BotaoLink href="/canais" tom="contorno" tamanho="sm" className="mt-2.5">
          Configurar em Canais
        </BotaoLink>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={escolher}
      aria-pressed={escolhido}
      className={cn(
        'rounded-[18px] border-2 p-4 text-left transition-all',
        escolhido
          ? 'border-blue bg-blue/6 shadow-[0_12px_24px_-16px_rgba(0,120,248,.6)]'
          : 'border-line bg-white hover:border-blue/50',
      )}
    >
      {miolo}
      {semNumero ? (
        <p className="mt-2 text-[.78rem] leading-snug text-[#a16207]">
          Sem número conectado o disparo fica esperando. Conecte um em Canais.
        </p>
      ) : null}
    </button>
  )
}

function CaixaDeFonte({
  marcada,
  desabilitada,
  alternar,
  titulo,
  nota,
}: {
  marcada: boolean
  desabilitada?: boolean
  alternar: () => void
  titulo: ReactNode
  nota: ReactNode
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3 transition-colors',
        marcada ? 'border-blue bg-blue/6' : 'border-line bg-white hover:border-blue/40',
        desabilitada && 'cursor-not-allowed opacity-55 hover:border-line',
      )}
    >
      <input
        type="checkbox"
        checked={marcada}
        disabled={desabilitada}
        onChange={alternar}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[.9rem] font-semibold text-navy">{titulo}</span>
        <span className="mt-0.5 block text-[.78rem] leading-snug text-muted">{nota}</span>
      </span>
    </label>
  )
}

function LinhaResumo({ rotulo, valor }: { rotulo: ReactNode; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[.82rem] text-muted">{rotulo}</dt>
      <dd className="tabular m-0 text-right text-[.86rem] font-semibold text-navy">{valor}</dd>
    </div>
  )
}

// ────────────────────────────────────────────────────────── assistente

export function Assistente({
  canais,
  listas,
  etiquetas,
  ativosNaBase,
  saldo,
  frase,
  hoje,
}: {
  canais: CanalDisponivel[]
  listas: ListaDisponivel[]
  etiquetas: EtiquetaDisponivel[]
  ativosNaBase: number
  saldo: number
  frase: string
  hoje: string
}) {
  const [passo, setPasso] = useState(1)

  const [configId, setConfigId] = useState<string | null>(null)
  const [listasEscolhidas, setListasEscolhidas] = useState<string[]>([])
  const [etiquetasEscolhidas, setEtiquetasEscolhidas] = useState<string[]>([])
  const [todaABase, setTodaABase] = useState(false)

  const [nome, setNome] = useState('')
  const [corpo, setCorpo] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [eleitoral, setEleitoral] = useState(false)

  const [ritmo, setRitmo] = useState(60)
  const [abreAs, setAbreAs] = useState(8)
  const [fechaAs, setFechaAs] = useState(21)
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [agendarEm, setAgendarEm] = useState('')

  const [numeroDeTeste, setNumeroDeTeste] = useState('')

  // Só o Monitor de Envios usa: lá o perfil viaja junto da campanha.
  const [perfilNome, setPerfilNome] = useState('')
  const [perfilFoto, setPerfilFoto] = useState('')
  const [perfilNome2, setPerfilNome2] = useState('')
  const [perfilFoto2, setPerfilFoto2] = useState('')

  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [orcando, setOrcando] = useState(false)
  const [erroDoOrcamento, setErroDoOrcamento] = useState<string | null>(null)

  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const pedido = useRef(0)

  const [estadoDoTeste, testar, testando] = useActionState(enviarTeste, undefined)
  const [estadoDaCriacao, criar, criando] = useActionState(criarDisparo, undefined)

  const canalEscolhido = canais.find((c) => c.id === configId) ?? null
  const canal = canalEscolhido?.canal ?? null
  const peloMonitor = canalEscolhido?.provedor === 'monitor_envios'
  const perfil = peloMonitor
    ? { nome: perfilNome.trim(), fotoUrl: perfilFoto.trim(), nome2: perfilNome2.trim(), fotoUrl2: perfilFoto2.trim() }
    : null
  // A régua da Meta, conferida enquanto a pessoa digita. Nome reprovado trava
  // a campanha no meio do disparo, não na criação.
  const vereditoNome = perfilNome.trim() ? conferirNomeDePerfil(perfilNome) : null
  const vereditoNome2 = perfilNome2.trim() ? conferirNomeDePerfil(perfilNome2) : null

  const fontes: Fonte[] = useMemo(() => {
    if (todaABase) return [{ tipo: 'todos', chave: 'todos', rotulo: 'Toda a base' }]
    const daLista: Fonte[] = listasEscolhidas.flatMap((id) => {
      const lista = listas.find((l) => l.id === id)
      return lista ? [{ tipo: 'lista', chave: lista.id, rotulo: lista.nome }] : []
    })
    const daEtiqueta: Fonte[] = etiquetasEscolhidas.map((e) => ({
      tipo: 'etiqueta',
      chave: e,
      rotulo: `Etiqueta ${e}`,
    }))
    return [...daLista, ...daEtiqueta]
  }, [todaABase, listasEscolhidas, etiquetasEscolhidas, listas])

  // Fora do SMS o corpo não muda o preço; mandá-lo faria uma consulta por tecla.
  const corpoDoOrcamento = canal === 'sms' ? corpo : ''

  useEffect(() => {
    if (!canalEscolhido || fontes.length === 0) {
      setOrcamento(null)
      setOrcando(false)
      setErroDoOrcamento(null)
      return
    }

    // O contador descarta resposta atrasada: sem ele, um orçamento antigo
    // sobrescreveria o novo e a tela mostraria um custo que já não vale.
    const meu = pedido.current + 1
    pedido.current = meu
    setOrcando(true)

    const temporizador = setTimeout(() => {
      void orcarDisparo({
        canal: canalEscolhido.canal,
        corpo: corpoDoOrcamento,
        fontes,
        eleitoral,
      })
        .then((resposta) => {
          if (meu !== pedido.current) return
          setOrcando(false)
          if (resposta.ok) {
            setOrcamento(resposta.orcamento)
            setErroDoOrcamento(null)
          } else {
            setOrcamento(null)
            setErroDoOrcamento(resposta.erro)
          }
        })
        .catch(() => {
          if (meu !== pedido.current) return
          setOrcando(false)
          setErroDoOrcamento('Não foi possível calcular o orçamento agora. Tente de novo.')
        })
    }, 350)

    return () => clearTimeout(temporizador)
  }, [canalEscolhido, fontes, corpoDoOrcamento, eleitoral])

  const textoDeSaida = textoQueSai(corpo, eleitoral, frase)
  const sms = medirSms(textoDeSaida)
  const variantes = contarVariantes(textoDeSaida)

  const nomeSugerido = `${canal ? CANAL_CURTO[canal] : 'Disparo'} · ${hoje}`
  const nomeFinal = nome.trim() || nomeSugerido

  const podeIrPara2 = Boolean(canalEscolhido)
  const podeIrPara3 = podeIrPara2 && fontes.length > 0
  const podeIrPara4 = podeIrPara3 && corpo.trim().length > 0
  const maximo = podeIrPara4 ? 4 : podeIrPara3 ? 3 : podeIrPara2 ? 2 : 1

  const faltaEmCreditos = orcamento ? orcamento.total - orcamento.saldo - orcamento.limite : 0

  function impedimentoDoEnvio(): string | null {
    if (!canalEscolhido) return 'Escolha o canal no passo 1.'
    if (fontes.length === 0) return 'Escolha quem vai receber no passo 2.'
    if (!corpo.trim()) return 'Escreva a mensagem no passo 3.'
    if (orcando) return 'Calculando o orçamento…'
    if (erroDoOrcamento) return erroDoOrcamento
    if (!orcamento) return 'O orçamento ainda não foi calculado.'
    if (orcamento.destinatarios === 0) {
      return 'Ninguém do público escolhido pode receber. Quem pediu para sair fica de fora — reveja as listas.'
    }
    if (!orcamento.cabeNoSaldo) {
      return `Faltam ${moeda(faltaEmCreditos)} em créditos para este disparo. Peça uma recarga ou reduza o público.`
    }
    if (quando === 'agendar' && !agendarEm) return 'Escolha a data e a hora do agendamento.'
    if (peloMonitor && perfil) {
      if (!perfil.nome || !perfil.fotoUrl) return 'Preencha o perfil principal — nome e foto.'
      if (!perfil.nome2 || !perfil.fotoUrl2) return 'Preencha o perfil reserva — nome e foto.'
      if (perfil.nome.toLowerCase() === perfil.nome2.toLowerCase()) {
        return 'O perfil reserva precisa ter um nome diferente do principal.'
      }
      if (perfil.fotoUrl === perfil.fotoUrl2) {
        return 'A foto do perfil reserva precisa ser diferente da do principal.'
      }
      if (vereditoNome && !vereditoNome.ok) return `Perfil principal — ${vereditoNome.motivo}`
      if (vereditoNome2 && !vereditoNome2.ok) return `Perfil reserva — ${vereditoNome2.motivo}`
    }
    return null
  }

  const impedimento = impedimentoDoEnvio()

  function escolherCanal(c: CanalDisponivel) {
    setConfigId(c.id)
    setPasso(2)
  }

  function alternarLista(id: string) {
    setListasEscolhidas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    )
  }

  function alternarEtiqueta(chave: string) {
    setEtiquetasEscolhidas((atual) =>
      atual.includes(chave) ? atual.filter((x) => x !== chave) : [...atual, chave],
    )
  }

  /** Insere a variável onde o cursor está, não no fim do texto. */
  function inserirVariavel(chave: string) {
    const marca = `{{${chave}}}`
    const area = areaRef.current
    if (!area) {
      setCorpo((c) => c + marca)
      return
    }
    const inicio = area.selectionStart
    const fim = area.selectionEnd
    setCorpo(`${corpo.slice(0, inicio)}${marca}${corpo.slice(fim)}`)
    requestAnimationFrame(() => {
      area.focus()
      const cursor = inicio + marca.length
      area.setSelectionRange(cursor, cursor)
    })
  }

  /*
   * Os dois disparos de ação vão dentro de `startTransition`.
   *
   * `useActionState` chamado fora de uma transição não é detalhe de estilo: o
   * `criarDisparo` termina em `redirect`, e sem a transição a navegação
   * acontece no meio da renderização — a árvore troca de forma e o React
   * derruba a tela com "Rendered more hooks than during the previous render".
   * Fora isso, `criando` e `testando` nunca ficariam verdadeiros.
   */
  function mandarTeste() {
    if (!canalEscolhido) return
    startTransition(() => {
      testar({
        canal: canalEscolhido!.canal,
        configId: canalEscolhido!.id,
        numero: numeroDeTeste,
        corpo,
        mediaUrl: mediaUrl.trim() || null,
        eleitoral,
      })
    })
  }

  function mandarCriacao() {
    if (!canalEscolhido || impedimento) return
    const agendado = agendarEm ? new Date(agendarEm) : null
    startTransition(() => {
      criar({
        nome: nomeFinal,
        canal: canalEscolhido!.canal,
        configId: canalEscolhido!.id,
        corpo,
        mediaUrl: mediaUrl.trim() || null,
        fontes,
        ritmo,
        quietStart: abreAs,
        quietEnd: fechaAs,
        eleitoral,
        agendarPara:
          quando === 'agendar' && agendado && !Number.isNaN(agendado.getTime())
            ? agendado.toISOString()
            : null,
        perfil,
      })
    })
  }

  const destinatarios = orcamento?.destinatarios ?? 0
  const tempo = destinatarios > 0 ? duracao((destinatarios / ritmo) * 60_000) : '—'
  const saldoAgora = orcamento?.saldo ?? saldo
  const custo = orcamento?.total ?? 0

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <Indicador passo={passo} maximo={maximo} ir={setPasso} />

        {/* ─────────────────────────────────────── passo 1: canal */}
        {passo === 1 ? (
          <Pad>
            <PadTitulo
              titulo="Por onde vai sair"
              descricao="O canal define o preço por mensagem e o que dá para escrever."
            />
            <div className="p-6">
              {canais.every((c) => !c.ativo || !c.temCredencial) ? (
                <Aviso tom="alerta" titulo="Nenhum canal pronto para enviar" className="mb-4">
                  Os canais abaixo existem, mas ainda falta credencial ou eles estão desativados.
                </Aviso>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {canais.map((c) => (
                  <CartaoDeCanal
                    key={c.id}
                    canal={c}
                    escolhido={c.id === configId}
                    escolher={() => escolherCanal(c)}
                  />
                ))}
              </div>
            </div>
          </Pad>
        ) : null}

        {/* ────────────────────────────────────── passo 2: público */}
        {passo === 2 ? (
          <Pad>
            <PadTitulo
              titulo="Quem vai receber"
              descricao="Pode somar listas e etiquetas. Quem estiver em duas recebe uma vez só."
            />
            <div className="p-6">
              {listas.length === 0 && etiquetas.length === 0 && ativosNaBase === 0 ? (
                <Vazio
                  titulo="Sua base ainda está vazia"
                  descricao="Importe seus contatos para escolher quem recebe este disparo."
                  icone={<IcContatos className="h-6 w-6" />}
                  acao={<BotaoLink href="/contatos">Importar contatos</BotaoLink>}
                />
              ) : (
                <div className="space-y-6">
                  <div>
                    <Etiqueta>Base inteira</Etiqueta>
                    <div className="mt-2">
                      <CaixaDeFonte
                        marcada={todaABase}
                        alternar={() => setTodaABase((v) => !v)}
                        titulo="Toda a base de contatos"
                        nota={`${numero(ativosNaBase)} contatos ativos, sem contar quem pediu para sair.`}
                      />
                    </div>
                    {todaABase ? (
                      <p className="mt-2 text-[.78rem] leading-relaxed text-muted">
                        A base inteira já inclui todas as listas e etiquetas — por isso elas ficam
                        desmarcadas.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <Etiqueta>Listas</Etiqueta>
                    {listas.length === 0 ? (
                      <p className="mt-2 text-[.82rem] text-muted">
                        Você ainda não criou listas.{' '}
                        <Link href="/contatos" className="font-semibold text-blue hover:underline">
                          Criar uma lista
                        </Link>
                      </p>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {listas.map((l) => (
                          <CaixaDeFonte
                            key={l.id}
                            marcada={!todaABase && listasEscolhidas.includes(l.id)}
                            desabilitada={todaABase}
                            alternar={() => alternarLista(l.id)}
                            titulo={l.nome}
                            nota={`${numero(l.total)} contatos`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <Etiqueta>Etiquetas</Etiqueta>
                    {etiquetas.length === 0 ? (
                      <p className="mt-2 text-[.82rem] text-muted">
                        Nenhuma etiqueta em uso.{' '}
                        <Link href="/contatos" className="font-semibold text-blue hover:underline">
                          Etiquetar contatos
                        </Link>
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {etiquetas.map((e) => {
                          const marcada = !todaABase && etiquetasEscolhidas.includes(e.etiqueta)
                          return (
                            <button
                              key={e.etiqueta}
                              type="button"
                              disabled={todaABase}
                              onClick={() => alternarEtiqueta(e.etiqueta)}
                              aria-pressed={marcada}
                              className={cn(
                                'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[.82rem] font-semibold transition-colors',
                                marcada
                                  ? 'border-blue bg-blue/8 text-blue'
                                  : 'border-line bg-white text-navy hover:border-blue/50',
                                todaABase && 'cursor-not-allowed opacity-50',
                              )}
                            >
                              {e.etiqueta}
                              <span className="tabular font-mono text-[.72rem] font-medium text-muted">
                                {numero(e.total)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {fontes.length > 0 ? (
                    <div className="rounded-[12px] border border-line bg-paper-alt px-4 py-3">
                      {orcando ? (
                        <p className="text-[.86rem] text-muted">Contando quem vai receber…</p>
                      ) : erroDoOrcamento ? (
                        <p className="text-[.86rem] font-semibold text-danger">{erroDoOrcamento}</p>
                      ) : orcamento ? (
                        <>
                          <p className="text-[.9rem] text-navy">
                            <b className="tabular font-mono text-[1.15rem]">
                              {numero(orcamento.destinatarios)}
                            </b>{' '}
                            {orcamento.destinatarios === 1 ? 'pessoa vai receber' : 'pessoas vão receber'}
                          </p>
                          <p className="mt-1 text-[.8rem] leading-relaxed text-muted">
                            {numero(orcamento.publico.bruto)} vieram das fontes escolhidas;{' '}
                            {numero(orcamento.publico.barrados)} ficaram de fora por descadastro.
                          </p>
                          {orcamento.publico.aparado ? (
                            <Aviso tom="alerta" className="mt-3">
                              O público passou do teto de um milhão por disparo e foi aparado. Divida
                              em mais de uma campanha para alcançar todo mundo.
                            </Aviso>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </Pad>
        ) : null}

        {/* ───────────────────────────────────── passo 3: mensagem */}
        {passo === 3 ? (
          <Pad>
            <PadTitulo
              titulo="O que vai ser enviado"
              descricao="Use variáveis para tratar cada pessoa pelo nome e spintax para variar o texto."
            />
            <div className="space-y-5 p-6">
              <Campo rotulo="Mensagem" obrigatorio>
                <AreaTexto
                  ref={areaRef}
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  rows={7}
                  maxLength={4000}
                  placeholder="Olá {{primeiro_nome}}, {oi|tudo bem}? …"
                />
              </Campo>

              <div>
                <Etiqueta>Inserir variável</Etiqueta>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VARIAVEIS_PADRAO.map((v) => (
                    <button
                      key={v.chave}
                      type="button"
                      onClick={() => inserirVariavel(v.chave)}
                      title={`Exemplo: ${v.exemplo}`}
                      className="rounded-full border border-line bg-white px-3 py-1.5 text-[.78rem] font-semibold text-navy transition-colors hover:border-blue hover:text-blue"
                    >
                      {v.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              {canal === 'sms' ? (
                <div className="rounded-[12px] border border-line bg-paper-alt px-4 py-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[.82rem] text-muted">
                    <span>
                      <b className="tabular font-mono text-navy">{numero(sms.caracteres)}</b>{' '}
                      caracteres
                    </span>
                    <span>
                      <b className="tabular font-mono text-navy">{sms.segmentos}</b>{' '}
                      {sms.segmentos === 1 ? 'segmento' : 'segmentos'}
                    </span>
                    <span>
                      alfabeto{' '}
                      <b className="font-mono text-navy">
                        {sms.alfabeto === 'gsm' ? 'GSM' : 'Unicode'}
                      </b>
                    </span>
                    <span>
                      restam <b className="tabular font-mono text-navy">{sms.restam}</b> neste
                      segmento
                    </span>
                  </div>
                  {sms.forcaramUnicode.length > 0 ? (
                    <Aviso tom="alerta" className="mt-3">
                      Estes caracteres jogaram a mensagem para o Unicode e derrubaram o limite de 160
                      para 70:{' '}
                      <span className="font-mono font-semibold">
                        {sms.forcaramUnicode.join(' ')}
                      </span>
                      . Tirar os acentos costuma cortar o custo pela metade.
                    </Aviso>
                  ) : null}
                </div>
              ) : (
                <p className="text-[.82rem] text-muted">
                  <b className="tabular font-mono text-navy">{numero(corpo.length)}</b> caracteres
                </p>
              )}

              {variantes > 1 ? (
                <Aviso tom="ok">
                  Este texto pode sair de{' '}
                  <b className="tabular font-mono">{numero(variantes)}</b> jeitos diferentes. Variar
                  a redação é o que evita que o filtro antisspam veja mil cópias iguais.
                </Aviso>
              ) : null}

              <Campo
                rotulo="URL da mídia (opcional)"
                dica="Link público de imagem, PDF ou áudio. O provedor precisa conseguir baixar sozinho."
              >
                <Entrada
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Campo>

              <div className="rounded-[12px] border border-line bg-white px-4 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={eleitoral}
                    onChange={() => setEleitoral((v) => !v)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue"
                  />
                  <span>
                    <span className="block text-[.9rem] font-semibold text-navy">
                      Conteúdo eleitoral
                    </span>
                    <span className="mt-0.5 block text-[.8rem] leading-relaxed text-muted">
                      Propaganda eleitoral precisa oferecer a saída no próprio texto (art. 57-G da
                      Lei 9.504/97).
                    </span>
                  </span>
                </label>
                {eleitoral ? (
                  <p className="mt-3 rounded-[12px] bg-paper-alt px-3.5 py-2.5 text-[.82rem] text-navy">
                    Vai ser acrescentado ao fim da mensagem:{' '}
                    <b className="font-semibold">{frase}</b>
                  </p>
                ) : null}
              </div>

              <Previa
                canal={canal}
                corpo={corpo}
                mediaUrl={mediaUrl}
                eleitoral={eleitoral}
                frase={frase}
              />
            </div>
          </Pad>
        ) : null}

        {/* ──────────────────────────────── passo 4: ritmo e envio */}
        {passo === 4 ? (
          <div className="space-y-5">
            <Pad>
              <PadTitulo
                titulo="Ritmo e horário"
                descricao="Mandar devagar é o que mantém o número vivo e a entrega alta."
              />
              <div className="space-y-5 p-6">
                <Campo rotulo="Nome do disparo" dica="Só para você achar depois na lista de campanhas.">
                  <Entrada
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder={nomeSugerido}
                    maxLength={160}
                  />
                </Campo>

                {peloMonitor ? (
                  <Aviso tom="info" titulo="O ritmo aqui é da plataforma deles">
                    O Monitor de Envios recebe a campanha inteira e entrega no ritmo e na janela que
                    eles definem. Não adianta escolher aqui — por isso esses controles não aparecem.
                  </Aviso>
                ) : null}

                <Campo
                  rotulo="Ritmo"
                  className={peloMonitor ? 'hidden' : undefined}
                  dica={
                    destinatarios > 0
                      ? `Nesse ritmo, o disparo leva cerca de ${tempo} para terminar.`
                      : 'Quanto mais devagar, menor o risco de bloqueio.'
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {RITMOS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRitmo(r)}
                        aria-pressed={ritmo === r}
                        className={cn(
                          'rounded-full border-2 px-4 py-2 text-[.84rem] font-bold transition-colors',
                          ritmo === r
                            ? 'border-blue bg-blue/8 text-blue'
                            : 'border-line bg-white text-navy hover:border-blue/50',
                        )}
                      >
                        {r} por minuto
                      </button>
                    ))}
                  </div>
                </Campo>

                <div className={cn('grid gap-4 sm:grid-cols-2', peloMonitor && 'hidden')}>
                  <Campo rotulo="Só envia a partir das">
                    <Selecao value={abreAs} onChange={(e) => setAbreAs(Number(e.target.value))}>
                      {HORAS.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="E para às">
                    <Selecao value={fechaAs} onChange={(e) => setFechaAs(Number(e.target.value))}>
                      {HORAS.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                </div>
                <p className={cn('-mt-1 text-[.8rem] leading-relaxed text-muted', peloMonitor && 'hidden')}>
                  {abreAs === fechaAs
                    ? 'Sem janela de silêncio: o disparo envia a qualquer hora do dia.'
                    : `Fora dessa faixa o disparo fica em silêncio e retoma às ${String(abreAs).padStart(2, '0')}:00. A última mensagem sai antes das ${String(fechaAs).padStart(2, '0')}:00.`}
                </p>

                <Campo rotulo="Quando começar">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setQuando('agora')}
                      aria-pressed={quando === 'agora'}
                      className={cn(
                        'rounded-full border-2 px-4 py-2 text-[.84rem] font-bold transition-colors',
                        quando === 'agora'
                          ? 'border-blue bg-blue/8 text-blue'
                          : 'border-line bg-white text-navy hover:border-blue/50',
                      )}
                    >
                      Agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuando('agendar')}
                      aria-pressed={quando === 'agendar'}
                      className={cn(
                        'rounded-full border-2 px-4 py-2 text-[.84rem] font-bold transition-colors',
                        quando === 'agendar'
                          ? 'border-blue bg-blue/8 text-blue'
                          : 'border-line bg-white text-navy hover:border-blue/50',
                      )}
                    >
                      Agendar
                    </button>
                  </div>
                </Campo>

                {quando === 'agendar' ? (
                  <Campo rotulo="Data e hora" dica="No horário do seu computador.">
                    <Entrada
                      type="datetime-local"
                      value={agendarEm}
                      onChange={(e) => setAgendarEm(e.target.value)}
                    />
                  </Campo>
                ) : null}
              </div>
            </Pad>

            <Pad>
              <PadTitulo
                titulo="Enviar um teste"
                descricao="Manda uma mensagem só, para o número que você quiser. Não desconta do saldo."
              />
              <div className="p-6">
                <div className="flex flex-wrap items-end gap-3">
                  <Campo rotulo="Número do teste" className="min-w-[220px] flex-1">
                    <Entrada
                      type="tel"
                      value={numeroDeTeste}
                      onChange={(e) => setNumeroDeTeste(e.target.value)}
                      placeholder="(11) 98765-4321"
                    />
                  </Campo>
                  <Botao
                    type="button"
                    tom="contorno"
                    onClick={mandarTeste}
                    disabled={testando || !canalEscolhido || !corpo.trim() || !numeroDeTeste.trim()}
                  >
                    {testando ? 'Enviando…' : 'Enviar teste'}
                  </Botao>
                </div>
                {estadoDoTeste?.erro ? (
                  <Aviso tom="erro" className="mt-4">
                    {estadoDoTeste.erro}
                  </Aviso>
                ) : null}
                {estadoDoTeste?.ok ? (
                  <Aviso tom="ok" className="mt-4">
                    {estadoDoTeste.ok}
                  </Aviso>
                ) : null}
              </div>
            </Pad>

            {peloMonitor ? (
              <Pad>
                <PadTitulo
                  titulo="Perfil no WhatsApp"
                  descricao="É o nome e a foto que quem recebe vê. O Monitor de Envios exige os dois perfis: o principal e um reserva, para a equipe deles trocar se a Meta reprovar o primeiro."
                />
                <div className="space-y-4 p-6">
                  <Aviso tom="info">
                    O nome precisa ser comercial — <b>Móveis Silva</b>, <b>Padaria Aurora</b>. Frase,
                    promessa, &quot;Oficial&quot; ou termo de aposta fazem a Meta banir o número, e o
                    Monitor recusa antes disso.{' '}
                    <Link href="/canais/nome-de-perfil" className="font-semibold underline">
                      Ver as regras e testar um nome
                    </Link>
                    .
                  </Aviso>

                  <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    <Campo
                      rotulo="Perfil principal — nome"
                      obrigatorio
                      erro={vereditoNome && !vereditoNome.ok ? vereditoNome.motivo : undefined}
                      dica={
                        vereditoNome?.ok
                          ? 'Passa nas regras conhecidas da Meta.'
                          : `O nome comercial da empresa, até ${TAMANHO_MAXIMO} caracteres.`
                      }
                    >
                      <Entrada
                        value={perfilNome}
                        onChange={(e) => setPerfilNome(e.target.value)}
                        maxLength={TAMANHO_MAXIMO}
                        placeholder="Moveis Silva"
                      />
                    </Campo>
                    <Campo
                      rotulo="Perfil principal — foto"
                      obrigatorio
                      dica="Quadrada, mínimo 192×192, até 5 MB."
                    >
                      <Entrada
                        type="url"
                        value={perfilFoto}
                        onChange={(e) => setPerfilFoto(e.target.value)}
                        placeholder="https://seusite.com.br/avatar.png"
                      />
                    </Campo>
                    <Campo
                      rotulo="Perfil reserva — nome"
                      obrigatorio
                      erro={vereditoNome2 && !vereditoNome2.ok ? vereditoNome2.motivo : undefined}
                      dica={
                        vereditoNome2?.ok
                          ? 'Passa nas regras conhecidas da Meta.'
                          : 'Precisa ser diferente do principal.'
                      }
                    >
                      <Entrada
                        value={perfilNome2}
                        onChange={(e) => setPerfilNome2(e.target.value)}
                        maxLength={TAMANHO_MAXIMO}
                        placeholder="Silva Moveis"
                      />
                    </Campo>
                    <Campo
                      rotulo="Perfil reserva — foto"
                      obrigatorio
                      dica="Uma imagem diferente da principal."
                    >
                      <Entrada
                        type="url"
                        value={perfilFoto2}
                        onChange={(e) => setPerfilFoto2(e.target.value)}
                        placeholder="https://seusite.com.br/avatar-2.png"
                      />
                    </Campo>
                  </div>
                </div>
              </Pad>
            ) : null}

            <Pad>
              <PadTitulo titulo="Confira antes de disparar" />
              <div className="p-6">
                <dl className="divide-y divide-line">
                  <LinhaResumo
                    rotulo="Canal"
                    valor={
                      canalEscolhido
                        ? `${CANAL_LABEL[canalEscolhido.canal]} · ${canalEscolhido.rotulo}`
                        : '—'
                    }
                  />
                  <LinhaResumo rotulo="Público" valor={fontes.map((f) => f.rotulo).join(', ') || '—'} />
                  <LinhaResumo rotulo="Destinatários" valor={numero(destinatarios)} />
                  <LinhaResumo
                    rotulo={
                      orcamento && orcamento.segmentos > 1
                        ? `Preço por envio (${orcamento.segmentos} segmentos)`
                        : 'Preço por envio'
                    }
                    valor={moeda(orcamento?.precoPorEnvio ?? canalEscolhido?.preco ?? 0)}
                  />
                  <LinhaResumo rotulo="Custo estimado" valor={moeda(custo)} />
                  <LinhaResumo rotulo="Saldo atual" valor={moeda(saldoAgora)} />
                  <LinhaResumo rotulo="Saldo depois" valor={moeda(saldoAgora - custo)} />
                  <LinhaResumo
                    rotulo="Começa"
                    valor={quando === 'agora' ? 'Assim que ficar pronto' : agendarEm.replace('T', ' às ') || '—'}
                  />
                </dl>

                {estadoDaCriacao?.erro ? (
                  <Aviso tom="erro" className="mt-5">
                    {estadoDaCriacao.erro}
                  </Aviso>
                ) : null}

                {impedimento ? (
                  <Aviso tom="alerta" className="mt-5">
                    {impedimento}
                  </Aviso>
                ) : null}

                <Botao
                  type="button"
                  tom="wa"
                  tamanho="lg"
                  bloco
                  className="mt-5"
                  onClick={mandarCriacao}
                  disabled={Boolean(impedimento) || criando}
                >
                  {criando ? 'Criando o disparo…' : 'Criar disparo'}
                </Botao>
                <p className="mt-3 text-center text-[.78rem] leading-relaxed text-muted">
                  {peloMonitor
                    ? 'Este disparo vai para a fila de aprovação do Monitor de Envios. Depois de aprovado, quem controla o ritmo é a plataforma deles — e a campanha não pode mais ser pausada por aqui.'
                    : 'O crédito só sai quando cada mensagem sai. Dá para pausar ou cancelar a campanha a qualquer momento.'}
                </p>
              </div>
            </Pad>
          </div>
        ) : null}

        {/* ─────────────────────────────────────────── navegação */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Botao
            type="button"
            tom="fantasma"
            onClick={() => setPasso((p) => Math.max(1, p - 1))}
            disabled={passo === 1}
          >
            Voltar
          </Botao>
          {passo < 4 ? (
            <Botao
              type="button"
              onClick={() => setPasso((p) => Math.min(4, p + 1))}
              disabled={passo + 1 > maximo}
            >
              Continuar
            </Botao>
          ) : null}
        </div>
      </div>

      {/* ───────────────────────────────────────────── resumo fixo */}
      <aside className="lg:sticky lg:top-6">
        <Pad>
          <PadTitulo titulo="Resumo" />
          <div className="px-5 py-4">
            <dl className="divide-y divide-line">
              <LinhaResumo
                rotulo="Canal"
                valor={
                  canalEscolhido ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-[.7rem] text-muted">
                        {CANAL_CODIGO[canalEscolhido.canal]}
                      </span>
                      {CANAL_CURTO[canalEscolhido.canal]}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <LinhaResumo
                rotulo="Público"
                valor={fontes.length === 0 ? '—' : `${fontes.length} ${fontes.length === 1 ? 'fonte' : 'fontes'}`}
              />
              <LinhaResumo
                rotulo="Vão receber"
                valor={orcando ? '…' : numero(destinatarios)}
              />
              {orcamento && orcamento.publico.barrados > 0 ? (
                <LinhaResumo
                  rotulo="Fora por descadastro"
                  valor={numero(orcamento.publico.barrados)}
                />
              ) : null}
              <LinhaResumo
                rotulo={canal === 'sms' ? `Preço por envio (${sms.segmentos}×)` : 'Preço por envio'}
                valor={moeda(orcamento?.precoPorEnvio ?? canalEscolhido?.preco ?? 0)}
              />
              <LinhaResumo rotulo="Ritmo" valor={`${ritmo}/min`} />
              {peloMonitor ? null : <LinhaResumo rotulo="Duração estimada" valor={tempo} />}
            </dl>

            <div className="mt-4 rounded-[12px] bg-navy px-4 py-3.5 text-white">
              <p className="font-mono text-[.68rem] font-semibold tracking-[.1em] text-white/70 uppercase">
                Custo estimado
              </p>
              <p className="tabular mt-1 font-mono text-[1.6rem] leading-none font-semibold">
                {moeda(custo)}
              </p>
              <p className="mt-2 text-[.76rem] leading-relaxed text-white/75">
                {numero(destinatarios)} × {moeda(orcamento?.precoPorEnvio ?? 0)}
              </p>
            </div>

            <dl className="mt-3 divide-y divide-line">
              <LinhaResumo rotulo="Saldo atual" valor={moeda(saldoAgora)} />
              <LinhaResumo
                rotulo="Saldo depois"
                valor={
                  <span className={cn(saldoAgora - custo < 0 && 'text-danger')}>
                    {moeda(saldoAgora - custo)}
                  </span>
                }
              />
            </dl>

            {orcamento && !orcamento.cabeNoSaldo ? (
              <Aviso tom="erro" className="mt-4">
                Faltam <b>{moeda(faltaEmCreditos)}</b> em créditos.
              </Aviso>
            ) : null}

            {orcamento && orcamento.limite > 0 ? (
              <p className="mt-3 text-[.74rem] leading-relaxed text-muted">
                Sua conta tem {moeda(orcamento.limite)} de limite além do saldo.
              </p>
            ) : null}
          </div>
        </Pad>
      </aside>
    </div>
  )
}
