import type { Metadata } from 'next'
import { exigirAdmin } from '@/lib/auth/atual'
import { canaisDaOrg, numerosDaOrg } from '@/db/queries/canais'
import { tokenDeRetorno } from '@/lib/canais/retorno'
import { CANAIS, CANAL_CODIGO, CANAL_LABEL, PROVEDOR_LABEL, type Channel } from '@/db/schema/enums'
import { Aviso, BotaoLink, Chip, Etiqueta, Pad, PadTitulo } from '@/components/ui/base'
import { Titulo } from '@/components/shell/casca'
import { CartaoDoCanal, Numeros } from './painel'

export const metadata: Metadata = { title: 'Canais' }
export const dynamic = 'force-dynamic'

/** O que cada canal exige de quem opera. */
const EXPLICACAO: Record<Channel, string> = {
  whatsapp_oficial:
    'Número verificado pela Meta. Fora da janela de 24 horas só sai modelo aprovado — é o canal de quem não pode correr risco de bloqueio.',
  whatsapp_nao_oficial:
    'Chip próprio pela Evolution. Escala rápido e custa pouco, mas o número pode ser banido; o ritmo e o teto por chip existem para isso.',
  sms: 'Chega em qualquer celular, com ou sem internet. Cobrado por segmento de 160 caracteres.',
  rcs: 'A evolução do SMS, com imagem e botão. Configure pelo provedor HTTP do seu gateway.',
  voz: 'Áudio automático direto na ligação. Configure pelo provedor HTTP da sua operadora.',
}

export default async function Canais() {
  const usuario = await exigirAdmin()

  const [canais, numeros, token] = await Promise.all([
    canaisDaOrg(usuario.orgId),
    numerosDaOrg(usuario.orgId),
    tokenDeRetorno(usuario.orgId, 'whatsapp_nao_oficial'),
  ])

  const evolution = canais.find(
    (c) => c.canal === 'whatsapp_nao_oficial' && c.provedor === 'evolution' && c.orgId,
  )
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '')

  return (
    <>
      <Titulo
        titulo="Canais"
        descricao="Por onde suas mensagens saem. Cada canal guarda a credencial do provedor, cifrada — ela nunca volta para esta tela."
        acao={
          <BotaoLink href="/canais/nome-de-perfil" tom="contorno">
            Regras do nome de perfil
          </BotaoLink>
        }
      />

      <div className="space-y-5">
        {CANAIS.map((canal) => {
          const doCanal = canais.filter((c) => c.canal === canal)
          return (
            <Pad key={canal}>
              <PadTitulo
                titulo={
                  <span className="flex items-center gap-3">
                    <Etiqueta>{CANAL_CODIGO[canal]}</Etiqueta>
                    {CANAL_LABEL[canal]}
                  </span>
                }
                descricao={EXPLICACAO[canal]}
                acao={
                  doCanal.some((c) => c.ativo && c.temCredencial) ? (
                    <Chip tom="verde" pulsando>
                      Pronto
                    </Chip>
                  ) : (
                    <Chip tom="neutro">Sem configuração</Chip>
                  )
                }
              />

              <div className="space-y-4 p-6">
                {doCanal.map((c) => (
                  <CartaoDoCanal
                    key={c.id}
                    canal={{
                      id: c.id,
                      canal: c.canal,
                      provedor: c.provedor,
                      rotulo: c.rotulo,
                      ativo: c.ativo,
                      padrao: c.padrao,
                      temCredencial: c.temCredencial,
                      perfil: c.perfilPadrao,
                    }}
                    daPlataforma={c.orgId === null}
                    provedorNome={PROVEDOR_LABEL[c.provedor] ?? c.provedor}
                    quebradoAte={c.quebradoAte ? c.quebradoAte.toISOString() : null}
                    falhasSeguidas={c.falhasSeguidas}
                    numeros={c.numeros}
                  />
                ))}

                <CartaoDoCanal novo canalFixo={canal} />
              </div>

              {canal === 'whatsapp_nao_oficial' && evolution ? (
                <div className="border-t border-line p-6">
                  <Numeros
                    configId={evolution.id}
                    numeros={numeros.map((n) => ({
                      ...n,
                      ultimoEnvio: n.ultimoEnvio ? n.ultimoEnvio.toISOString() : null,
                      vistoEm: n.vistoEm ? n.vistoEm.toISOString() : null,
                    }))}
                  />
                  {base ? (
                    <Aviso tom="info" className="mt-5">
                      O status de entrega volta por{' '}
                      <code className="font-mono text-[.8rem]">
                        {base}/api/retorno/{token.slice(0, 8)}…
                      </code>
                      . O endereço é registrado sozinho ao conectar um número.
                    </Aviso>
                  ) : null}
                </div>
              ) : null}
            </Pad>
          )
        })}
      </div>
    </>
  )
}
