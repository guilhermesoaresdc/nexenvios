import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { comBancoDeSessao } from '@/db/sessao-conexao'
import { users } from '@/db/schema'
import { criarLog } from '@/lib/log'
import { registrarTentativa } from './limite'
import { gerarHash } from './senha'
import { consumirTokenDeSenha, emitirToken } from './tokens'
import { enviarEmailDeSenha } from './email'
import { MOTIVO_DO_LINK, TAMANHO_MINIMO_SENHA } from './regras'

const log = criarLog('recuperacao')
export type ResultadoRecuperacao = { ok?: string; erro?: string }
const ERRO_TEMPORARIO = 'Não foi possível concluir agora. Tente novamente em instantes.'
const PEDIDO_RECEBIDO = 'Se o e-mail estiver cadastrado e a conta estiver ativa, você receberá um link válido por uma hora. Confira também o spam.'
const pedido = z.object({ email: z.string().trim().toLowerCase().email('Informe um e-mail válido.') })
const novaSenha = z.object({
  token: z.string().min(1).max(200),
  senha: z.string().max(200).min(TAMANHO_MINIMO_SENHA, `Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`),
  confirmacao: z.string().max(200),
}).refine((v) => v.senha === v.confirmacao, { message: 'As duas senhas não são iguais.' })

export async function solicitarRecuperacao(form: FormData, ip: string): Promise<ResultadoRecuperacao> {
  const dados = pedido.safeParse({ email: form.get('email') })
  if (!dados.success) return { erro: dados.error.issues[0]!.message }
  try {
    const preparacao = await comBancoDeSessao(async (banco, conexao) => {
      if ((await registrarTentativa(`recuperar:${ip}`, conexao)).bloqueado)
        return { bloqueado: true as const }
      const [conta] = await banco.select({ id: users.id, ativo: users.active })
        .from(users).where(eq(users.email, dados.data.email)).limit(1)
      const token = conta?.ativo ? await emitirToken(conta.id, 'recuperacao', banco) : null
      return { bloqueado: false as const, token }
    }, 'recuperar')
    if (preparacao.bloqueado) return { erro: 'Pedidos demais. Espere alguns minutos.' }
    // Libera a conexão antes de aguardar o provedor. O fetch de e-mail tem seu próprio prazo.
    if (preparacao.token) await enviarEmailDeSenha(dados.data.email, preparacao.token, 'recuperacao')
    return { ok: PEDIDO_RECEBIDO }
  } catch (erro) {
    log.error('pedido interrompido', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { erro: ERRO_TEMPORARIO }
  }
}

export async function salvarNovaSenha(form: FormData, ip: string): Promise<ResultadoRecuperacao> {
  const dados = novaSenha.safeParse({
    token: form.get('token'), senha: form.get('senha'), confirmacao: form.get('confirmacao'),
  })
  if (!dados.success) return { erro: dados.error.issues[0]!.message }
  try {
    return await comBancoDeSessao(async (banco, conexao) => {
      if ((await registrarTentativa(`senha:${ip}`, conexao)).bloqueado)
        return { erro: 'Tentativas demais. Espere alguns minutos.' }
      const conferido = await consumirTokenDeSenha(dados.data.token, await gerarHash(dados.data.senha), banco)
      if (!conferido.ok) return { erro: MOTIVO_DO_LINK[conferido.motivo] }
      // A confirmação depende apenas da transação da senha. Não cria sessão
      // depois do commit nem espera o painel para dizer que a senha foi salva.
      return { ok: 'Senha alterada. Entre na sua conta usando a nova senha.' }
    }, 'definir-senha')
  } catch (erro) {
    log.error('troca interrompida', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { erro: ERRO_TEMPORARIO }
  }
}
