import type { Channel } from '@/db/schema/enums'
import { TAMANHO_MAXIMO, TAMANHO_MINIMO } from '@/lib/channels/nome-perfil'

/**
 * Os campos de cada provedor, descritos como dados.
 *
 * Uma lista e não um `switch` espalhado pela tela: assim a validação no
 * servidor, o formulário e a máscara do que já está salvo leem a MESMA
 * definição, e acrescentar um provedor é acrescentar uma entrada.
 *
 * `segredo: true` marca o que nunca volta para a tela — o campo aparece vazio
 * na edição, com o rótulo "deixe em branco para manter".
 */

export type CampoDoProvedor = {
  nome: string
  rotulo: string
  tipo?: 'texto' | 'senha' | 'url' | 'area' | 'selecao' | 'imagem'
  opcoes?: { valor: string; rotulo: string }[]
  dica?: string
  exemplo?: string
  obrigatorio?: boolean
  segredo?: boolean
  padrao?: string
}

const GENERICO: CampoDoProvedor[] = [
  {
    nome: 'url',
    rotulo: 'Endereço da API',
    tipo: 'url',
    obrigatorio: true,
    exemplo: 'https://api.seuprovedor.com.br/v1/enviar',
  },
  {
    nome: 'metodo',
    rotulo: 'Método',
    tipo: 'selecao',
    padrao: 'POST',
    opcoes: [
      { valor: 'POST', rotulo: 'POST' },
      { valor: 'GET', rotulo: 'GET' },
      { valor: 'PUT', rotulo: 'PUT' },
    ],
  },
  {
    nome: 'auth',
    rotulo: 'Como autentica',
    tipo: 'selecao',
    padrao: 'bearer',
    opcoes: [
      { valor: 'bearer', rotulo: 'Bearer no cabeçalho Authorization' },
      { valor: 'header', rotulo: 'Cabeçalho próprio' },
      { valor: 'query', rotulo: 'Parâmetro na URL' },
      { valor: 'basic', rotulo: 'Usuário e senha (Basic)' },
      { valor: 'nenhum', rotulo: 'Sem autenticação' },
    ],
  },
  { nome: 'authHeader', rotulo: 'Nome do cabeçalho', dica: 'Só para "Cabeçalho próprio".', exemplo: 'x-api-key' },
  { nome: 'authQuery', rotulo: 'Nome do parâmetro', dica: 'Só para "Parâmetro na URL".', exemplo: 'key' },
  { nome: 'apiKey', rotulo: 'Chave', tipo: 'senha', segredo: true },
  { nome: 'usuario', rotulo: 'Usuário', dica: 'Só para Basic.' },
  { nome: 'senha', rotulo: 'Senha', tipo: 'senha', segredo: true, dica: 'Só para Basic.' },
  {
    nome: 'corpoTemplate',
    rotulo: 'Corpo da requisição',
    tipo: 'area',
    dica: 'JSON com marcadores. Use {{mensagem_json}} no texto para as aspas não quebrarem o JSON.',
    exemplo: '{"numero":"{{para}}","texto":"{{mensagem_json}}"}',
  },
  {
    nome: 'queryTemplate',
    rotulo: 'Parâmetros na URL',
    dica: 'Para provedor que só aceita GET.',
    exemplo: 'to={{para}}&msg={{mensagem_url}}',
  },
  {
    nome: 'contentType',
    rotulo: 'Formato do corpo',
    tipo: 'selecao',
    padrao: 'json',
    opcoes: [
      { valor: 'json', rotulo: 'JSON' },
      { valor: 'form', rotulo: 'Formulário (x-www-form-urlencoded)' },
    ],
  },
  {
    nome: 'caminhoId',
    rotulo: 'Onde está o id na resposta',
    dica: 'Caminho separado por ponto. Serve para casar o webhook de status depois.',
    exemplo: 'data.messageId',
  },
  {
    nome: 'caminhoErro',
    rotulo: 'Onde está o erro na resposta',
    dica: 'Muito provedor devolve HTTP 200 com o erro no corpo. Se este caminho tiver valor, o envio é dado como falho.',
    exemplo: 'error',
  },
  {
    nome: 'marcaDeSucesso',
    rotulo: 'Texto que indica sucesso',
    dica: 'Opcional. Se informado, a resposta precisa conter este texto.',
    exemplo: '"status":"ok"',
  },
]

export const CAMPOS_DO_PROVEDOR: Record<string, CampoDoProvedor[]> = {
  meta_cloud: [
    {
      nome: 'phoneNumberId',
      rotulo: 'ID do número',
      obrigatorio: true,
      dica: 'O Phone Number ID do WhatsApp Business, no painel da Meta.',
      exemplo: '109876543210987',
    },
    { nome: 'accessToken', rotulo: 'Token de acesso', tipo: 'senha', obrigatorio: true, segredo: true },
    { nome: 'versao', rotulo: 'Versão da Graph API', padrao: 'v21.0', dica: 'Fixar evita quebra quando a Meta muda.' },
    { nome: 'idioma', rotulo: 'Idioma dos modelos', padrao: 'pt_BR' },
  ],
  evolution: [
    {
      nome: 'url',
      rotulo: 'Endereço da Evolution',
      tipo: 'url',
      obrigatorio: true,
      exemplo: 'https://evolution.suaempresa.com.br',
    },
    { nome: 'apikey', rotulo: 'Chave global', tipo: 'senha', obrigatorio: true, segredo: true },
  ],
  smsdev: [{ nome: 'apiKey', rotulo: 'Chave da API', tipo: 'senha', obrigatorio: true, segredo: true }],
  comtele: [
    { nome: 'apiKey', rotulo: 'Auth Key', tipo: 'senha', obrigatorio: true, segredo: true },
    {
      nome: 'remetente',
      rotulo: 'Remetente',
      dica: 'Nome curto que aparece como origem, onde a operadora permite.',
      exemplo: 'NEXENVIOS',
    },
  ],
  /*
   * Os quatro campos de perfil são OBRIGATÓRIOS aqui, e não na hora do disparo.
   *
   * A API deles exige `perfil_nome` e `foto_perfil` em toda campanha —
   * inclusive SMS, onde ninguém os vê. Deixá-los opcionais no cadastro
   * permitia salvar um canal pela metade e descobrir isso só ao criar o
   * disparo, com a base montada. Exigir aqui custa um minuto uma vez; deixar
   * para depois custa o disparo.
   */
  monitor_envios: [
    {
      nome: 'apiToken',
      rotulo: 'Token de acesso',
      tipo: 'senha',
      obrigatorio: true,
      segredo: true,
      dica: 'O api_token do seu cadastro no Monitor de Envios. Não é a Chave de Acesso, que é o que eles mandam para você.',
    },
    {
      nome: 'perfilNome',
      rotulo: 'Perfil padrão — nome',
      obrigatorio: true,
      dica: `De ${TAMANHO_MINIMO} a ${TAMANHO_MAXIMO} caracteres. Tem que ser nome comercial: nada de frase, promessa ou termo de aposta.`,
      exemplo: 'Moveis Silva',
    },
    {
      nome: 'perfilFoto',
      rotulo: 'Perfil padrão — foto',
      tipo: 'imagem',
      obrigatorio: true,
      dica: 'Envie do computador ou cole um link. Quadrada, de 192×192 a 4096×4096, até 5 MB. Exigida em toda campanha — inclusive SMS, onde ninguém a vê.',
      exemplo: 'https://seusite.com.br/avatar.png',
    },
    {
      nome: 'perfilNome2',
      rotulo: 'Perfil reserva — nome',
      obrigatorio: true,
      dica: 'Obrigatório no Monitor (o comunicado diz 01/09/2026, a documentação da API diz 10/09 — vale a data mais cedo). A equipe deles usa se a Meta reprovar o principal; precisa ser diferente dele.',
      exemplo: 'Silva Moveis',
    },
    {
      nome: 'perfilFoto2',
      rotulo: 'Perfil reserva — foto',
      tipo: 'imagem',
      obrigatorio: true,
      dica: 'Mesmas regras da principal, e precisa ser uma imagem diferente.',
      exemplo: 'https://seusite.com.br/avatar-2.png',
    },
  ],
  generico: GENERICO,
}

/** Os marcadores que o provedor genérico entende. A tela mostra esta lista. */
export const MARCADORES = [
  { chave: '{{para}}', explica: 'o número em E.164 sem o "+" — 5511987654321' },
  { chave: '{{para_mais}}', explica: 'o número com o "+" na frente' },
  { chave: '{{mensagem}}', explica: 'o texto, como está' },
  { chave: '{{mensagem_json}}', explica: 'o texto com as aspas escapadas — use dentro de JSON' },
  { chave: '{{mensagem_url}}', explica: 'o texto codificado para URL — use em query string' },
  { chave: '{{nome}}', explica: 'o nome do contato, quando houver' },
  { chave: '{{midia}}', explica: 'a URL da imagem ou vídeo' },
  { chave: '{{audio}}', explica: 'a URL do áudio, no torpedo de voz' },
]

/** Um exemplo pronto por canal, para quem está configurando o genérico. */
export const EXEMPLO_GENERICO: Partial<Record<Channel, string>> = {
  sms: '{"to":"{{para}}","message":"{{mensagem_json}}"}',
  rcs: '{"msisdn":"{{para}}","content":{"text":"{{mensagem_json}}"}}',
  voz: '{"phone":"{{para}}","audio_url":"{{audio}}","text":"{{mensagem_json}}"}',
  whatsapp_oficial: '{"phone":"{{para}}","message":"{{mensagem_json}}"}',
  whatsapp_nao_oficial: '{"number":"{{para}}","text":"{{mensagem_json}}"}',
}
