/**
 * Regras que a INTERFACE precisa conhecer.
 *
 * Separado de `senha.ts` porque aquele módulo importa `node:crypto`: um
 * componente de cliente que só quisesse o tamanho mínimo arrastaria o módulo
 * inteiro para o navegador, e o empacotador do Next recusa.
 */

/**
 * Dez caracteres, e não oito.
 *
 * Com scrypt no custo que usamos, o que protege contra tentativa em massa é o
 * comprimento — não a exigência de símbolo. Regra de "precisa ter maiúscula e
 * número" produz senha pior e mais anotada em papel.
 */
export const TAMANHO_MINIMO_SENHA = 10

export const MOTIVO_DO_LINK: Record<string, string> = {
  invalido: 'Este link não é válido. Peça um novo ao administrador.',
  expirado: 'Este link venceu. Peça um novo — eles duram pouco de propósito.',
  usado: 'Este link já foi usado. Se não foi você, avise o administrador agora.',
  inativo: 'Esta conta está desativada. Fale com o administrador.',
}

export const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000
export const VALIDADE_RECUPERACAO_MS = 60 * 60 * 1000
