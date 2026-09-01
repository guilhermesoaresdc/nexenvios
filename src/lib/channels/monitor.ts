import 'server-only'

/**
 * Monitor de Envios — campanha inteira, não mensagem a mensagem.
 *
 * Este arquivo é a exceção da pasta. Os outros canais recebem um destino e
 * mandam uma mensagem; o Monitor recebe a CAMPANHA — perfil, copy, mídia e a
 * base como arquivo — num único POST multipart, passa por uma fila de
 * aprovação humana do lado deles, e devolve progresso agregado por consulta.
 *
 * Por isso ele não implementa `enviarPeloCanal`: não há o que enviar uma a
 * uma. Quem usa daqui é `lib/campanhas/externa.ts`.
 *
 * Os limites abaixo não são preferência nossa: são as regras que eles aplicam,
 * que por sua vez seguem a WhatsApp Cloud API. Conferir aqui, antes de subir
 * 25 MB de base, é mais barato do que tomar um 400 depois do upload.
 */

/*
 * O endereço é fixo em produção. A variável existe só para o teste de
 * integração apontar para um servidor local — sem ela, provar o contrato de
 * cobrança exigiria bater no Monitor de verdade.
 */
import { conferirNomeDePerfil } from './nome-perfil'

const BASE = process.env.MONITOR_API_BASE ?? 'https://monitordeenvios.com/api'

export const LIMITES = {
  nomeCampanha: 150,
  /** A régua deles é de 3 a 20; a tabela da API diz 25. Vale a mais apertada. */
  perfilNome: 20,
  copyComMidia: 750,
  copySemMidia: 1024,
  observacoes: 1000,
  /** A linha de descadastro que eles acrescentam come do mesmo limite. */
  folgaEleitoral: 80,
} as const

export type CredencialMonitor = {
  apiToken: string
  /** Perfil padrão da conta, usado quando a campanha não traz o seu. */
  perfilNome?: string
  perfilFoto?: string
  perfilNome2?: string
  perfilFoto2?: string
}

export type Perfil = {
  nome: string
  fotoUrl: string
  nome2: string
  fotoUrl2: string
}

export type SubmissaoDaCampanha = {
  nome: string
  copy: string
  perfil: Perfil
  /** CSV já montado com os números. */
  base: { nomeArquivo: string; conteudo: string }
  mediaUrl?: string | null
  /** Nossa referência, devolvida igual nas consultas. */
  referencia?: string
  dataCampanha?: Date | null
  observacoes?: string
  politica?: {
    documento: string
    partido: string
  } | null
}

export type ResultadoDaSubmissao =
  | { ok: true; codigo: string; id: number }
  | { ok: false; erro: string; status: number }

export type StatusDeAprovacao = {
  status: 'aguardando' | 'aprovado' | 'rejeitado' | 'rascunho'
  rotulo: string
  motivoRejeicao: string | null
  emExecucao: boolean
  statusExecucao: string | null
}

export type ProgressoDaCampanha = {
  progresso: number
  /** Saíram mas ainda sem confirmação de recebimento. */
  enviadas: number
  /** Confirmadas como recebidas. É um conjunto DISJUNTO de `enviadas`. */
  recebidas: number
  /** enviadas + recebidas — o que de fato já foi processado. É o que se cobra. */
  processadas: number
}

export type Resposta = {
  telefone: string
  texto: string
  quando: Date
}

// ─────────────────────────────────────────────────────────── conferências

/**
 * O que dá para recusar antes de gastar um upload.
 *
 * O teto deles é 60 uploads por hora por conta. Mandar uma base de 25 MB para
 * tomar 400 por causa de um nome de perfil de 26 caracteres queima uma dessas
 * 60 por nada.
 */
export function conferirSubmissao(dados: SubmissaoDaCampanha): string | null {
  const { perfil, copy, nome } = dados

  if (nome.length > LIMITES.nomeCampanha) {
    return `O nome do disparo passa de ${LIMITES.nomeCampanha} caracteres.`
  }
  if (!perfil.nome.trim() || !perfil.nome2.trim()) {
    return 'O Monitor de Envios exige dois nomes de perfil: o principal e o reserva.'
  }
  for (const [rotulo, valor] of [
    ['principal', perfil.nome],
    ['reserva', perfil.nome2],
  ] as const) {
    if (valor.length > LIMITES.perfilNome) {
      return `O nome de perfil ${rotulo} passa de ${LIMITES.perfilNome} caracteres.`
    }
  }
  if (perfil.nome.trim().toLowerCase() === perfil.nome2.trim().toLowerCase()) {
    return 'O perfil reserva precisa ter um nome diferente do principal.'
  }

  /*
   * A régua da Meta, aplicada aqui e não só na tela.
   *
   * Um nome reprovado trava a campanha NO MEIO do disparo — não na hora de
   * criar. Recusar antes do upload custa nada; destravar depois custa o dia.
   */
  for (const [rotulo, valor] of [
    ['principal', perfil.nome],
    ['reserva', perfil.nome2],
  ] as const) {
    const veredito = conferirNomeDePerfil(valor)
    if (!veredito.ok) return `Perfil ${rotulo} — ${veredito.motivo}`
  }
  if (!perfil.fotoUrl || !perfil.fotoUrl2) {
    return 'O Monitor de Envios exige a foto dos dois perfis.'
  }
  if (perfil.fotoUrl === perfil.fotoUrl2) {
    return 'A foto do perfil reserva precisa ser diferente da do principal.'
  }

  const teto = dados.mediaUrl ? LIMITES.copyComMidia : LIMITES.copySemMidia
  const espaco = dados.politica ? teto - LIMITES.folgaEleitoral : teto
  if (copy.length > espaco) {
    return dados.politica
      ? `Em campanha política a mensagem cabe em ${espaco} caracteres — o resto é a linha de descadastro que eles acrescentam.`
      : `A mensagem passa de ${teto} caracteres para este formato.`
  }

  /*
   * A mídia deles aceita IMAGEM e VÍDEO — não PDF nem áudio.
   *
   * A tela de disparo serve a todos os canais, e no provedor HTTP genérico um
   * PDF é mídia legítima. Aqui não: `midia_campanha` lista jpg/jpeg/png/webp e
   * mp4/mov, e qualquer outra coisa volta 400 DEPOIS do upload — com a base de
   * 25 MB já subida e uma das 60 submissões da hora gasta.
   */
  if (dados.mediaUrl) {
    const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(dados.mediaUrl)?.[1]?.toLowerCase() ?? ''
    const aceitas = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov']
    if (ext && !aceitas.includes(ext)) {
      return `O Monitor de Envios só aceita imagem (JPG, PNG, WebP) ou vídeo (MP4, MOV) como mídia — este arquivo é .${ext}.`
    }
  }

  if (!dados.base.conteudo.trim()) return 'A base está vazia.'
  return null
}

// ─────────────────────────────────────────────────────────────── chamadas

/** Baixa uma imagem para repassar como arquivo. Eles só aceitam upload. */
async function baixar(url: string, rotulo: string): Promise<Blob> {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!resposta.ok) {
    throw new Error(`não deu para baixar ${rotulo} (HTTP ${resposta.status})`)
  }
  return await resposta.blob()
}

function nomeDoArquivo(url: string, padrao: string): string {
  try {
    const caminho = new URL(url).pathname
    const ultimo = caminho.split('/').pop()
    return ultimo && ultimo.includes('.') ? ultimo : padrao
  } catch {
    return padrao
  }
}

/**
 * DD/MM/YYYY no fuso de Brasília, que é o calendário deles.
 *
 * Em UTC, um disparo marcado para as 21h de 01/09 vira 02/09 — e a campanha
 * chegaria lá datada do dia seguinte, sem ninguém notar até ela não sair no
 * dia combinado. O corte do dia tem que ser o mesmo que a pessoa viu na tela.
 */
function dataBr(quando: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(quando)
}

export async function submeterCampanha(
  credencial: CredencialMonitor,
  dados: SubmissaoDaCampanha,
): Promise<ResultadoDaSubmissao> {
  if (!credencial.apiToken) {
    return { ok: false, erro: 'O canal do Monitor de Envios está sem token.', status: 0 }
  }

  const form = new FormData()
  form.set('api_token', credencial.apiToken)
  form.set('nome_campanha', dados.nome)
  form.set('perfil_nome', dados.perfil.nome)
  form.set('perfil_nome_2', dados.perfil.nome2)
  form.set('copy_texto', dados.copy)
  if (dados.referencia) form.set('nome_arquivo_original', dados.referencia)
  if (dados.observacoes) form.set('observacoes', dados.observacoes)
  if (dados.dataCampanha) form.set('data_campanha', dataBr(dados.dataCampanha))

  if (dados.politica) {
    form.set('politica', 'true')
    form.set('politica_documento', dados.politica.documento)
    form.set('politica_partido', dados.politica.partido)
    // O aceite do termo é registrado por nós na criação do disparo.
    form.set('politica_aceite', 'true')
  }

  try {
    form.set(
      'foto_perfil',
      await baixar(dados.perfil.fotoUrl, 'a foto do perfil'),
      nomeDoArquivo(dados.perfil.fotoUrl, 'perfil.png'),
    )
    form.set(
      'foto_perfil_2',
      await baixar(dados.perfil.fotoUrl2, 'a foto do perfil reserva'),
      nomeDoArquivo(dados.perfil.fotoUrl2, 'perfil-2.png'),
    )
    if (dados.mediaUrl) {
      form.set(
        'midia_campanha',
        await baixar(dados.mediaUrl, 'a mídia da campanha'),
        nomeDoArquivo(dados.mediaUrl, 'midia.jpg'),
      )
    }
  } catch (erro) {
    return {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'não deu para baixar os arquivos do perfil',
      status: 0,
    }
  }

  form.set('base_dados', new Blob([dados.base.conteudo], { type: 'text/csv' }), dados.base.nomeArquivo)

  let resposta: Response
  try {
    resposta = await fetch(`${BASE}/receber_campanha_externa.php`, {
      method: 'POST',
      body: form,
      // Base grande sobe devagar; o teto do plano é 60s de função.
      signal: AbortSignal.timeout(50_000),
    })
  } catch (erro) {
    return {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'o Monitor de Envios não respondeu',
      status: 0,
    }
  }

  const corpo = (await lerJson(resposta)) as
    | { success?: boolean; message?: string; id?: number; codigo_acompanhamento?: string }
    | null

  if (!resposta.ok || !corpo?.success || !corpo.codigo_acompanhamento) {
    return {
      ok: false,
      erro: corpo?.message ?? `O Monitor de Envios recusou (HTTP ${resposta.status}).`,
      status: resposta.status,
    }
  }

  return { ok: true, codigo: corpo.codigo_acompanhamento, id: corpo.id ?? 0 }
}

/**
 * O erro é da CAMPANHA, e não da credencial?
 *
 * 404 ("Campanha não encontrada") e 403 ("não tem permissão") são definitivos:
 * tentar de novo daqui a um minuto não muda nada. Distinguir importa por dois
 * motivos — não sujar a saúde do canal com um problema que não é dele, e parar
 * de gastar uma requisição por minuto do teto deles com algo que nunca vai
 * resolver.
 */
export function eErroDaCampanha(mensagem: string): boolean {
  return /n[ãa]o encontrada|n[ãa]o tem permiss[ãa]o|pertence a outra/i.test(mensagem)
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json()
  } catch {
    return null
  }
}

async function consultar(
  credencial: CredencialMonitor,
  rota: string,
  parametros: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${BASE}/${rota}`)
  for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor)

  /*
   * O token vai pelos DOIS caminhos: parâmetro e cabeçalho.
   *
   * A seção 1 da documentação deles promete que os dois valem em qualquer
   * endpoint, mas só `saldo_empresa.php` repete isso na própria seção — todos
   * os outros exemplos usam `?api_token=`. Mandando só o cabeçalho,
   * `status_aprovacao.php` respondeu "Campanha não encontrada." a CADA minuto
   * para uma campanha que existe e estava na fila deles: sem reconhecer a
   * conta, a busca pelo código não acha nada, e o erro sai como campanha
   * inexistente em vez de token ausente.
   *
   * O preço é o token aparecer no log de acesso deles. Eles registram tudo de
   * qualquer forma (§6.5), e uma campanha que não dá para acompanhar custa
   * mais.
   */
  url.searchParams.set('api_token', credencial.apiToken)

  const resposta = await fetch(url, {
    headers: { 'X-API-Token': credencial.apiToken },
    signal: AbortSignal.timeout(20_000),
  })

  if (resposta.status === 429) throw new Error('limite de consultas do Monitor de Envios atingido')
  const corpo = (await lerJson(resposta)) as { success?: boolean; message?: string; data?: unknown } | null
  if (!resposta.ok || !corpo?.success) {
    throw new Error(corpo?.message ?? `Monitor de Envios respondeu HTTP ${resposta.status}`)
  }
  return corpo.data
}

export async function statusDeAprovacao(
  credencial: CredencialMonitor,
  codigo: string,
): Promise<StatusDeAprovacao> {
  const dados = (await consultar(credencial, 'status_aprovacao.php', { codigo })) as {
    status?: string
    status_rotulo?: string
    motivo_rejeicao?: string | null
    em_execucao?: boolean
    status_execucao?: string | null
  } | null

  const bruto = dados?.status ?? 'aguardando'
  const status = (['aguardando', 'aprovado', 'rejeitado', 'rascunho'] as const).includes(
    bruto as StatusDeAprovacao['status'],
  )
    ? (bruto as StatusDeAprovacao['status'])
    : 'aguardando'

  return {
    status,
    rotulo: dados?.status_rotulo ?? '',
    motivoRejeicao: dados?.motivo_rejeicao ?? null,
    emExecucao: Boolean(dados?.em_execucao),
    statusExecucao: dados?.status_execucao ?? null,
  }
}

export async function progressoDaCampanha(
  credencial: CredencialMonitor,
  codigo: string,
): Promise<ProgressoDaCampanha> {
  const dados = (await consultar(credencial, 'status_campanha.php', { codigo })) as {
    progresso?: number | string
    quantidadeEnviada?: number | string
    quantidadeRecebida?: number | string
    quantidadeTotalEnviada?: number | string
  } | null

  const enviadas = Number(dados?.quantidadeEnviada ?? 0)
  const recebidas = Number(dados?.quantidadeRecebida ?? 0)

  /*
   * `quantidadeEnviada` e `quantidadeRecebida` são DISJUNTAS.
   *
   * A documentação define `quantidadeTotalEnviada` como "soma de enviada +
   * recebida", e o exemplo deles fecha: 433 + 354 = 787. Ou seja, a mensagem
   * SAI de "enviada" quando o recebimento é confirmado.
   *
   * Isso importa para a cobrança: usar só `quantidadeEnviada` cobraria a menos
   * e, pior, o número pode DIMINUIR conforme as confirmações chegam — o que
   * faria o cálculo do que falta cobrar virar negativo e travar o débito.
   */
  const somadas = enviadas + recebidas
  const total = Number(dados?.quantidadeTotalEnviada ?? somadas)

  return {
    progresso: Number(dados?.progresso ?? 0),
    enviadas,
    recebidas,
    // Confia no total deles quando vem; senão soma. Nunca menos que a soma.
    processadas: Math.max(total, somadas),
  }
}

export async function respostasDaCampanha(
  credencial: CredencialMonitor,
  codigo: string,
): Promise<Resposta[]> {
  const dados = (await consultar(credencial, 'respostas_campanha.php', { codigo })) as
    | { telefone?: string; resposta?: string; data_hora?: string }[]
    | null

  if (!Array.isArray(dados)) return []
  return dados.flatMap((r) => {
    if (!r.telefone) return []
    const quando = r.data_hora ? new Date(r.data_hora.replace(' ', 'T')) : new Date()
    return [
      {
        telefone: r.telefone,
        texto: r.resposta ?? '',
        quando: Number.isNaN(quando.getTime()) ? new Date() : quando,
      },
    ]
  })
}

/** Saldo da conta no Monitor, em quantidade de envios. */
export async function saldoNoMonitor(credencial: CredencialMonitor): Promise<number> {
  const dados = (await consultar(credencial, 'saldo_empresa.php', {})) as { saldo?: number } | null
  return Number(dados?.saldo ?? 0)
}

// ────────────────────────────────────────────────── diagnóstico do token

/**
 * O token, mascarado, para conferir sem expor.
 *
 * O comprimento é o que resolve a confusão mais comum: o Token de Acesso deles
 * tem 40 caracteres e a Chave de Acesso tem 32. Trocar um pelo outro devolve
 * exatamente "Token inválido" — e o valor sozinho, escondido atrás de um campo
 * de senha, não deixa ninguém perceber a troca.
 */
export function impressaoDoToken(token: string): string {
  const t = token.trim()
  if (!t) return 'vazio'
  const visivel = t.length <= 10 ? t.slice(0, 2) : `${t.slice(0, 4)}…${t.slice(-4)}`
  return `${visivel} (${t.length} caracteres)`
}

export type TesteDeToken =
  | { aceito: true; resposta: string }
  | { aceito: false; resposta: string }

/**
 * Testa o token sem provocar erro do lado deles.
 *
 * A primeira versão disto mandava um POST vazio para
 * `receber_campanha_externa.php` e lia a recusa por campo obrigatório como
 * "token bom". Funcionava — e era uma armadilha: a política deles (§6.1)
 * bloqueia o IP por 15 MINUTOS depois de 5 respostas 4xx em 5 minutos, e um
 * POST sem `perfil_nome` é justamente um 400. Cinco cliques em "Conferir
 * credencial" derrubariam junto o polling de todas as campanhas vivas — pior
 * do que o problema que aquilo resolvia.
 *
 * `listar_campanhas.php` responde 200 com token bom e 401 com token ruim, e
 * recebe o token pelo MESMO parâmetro `api_token` que a submissão usa. Segundo
 * a seção 1 da documentação deles, parâmetro, cabeçalho e campo POST
 * autenticam igual em qualquer endpoint — então esta consulta prova o que a
 * submissão precisa provar, sem gastar cota de erro.
 */
export async function conferirTokenNoUpload(
  credencial: CredencialMonitor,
): Promise<TesteDeToken> {
  const url = new URL(`${BASE}/listar_campanhas.php`)
  url.searchParams.set('api_token', credencial.apiToken)

  const resposta = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const corpo = (await lerJson(resposta)) as { success?: boolean; message?: string } | null
  const mensagem = corpo?.message ?? `HTTP ${resposta.status}`

  if (resposta.ok && corpo?.success) return { aceito: true, resposta: mensagem }
  return { aceito: false, resposta: mensagem }
}
