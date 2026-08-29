import { semear } from './seed'

/**
 * Dentro de uma função, e não no topo do módulo.
 *
 * O tsx transpila estes scripts para CJS, e CJS não aceita `await` no nível do
 * módulo — o comando morria com "Top-level await is currently not supported"
 * antes de tocar no banco.
 */
async function main() {
  const resultado = await semear()

  if (resultado.criouUsuario) {
    console.log('\n  Nex Envios — primeiro acesso\n')
    console.log(`  E-mail: ${resultado.email}`)
    console.log(`  Senha:  ${resultado.senha}`)
    console.log('\n  Esta senha aparece UMA ÚNICA VEZ. Guarde agora.\n')
  } else {
    console.log(`O usuário ${resultado.email} já existe — nada foi alterado.`)
  }
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  },
)
