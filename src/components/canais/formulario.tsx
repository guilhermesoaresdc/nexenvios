'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  CAMPOS_DO_PROVEDOR,
  EXEMPLO_GENERICO,
  MARCADORES,
  type CampoDoProvedor,
} from '@/lib/canais/campos'
import {
  CANAL_LABEL,
  CANAL_PROVEDORES,
  PROVEDOR_LABEL,
  type Channel,
} from '@/db/schema/enums'
import {
  AreaTexto,
  Aviso,
  Botao,
  Campo,
  Entrada,
  Etiqueta,
  Selecao,
} from '@/components/ui/base'

/**
 * O formulário de credencial, montado a partir de `CAMPOS_DO_PROVEDOR`.
 *
 * Serve à tela do cliente e à de provedores da plataforma. Campo de segredo
 * nasce VAZIO mesmo na edição: o valor guardado nunca volta para o navegador,
 * e deixar em branco quer dizer "mantenha o que está lá".
 */

function Salvar({ novo }: { novo: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? 'Salvando…' : novo ? 'Conectar canal' : 'Salvar alterações'}
    </Botao>
  )
}

function CampoDoFormulario({ campo, novo }: { campo: CampoDoProvedor; novo: boolean }) {
  const dica = campo.segredo
    ? novo
      ? campo.dica
      : 'Deixe em branco para manter a credencial atual.'
    : campo.dica

  const comum = {
    name: campo.nome,
    defaultValue: campo.segredo ? '' : (campo.padrao ?? ''),
    placeholder: campo.exemplo,
    required: campo.obrigatorio && (novo || !campo.segredo),
  }

  return (
    <Campo
      rotulo={campo.rotulo}
      dica={dica}
      obrigatorio={campo.obrigatorio}
      className={campo.tipo === 'area' ? 'col-span-2 max-sm:col-span-1' : undefined}
    >
      {campo.tipo === 'area' ? (
        <AreaTexto {...comum} rows={3} className="font-mono text-[.82rem]" />
      ) : campo.tipo === 'selecao' ? (
        <Selecao name={campo.nome} defaultValue={campo.padrao ?? campo.opcoes?.[0]?.valor}>
          {campo.opcoes?.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </Selecao>
      ) : (
        <Entrada
          {...comum}
          type={campo.tipo === 'senha' ? 'password' : campo.tipo === 'url' ? 'url' : 'text'}
          autoComplete={campo.tipo === 'senha' ? 'new-password' : 'off'}
        />
      )}
    </Campo>
  )
}

export type CanalParaEditar = {
  id: string
  canal: Channel
  provedor: string
  rotulo: string
  ativo: boolean
  padrao: boolean
  temCredencial: boolean
}

export function FormularioDeCanal({
  acao,
  estado,
  canalFixo,
  editando,
  daPlataforma,
}: {
  acao: (form: FormData) => void
  estado?: { erro?: string; ok?: string }
  /** Quando a tela já escolheu o canal, o seletor não aparece. */
  canalFixo?: Channel
  editando?: CanalParaEditar
  daPlataforma?: boolean
}) {
  const [canal, setCanal] = useState<Channel>(editando?.canal ?? canalFixo ?? 'sms')
  const provedores = CANAL_PROVEDORES[canal]
  const [provedor, setProvedor] = useState(editando?.provedor ?? provedores[0] ?? 'generico')

  const listaDeProvedores = CANAL_PROVEDORES[canal]
  const provedorValido = listaDeProvedores.includes(provedor)
    ? provedor
    : (listaDeProvedores[0] ?? 'generico')
  const campos = CAMPOS_DO_PROVEDOR[provedorValido] ?? []
  const novo = !editando

  return (
    <form action={acao} className="space-y-5">
      {editando ? <input type="hidden" name="configId" value={editando.id} /> : null}
      <input type="hidden" name="canal" value={canal} />
      <input type="hidden" name="provedor" value={provedorValido} />

      {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
      {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {canalFixo || editando ? null : (
          <Campo rotulo="Canal" obrigatorio>
            <Selecao
              value={canal}
              onChange={(e) => {
                const novoCanal = e.target.value as Channel
                setCanal(novoCanal)
                setProvedor(CANAL_PROVEDORES[novoCanal][0] ?? 'generico')
              }}
            >
              {(Object.keys(CANAL_LABEL) as Channel[]).map((c) => (
                <option key={c} value={c}>
                  {CANAL_LABEL[c]}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}

        <Campo
          rotulo="Provedor"
          obrigatorio
          dica={
            editando
              ? 'Só troca com o canal parado: campanha em andamento quebraria no meio.'
              : undefined
          }
        >
          <Selecao value={provedorValido} onChange={(e) => setProvedor(e.target.value)}>
            {listaDeProvedores.map((p) => (
              <option key={p} value={p}>
                {PROVEDOR_LABEL[p] ?? p}
              </option>
            ))}
          </Selecao>
        </Campo>

        <Campo rotulo="Nome deste canal" dica="Como ele aparece na hora de escolher um disparo." obrigatorio>
          <Entrada
            name="rotulo"
            required
            defaultValue={editando?.rotulo ?? ''}
            placeholder={`${CANAL_LABEL[canal]} principal`}
          />
        </Campo>
      </div>

      <div className="rounded-[12px] border border-line bg-paper-alt/50 p-5">
        <Etiqueta className="mb-4 block">Credenciais</Etiqueta>
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          {campos.map((c) => (
            <CampoDoFormulario key={c.nome} campo={c} novo={novo} />
          ))}
        </div>

        {provedorValido === 'generico' ? (
          <div className="mt-5 border-t border-line pt-5">
            <Etiqueta className="mb-2 block">Marcadores disponíveis</Etiqueta>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 max-sm:grid-cols-1">
              {MARCADORES.map((m) => (
                <li key={m.chave} className="text-[.8rem] text-muted">
                  <code className="font-mono font-semibold text-blue">{m.chave}</code> — {m.explica}
                </li>
              ))}
            </ul>
            {EXEMPLO_GENERICO[canal] ? (
              <p className="mt-3 text-[.8rem] text-muted">
                Exemplo de corpo para {CANAL_LABEL[canal]}:{' '}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[.76rem] text-navy">
                  {EXEMPLO_GENERICO[canal]}
                </code>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-[.88rem] font-semibold text-navy">
          <input type="checkbox" name="ativo" defaultChecked={editando?.ativo ?? true} className="h-4 w-4" />
          Ativo
        </label>
        <label className="flex items-center gap-2 text-[.88rem] font-semibold text-navy">
          <input type="checkbox" name="padrao" defaultChecked={editando?.padrao ?? false} className="h-4 w-4" />
          Usar como padrão deste canal
        </label>
      </div>

      {daPlataforma ? (
        <Aviso tom="alerta">
          Este é um provedor <b>da plataforma</b>: todo cliente sem canal próprio deste tipo passa a
          enviar por ele. Uma credencial errada aqui derruba o disparo de todo mundo.
        </Aviso>
      ) : null}

      {provedorValido === 'evolution' ? (
        <Aviso tom="alerta" titulo="Sobre o WhatsApp não oficial">
          A Evolution roda sobre o protocolo do WhatsApp Web. Funciona bem e custa pouco, mas{' '}
          <b>o número pode ser banido — e um número banido raramente volta.</b> É por isso que cada
          chip tem teto diário e intervalo mínimo entre envios.
        </Aviso>
      ) : null}

      <Salvar novo={novo} />
    </form>
  )
}
