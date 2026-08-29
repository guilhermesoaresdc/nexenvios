'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { salvarConta } from './acoes'
import { Aviso, Botao, Campo, Entrada, Pad, PadTitulo, Selecao } from '@/components/ui/base'

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </Botao>
  )
}

export function FormularioDaConta({
  conta,
}: {
  conta: {
    nome: string
    documento: string | null
    contatoNome: string | null
    contatoEmail: string | null
    contatoTelefone: string | null
    fuso: string
  }
}) {
  const [estado, acao] = useActionState(salvarConta, undefined)

  return (
    <Pad>
      <PadTitulo titulo="Dados da conta" />
      <form action={acao} className="space-y-4 p-6">
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.ok ? <Aviso tom="ok">{estado.ok}</Aviso> : null}

        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <Campo rotulo="Nome da empresa" obrigatorio className="col-span-2 max-sm:col-span-1">
            <Entrada name="nome" defaultValue={conta.nome} required />
          </Campo>
          <Campo rotulo="CNPJ ou CPF">
            <Entrada name="documento" defaultValue={conta.documento ?? ''} />
          </Campo>
          <Campo
            rotulo="Fuso horário"
            dica="Define a janela de silêncio: nenhum disparo sai de madrugada."
          >
            <Selecao name="fuso" defaultValue={conta.fuso}>
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
            <Entrada name="contatoNome" defaultValue={conta.contatoNome ?? ''} />
          </Campo>
          <Campo rotulo="Contato — e-mail">
            <Entrada name="contatoEmail" type="email" defaultValue={conta.contatoEmail ?? ''} />
          </Campo>
          <Campo rotulo="Contato — telefone">
            <Entrada name="contatoTelefone" defaultValue={conta.contatoTelefone ?? ''} />
          </Campo>
        </div>

        <Salvar />
      </form>
    </Pad>
  )
}
