/**
 * Preferências de aparência da casca.
 *
 * Em módulo próprio, sem `'use client'`: tudo que um arquivo cliente exporta
 * vira referência de cliente quando o servidor importa, e o layout precisa do
 * texto do nome do cookie, não de uma referência.
 */

/** O cookie que guarda o menu recolhido. Escrito no navegador, lido no layout. */
export const COOKIE_MENU = 'nex_menu'

export const MENU_ENCOLHIDO = 'encolhido'
export const MENU_ABERTO = 'aberto'
