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
  enviadas: number
  recebidas: number
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

/** DD/MM/YYYY, como eles aceitam. */
function dataBr(quando: Date): string {
  const d = String(quando.getUTCDate()).padStart(2, '0')
  const m = String(quando.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${quando.getUTCFullYear()}`
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

  // O token vai no cabeçalho, não na URL: assim ele não fica gravado no log
  // do servidor deles nem em nenhum proxy pelo caminho.
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
  } | null

  return {
    progresso: Number(dados?.progresso ?? 0),
    enviadas: Number(dados?.quantidadeEnviada ?? 0),
    recebidas: Number(dados?.quantidadeRecebida ?? 0),
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
