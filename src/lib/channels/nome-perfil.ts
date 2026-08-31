/**
 * O nome de perfil do WhatsApp, conferido antes de sair daqui.
 *
 * Este arquivo NÃO é `server-only` de propósito: as mesmas regras precisam
 * rodar no navegador, enquanto a pessoa digita, e no servidor, antes do upload.
 * Duas cópias divergiriam, e a que divergisse seria a que reprova.
 *
 * **Por que conferir.** Quando a Meta reprova o nome, a campanha trava NO MEIO
 * do disparo. Para voltar a rodar é preciso cadastrar outro perfil e esperar
 * nova aprovação — e o envio fica parado esse tempo todo. Dependendo da hora,
 * a campanha não termina no mesmo dia.
 *
 * **O que isto não é.** Não é a palavra final. Quem decide é a Meta, e o
 * Monitor de Envios aplica a régua deles no momento do envio. Aqui pegamos o
 * que é conhecidamente reprovado — o suficiente para não descobrir o problema
 * com a base já enviada.
 */

/** Da página de regras deles. A API documenta 25, mas quem valida é esta. */
export const TAMANHO_MINIMO = 3
export const TAMANHO_MAXIMO = 20

export type Regra = {
  id: string
  titulo: string
  explica: string
  /** O que não passa, para a tela mostrar riscado. */
  ruins: string[]
}

/** As oito recusas da página de regras, na ordem em que eles listam. */
export const REGRAS: Regra[] = [
  {
    id: 'frase',
    titulo: 'Frase em vez de nome',
    explica:
      'O perfil tem que ser o nome da empresa, não uma frase ou slogan. Nada de começar com “Sua”, “Seu”, “Meu”, “O”, “A”.',
    ruins: ['Sua Chance', 'Seu Momento', 'O Melhor'],
  },
  {
    id: 'promessa',
    titulo: 'Promessa, prêmio ou promoção',
    explica:
      'A Meta trata como propaganda enganosa. Vale para a palavra grudada também (TurboPix, PixFácil).',
    ruins: ['Pix na Conta', 'Turbopix', 'Prêmio Fácil', 'Cupom Legal'],
  },
  {
    id: 'bet',
    titulo: '“Bet” no nome',
    explica:
      'A Meta não aceita “bet” no nome exibido — nem sozinho, nem colado em outra palavra, nem marca de aposta.',
    ruins: ['Alfa Bet', 'Turbobet', 'Betmania', 'Betzone'],
  },
  {
    id: 'oficial',
    titulo: '“Oficial” ou “Verificado”',
    explica: 'Só conta com selo de verificação da Meta pode usar. Sem o selo, é considerado engano.',
    ruins: ['Marca Oficial', 'Perfil Verificado'],
  },
  {
    id: 'acao',
    titulo: 'Chamada para ação',
    explica: 'Nome de perfil não é anúncio. Verbo no imperativo não passa.',
    ruins: ['Ganhe Agora', 'Clique Aqui', 'Indique e Ganhe'],
  },
  {
    id: 'generico',
    titulo: 'Termo genérico',
    explica:
      'Palavra genérica não identifica a marca. Se o nome inteiro é genérico, não passa.',
    ruins: ['Contato', 'Central de Vendas', 'Televendas', 'Departamento Comercial'],
  },
  {
    id: 'marca_alheia',
    titulo: 'Marca que não é sua',
    explica:
      'Usar nome de plataforma, banco ou órgão público é falsidade ideológica para a Meta.',
    ruins: ['WhatsApp Suporte', 'Correios Avisos', 'Serasa Alerta'],
  },
  {
    id: 'codigo',
    titulo: 'Código, número ou site',
    explica:
      'Sequência de números, código aleatório, endereço de site, e-mail, emoji ou símbolo não passam.',
    ruins: ['Kt429wq Com', 'R$ Fácil', 'Promo 84213'],
  },
]

/** Nomes que passam, para a tela mostrar como referência. */
export const BONS = [
  'Móveis Silva',
  'Padaria Aurora',
  'Ótica Bellini',
  'Delta Contabilidade',
  'Pizzaria Napoli',
  'Studio Lumine',
  'Casa & Cia',
  'Auto Peças Kruger',
]

// ─────────────────────────────────────────────────────────── vocabulário

/** Começos que fazem o nome virar frase. */
const COMECOS = ['sua', 'seu', 'meu', 'minha', 'o', 'a', 'os', 'as']

/** Promessa, prêmio e promoção. Casam como pedaço da palavra. */
const PROMESSA = [
  'pix',
  'premio',
  'cupom',
  'desconto',
  'gratis',
  'gratuito',
  'sorteio',
  'brinde',
  'promo',
  'oferta',
  'bonus',
  'cashback',
  'dinheiro',
  'renda',
  'lucro',
  'gratuita',
  'imperdivel',
  'facil',
  'turbo',
]

/** Aposta. Pedaço de palavra, como eles avisam. */
const APOSTA = [
  'bet',
  'aposta',
  'cassino',
  'casino',
  'slots',
  'jackpot',
  'roleta',
  'blaze',
  'stake',
  'parimatch',
  'tigrinho',
  'tiger',
  'sportingbet',
  'betano',
  'pixbet',
  'brbet',
]

const SELO = ['oficial', 'verificado', 'verified', 'official']

/** Verbo no imperativo — palavra inteira, senão "gancho" viraria "ganhe". */
const ACAO = [
  'ganhe',
  'clique',
  'compre',
  'aproveite',
  'corra',
  'baixe',
  'acesse',
  'participe',
  'indique',
  'resgate',
  'saiba',
  'confira',
  'garanta',
  'receba',
  'cadastre',
  'assine',
  'peca',
  'chame',
  'venha',
]

/** Genérico. Só reprova se o nome INTEIRO for feito destas. */
const GENERICO = [
  'contato',
  'central',
  'atendimento',
  'suporte',
  'vendas',
  'venda',
  'televendas',
  'comercial',
  'financeiro',
  'sac',
  'ajuda',
  'informacoes',
  'informacao',
  'departamento',
  'setor',
  'equipe',
  'time',
  'servicos',
  'servico',
  'empresa',
  'loja',
  'grupo',
  'canal',
  'oficina',
  'escritorio',
]

/** Marca de terceiro: plataforma, banco, órgão público. */
const MARCAS_ALHEIAS = [
  'whatsapp',
  'facebook',
  'instagram',
  'meta',
  'google',
  'correios',
  'serasa',
  'spc',
  'boa vista',
  'nubank',
  'itau',
  'bradesco',
  'santander',
  'caixa economica',
  'banco do brasil',
  'inss',
  'receita federal',
  'detran',
  'gov br',
  'mercado livre',
  'mercado pago',
  'magalu',
  'ifood',
  'shopee',
  'amazon',
  'netflix',
  'spotify',
]

/** Palavras que não contam na hora de julgar "é tudo genérico?". */
const LIGACOES = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', '&']

// ─────────────────────────────────────────────────────────── conferência

export type Veredito =
  | { ok: true }
  | { ok: false; regra: string; motivo: string }

/** Sem acento e em minúsculas, para comparar. */
function simples(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function achar(agulhas: string[], palheiro: string): string | null {
  return agulhas.find((a) => palheiro.includes(a)) ?? null
}

/**
 * Confere um nome de perfil contra as regras conhecidas.
 *
 * A ordem importa: devolvemos o primeiro problema, e o primeiro deve ser o
 * mais explicativo. Dizer "tem 'bet' no nome" ajuda mais do que "tem caractere
 * inválido" quando as duas coisas são verdade.
 */
export function conferirNomeDePerfil(bruto: string): Veredito {
  const nome = bruto.trim()

  if (nome.length < TAMANHO_MINIMO) {
    return { ok: false, regra: 'tamanho', motivo: `O nome precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.` }
  }
  const plano = simples(nome)
  const palavras = plano.split(/[\s&]+/).filter(Boolean)

  // Emoji, símbolo e pontuação de código. "&" passa: "Casa & Cia" é nome real.
  if (!/^[\p{L}\p{N}\s&.'-]+$/u.test(nome)) {
    return {
      ok: false,
      regra: 'codigo',
      motivo: 'Emoji, símbolo ou pontuação estranha não passam no nome do perfil.',
    }
  }

  if (/\d{2,}/.test(plano)) {
    return { ok: false, regra: 'codigo', motivo: 'Sequência de números não passa no nome do perfil.' }
  }
  // Token com letra e número embolados é código ("Kt429wq"), não nome.
  if (palavras.some((p) => /\d/.test(p) && /\p{L}/u.test(p))) {
    return { ok: false, regra: 'codigo', motivo: 'Isso parece um código, não o nome de uma empresa.' }
  }
  if (/(https?:|www\.|\.com|\.br|@)/.test(plano)) {
    return { ok: false, regra: 'codigo', motivo: 'Endereço de site ou e-mail não passa no nome do perfil.' }
  }

  const aposta = achar(APOSTA, plano)
  if (aposta) {
    return {
      ok: false,
      regra: 'bet',
      motivo: `“${aposta}” não passa no nome do perfil — a Meta bane o número. Pode aparecer no texto da mensagem, só não aqui.`,
    }
  }

  const selo = achar(SELO, plano)
  if (selo) {
    return {
      ok: false,
      regra: 'oficial',
      motivo: `“${selo}” só pode com selo de verificação da Meta. Sem o selo, é considerado engano.`,
    }
  }

  const promessa = achar(PROMESSA, plano)
  if (promessa) {
    return {
      ok: false,
      regra: 'promessa',
      motivo: `“${promessa}” é promessa ou promoção — a Meta trata como propaganda enganosa.`,
    }
  }

  const marca = achar(MARCAS_ALHEIAS, plano)
  if (marca) {
    return {
      ok: false,
      regra: 'marca_alheia',
      motivo: `“${marca}” é marca de terceiro. Usar não é permitido, mesmo com outra palavra junto.`,
    }
  }

  const acao = palavras.find((p) => ACAO.includes(p))
  if (acao) {
    return {
      ok: false,
      regra: 'acao',
      motivo: `“${acao}” é chamada para ação. Nome de perfil não é anúncio.`,
    }
  }

  if (COMECOS.includes(palavras[0] ?? '')) {
    return {
      ok: false,
      regra: 'frase',
      motivo: `Começar com “${palavras[0]}” faz o nome virar frase. Use o nome da empresa.`,
    }
  }

  // Genérico só reprova quando é TUDO genérico: "Móveis Silva" passa,
  // "Central de Vendas" não.
  const significativas = palavras.filter((p) => !LIGACOES.includes(p))
  if (significativas.length > 0 && significativas.every((p) => GENERICO.includes(p))) {
    return {
      ok: false,
      regra: 'generico',
      motivo: 'Esse nome é genérico e não identifica a sua marca. Use o nome comercial da empresa.',
    }
  }

  /*
   * O tamanho fica por último de propósito.
   *
   * "Departamento Comercial" tem 22 caracteres E é genérico. Dizer "passa de
   * 20" mandaria a pessoa encurtar — e "Depto Comercial" continua reprovando.
   * A regra de conteúdo é a que resolve, então é ela que aparece.
   */
  if (nome.length > TAMANHO_MAXIMO) {
    return {
      ok: false,
      regra: 'tamanho',
      motivo: `O nome passa de ${TAMANHO_MAXIMO} caracteres — o limite da régua da Meta.`,
    }
  }

  return { ok: true }
}
