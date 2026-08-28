import Link from 'next/link'
import { Marca } from '@/components/ui/marca'
import {
  AoAparecer,
  Cabecalho,
  Contador,
} from '@/components/site/interativos'
import {
  IconeAbertura,
  IconeAlcance,
  IconeAutomacao,
  IconeBanco,
  IconeCelular,
  IconeCusto,
  IconeDado,
  IconeEscala,
  IconeEscudo,
  IconeMulticanal,
  IconePersonalizacao,
  IconeRaio,
  IconeRcs,
  IconeSeta,
  IconeVoz,
  IconeWhatsapp,
} from '@/components/site/icones'

/**
 * A landing. Renderizada no servidor — o único JavaScript que vai para o
 * navegador é o do cabeçalho e o das animações de entrada.
 */

export const revalidate = 3600

const NUMERO_WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP ?? '5511999999999'
const MENSAGEM =
  'Olá! Vim pela landing page e quero saber mais sobre disparos em massa.'
const LINK_WHATSAPP = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(MENSAGEM)}`

const CANAIS = [
  {
    codigo: 'WA·01',
    nome: 'WhatsApp API Oficial',
    Icone: IconeEscudo,
    descricao:
      'Número verificado pela Meta, com selo de negócio e altíssima entregabilidade. Ideal para operações que não podem correr risco de bloqueio.',
    status: 'Ativo — alta entrega',
  },
  {
    codigo: 'WA·02',
    nome: 'WhatsApp API Não Oficial',
    Icone: IconeRaio,
    descricao:
      'Alto volume de disparo com mais liberdade e agilidade. Indicado para quem quer escalar rápido e testar ofertas em campo.',
    status: 'Ativo — alto volume',
  },
  {
    codigo: 'SMS·03',
    nome: 'SMS',
    Icone: IconeCelular,
    descricao:
      'Chega em qualquer celular, com ou sem internet. Leitura em segundos e cobertura em todo o território nacional.',
    status: 'Ativo — cobertura total',
  },
  {
    codigo: 'RCS·04',
    nome: 'RCS',
    Icone: IconeRcs,
    descricao:
      'A evolução do SMS: imagens, botões de ação e carrossel direto na caixa de mensagens do cliente.',
    status: 'Novo — alta conversão',
  },
  {
    codigo: 'VOZ·05',
    nome: 'Torpedo de Voz',
    Icone: IconeVoz,
    descricao:
      'Mensagem de áudio automática, direto na ligação. Ideal para públicos que respondem melhor ao que ouvem.',
    status: 'Ativo — 100% automático',
  },
]

const BENEFICIOS = [
  {
    Icone: IconeAlcance,
    titulo: 'Alcance imediato em escala',
    texto:
      'Uma campanha impacta milhares de contatos em minutos. Nenhum canal comunica tão rápido quanto WhatsApp, SMS e voz combinados.',
  },
  {
    Icone: IconeCusto,
    titulo: 'Custo por contato muito menor',
    texto:
      'O investimento por pessoa alcançada é uma fração do custo da mídia paga tradicional, com retorno mensurável a cada disparo.',
  },
  {
    Icone: IconeAbertura,
    titulo: 'Taxa de abertura acima do e-mail',
    texto:
      'Mensagens de texto e voz são lidas — ou ouvidas — em minutos, não em dias. Sua oferta chega enquanto ainda importa.',
  },
  {
    Icone: IconePersonalizacao,
    titulo: 'Personalização mesmo em massa',
    texto:
      'Nome, oferta, horário e canal se ajustam por contato. Disparo em massa não precisa ser genérico para converter.',
  },
  {
    Icone: IconeMulticanal,
    titulo: 'Multicanal aumenta a conversão',
    texto:
      'Combine WhatsApp, SMS, RCS e voz na mesma régua de contato para garantir que a mensagem chegue, seja qual for o perfil do lead.',
  },
  {
    Icone: IconeAutomacao,
    titulo: 'Automação que não para',
    texto:
      'Recuperação de leads, reativação de base e lembretes acontecem sozinhos, 24 horas por dia, sem depender de time manual.',
  },
]

const NICHOS = [
  {
    Icone: IconeBanco,
    etiqueta: 'Financeiro',
    titulo: 'Corban',
    texto:
      'Consignado, FGTS, portabilidade e refinanciamento pedem volume e agilidade. Estruturamos disparos que aquecem a base e entregam leads prontos para a proposta.',
  },
  {
    Icone: IconeDado,
    etiqueta: 'Apostas & Cassino',
    titulo: 'iGaming',
    texto:
      'Cadastro, primeiro depósito, reativação de inativos e campanhas de bônus — no ritmo que o setor de apostas e cassino online exige.',
  },
  {
    Icone: IconeEscala,
    etiqueta: 'Alto volume',
    titulo: 'Campanhas com Escala',
    texto:
      'De 10 mil a milhões de contatos: montamos a operação de disparo para crescer junto com o seu negócio sem perder entregabilidade.',
  },
]

function BotaoWhatsapp({
  grande,
  children,
}: {
  grande?: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={LINK_WHATSAPP}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center justify-center gap-2.5 rounded-full bg-wa font-bold text-white shadow-[0_14px_28px_-10px_rgba(37,211,102,.55)] transition-all hover:-translate-y-0.5 hover:bg-wa-dark ${
        grande ? 'px-8 py-4 text-[1.05rem]' : 'px-6 py-3.5 text-[.96rem]'
      }`}
    >
      <IconeWhatsapp className="h-5 w-5 shrink-0" />
      {children}
    </a>
  )
}

export default function Landing() {
  return (
    <>
      <Cabecalho whatsapp={LINK_WHATSAPP} />

      <main id="topo">
        {/* ───────────────────────────────────────────────── herói */}
        <section className="relative overflow-hidden pt-[76px] pb-[88px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-10%] top-[-20%] h-[640px]"
            style={{
              background:
                'radial-gradient(560px 360px at 22% 20%, rgba(0,176,248,.16), transparent 65%), radial-gradient(620px 420px at 82% 10%, rgba(0,120,248,.14), transparent 60%)',
            }}
          />
          <div className="relative mx-auto max-w-[760px] px-6 text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-blue/20 bg-blue/8 py-2 pr-4 pl-3 font-mono text-[.76rem] font-semibold tracking-[.13em] text-blue uppercase">
              <span className="pulsa h-[7px] w-[7px] shrink-0 rounded-full bg-wa" />
              Sistema ativo · +100 milhões entregues
            </span>

            <h1 className="mt-5 mb-5 text-[clamp(2.15rem,1.35rem+3.6vw,3.5rem)] leading-[1.08] font-bold tracking-[-.02em]">
              Multiplique sua base de clientes com{' '}
              <span className="text-blue">disparos em massa</span>
            </h1>

            <p className="mx-auto mb-8 max-w-[600px] text-[clamp(1.02rem,.95rem+.3vw,1.18rem)] leading-relaxed text-muted">
              WhatsApp Oficial, API não oficial, SMS, RCS e Torpedo de Voz — reunidos em uma única
              operação. Desenvolvemos a estratégia certa para o seu negócio adquirir mais clientes.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <BotaoWhatsapp grande>Falar no WhatsApp</BotaoWhatsapp>
              <a
                href="#canais"
                className="inline-flex items-center justify-center gap-2.5 rounded-full border-2 border-line px-8 py-4 text-[1.05rem] font-bold text-navy transition-all hover:-translate-y-0.5 hover:border-blue hover:text-blue"
              >
                Ver canais de disparo
                <IconeSeta className="h-[19px] w-[19px] shrink-0" />
              </a>
            </div>

            <p className="mt-8 font-mono text-[.78rem] tracking-[.09em] text-muted uppercase">
              Feito para <b className="font-semibold text-navy">Corban</b> ·{' '}
              <b className="font-semibold text-navy">iGaming</b> ·{' '}
              <b className="font-semibold text-navy">Campanhas com Escala</b>
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────── esteira */}
        <div
          aria-hidden="true"
          className="overflow-hidden border-y border-white/8 bg-navy py-[15px]"
        >
          <div className="ticker flex w-max">
            {Array.from({ length: 2 }).map((_, volta) =>
              ['WHATSAPP API OFICIAL', 'WHATSAPP API NÃO OFICIAL', 'SMS', 'RCS', 'TORPEDO DE VOZ'].map(
                (texto) => (
                  <span
                    key={`${volta}-${texto}`}
                    className="inline-flex items-center px-[22px] font-mono text-[.82rem] tracking-[.13em] whitespace-nowrap text-[#cfe0ff] uppercase"
                  >
                    {texto}
                    <i className="pl-[22px] text-cyan not-italic">→</i>
                  </span>
                ),
              ),
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────── canais */}
        <section id="canais" className="py-[104px] max-md:py-[68px]">
          <div className="mx-auto max-w-[1180px] px-6">
            <div className="mx-auto mb-14 max-w-[680px] text-center">
              <span className="inline-flex items-center rounded-full border border-blue/20 bg-blue/8 px-4 py-2 font-mono text-[.76rem] font-semibold tracking-[.13em] text-blue uppercase">
                05 canais ativos
              </span>
              <h2 className="mt-4 mb-3.5 text-[clamp(1.7rem,1.15rem+2.2vw,2.5rem)] leading-[1.16]">
                Cinco canais. Uma única operação de disparo.
              </h2>
              <p className="text-[1.05rem] leading-relaxed text-muted">
                Cada canal cumpre um papel na estratégia. Veja como cada um entrega sua mensagem — e
                converte.
              </p>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_10px_24px_-12px_rgba(0,32,88,.22)]">
              <table className="w-full border-collapse max-md:block">
                <thead className="max-md:hidden">
                  <tr>
                    {['Código', 'Canal', 'O que faz', 'Status'].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-line bg-paper-alt px-[22px] py-[18px] text-left font-mono text-[.72rem] font-semibold tracking-[.1em] text-muted uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {CANAIS.map(({ codigo, nome, Icone, descricao, status }, i) => (
                    <tr
                      key={codigo}
                      className="transition-colors hover:bg-blue/4 max-md:block max-md:border-b max-md:border-line max-md:px-[18px] max-md:py-5 max-md:last:border-0"
                    >
                      <td className="w-px border-b border-line px-[22px] py-[22px] align-top font-mono text-[.92rem] font-semibold whitespace-nowrap text-blue max-md:block max-md:w-auto max-md:border-0 max-md:px-0 max-md:py-1 max-md:text-[.78rem] max-md:text-muted">
                        {codigo}
                      </td>
                      <td className="w-[26%] border-b border-line px-[22px] py-[22px] align-top max-md:block max-md:w-auto max-md:border-0 max-md:px-0 max-md:py-1">
                        <span className="mb-1 block font-mono text-[.66rem] tracking-[.09em] text-muted uppercase md:hidden">
                          Canal
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue/9 text-blue">
                            <Icone className="h-[19px] w-[19px]" />
                          </span>
                          <span className="text-[1.02rem] font-semibold text-navy">{nome}</span>
                        </div>
                      </td>
                      <td className="border-b border-line px-[22px] py-[22px] align-top text-[.95rem] leading-relaxed text-muted max-md:block max-md:border-0 max-md:px-0 max-md:py-1">
                        <span className="mt-2.5 mb-1 block font-mono text-[.66rem] tracking-[.09em] text-muted uppercase md:hidden">
                          O que faz
                        </span>
                        {descricao}
                      </td>
                      <td className="border-b border-line px-[22px] py-[22px] align-top text-[.88rem] font-semibold whitespace-nowrap text-navy max-md:block max-md:border-0 max-md:px-0 max-md:py-1">
                        <span className="mt-2.5 mb-1 block font-mono text-[.66rem] tracking-[.09em] text-muted uppercase md:hidden">
                          Status
                        </span>
                        <span className="pulsa mr-[7px] inline-block h-2 w-2 rounded-full bg-wa align-middle" />
                        {status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 px-6 pt-11 pb-2 text-center">
              <span className="tabular block font-mono text-[clamp(2rem,1.4rem+2.6vw,3.1rem)] leading-none font-semibold tracking-[-.01em] text-navy">
                <Contador alvo={100_000_000} />
              </span>
              <span className="mt-2 block text-[.92rem] text-muted">
                mensagens entregues pela operação Nex Envios
              </span>
            </div>
          </div>
        </section>

        {/* ───────────────────────────────────────────── benefícios */}
        <section id="beneficios" className="bg-paper-alt py-[104px] max-md:py-[68px]">
          <div className="mx-auto max-w-[1180px] px-6">
            <div className="mx-auto mb-14 max-w-[680px] text-center">
              <span className="inline-flex items-center rounded-full border border-blue/20 bg-blue/8 px-4 py-2 font-mono text-[.76rem] font-semibold tracking-[.13em] text-blue uppercase">
                Por que disparo em massa
              </span>
              <h2 className="mt-4 mb-3.5 text-[clamp(1.7rem,1.15rem+2.2vw,2.5rem)] leading-[1.16]">
                Uma mensagem. Milhões de contatos. Resultado imediato.
              </h2>
              <p className="text-[1.05rem] leading-relaxed text-muted">
                Veja por que cada vez mais empresas migram verba de mídia paga para campanhas de
                disparo direto.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {BENEFICIOS.map(({ Icone, titulo, texto }, i) => (
                <AoAparecer key={titulo} atraso={i * 60}>
                  <div className="h-full rounded-[18px] border border-line bg-white px-[26px] py-[30px] transition-all hover:border-blue/35 hover:shadow-[0_10px_24px_-12px_rgba(0,32,88,.22)]">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[13px] bg-gradient-to-br from-blue/12 to-cyan/12 text-blue">
                      <Icone className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2.5 text-[1.12rem]">{titulo}</h3>
                    <p className="text-[.95rem] leading-relaxed text-muted">{texto}</p>
                  </div>
                </AoAparecer>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────── nichos */}
        <section id="nichos" className="py-[104px] max-md:py-[68px]">
          <div className="mx-auto max-w-[1180px] px-6">
            <div className="mx-auto mb-14 max-w-[680px] text-center">
              <span className="inline-flex items-center rounded-full border border-blue/20 bg-blue/8 px-4 py-2 font-mono text-[.76rem] font-semibold tracking-[.13em] text-blue uppercase">
                Setores que atendemos
              </span>
              <h2 className="mt-4 mb-3.5 text-[clamp(1.7rem,1.15rem+2.2vw,2.5rem)] leading-[1.16]">
                Estratégia de disparo feita para o seu mercado
              </h2>
              <p className="text-[1.05rem] leading-relaxed text-muted">
                Cada setor tem um ritmo e um momento certo de contato. Construímos a régua de
                disparo em cima do seu funil.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1">
              {NICHOS.map(({ Icone, etiqueta, titulo, texto }, i) => (
                <AoAparecer key={titulo} atraso={i * 80}>
                  <div className="relative h-full overflow-hidden rounded-[18px] bg-navy px-7 py-[34px] text-white">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-[-30%] bottom-[-50%] h-[220px] w-[220px]"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(0,176,248,.35), transparent 70%)',
                      }}
                    />
                    <div className="relative z-[1]">
                      <div className="mb-[22px] flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-cyan/16 text-cyan">
                        <Icone className="h-[23px] w-[23px]" />
                      </div>
                      <span className="mb-3.5 block font-mono text-[.68rem] tracking-[.1em] text-cyan uppercase">
                        {etiqueta}
                      </span>
                      <h3 className="mb-3 text-[1.2rem] text-white">{titulo}</h3>
                      <p className="text-[.95rem] leading-relaxed text-[#c3d3f2]">{texto}</p>
                    </div>
                  </div>
                </AoAparecer>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────────────────────────── chamada final */}
        <section className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-deep py-[104px] text-center text-white max-md:py-[68px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-10%] top-[-40%] h-[70%]"
            style={{
              background:
                'radial-gradient(560px 360px at 50% 0%, rgba(0,176,248,.22), transparent 65%)',
            }}
          />
          <div className="relative mx-auto max-w-[620px] px-6">
            <h2 className="mb-4 text-[clamp(1.7rem,1.2rem+2.3vw,2.5rem)] leading-[1.15] text-white">
              Pronto para multiplicar seus resultados?
            </h2>
            <p className="mb-8 text-[1.05rem] leading-relaxed text-[#c3d3f2]">
              Fale agora com um especialista e monte, sem compromisso, a estratégia de disparo ideal
              para o seu negócio.
            </p>
            <BotaoWhatsapp grande>Falar no WhatsApp agora</BotaoWhatsapp>
            <p className="mt-6 font-mono text-[.76rem] tracking-[.09em] text-[#8fa6d6] uppercase">
              Resposta rápida · Sem compromisso · Estratégia sob medida
            </p>
          </div>
        </section>
      </main>

      {/* ───────────────────────────────────────────────────── rodapé */}
      <footer id="contato" className="bg-navy-deep pt-16 text-[#c3d3f2]">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="flex flex-wrap justify-between gap-10 border-b border-white/9 pb-12">
            <div className="max-w-[320px]">
              <Marca size={28} claro />
              <p className="mt-3.5 text-[.92rem] leading-relaxed text-[#8fa6d6]">
                Disparos em massa que geram resultado — WhatsApp, SMS, RCS e voz em uma única
                operação.
              </p>
            </div>

            <div className="flex flex-wrap gap-16">
              <div>
                <h4 className="mb-4 font-mono text-[.72rem] font-semibold tracking-[.1em] text-[#8fa6d6] uppercase">
                  Navegação
                </h4>
                <ul className="flex flex-col gap-2.5">
                  {[
                    { href: '#canais', texto: 'Canais' },
                    { href: '#beneficios', texto: 'Benefícios' },
                    { href: '#nichos', texto: 'Nichos' },
                  ].map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        className="text-[.94rem] text-[#dbe6fb] transition-colors hover:text-cyan"
                      >
                        {l.texto}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="mb-4 font-mono text-[.72rem] font-semibold tracking-[.1em] text-[#8fa6d6] uppercase">
                  Plataforma
                </h4>
                <ul className="flex flex-col gap-2.5">
                  <li>
                    <Link
                      href="/entrar"
                      className="text-[.94rem] text-[#dbe6fb] transition-colors hover:text-cyan"
                    >
                      Entrar no painel
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/recuperar"
                      className="text-[.94rem] text-[#dbe6fb] transition-colors hover:text-cyan"
                    >
                      Recuperar senha
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="mb-4 font-mono text-[.72rem] font-semibold tracking-[.1em] text-[#8fa6d6] uppercase">
                  Contato
                </h4>
                <ul className="flex flex-col gap-2.5">
                  <li>
                    <a
                      href={LINK_WHATSAPP}
                      target="_blank"
                      rel="noopener"
                      className="text-[.94rem] text-[#dbe6fb] transition-colors hover:text-cyan"
                    >
                      WhatsApp
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:contato@nexenvios.com.br"
                      className="text-[.94rem] text-[#dbe6fb] transition-colors hover:text-cyan"
                    >
                      contato@nexenvios.com.br
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4 py-[26px] text-[.82rem] text-[#7186b3]">
            <span>© {new Date().getFullYear()} Nex Envios. Todos os direitos reservados.</span>
            <span>WhatsApp é uma marca registrada da Meta Platforms, Inc.</span>
          </div>
        </div>
      </footer>

      {/* Botão flutuante */}
      <a
        href={LINK_WHATSAPP}
        target="_blank"
        rel="noopener"
        aria-label="Falar no WhatsApp"
        className="fixed right-[22px] bottom-[22px] z-[200] flex h-15 w-15 items-center justify-center rounded-full bg-wa text-white shadow-[0_14px_30px_-8px_rgba(37,211,102,.6)] transition-transform hover:scale-107 max-sm:right-4 max-sm:bottom-4 max-sm:h-[54px] max-sm:w-[54px]"
      >
        <span className="pulsa absolute inset-0 rounded-full" />
        <IconeWhatsapp className="h-7 w-7 max-sm:h-[25px] max-sm:w-[25px]" />
      </a>
    </>
  )
}
