'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { ClienteDetalhado } from '@/db/queries/admin'
import { convidarUsuario, lancarCredito, mudarStatus, salvarCliente } from '../acoes'
import {
  Aviso,
  Botao,
  Campo,
  Entrada,
  Pad,
  PadTitulo,
  Selecao,
} from '@/components/ui/base'
import { moeda } from '@/lib/ui'

function Salvar({ texto = 'Salvar', tom }: { texto?: string; tom?: 'primario' | 'perigo' }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tom={tom} disabled={pending}>
      {pending ? 'Salvando…' : texto}
    </Botao>
  )
}

/** O cadastro editável do cliente. */
export function Cadastro({ cliente }: { cliente: ClienteDetalhado }) {
  const [estado, acao] = useActionState(salvarCliente, undefined)

  return (
    <Pad>
      <PadTitulo titulo="Cadastro" />
      <form action={acao} className="space-y-4 p-6">
        <input type="hidden" name="orgId" value={cliente.id} />
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <Campo rotulo="Nome da empresa" obrigatorio>
            <Entrada name="nome" defaultValue={cliente.nome} required />
          </Campo>
          <Campo rotulo="Apelido" obrigatorio>
            <Entrada name="apelido" defaultValue={cliente.apelido} required />
          </Campo>
          <Campo rotulo="CNPJ ou CPF">
            <Entrada name="documento" defaultValue={cliente.documento ?? ''} />
          </Campo>
          <Campo rotulo="Fuso horário" dica="Define a janela de silêncio dos disparos.">
            <Selecao name="fuso" defaultValue={cliente.fuso}>
              <option value="America/Sao_Paulo">Brasília (São Paulo)</option>
              <option value="America/Manaus">Manaus</option>
              <option value="America/Belem">Belém</option>
              <option value="America/Fortaleza">Fortaleza</option>
              <option value="America/Recife">Recife</option>
              <option value="America/Cuiaba">Cuiabá</option>
              <option value="America/Rio_Branco">Rio Branco</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Contato — nome">
            <Entrada name="contatoNome" defaultValue={cliente.contatoNome ?? ''} />
          </Campo>
          <Campo rotulo="Contato — e-mail">
            <Entrada name="contatoEmail" type="email" defaultValue={cliente.contato ?? ''} />
          </Campo>
          <Campo rotulo="Contato — telefone">
            <Entrada name="contatoTelefone" defaultValue={cliente.contatoTelefone ?? ''} />
          </Campo>
          <Campo
            rotulo="Limite de confiança"
            dica="Quanto o saldo pode furar antes de o disparo ser barrado."
          >
            <Entrada name="limite" type="number" min={0} step="0.01" defaultValue={cliente.limite} />
          </Campo>
        </div>

        <Salvar />
      </form>
    </Pad>
  )
}

/** Recarga e ajuste de crédito. */
export function Credito({ orgId, saldo }: { orgId: string; saldo: string }) {
  const [estado, acao] = useActionState(lancarCredito, undefined)
  const [valor, setValor] = useState('')

  const depois = Number(saldo) + (Number(valor) || 0)

  return (
    <Pad>
      <PadTitulo titulo="Lançar crédito" descricao="Positivo credita, negativo debita." />
      <form action={acao} className="space-y-4 p-6">
        <input type="hidden" name="orgId" value={orgId} />
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

        <Campo rotulo="Valor em créditos" obrigatorio>
          <Entrada
            name="valor"
            type="number"
            step="0.01"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="500,00"
          />
        </Campo>

        <Campo rotulo="Descrição" dica="Aparece no extrato do cliente.">
          <Entrada name="descricao" placeholder="Recarga referente a março" />
        </Campo>

        {valor && Number(valor) !== 0 ? (
          <div className="rounded-[12px] bg-paper-alt px-4 py-3 text-[.86rem]">
            <span className="text-muted">Saldo depois: </span>
            <b className={`tabular font-semibold ${depois < 0 ? 'text-danger' : 'text-navy'}`}>
              {moeda(depois)}
            </b>
          </div>
        ) : null}

        <Salvar texto="Lançar" />
      </form>
    </Pad>
  )
}

/** Ativar, suspender ou cancelar a conta. */
export function Status({ orgId, status }: { orgId: string; status: string }) {
  const [estado, acao] = useActionState(mudarStatus, undefined)

  return (
    <Pad>
      <PadTitulo titulo="Status da conta" />
      <form action={acao} className="space-y-4 p-6">
        <input type="hidden" name="orgId" value={orgId} />
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

        <Campo rotulo="Status">
          <Selecao name="status" defaultValue={status}>
            <option value="ativo">Ativo — opera normalmente</option>
            <option value="suspenso">Suspenso — não cria disparo novo</option>
            <option value="cancelado">Cancelado — perde o acesso</option>
          </Selecao>
        </Campo>

        <Aviso tom="alerta">
          Suspender barra a criação de disparos novos, mas o que já está na fila continua saindo.
          Cancelar derruba as sessões abertas na hora.
        </Aviso>

        <Salvar texto="Aplicar" />
      </form>
    </Pad>
  )
}

/** O link do convite, para copiar quando o e-mail não sair. */
export function Convite({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <Aviso tom="ok" titulo="Cliente criado. Este é o link de acesso do administrador.">
      <p className="mt-1 mb-3">
        Ele vale por 7 dias e só pode ser usado uma vez. Se o e-mail não chegar, mande este link.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[8px] bg-white px-3 py-2 font-mono text-[.78rem] text-navy">
          {link}
        </code>
        <Botao
          type="button"
          tamanho="sm"
          tom="contorno"
          onClick={() => {
            navigator.clipboard?.writeText(link).then(
              () => setCopiado(true),
              () => setCopiado(false),
            )
          }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </Botao>
      </div>
    </Aviso>
  )
}

/** Convidar mais alguém para a conta do cliente. */
Convite.Formulario = function FormularioDeConvite({ orgId }: { orgId: string }) {
  const [estado, acao] = useActionState(convidarUsuario, undefined)

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
      {estado?.ok ? (
        <Aviso tom="ok" titulo={estado.ok}>
          {estado.link ? (
            <code className="mt-2 block truncate rounded-[8px] bg-white px-3 py-2 font-mono text-[.76rem] text-navy">
              {estado.link}
            </code>
          ) : null}
        </Aviso>
      ) : null}

      <p className="text-[.82rem] font-semibold text-navy">Convidar mais alguém</p>
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Nome" className="min-w-[160px] flex-1">
          <Entrada name="nome" required placeholder="João Silva" />
        </Campo>
        <Campo rotulo="E-mail" className="min-w-[200px] flex-1">
          <Entrada name="email" type="email" required placeholder="joao@empresa.com.br" />
        </Campo>
        <Campo rotulo="Papel" className="min-w-[150px]">
          <Selecao name="papel" defaultValue="operador">
            <option value="admin">Administrador da conta</option>
            <option value="operador">Operador</option>
            <option value="visualizador">Visualizador</option>
          </Selecao>
        </Campo>
        <Salvar texto="Convidar" />
      </div>
    </form>
  )
}
