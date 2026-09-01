/**
 * Quem pediu para sair.
 *
 * Mora num arquivo só porque há dois caminhos de resposta — o webhook dos
 * provedores diretos e o polling do Monitor de Envios — e uma lista que
 * divergisse entre eles significaria continuar mandando para quem pediu
 * para parar por um deles.
 *
 * Não é preferência de produto: em campanha eleitoral, mensagem para quem já
 * pediu descadastramento custa R$ 100 por mensagem ao responsável.
 */

/** As palavras que valem em qualquer canal. */
export const PEDIDOS_DE_SAIDA = [
  'pare',
  'sair',
  'stop',
  'descadastrar',
  'remover',
  'cancelar',
] as const

/**
 * O "2" do Monitor de Envios.
 *
 * A frase que ELES colam na campanha política manda responder "2". Só vale
 * onde essa frase foi mesmo enviada: num canal comum, alguém respondendo "2"
 * a uma pergunta de duas opções seria descadastrado sem ter pedido nada.
 */
const NUMERO_DO_MONITOR = '2'

export function limparResposta(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

export function pediuParaSair(
  texto: string,
  opcoes: { aceitaNumero2?: boolean } = {},
): boolean {
  const limpo = limparResposta(texto)
  if ((PEDIDOS_DE_SAIDA as readonly string[]).includes(limpo)) return true
  return Boolean(opcoes.aceitaNumero2) && limpo === NUMERO_DO_MONITOR
}
