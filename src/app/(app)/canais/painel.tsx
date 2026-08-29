'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { Channel, InstanceStatus } from '@/db/schema/enums'
import {
  ajustarNumero,
  apagarCanal,
  atualizarQr,
  conectarNumero,
  conferirNumero,
  guardarCanal,
  removerNumero,
  testarCanal,
} from './acoes'
import {
  FormularioDeCanal,
  type CanalParaEditar,
} from '@/components/canais/formulario'
import {
  Aviso,
  Barra,
  Botao,
  Campo,
  Chip,
  Entrada,
  Etiqueta,
  Pad,
  Tabela,
  Td,
  Th,
  Vazio,
} from '@/components/ui/base'
import { formatarTelefone } from '@/lib/telefone'
import { numero, quando } from '@/lib/ui'

const STATUS_TOM: Record<InstanceStatus, 'verde' | 'ciano' | 'neutro' | 'vermelho'> = {
  conectado: 'verde',
  conectando: 'ciano',
  desconectado: 'neutro',
  banido: 'vermelho',
}

const STATUS_LABEL: Record<InstanceStatus, string> = {
  conectado: 'Conectado',
  conectando: 'Lendo QR',
  desconectado: 'Desconectado',
  banido: 'Banido',
}

/** Um canal já configurado, ou o botão de adicionar mais um. */
export function CartaoDoCanal({
  canal,
  novo,
  canalFixo,
  daPlataforma,
  provedorNome,
  quebradoAte,
  falhasSeguidas,
  numeros,
}: {
  canal?: CanalParaEditar
  novo?: boolean
  canalFixo?: Channel
  daPlataforma?: boolean
  provedorNome?: string
  quebradoAte?: string | null
  falhasSeguidas?: number
  numeros?: number
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao] = useActionState(guardarCanal, undefined)
  const [apagando, iniciarRemocao] = useTransition()

  const quebrado = quebradoAte && new Date(quebradoAte).getTime() > Date.now()

  if (novo) {
    return aberto ? (
      <div className="rounded-[12px] border border-blue/30 bg-blue/4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Etiqueta>Novo canal</Etiqueta>
          <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => setAberto(false)}>
            Cancelar
          </Botao>
        </div>
        <FormularioDeCanal acao={acao} estado={estado} canalFixo={canalFixo} />
      </div>
    ) : (
      <Botao type="button" tom="contorno" tamanho="sm" onClick={() => setAberto(true)}>
        Configurar este canal
      </Botao>
    )
  }

  if (!canal) return null

  return (
    <div className="rounded-[12px] border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[.98rem] font-semibold text-navy">
            {canal.rotulo}
            {daPlataforma ? <Chip tom="ciano">Provedor Nex Envios</Chip> : null}
            {canal.padrao ? <Chip tom="azul">Padrão</Chip> : null}
            {!canal.ativo ? <Chip tom="neutro">Desativado</Chip> : null}
            {quebrado ? <Chip tom="vermelho">Desligado por falhas</Chip> : null}
          </p>
          <p className="mt-1 text-[.84rem] text-muted">
            {provedorNome}
            {canal.temCredencial ? ' · credencial salva' : ' · sem credencial'}
            {numeros ? ` · ${numero(numeros)} número(s) conectado(s)` : ''}
          </p>
          {quebrado ? (
            <p className="mt-1 text-[.8rem] text-danger">
              {falhasSeguidas} falhas seguidas. Volta a ser usado {quando(quebradoAte)}. Salvar as
              credenciais religa na hora.
            </p>
          ) : null}
        </div>

        {daPlataforma ? (
          <span className="text-[.8rem] text-muted">Gerenciado pelo time Nex</span>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Botao type="button" tom="contorno" tamanho="sm" onClick={() => setAberto((v) => !v)}>
              {aberto ? 'Fechar' : 'Editar'}
            </Botao>
            <Botao
              type="button"
              tom="perigo"
              tamanho="sm"
              disabled={apagando}
              onClick={() => {
                if (!confirm(`Remover "${canal.rotulo}"? Disparos futuros deixam de usá-lo.`)) return
                iniciarRemocao(() => void apagarCanal(canal.id))
              }}
            >
              Remover
            </Botao>
          </div>
        )}
      </div>

      {aberto && !daPlataforma ? (
        <div className="mt-5 border-t border-line pt-5">
          <FormularioDeCanal acao={acao} estado={estado} editando={canal} />
          <div className="mt-6 border-t border-line pt-5">
            <Teste configId={canal.id} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EnviarTeste() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tom="contorno" tamanho="sm" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar teste'}
    </Botao>
  )
}

function Teste({ configId }: { configId: string }) {
  const [estado, acao] = useActionState(testarCanal, undefined)

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="configId" value={configId} />
      <Etiqueta>Testar o canal</Etiqueta>
      {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
      {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Número que vai receber" className="min-w-[180px] flex-1">
          <Entrada name="numero" required placeholder="(11) 98765-4321" />
        </Campo>
        <Campo rotulo="Texto" className="min-w-[220px] flex-[2]">
          <Entrada name="texto" defaultValue="Teste de canal da Nex Envios." />
        </Campo>
        <EnviarTeste />
      </div>
    </form>
  )
}

type NumeroConectado = {
  id: string
  nome: string
  instancia: string
  telefone: string | null
  status: InstanceStatus
  tetoDiario: number
  enviadosHoje: number
  intervaloMs: number
  ultimoEnvio: string | null
  vistoEm: string | null
}

export function Numeros({
  configId,
  numeros,
}: {
  configId: string
  numeros: NumeroConectado[]
}) {
  const [estado, acao] = useActionState(conectarNumero, undefined)
  const [qr, setQr] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  const codigo = estado?.qrcode ?? qr

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[1rem] font-semibold text-navy">Números conectados</p>
          <p className="text-[.84rem] text-muted">
            Cada chip tem teto diário e intervalo mínimo. É o aquecimento que mantém o número vivo.
          </p>
        </div>
      </div>

      {numeros.length === 0 ? (
        <Vazio
          titulo="Nenhum número conectado"
          descricao="Conecte um chip abaixo para começar a disparar pelo WhatsApp não oficial."
        />
      ) : (
        <Pad>
          <Tabela>
            <thead>
              <tr>
                <Th>Chip</Th>
                <Th>Número</Th>
                <Th>Status</Th>
                <Th>Hoje</Th>
                <Th>Ritmo</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {numeros.map((n) => (
                <tr key={n.id}>
                  <Td className="font-semibold text-navy">
                    {n.nome}
                    <span className="block font-mono text-[.7rem] font-normal text-muted">
                      {n.instancia}
                    </span>
                  </Td>
                  <Td className="tabular text-[.86rem]">
                    {n.telefone ? formatarTelefone(n.telefone) : '—'}
                  </Td>
                  <Td>
                    <Chip tom={STATUS_TOM[n.status]} pulsando={n.status === 'conectado'}>
                      {STATUS_LABEL[n.status]}
                    </Chip>
                    <span className="mt-0.5 block text-[.72rem] text-muted">
                      visto {quando(n.vistoEm)}
                    </span>
                  </Td>
                  <Td className="min-w-[120px]">
                    <span className="tabular text-[.84rem]">
                      {numero(n.enviadosHoje)} / {numero(n.tetoDiario)}
                    </span>
                    <Barra
                      className="mt-1"
                      total={n.tetoDiario}
                      fatias={[
                        {
                          valor: Math.min(n.enviadosHoje, n.tetoDiario),
                          cor: n.enviadosHoje >= n.tetoDiario ? '#dc2626' : '#0078f8',
                          rotulo: 'enviados hoje',
                        },
                      ]}
                    />
                  </Td>
                  <Td className="text-[.84rem] text-muted">
                    {(n.intervaloMs / 1000).toFixed(1).replace('.', ',')} s entre envios
                  </Td>
                  <Td>
                    <AjusteDoNumero numero={n} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Pad>
      )}

      <form action={acao} className="rounded-[12px] border border-line bg-paper-alt/50 p-5">
        <input type="hidden" name="configId" value={configId} />
        {estado?.erro ? <Aviso tom="erro" className="mb-3">{estado.erro}</Aviso> : null}

        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Nome do chip" dica="Só para você identificar." className="min-w-[200px] flex-1">
            <Entrada name="nome" required placeholder="Chip comercial 1" />
          </Campo>
          <ConectarBotao />
        </div>

        {codigo ? (
          <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-line pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element --
                a Evolution devolve o QR em base64; `next/image` não tem o que
                otimizar num data URI, e passaria por um proxy à toa. */}
            <img
              src={codigo.startsWith('data:') ? codigo : `data:image/png;base64,${codigo}`}
              alt="QR Code para conectar o WhatsApp"
              className="h-52 w-52 rounded-[12px] border border-line bg-white p-2"
            />
            <div className="max-w-sm">
              <p className="text-[.92rem] font-semibold text-navy">Leia com o WhatsApp</p>
              <p className="mt-1 text-[.84rem] leading-relaxed text-muted">
                No aparelho: Configurações → Aparelhos conectados → Conectar aparelho. O código vence
                em segundos; se expirar, gere outro.
              </p>
              <div className="mt-3 flex gap-2">
                <Botao
                  type="button"
                  tom="contorno"
                  tamanho="sm"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      const alvo = numeros.find((n) => n.status !== 'conectado')
                      if (alvo) setQr(await atualizarQr(alvo.id))
                    })
                  }
                >
                  Gerar outro código
                </Botao>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  )
}

function ConectarBotao() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? 'Criando…' : 'Conectar número'}
    </Botao>
  )
}

function AjusteDoNumero({ numero: n }: { numero: NumeroConectado }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao] = useActionState(ajustarNumero, undefined)
  const [ocupado, iniciar] = useTransition()

  return (
    <div className="text-right">
      <div className="flex justify-end gap-1.5">
        <Botao
          type="button"
          tom="fantasma"
          tamanho="sm"
          disabled={ocupado}
          onClick={() => iniciar(() => void conferirNumero(n.id))}
        >
          Conferir
        </Botao>
        <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => setAberto((v) => !v)}>
          Ajustar
        </Botao>
        <Botao
          type="button"
          tom="fantasma"
          tamanho="sm"
          disabled={ocupado}
          onClick={() => {
            if (!confirm(`Remover o chip "${n.nome}"? Ele é desconectado da Evolution também.`)) return
            iniciar(() => void removerNumero(n.id))
          }}
        >
          Remover
        </Botao>
      </div>

      {aberto ? (
        <form action={acao} className="mt-3 space-y-2 rounded-[10px] bg-paper-alt p-3 text-left">
          <input type="hidden" name="instanciaId" value={n.id} />
          {estado?.erro ? <p className="text-[.76rem] text-danger">{estado.erro}</p> : null}
          {estado?.ok ? <p className="text-[.76rem] text-[#0f6b34]">{estado.ok}</p> : null}
          <Campo rotulo="Teto diário">
            <Entrada name="tetoDiario" type="number" min={1} max={20000} defaultValue={n.tetoDiario} />
          </Campo>
          <Campo rotulo="Intervalo mínimo (ms)">
            <Entrada name="intervaloMs" type="number" min={500} max={120000} step={500} defaultValue={n.intervaloMs} />
          </Campo>
          <Botao type="submit" tamanho="sm">
            Salvar
          </Botao>
        </form>
      ) : null}
    </div>
  )
}
