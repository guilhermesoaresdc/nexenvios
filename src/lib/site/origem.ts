/**
 * O endereço público do produto, num lugar só.
 *
 * Estava repetido em cinco arquivos, cada um com o seu
 * `?? 'https://nexenvios.com.br'` — e os cinco apontavam para o host errado.
 *
 * O domínio está configurado com o www como canônico: o ápice responde 308
 * para `www.nexenvios.com.br` (conferido em produção, inclusive para
 * arquivos estáticos). Para um navegador isso é invisível, ele segue o
 * redirecionamento. Para o robô do WhatsApp que busca a `og:image`, não é:
 * ele costuma desistir no redirecionamento e a prévia sai sem imagem — que
 * foi exatamente o sintoma relatado.
 *
 * Por isso o ápice é corrigido para o www aqui, e não só na constante padrão:
 * `APP_URL` está definida em produção apontando para o ápice, e uma correção
 * que dependesse de alguém trocar a variável não teria consertado nada.
 * A correção é estreita de propósito — só este hostname, só quando vier sem
 * o www. Se um dia o domínio passar a servir o ápice direto, isto some.
 */

const PADRAO = 'https://www.nexenvios.com.br'

/** Hostname servido de verdade, para o que sai daqui não virar redirecionamento. */
export function canonizar(bruto: string): string {
  try {
    const url = new URL(bruto)
    if (url.hostname === 'nexenvios.com.br') url.hostname = 'www.nexenvios.com.br'
    return url.origin
  } catch {
    // APP_URL malformada não derruba a página: vale o padrão.
    return PADRAO
  }
}

/**
 * A origem para montar link absoluto: `https://www.nexenvios.com.br`, sem
 * barra no fim.
 */
export const ORIGEM: string = canonizar((process.env.APP_URL ?? PADRAO).trim() || PADRAO)
