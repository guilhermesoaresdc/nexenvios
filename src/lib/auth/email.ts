import 'server-only'
import { criarLog } from '@/lib/log'
import { linkDeSenha, type Proposito } from './tokens'

const log = criarLog('email')

/**
 * E-mail transacional (convite e recuperação de senha).
 *
 * Usa o Resend quando `RESEND_API_KEY` existe. Sem a variável, o administrador
 * recebe o link na tela autenticada de gestão de acessos. Tokens nunca vão
 * para logs; a recuperação pública mantém a resposta genérica.
 */

const ASSUNTO: Record<Proposito, string> = {
  convite: 'Seu acesso à Nex Envios está pronto',
  recuperacao: 'Redefina sua senha da Nex Envios',
}

const CONTEUDO: Record<
  Proposito,
  { preheader: string; titulo: string; descricao: string; acao: string; validade: string }
> = {
  convite: {
    preheader: 'Crie sua senha e acesse sua conta na Nex Envios.',
    titulo: 'Seu acesso está pronto',
    descricao:
      'Sua conta na Nex Envios foi criada. Falta apenas definir sua senha para acessar o painel.',
    acao: 'Criar minha senha',
    validade: 'Este link é válido por 7 dias.',
  },
  recuperacao: {
    preheader: 'Use este link seguro para redefinir sua senha.',
    titulo: 'Redefina sua senha',
    descricao:
      'Recebemos uma solicitação para alterar a senha da sua conta. Use o botão abaixo para escolher uma nova senha.',
    acao: 'Redefinir minha senha',
    validade: 'Este link é válido por 1 hora e pode ser usado uma única vez.',
  },
}

function corpo(link: string, proposito: Proposito): string {
  const texto = CONTEUDO[proposito]

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ASSUNTO[proposito]}</title></head>
<body style="margin:0;padding:0;background:#f3f7fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0b1f44">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${texto.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f7fd">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 8px 22px;text-align:center">
<span style="font-size:25px;line-height:1;font-weight:800;letter-spacing:-.7px;color:#002058">Nex</span><span style="font-size:25px;line-height:1;font-weight:800;letter-spacing:-.7px;color:#009df0">Envios</span>
</td></tr>
<tr><td style="overflow:hidden;border:1px solid #dce7f7;border-radius:22px;background:#ffffff;box-shadow:0 12px 32px rgba(0,32,88,.08)">
<div style="height:6px;background:#0078f8"></div>
<div style="padding:42px 40px 38px">
<div style="display:inline-block;margin-bottom:22px;border-radius:999px;background:#eaf5ff;padding:8px 13px;color:#0068d8;font-size:12px;font-weight:700;letter-spacing:.35px;text-transform:uppercase">Acesso seguro</div>
<h1 style="margin:0;color:#002058;font-size:29px;line-height:1.2;letter-spacing:-.6px">${texto.titulo}</h1>
<p style="margin:16px 0 0;color:#566784;font-size:16px;line-height:1.65">${texto.descricao}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 26px"><tr><td style="border-radius:999px;background:#0078f8">
<a href="${link}" style="display:inline-block;padding:15px 27px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${texto.acao}</a>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-radius:13px;background:#f5f8fd"><tr><td style="padding:15px 17px;color:#566784;font-size:13px;line-height:1.55">
<strong style="color:#243c67">Prazo de segurança:</strong> ${texto.validade}
</td></tr></table>
<p style="margin:24px 0 7px;color:#71809b;font-size:12px;line-height:1.55">Se o botão não abrir, copie e cole este endereço no navegador:</p>
<p style="margin:0;word-break:break-all;color:#0078f8;font-size:12px;line-height:1.55"><a href="${link}" style="color:#0078f8;text-decoration:none">${link}</a></p>
<div style="margin:28px 0 24px;border-top:1px solid #e3eaf5"></div>
<p style="margin:0;color:#71809b;font-size:12px;line-height:1.6">Não reconhece esta solicitação? Ignore este e-mail. Sua senha continuará a mesma.</p>
</div>
</td></tr>
<tr><td style="padding:22px 16px 0;text-align:center;color:#8b9ab3;font-size:11px;line-height:1.6">Nex Envios · Sua comunicação em movimento.<br>Este é um e-mail automático sobre o acesso à sua conta.</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function corpoTexto(link: string, proposito: Proposito): string {
  const texto = CONTEUDO[proposito]
  return `Nex Envios\n\n${texto.titulo}\n\n${texto.descricao}\n\n${texto.acao}: ${link}\n\n${texto.validade}\n\nNão reconhece esta solicitação? Ignore este e-mail. Sua senha continuará a mesma.`
}

export async function enviarEmailDeSenha(
  para: string,
  token: string,
  proposito: Proposito,
): Promise<{ enviado: boolean; link: string }> {
  const link = linkDeSenha(token)
  const chave = process.env.RESEND_API_KEY
  const remetente =
    process.env.EMAIL_REMETENTE ?? 'Nex Envios <nao-responda@email.nexenvios.com.br>'

  if (!chave) {
    // O link permite trocar a senha: nunca registrar tokens nos logs.
    log.warn('sem RESEND_API_KEY: e-mail não enviado', { proposito })
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
        text: corpoTexto(link, proposito),
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
