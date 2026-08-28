import { semear } from './seed'

const resultado = await semear()

if (resultado.criouUsuario) {
  console.log('\n  Nex Envios — primeiro acesso\n')
  console.log(`  E-mail: ${resultado.email}`)
  console.log(`  Senha:  ${resultado.senha}`)
  console.log('\n  Esta senha aparece UMA ÚNICA VEZ. Guarde agora.\n')
} else {
  console.log(`O usuário ${resultado.email} já existe — nada foi alterado.`)
}

process.exit(0)
