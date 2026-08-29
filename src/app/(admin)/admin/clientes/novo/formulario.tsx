'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { criarCliente } from '../acoes'
import { Aviso, Botao, Campo, Entrada, Pad, PadTitulo, Selecao } from '@/components/ui/base'
import { apelido as gerarApelido } from '@/lib/ui'

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tamanho="lg" disabled={pending}>
      {pending ? 'Criando…' : 'Criar cliente'}
    </Botao>
  )
}

export function Formulario() {
  const [estado, acao] = useActionState(criarCliente, undefined)
  // O apelido é derivado do nome enquanto ninguém mexer nele; a partir do
  // primeiro toque, quem manda é a pessoa.
  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [tocouApelido, setTocouApelido] = useState(false)

  return (
    <form action={acao} className="grid grid-cols-[1.4fr_1fr] gap-6 max-lg:grid-cols-1">
      <div className="space-y-5">
        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}

        <Pad>
          <PadTitulo titulo="A empresa" />
          <div className="grid grid-cols-2 gap-4 p-6 max-sm:grid-cols-1">
            <Campo rotulo="Nome da empresa" obrigatorio className="col-span-2 max-sm:col-span-1">
              <Entrada
                name="nome"
                required
                autoFocus
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                  if (!tocouApelido) setApelido(gerarApelido(e.target.value))
                }}
                placeholder="Corban Prime Promotora"
              />
            </Campo>

            <Campo rotulo="Apelido" dica="Identificador curto, sem espaço nem acento." obrigatorio>
              <Entrada
                name="apelido"
                required
                value={apelido}
                onChange={(e) => {
                  setTocouApelido(true)
                  setApelido(gerarApelido(e.target.value))
                }}
                placeholder="corban-prime"
              />
            </Campo>

            <Campo rotulo="CNPJ ou CPF">
              <Entrada name="documento" placeholder="12.345.678/0001-90" />
            </Campo>

            <Campo rotulo="Fuso horário" dica="Define a janela de silêncio dos disparos.">
              <Selecao name="fuso" defaultValue="America/Sao_Paulo">
                <option value="America/Sao_Paulo">Brasília (São Paulo)</option>
                <option value="America/Manaus">Manaus</option>
                <option value="America/Belem">Belém</option>
                <option value="America/Fortaleza">Fortaleza</option>
                <option value="America/Recife">Recife</option>
                <option value="America/Cuiaba">Cuiabá</option>
                <option value="America/Rio_Branco">Rio Branco</option>
              </Selecao>
            </Campo>

            <Campo rotulo="Limite de confiança" dica="Quanto o saldo pode furar antes de barrar o disparo.">
              <Entrada name="limite" type="number" min={0} step="0.01" defaultValue="0" />
            </Campo>
          </div>
        </Pad>

        <Pad>
          <PadTitulo
            titulo="Quem administra a conta"
            descricao="Recebe um link para definir a própria senha. Nenhuma senha é criada por aqui."
          />
          <div className="grid grid-cols-2 gap-4 p-6 max-sm:grid-cols-1">
            <Campo rotulo="Nome" obrigatorio>
              <Entrada name="adminNome" required placeholder="Renata Alves" />
            </Campo>
            <Campo rotulo="E-mail" obrigatorio>
              <Entrada name="adminEmail" type="email" required placeholder="renata@empresa.com.br" />
            </Campo>
          </div>
        </Pad>

        <Pad>
          <PadTitulo titulo="Contato comercial" descricao="Opcional. Serve para o time achar quem chamar." />
          <div className="grid grid-cols-3 gap-4 p-6 max-sm:grid-cols-1">
            <Campo rotulo="Nome">
              <Entrada name="contatoNome" placeholder="Renata Alves" />
            </Campo>
            <Campo rotulo="E-mail">
              <Entrada name="contatoEmail" type="email" placeholder="financeiro@empresa.com.br" />
            </Campo>
            <Campo rotulo="Telefone">
              <Entrada name="contatoTelefone" placeholder="(11) 98888-7777" />
            </Campo>
          </div>
        </Pad>
      </div>

      <div className="space-y-5">
        <Pad className="lg:sticky lg:top-6">
          <PadTitulo titulo="Crédito inicial" />
          <div className="space-y-4 p-6">
            <Campo rotulo="Valor em créditos" dica="1 crédito = R$ 1,00. Vira um lançamento no extrato do cliente.">
              <Entrada name="creditoInicial" type="number" min={0} step="0.01" defaultValue="0" />
            </Campo>

            <Aviso tom="info">
              O saldo do cliente só muda por lançamento no extrato — nunca direto. É isso que faz o
              extrato bater com o saldo.
            </Aviso>

            <Enviar />
          </div>
        </Pad>
      </div>
    </form>
  )
}
