import { redirect } from 'next/navigation'

/** Compatibilidade com links e versões antigas da landing page. */
export default function LoginAntigo() {
  redirect('/entrar')
}
