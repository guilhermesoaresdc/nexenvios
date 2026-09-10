import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { comBancoDeSessao } from '@/db/sessao-conexao'
import { organizations, users } from '@/db/schema'
import { criarLog } from '@/lib/log'
import { limparTentativas, registrarTentativa } from './limite'
import { conferirSenha } from './senha'
import { criarSessao } from './sessao'

const log = criarLog('entrada')
const dadosDeEntrada = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.').max(200, 'A senha deve ter até 200 caracteres.'),
})

export const ERROS_ENTRADA = {
  dados: 'Confira o e-mail e a senha informados.',
  credenciais: 'E-mail ou senha não conferem.',
  limite: 'Tentativas demais. Espere alguns minutos antes de tentar de novo.',
  inativo: 'Esta conta está desativada. Fale com o administrador.',
  cancelado: 'Esta conta foi encerrada. Fale com o suporte da Nex Envios.',
  temporario: 'Não foi possível conectar agora. Tente novamente em instantes.',
} as const

type Falha = { ok: false; codigo: keyof typeof ERROS_ENTRADA; erro: string }
type Entrada = Falha | { ok: true; token: string; expiraEm: Date; destino: '/admin' | '/painel' }
function falha(codigo: Falha['codigo']): Falha {
  return { ok: false, codigo, erro: ERROS_ENTRADA[codigo] }
}

/** Todas as consultas do login pertencem à mesma conexão com prazo total. */
export async function autenticarEntrada(
  form: FormData,
  origem: { ip: string; agente: string },
): Promise<Entrada> {
  const dados = dadosDeEntrada.safeParse({ email: form.get('email'), senha: form.get('senha') })
  if (!dados.success) return { ...falha('dados'), erro: dados.error.issues[0]!.message }

  let etapa = 'limite de tentativas'
  const inicio = Date.now()
  function marcar(nome: string) {
    etapa = nome
    log.info('etapa iniciada', { etapa, duracaoMs: Date.now() - inicio })
  }
  try {
    return await comBancoDeSessao(async (banco, conexao): Promise<Entrada> => {
      marcar('limite de tentativas')
      const porIp = await registrarTentativa(`entrar:${origem.ip}`, conexao)
      const porConta = await registrarTentativa(`conta:${dados.data.email}`, conexao)
      if (porIp.bloqueado || porConta.bloqueado) return falha('limite')

      marcar('consulta da conta')
      const [conta] = await banco.select({
        id: users.id, hash: users.passwordHash, ativo: users.active,
        orgStatus: organizations.status, papel: users.role, plataforma: organizations.isPlatform,
      }).from(users)
        .innerJoin(organizations, eq(organizations.id, users.orgId))
        .where(eq(users.email, dados.data.email)).limit(1)

      marcar('verificação da senha')
      // Também calcula o hash quando a conta não existe, sem revelar o cadastro.
      const confere = await conferirSenha(dados.data.senha, conta?.hash ?? null)
      if (!conta || !confere) return falha('credenciais')
      if (!conta.ativo) return falha('inativo')
      if (conta.orgStatus === 'cancelado') return falha('cancelado')

      marcar('registro do acesso')
      await limparTentativas(`conta:${dados.data.email}`, conexao)
      await limparTentativas(`entrar:${origem.ip}`, conexao)
      await banco.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, conta.id))
      const { token, sessao } = await criarSessao(conta.id, {
        ip: origem.ip, userAgent: origem.agente,
      }, banco)
      return {
        ok: true, token,
        expiraEm: sessao.expiresAt,
        destino: conta.plataforma && ['superadmin', 'suporte'].includes(conta.papel) ? '/admin' : '/painel',
      }
    }, 'entrar')
  } catch (erro) {
    // Nunca registrar senha, e-mail, token ou parâmetros SQL.
    log.error('entrada interrompida', {
      etapa, duracaoMs: Date.now() - inicio,
      tipo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    return falha('temporario')
  }
}
