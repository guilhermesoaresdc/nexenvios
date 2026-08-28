/**
 * O pacote `server-only` existe para o empacotador do Next recusar um import
 * indevido a partir do navegador. No Vitest não há navegador — sem este apelido
 * ele derruba qualquer teste de módulo do servidor com "cannot be imported from
 * a Client Component".
 */
export {}
