import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/auth/atual'
import { Titulo } from '@/components/shell/casca'
import { Aviso, BotaoLink } from '@/components/ui/base'
import { Testador } from './testador'

export const metadata: Metadata = { title: 'Nome de perfil' }

/**
 * A régua do nome de perfil, num lugar só.
 *
 * Existe porque a reprovação não acontece na criação do disparo: acontece no
 * meio dele. A campanha trava, e para voltar a rodar é preciso cadastrar outro
 * perfil e esperar nova aprovação — o envio fica parado esse tempo todo.
 */
export default async function NomeDePerfil() {
  await exigirUsuario()

  return (
    <>
      <Titulo
        titulo="Nome de perfil"
        descricao="É o nome que aparece para quem recebe a mensagem — e a Meta analisa ele. Use o nome comercial da empresa: o mesmo da fachada, do site ou da nota fiscal."
        acao={
          <BotaoLink href="/canais" tom="contorno">
            Voltar aos canais
          </BotaoLink>
        }
      />

      <Aviso tom="alerta" titulo="Por que a gente aperta nisso" className="mb-6">
        Quando a Meta reprova o nome, a campanha <b>trava no meio do disparo</b>. Para voltar a
        rodar é preciso cadastrar um novo perfil e esperar a aprovação — e o envio fica parado esse
        tempo todo. Dependendo da hora em que trava, a campanha não termina no mesmo dia.
      </Aviso>

      <Testador />

      <Aviso tom="info" className="mt-6">
        Se o seu nome foi recusado: troque pelo nome comercial da empresa — marca, não descrição
        (&quot;Ganhe Mais Crédito&quot; vira &quot;Crediluz&quot;). Tire promessa, prêmio,
        &quot;pix&quot;, &quot;bet&quot;, &quot;oficial&quot; e número. Se a sua empresa se chama
        assim de verdade e mesmo assim foi recusada, fale com a Nex Envios — dá para liberar na mão
        com o Monitor.
      </Aviso>
    </>
  )
}
