import 'server-only'
import { criarLog } from '@/lib/log'
import { linkDeSenha, type Proposito } from './tokens'

const log = criarLog('email')

/**
 * E-mail transacional (convite e recuperação de senha).
 *
 * Usa o Resend quando `RESEND_API_KEY` existe. Sem a variável, o link é
 * escrito no log do servidor e a operação segue: numa instalação nova, sem
 * domínio verificado, travar o convite por causa do e-mail seria pior — o
 * administrador copia o link do log e manda pelo canal que quiser.
 */

const ASSUNTO: Record<Proposito, string> = {
  convite: 'Seu acesso à Nex Envios',
  recuperacao: 'Recuperar a senha da Nex Envios',
}

function corpo(link: string, proposito: Proposito): string {
  const abertura =
    proposito === 'convite'
      ? 'Sua conta na Nex Envios foi criada. Defina uma senha para entrar:'
      : 'Recebemos um pedido para trocar a senha da sua conta. Se foi você, defina uma nova:'
  const validade = proposito === 'convite' ? 'Este link vale por 7 dias.' : 'Este link vale por 1 hora.'

  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0b1220">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #dbe3f5;border-radius:18px;padding:36px">
<tr><td>
<div style="font-size:22px;font-weight:700;color:#002058;letter-spacing:-.02em">Nex<span style="color:#00b0f8">Envios</span></div>
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#5c6b8a">${abertura}</p>
<p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#0078f8;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px">Definir minha senha</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#5c6b8a">${validade} Se o botão não abrir, copie e cole este endereço:<br><span style="color:#0078f8;word-break:break-all">${link}</span></p>
<hr style="border:none;border-top:1px solid #dbe3f5;margin:28px 0">
<p style="margin:0;font-size:12px;color:#7186b3">Se você não pediu isto, ignore esta mensagem — nada muda sem clicar no link.</p>
</td></tr></table></td></tr></table></body></html>`
}

export async function enviarEmailDeSenha(
  para: string,
  token: string,
  proposito: Proposito,
): Promise<{ enviado: boolean; link: string }> {
  const link = linkDeSenha(token)
  const chave = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_REMETENTE ?? 'Nex Envios <nao-responda@nexenvios.com.br>'

  if (!chave) {
    // O e-mail (dado pessoal) não vai para o log; o link, sim — ele é o que o
    // administrador precisa copiar, e sozinho não identifica ninguém.
    log.warn('sem RESEND_API_KEY: link gerado, e-mail não enviado', { proposito, link })
    return { enviado: false, link }
  }

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [para],
        subject: ASSUNTO[proposito],
        html: corpo(link, proposito),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resposta.ok) {
      log.error('o provedor de e-mail recusou', { status: resposta.status, proposito })
      return { enviado: false, link }
    }
    return { enviado: true, link }
  } catch (erro) {
    log.error('falha ao enviar e-mail', { motivo: erro instanceof Error ? erro.name : 'rede' })
    return { enviado: false, link }
  }
}
