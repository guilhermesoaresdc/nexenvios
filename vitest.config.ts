import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // O que fala com banco ou rede não roda aqui — estes testes exercitam a
    // aritmética e as regras puras, que são onde os erros silenciosos moram.
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/apoio/server-only.ts', import.meta.url)),
    },
  },
})
