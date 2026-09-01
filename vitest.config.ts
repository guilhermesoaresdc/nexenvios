import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    /*
     * Um arquivo de cada vez.
     *
     * Os testes de integração compartilham UM banco, e `bater()` do motor
     * trabalha na fila inteira, não na organização de quem chamou. Rodando em
     * paralelo, a batida de um arquivo reserva as linhas do outro e os dois
     * medem errado — foi exatamente o que aconteceu quando o teste do Monitor
     * passou a chamar `bater()`.
     *
     * Custa uns segundos. Um teste que falha por vizinhança custa mais: manda
     * procurar bug onde não tem.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/apoio/server-only.ts', import.meta.url)),
    },
  },
})
