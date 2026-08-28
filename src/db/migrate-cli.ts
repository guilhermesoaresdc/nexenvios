import { migrar } from './migrate'

const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL
if (!url) {
  console.error('Defina DATABASE_URL (ou DATABASE_URL_ADMIN) antes de migrar.')
  process.exit(1)
}

const novas = await migrar(url)
if (novas.length === 0) console.log('Nada a aplicar — o banco já está em dia.')
else console.log(`Aplicadas: ${novas.join(', ')}`)
