'use client'

import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import {
  PAPEIS_DA_NEX,
  PAPEIS_DO_CLIENTE,
  PAPEL_EXPLICA,
  PAPEL_LABEL,
  type UserRole,
} from '@/db/schema/enums'
import { alternarAtivo, criarAcesso, definirSenha, mudarPapel, reenviarLink, remover } from './acoes'
import {
  Aviso,
  Botao,
  Campo,
  Chip,
  Entrada,
  Etiqueta,
  Pad,
  PadTitulo,
  Selecao,
} from '@/components/ui/base'
import { TAMANHO_MINIMO_SENHA } from '@/lib/auth/regras'

/**
 * Um segredo que aparece uma vez, com botão de copiar.
 *
 * Serve para senha e para link de acesso: os dois têm a mesma regra — quem
 * está na tela precisa levar embora agora, porque não volta.
 */
export function SegredoDeUmaVez({
  titulo,
  valor,
  explica,
  email,
}: {
  titulo: string
  valor: string
  explica: ReactNode
  email?: string
}) {
  const [copiado, setCopiado] = useState(false)

  return (
    <Aviso tom="alerta" titulo={titulo}>
      {email ? (
        <p className="mt-1 text-[.84rem]">
          Para <b>{email}</b>
        </p>
      ) : null}
      <p className="mt-1 mb-3 text-[.84rem]">{explica}</p>
      <code className="block break-all rounded-[8px] bg-white px-3 py-2 font-mono text-[.8rem] text-navy">
        {valor}
      </code>
      <Botao
        type="button"
        tamanho="sm"
        tom="contorno"
        className="mt-3"
        onClick={() =>
          navigator.clipboard?.writeText(valor).then(
            () => setCopiado(true),
            () => setCopiado(false),
          )
        }
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </Botao>
    </Aviso>
  )
}

function Enviar({ texto, bloco }: { texto: string; bloco?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tamanho="sm" bloco={bloco} disabled={pending}>
      {pending ? 'Salvando…' : texto}
    </Botao>
  )
}

export type Conta = { id: string; nome: string; plataforma: boolean }

/** Cria um acesso — em qualquer conta, com convite ou senha definida na hora. */
export function NovoAcesso({
  contas,
  contaFixa,
  papeis,
  podeConcederNex,
  titulo = 'Novo acesso',
}: {
  contas: Conta[]
  /** Quando a tela é de uma conta só, o seletor some. */
  contaFixa?: string
  papeis: UserRole[]
  podeConcederNex: boolean
  titulo?: string
}) {
  const [estado, acao] = useActionState(criarAcesso, undefined)
  const [modo, setModo] = useState<'convite' | 'senha'>('senha')
  const [papel, setPapel] = useState<UserRole>(papeis[0] ?? 'operador')

  const bloqueado = PAPEIS_DA_NEX.includes(papel) && !podeConcederNex

  return (
    <Pad className="self-start lg:sticky lg:top-6">
      <PadTitulo titulo={titulo} />
      <form action={acao} className="space-y-4 p-6">
        {contaFixa ? <input type="hidden" name="orgId" value={contaFixa} /> : null}
        <input type="hidden" name="acesso" value={modo} />

        {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
        {estado?.senha ? (
          <SegredoDeUmaVez
            titulo="Acesso criado — copie a senha"
            valor={estado.senha}
            email={estado.email}
            explica="Ela não aparece de novo. Entregue à pessoa e peça para trocar no primeiro acesso."
          />
        ) : estado?.link ? (
          <SegredoDeUmaVez
            titulo={estado.ok ?? 'Link de acesso'}
            valor={estado.link}
            email={estado.email}
            explica="Vale por 7 dias e só pode ser usado uma vez."
          />
        ) : estado?.ok ? (
          <Aviso tom="ok">{estado.ok}</Aviso>
        ) : null}

        {contaFixa ? null : (
          <Campo rotulo="Conta" obrigatorio>
            <Selecao name="orgId" required defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.plataforma ? `${c.nome} (time Nex)` : c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}

        <Campo rotulo="Nome" obrigatorio>
          <Entrada name="nome" required placeholder="Renata Alves" />
        </Campo>

        <Campo rotulo="E-mail" dica="É com ele que a pessoa entra." obrigatorio>
          <Entrada name="email" type="email" required placeholder="renata@empresa.com.br" />
        </Campo>

        <Campo rotulo="Papel" dica={PAPEL_EXPLICA[papel]} obrigatorio>
          <Selecao name="papel" value={papel} onChange={(e) => setPapel(e.target.value as UserRole)}>
            {papeis.map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]}
              </option>
            ))}
          </Selecao>
        </Campo>

        {bloqueado ? (
          <Aviso tom="erro">Só um Administrador Nex concede papel do time Nex.</Aviso>
        ) : null}

        <div>
          <Etiqueta className="mb-2 block">Como a pessoa entra</Etiqueta>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModo('senha')}
              className={`flex-1 rounded-[12px] border-2 px-3 py-2.5 text-left text-[.84rem] font-semibold transition-colors ${
                modo === 'senha' ? 'border-blue bg-blue/6 text-blue' : 'border-line text-muted'
              }`}
            >
              Definir a senha agora
              <span className="block text-[.74rem] font-normal">você entrega por fora</span>
            </button>
            <button
              type="button"
              onClick={() => setModo('convite')}
              className={`flex-1 rounded-[12px] border-2 px-3 py-2.5 text-left text-[.84rem] font-semibold transition-colors ${
                modo === 'convite' ? 'border-blue bg-blue/6 text-blue' : 'border-line text-muted'
              }`}
            >
              Mandar convite
              <span className="block text-[.74rem] font-normal">a pessoa escolhe a senha</span>
            </button>
          </div>
        </div>

        {modo === 'senha' ? (
          <Campo
            rotulo="Senha"
            dica={`Deixe em branco para gerar uma forte. Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.`}
          >
            <Entrada name="senha" type="text" autoComplete="off" placeholder="gerar automaticamente" />
          </Campo>
        ) : (
          <p className="text-[.8rem] leading-relaxed text-muted">
            Se o e-mail não sair — domínio ainda não verificado, caixa de spam — o link aparece aqui
            para você copiar.
          </p>
        )}

        <Enviar texto="Criar acesso" bloco />
      </form>
    </Pad>
  )
}

export type LinhaDeAcesso = {
  id: string
  nome: string
  email: string
  papel: UserRole
  ativo: boolean
  temSenha: boolean
  convitePendente: boolean
  cliente: string
  daPlataforma: boolean
  eu: boolean
}

/**
 * As ações de uma linha: senha, link, papel, ativar e remover.
 *
 * Ficam atrás de um botão só. São cinco ações e a coluna é estreita nos dois
 * lugares onde a tabela aparece — deixá-las sempre à mostra empilhava cinco
 * linhas de botão por pessoa e a tabela deixava de ser legível.
 */
export function AcoesDoUsuario({
  usuario,
  podeConcederNex,
}: {
  usuario: LinhaDeAcesso
  podeConcederNex: boolean
}) {
  const [menu, setMenu] = useState(false)
  const [aberto, setAberto] = useState<'nada' | 'senha' | 'papel'>('nada')
  const [estadoSenha, acaoSenha] = useActionState(definirSenha, undefined)
  const [estadoLink, acaoLink] = useActionState(reenviarLink, undefined)
  const [estadoPapel, acaoPapel] = useActionState(mudarPapel, undefined)
  const [ocupado, iniciar] = useTransition()
  const [aviso, setAviso] = useState<string | null>(null)

  const papeis = usuario.daPlataforma ? PAPEIS_DA_NEX : PAPEIS_DO_CLIENTE

  // Quem não pode mexer não vê botão desabilitado: vê o motivo, que é a
  // informação que ele realmente precisa.
  const motivo = usuario.eu
    ? 'seu próprio acesso'
    : usuario.daPlataforma && !podeConcederNex
      ? 'só Administrador Nex'
      : null

  if (motivo) {
    return <span className="block text-right text-[.8rem] whitespace-nowrap text-muted">{motivo}</span>
  }

  function fechar() {
    setMenu(false)
    setAberto('nada')
  }

  return (
    <div className="space-y-2">
      {menu ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            onClick={() => setAberto(aberto === 'senha' ? 'nada' : 'senha')}
          >
            Definir senha
          </Botao>

          <form action={acaoLink}>
            <input type="hidden" name="usuarioId" value={usuario.id} />
            <Botao type="submit" tom="fantasma" tamanho="sm">
              {usuario.temSenha ? 'Mandar link' : 'Reenviar convite'}
            </Botao>
          </form>

          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            onClick={() => setAberto(aberto === 'papel' ? 'nada' : 'papel')}
          >
            Trocar papel
          </Botao>

          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            disabled={ocupado}
            onClick={() => {
              if (usuario.ativo && !confirm(`Desativar ${usuario.nome}? O acesso cai agora mesmo.`)) return
              iniciar(async () => {
                const r = await alternarAtivo(usuario.id, !usuario.ativo)
                setAviso(r?.erro ?? null)
              })
            }}
          >
            {usuario.ativo ? 'Desativar' : 'Reativar'}
          </Botao>

          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            disabled={ocupado}
            onClick={() => {
              if (!confirm(`Remover ${usuario.nome} de vez? Não tem volta.`)) return
              iniciar(async () => {
                const r = await remover(usuario.id)
                setAviso(r?.erro ?? null)
              })
            }}
          >
            Remover
          </Botao>

          <Botao type="button" tom="fantasma" tamanho="sm" onClick={fechar}>
            Fechar
          </Botao>
        </div>
      ) : (
        <div className="flex justify-end">
          <Botao type="button" tom="contorno" tamanho="sm" onClick={() => setMenu(true)}>
            Gerenciar
          </Botao>
        </div>
      )}

      {aviso ? <Aviso tom="erro">{aviso}</Aviso> : null}
      {estadoLink?.erro ? <Aviso tom="erro">{estadoLink.erro}</Aviso> : null}
      {estadoLink?.link ? (
        <SegredoDeUmaVez
          titulo={estadoLink.ok ?? 'Link de acesso'}
          valor={estadoLink.link}
          email={estadoLink.email}
          explica="Vale por 7 dias e só pode ser usado uma vez."
        />
      ) : null}

      {aberto === 'senha' ? (
        <form action={acaoSenha} className="rounded-[10px] bg-paper-alt p-3 text-left">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          {estadoSenha?.erro ? <Aviso tom="erro" className="mb-2">{estadoSenha.erro}</Aviso> : null}
          {estadoSenha?.senha ? (
            <SegredoDeUmaVez
              titulo="Senha definida"
              valor={estadoSenha.senha}
              email={estadoSenha.email}
              explica="Todas as sessões da pessoa foram encerradas. Entregue a senha e peça para trocar."
            />
          ) : (
            <>
              <Campo rotulo="Nova senha" dica="Em branco, geramos uma forte.">
                <Entrada name="senha" type="text" autoComplete="off" placeholder="gerar automaticamente" />
              </Campo>
              <div className="mt-2 flex gap-2">
                <Enviar texto="Definir" />
                <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => setAberto('nada')}>
                  Cancelar
                </Botao>
              </div>
            </>
          )}
        </form>
      ) : null}

      {aberto === 'papel' ? (
        <form action={acaoPapel} className="rounded-[10px] bg-paper-alt p-3 text-left">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          {estadoPapel?.erro ? <Aviso tom="erro" className="mb-2">{estadoPapel.erro}</Aviso> : null}
          {estadoPapel?.ok ? <Aviso tom="ok" className="mb-2">{estadoPapel.ok}</Aviso> : null}
          <Campo rotulo="Papel">
            <Selecao name="papel" defaultValue={usuario.papel}>
              {papeis.map((p) => (
                <option key={p} value={p}>
                  {PAPEL_LABEL[p]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <div className="mt-2 flex gap-2">
            <Enviar texto="Trocar" />
            <Botao type="button" tom="fantasma" tamanho="sm" onClick={() => setAberto('nada')}>
              Cancelar
            </Botao>
          </div>
        </form>
      ) : null}
    </div>
  )
}

/** O selo de estado do acesso, que é o que se procura na tabela. */
export function EstadoDoAcesso({ usuario }: { usuario: LinhaDeAcesso }) {
  if (!usuario.ativo) return <Chip tom="neutro">Desativado</Chip>
  if (!usuario.temSenha && usuario.convitePendente) return <Chip tom="ambar">Convite pendente</Chip>
  if (!usuario.temSenha) return <Chip tom="vermelho">Sem acesso</Chip>
  return <Chip tom="verde">Ativo</Chip>
}
