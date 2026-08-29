import { migrar } from './migrate'

// Dentro de uma função pelo mesmo motivo do seed: o tsx transpila para CJS, e
// CJS não aceita `await` no nível do módulo.
async function main() {
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('Defina DATABASE_URL (ou DATABASE_URL_ADMIN) antes de migrar.')
  }

  const novas = await migrar(url)
  if (novas.length === 0) console.log('Nada a aplicar — o banco já está em dia.')
  else console.log(`Aplicadas: ${novas.join(', ')}`)
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  },
)
