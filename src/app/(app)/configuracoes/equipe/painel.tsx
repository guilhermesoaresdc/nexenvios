'use client'

import { useActionState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { PAPEL_LABEL, type UserRole } from '@/db/schema/enums'
import { alternarAtivo, convidar, mudarPapel, reenviarConvite } from '../acoes'
import { Aviso, Botao, Campo, Entrada, Etiqueta, Selecao } from '@/components/ui/base'

function Enviar({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" tamanho="sm" disabled={pending}>
      {pending ? '…' : texto}
    </Botao>
  )
}

export function Convidar() {
  const [estado, acao] = useActionState(convidar, undefined)

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro ? <Aviso tom="erro">{estado.erro}</Aviso> : null}
      {estado?.ok ? (
        <Aviso tom="ok" titulo={estado.ok}>
          {estado.link ? (
            <>
              <p className="mt-1 mb-2 text-[.84rem]">
                O link vale por 7 dias e só pode ser usado uma vez.
              </p>
              <code className="block truncate rounded-[8px] bg-white px-3 py-2 font-mono text-[.76rem] text-navy">
                {estado.link}
              </code>
            </>
          ) : null}
        </Aviso>
      ) : null}

      <Etiqueta>Convidar alguém</Etiqueta>
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Nome" className="min-w-[160px] flex-1">
          <Entrada name="nome" required placeholder="João Silva" />
        </Campo>
        <Campo rotulo="E-mail" className="min-w-[200px] flex-1">
          <Entrada name="email" type="email" required placeholder="joao@empresa.com.br" />
        </Campo>
        <Campo rotulo="Papel" className="min-w-[180px]">
          <Selecao name="papel" defaultValue="operador">
            <option value="admin">{PAPEL_LABEL.admin}</option>
            <option value="operador">{PAPEL_LABEL.operador}</option>
            <option value="visualizador">{PAPEL_LABEL.visualizador}</option>
          </Selecao>
        </Campo>
        <Enviar texto="Convidar" />
      </div>
      <p className="text-[.8rem] text-muted">
        A pessoa recebe um link para definir a própria senha. Nenhuma senha é criada aqui.
      </p>
    </form>
  )
}

export function LinhaDoUsuario({
  usuario,
  ultimoAdmin,
  modo,
}: {
  usuario: { id: string; papel: UserRole; ativo: boolean; temSenha: boolean; eu: boolean }
  ultimoAdmin: boolean
  modo: 'papel' | 'acoes'
}) {
  const [estadoPapel, acaoPapel] = useActionState(mudarPapel, undefined)
  const [estadoConvite, acaoConvite] = useActionState(reenviarConvite, undefined)
  const [ocupado, iniciar] = useTransition()

  const travado = usuario.eu || ultimoAdmin

  if (modo === 'papel') {
    if (travado) {
      return (
        <div>
          <span className="text-[.86rem] font-semibold text-navy">
            {PAPEL_LABEL[usuario.papel]}
          </span>
          <span className="block text-[.74rem] text-muted">
            {usuario.eu ? 'você não muda o próprio papel' : 'último administrador ativo'}
          </span>
        </div>
      )
    }

    return (
      <form action={acaoPapel} className="flex items-center gap-2">
        <input type="hidden" name="usuarioId" value={usuario.id} />
        <Selecao name="papel" defaultValue={usuario.papel} className="min-w-[170px] py-2 text-[.84rem]">
          <option value="admin">{PAPEL_LABEL.admin}</option>
          <option value="operador">{PAPEL_LABEL.operador}</option>
          <option value="visualizador">{PAPEL_LABEL.visualizador}</option>
        </Selecao>
        <Enviar texto="Trocar" />
        {estadoPapel?.erro ? (
          <span className="text-[.74rem] text-danger">{estadoPapel.erro}</span>
        ) : null}
      </form>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        {!usuario.temSenha ? (
          <form action={acaoConvite}>
            <input type="hidden" name="usuarioId" value={usuario.id} />
            <Botao type="submit" tom="fantasma" tamanho="sm">
              Reenviar convite
            </Botao>
          </form>
        ) : null}

        {travado ? null : (
          <Botao
            type="button"
            tom="fantasma"
            tamanho="sm"
            disabled={ocupado}
            onClick={() => {
              if (usuario.ativo && !confirm('Desativar? A pessoa perde o acesso agora mesmo.')) return
              iniciar(() => void alternarAtivo(usuario.id, !usuario.ativo))
            }}
          >
            {usuario.ativo ? 'Desativar' : 'Reativar'}
          </Botao>
        )}
      </div>

      {estadoConvite?.link ? (
        <code className="max-w-[280px] truncate rounded bg-paper-alt px-2 py-1 font-mono text-[.7rem] text-navy">
          {estadoConvite.link}
        </code>
      ) : null}
    </div>
  )
}
