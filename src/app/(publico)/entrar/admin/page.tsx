import { redirect } from 'next/navigation'

/** Mantém links antigos funcionando com a entrada única. */
export default function EntradaNex() {
  redirect('/entrar')
}
