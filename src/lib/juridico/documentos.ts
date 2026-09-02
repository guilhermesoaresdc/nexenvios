/**
 * Os documentos jurídicos, como texto.
 *
 * A fonte é o `.md` que o jurídico entrega, colado aqui SEM alteração — nem
 * de pontuação. É de propósito: quem responde por uma política de privacidade
 * responde pela redação dela, e uma vírgula "melhorada" no meio do caminho é
 * exatamente o que ninguém consegue explicar depois. Publicar é atualizar a
 * constante e subir a versão.
 *
 * Ficam em template literal, e não em arquivo lido do disco, porque isso os
 * torna parte do build: se o texto sumir, o build quebra — em vez de a página
 * ir ao ar vazia. E vale a conferência do `tsc` sobre o resto do módulo.
 */

export type Documento = {
  /** O caminho onde ele mora. Não muda: vira link em contrato e em cadastro. */
  rota: string
  titulo: string
  descricao: string
  versao: string
  /** ISO, para o `dateModified` e para o `<time>`. */
  atualizadoEm: string
  fonte: string
}

/**
 * Política de Privacidade.
 *
 * O endereço é o que a Meta pede no cadastro da conta do WhatsApp Business e o
 * que vai em contrato com cliente. Mudar de rota depois quebra links que estão
 * fora do nosso alcance — então ele é para durar.
 */
export const PRIVACIDADE: Documento = {
  rota: '/privacidade',
  titulo: 'Política de Privacidade',
  descricao: 'Como a Nex Envios coleta, utiliza, compartilha e protege dados pessoais, nos termos da Lei Geral de Proteção de Dados (LGPD).',
  versao: '1.1',
  atualizadoEm: '2026-09-02',
  fonte: `﻿# Política de Privacidade — Nex Envios

**Versão 1.1 · Vigente desde 2 de setembro de 2026**

Esta Política descreve como **NEX CREATIVE LTDA**, inscrita no CNPJ sob o nº **58.132.444/0001-60**, com sede na Rua Dr. Leandro, 175, Sala 05, Centro, Várzea Alegre/CE, CEP 63.540-000 ("**Nex Envios**", "nós"), coleta, utiliza, compartilha e protege dados pessoais, em conformidade com a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD).

Esta Política se aplica ao site https://nexenvios.com.br e a todos os nossos canais oficiais de atendimento, incluindo WhatsApp, Instagram e e-mail.

## 1. Controlador dos dados

O controlador dos dados pessoais tratados nos termos desta Política é NEX CREATIVE LTDA, CNPJ 58.132.444/0001-60. Quando a Empresa envia mensagens em nome de um cliente anunciante, no âmbito de uma campanha de publicidade contratada por esse cliente, a definição de quem é controlador e quem é operador daquele tratamento específico segue o que estiver definido no contrato firmado com o respectivo cliente.

## 2. Dados que coletamos

### 2.1 Dados fornecidos por você

- Cadastro: nome completo, CPF ou CNPJ, data de nascimento, e-mail, telefone.
- Faturamento: dados necessários à cobrança do serviço contratado.
- Contratação: histórico de serviços contratados, planos e campanhas.
- Atendimento: conteúdo das mensagens trocadas em nossos canais, incluindo áudios, imagens e documentos enviados por você.

### 2.2 Dados coletados automaticamente

- Endereço IP, tipo e versão de navegador, sistema operacional e dispositivo.
- Páginas acessadas, tempo de permanência, origem do acesso e termos de busca.
- Identificadores de cookies e tecnologias similares.

### 2.3 Dados recebidos de terceiros

- Confirmações e status de transação fornecidos por instituições de pagamento e antifraude.
- Identificadores de conta, status de entrega e leitura de mensagens fornecidos pela API Oficial do WhatsApp (Meta) e pelos demais provedores de mensageria utilizados nos canais de WhatsApp, SMS, RCS e torpedo de voz.

### 2.4 Dados de destinatários fornecidos por clientes

- Para executar uma campanha contratada, o cliente anunciante nos fornece a base de contatos que receberá as mensagens, contendo telefone e, quando informados, nome e demais campos usados para personalizar a mensagem.
- Nesse tratamento específico, e observado o disposto no item 1 desta Política, o cliente anunciante é, em regra, o controlador dos dados dos destinatários, atuando a Empresa como operadora, nos termos do art. 5º, VII, da LGPD.
- Cabe ao cliente anunciante assegurar a licitude da base fornecida e obter e comprovar a manifestação de vontade prévia (opt-in) dos destinatários.
- Registramos as respostas dos destinatários às campanhas e os pedidos de descadastro, para atender à solicitação e comprovar o atendimento.

**Dados sensíveis:** não coletamos intencionalmente dados pessoais sensíveis (origem racial ou étnica, convicção religiosa, opinião política, filiação sindical, dados de saúde, vida sexual, genéticos ou biométricos). Pedimos que não os inclua em mensagens enviadas aos nossos canais.

## 3. Finalidades e bases legais

| Finalidade | Base legal (LGPD) |
| --- | --- |
| Processar contratações, pagamentos e prestação do serviço de envio de mensagens | Execução de contrato — art. 7º, V |
| Prestar atendimento e suporte nos canais oficiais | Execução de contrato / procedimentos preliminares — art. 7º, V |
| Emitir documentos fiscais e cumprir obrigações legais | Cumprimento de obrigação legal — art. 7º, II |
| Prevenir fraudes e garantir a segurança das operações | Legítimo interesse — art. 7º, IX |
| Enviar comunicações promocionais e ofertas | Consentimento — art. 7º, I |
| Personalizar a experiência e recomendar serviços | Legítimo interesse — art. 7º, IX |
| Analisar métricas de navegação e desempenho | Legítimo interesse — art. 7º, IX |
| Exercer direitos em processos judiciais ou administrativos | Exercício regular de direitos — art. 7º, VI |

## 4. Compartilhamento de dados

Não vendemos dados pessoais. Compartilhamos apenas o necessário com:

- Meta / WhatsApp Business Platform, provedora da API Oficial do WhatsApp utilizada para envio e recebimento de mensagens;
- provedores de mensageria e operadoras de telefonia contratados para executar os disparos nos canais de WhatsApp, SMS, RCS e torpedo de voz, aos quais transmitimos os números de destino e o conteúdo da campanha, inclusive nos casos em que a execução do disparo é delegada integralmente ao provedor;
- operadores e fornecedores que atuam em nosso nome — hospedagem, ferramentas de CRM, e-mail e analytics;
- instituições financeiras e gateways de pagamento, para processamento e antifraude;
- autoridades públicas, quando exigido por lei, ordem judicial ou requisição de autoridade competente;
- terceiros em operações societárias, em caso de fusão, aquisição ou reorganização, mantidas as obrigações desta Política.

Exigimos de todos os operadores a adoção de medidas de segurança compatíveis e o tratamento restrito às finalidades contratadas. A relação nominal dos fornecedores utilizados em cada canal pode ser solicitada pelo titular a qualquer momento, nos termos do item 9 desta Política.

## 5. Transferência internacional

Alguns fornecedores de tecnologia, incluindo a Meta (WhatsApp Business Platform), provedores de mensageria e prestadores de infraestrutura e hospedagem, podem armazenar ou processar dados fora do Brasil. Nesses casos, a transferência observa o art. 33 da LGPD, mediante cláusulas contratuais adequadas ou outra hipótese legal aplicável.

## 6. Cookies e tecnologias similares

Utilizamos cookies para: (i) manter sua sessão ativa — cookies essenciais; (ii) medir desempenho e uso do site — cookies analíticos; (iii) exibir anúncios relevantes dentro e fora do site — cookies de publicidade. Você pode gerenciar ou bloquear cookies nas configurações do seu navegador, ciente de que o bloqueio de cookies essenciais pode comprometer funcionalidades da Plataforma.

## 7. Prazo de retenção

- Dados fiscais e de faturamento: 5 anos, nos termos da legislação tributária;
- registros de acesso a aplicações de internet: 6 meses, nos termos do art. 15 da Lei nº 12.965/2014 (Marco Civil da Internet);
- dados de cadastro e histórico de contratações: enquanto a conta permanecer ativa e pelo prazo prescricional aplicável após o encerramento;
- registros de consentimento e de comunicações: pelo prazo necessário à comprovação do opt-in.

Encerrados os prazos e as finalidades, os dados são eliminados ou anonimizados.

## 8. Segurança da informação

Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados, perda, alteração ou destruição, incluindo criptografia em trânsito (TLS), controle de acesso por perfil, registro de atividades e avaliação periódica de fornecedores. Nenhum sistema é integralmente imune a incidentes; em caso de incidente de segurança relevante, comunicaremos os titulares afetados e a ANPD conforme o art. 48 da LGPD.

## 9. Seus direitos como titular

Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:

- confirmação da existência de tratamento;
- acesso aos seus dados;
- correção de dados incompletos, inexatos ou desatualizados;
- anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;
- portabilidade a outro fornecedor;
- eliminação dos dados tratados com base no consentimento;
- informação sobre as entidades com as quais compartilhamos dados;
- informação sobre a possibilidade de não fornecer consentimento e suas consequências;
- revogação do consentimento;
- revisão de decisões automatizadas que afetem seus interesses.

As solicitações podem ser enviadas para nexenviosdocs@nexenvios.com.br e serão respondidas nos prazos legais. Podemos solicitar informações adicionais para confirmar sua identidade antes de atender ao pedido.

## 10. Encarregado pelo tratamento de dados (DPO)

Contato do Encarregado: nexenviosdocs@nexenvios.com.br.

## 11. Crianças e adolescentes

Nossos serviços não se destinam a menores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes sem o consentimento específico e em destaque de ao menos um dos pais ou responsável legal, nos termos do art. 14 da LGPD.

## 12. Alterações desta Política

Esta Política pode ser atualizada a qualquer momento. A versão vigente é sempre a publicada nesta página, identificada por número de versão e data. Alterações relevantes serão comunicadas pelos nossos canais.

## 13. Contato e Autoridade Nacional

**NEX CREATIVE LTDA** (Nex Envios)
CNPJ 58.132.444/0001-60
Rua Dr. Leandro, 175, Sala 05, Centro, Várzea Alegre/CE, CEP 63.540-000

Privacidade e LGPD: nexenviosdocs@nexenvios.com.br
Atendimento geral: comercial@nexenvios.com.br ou contato@nexenvios.com.br
Telefone: (88) 9264-0298

Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) por meio do site gov.br/anpd.

---
`,
}

/** Termos de Uso. Mesmo cuidado com a rota: ela é citada fora daqui. */
export const TERMOS: Documento = {
  rota: '/termos',
  titulo: 'Termos de Uso',
  descricao: 'As regras de acesso e uso do site, da plataforma e dos canais oficiais de atendimento da Nex Envios.',
  versao: '1.1',
  atualizadoEm: '2026-09-02',
  fonte: `﻿# Termos de Uso — Nex Envios

**Versão 1.1 · Vigente desde 2 de setembro de 2026**

Estes Termos de Uso ("Termos") regulam o acesso e a utilização do site https://nexenvios.com.br e dos canais digitais de atendimento operados por **NEX CREATIVE LTDA**, inscrita no CNPJ sob o nº **58.132.444/0001-60**, com sede na Rua Dr. Leandro, 175, Sala 05, Centro, Várzea Alegre/CE, CEP 63.540-000, doravante denominada "**Nex Envios**", "nós" ou "Empresa".

**Leia com atenção.** Ao acessar o site, criar uma conta, contratar um serviço ou iniciar uma conversa em qualquer um dos nossos canais oficiais, você declara ter lido, compreendido e aceito integralmente estes Termos. Caso não concorde, não utilize os serviços.

## 1. Definições

- **Usuário:** pessoa física ou jurídica que acessa o site ou os canais de atendimento da Empresa, contrata seus serviços ou recebe mensagens enviadas por ela.
- **Plataforma:** o site https://nexenvios.com.br, suas páginas, funcionalidades e sistemas associados.
- **Canais Oficiais:** os meios de comunicação mantidos pela Empresa, incluindo WhatsApp e Instagram, além de e-mail e telefone divulgados na Plataforma.
- **Agente Automatizado:** sistema de atendimento assistido por tecnologia, incluindo inteligência artificial, utilizado nos Canais Oficiais.
- **API Oficial do WhatsApp:** a WhatsApp Business Platform, disponibilizada pela Meta, utilizada pela Empresa para o envio e recebimento de mensagens.
- **Canais de Envio:** os meios pelos quais a Empresa executa as campanhas contratadas, incluindo WhatsApp — pela API Oficial ou por API não oficial —, SMS, RCS e torpedo de voz.
- **Destinatário:** a pessoa que recebe as mensagens de uma campanha, a partir de base de contatos fornecida pelo Usuário contratante.

## 2. Objeto

A Empresa atua no ramo de agência de publicidade, prestando serviços de comunicação e divulgação por meio do envio de mensagens pelos Canais de Envio — WhatsApp, SMS, RCS e torpedo de voz —, além de atendimento pelos Canais Oficiais. A Plataforma e os Canais Oficiais são utilizados para apresentação dos serviços da Empresa, contratação, acompanhamento de solicitações e atendimento ao Usuário.

## 3. Cadastro e conta de acesso

1. O cadastro exige o fornecimento de informações verdadeiras, completas e atualizadas. O Usuário é o único responsável pela veracidade dos dados informados.
2. As credenciais de acesso são pessoais e intransferíveis. O Usuário deve mantê-las em sigilo e comunicar imediatamente à Empresa qualquer uso não autorizado.
3. É vedado o cadastro por menores de 18 anos sem a assistência ou representação legal de seus pais ou responsáveis.
4. A Empresa poderá suspender ou cancelar contas que apresentem indícios de fraude, uso indevido ou violação destes Termos, mediante comunicação ao Usuário sempre que possível.

## 4. Uso permitido e condutas vedadas

O Usuário compromete-se a utilizar a Plataforma e os Canais Oficiais de forma lícita e de boa-fé. É expressamente vedado:

- praticar atos que violem a legislação vigente, a moral ou os bons costumes;
- utilizar dados de terceiros sem autorização ou se passar por outra pessoa;
- empregar robôs, scrapers ou quaisquer meios automatizados para extrair conteúdo ou dados da Plataforma sem autorização expressa;
- tentar obter acesso não autorizado a sistemas, contas ou áreas restritas;
- introduzir vírus, malware ou código malicioso;
- enviar, pelos Canais Oficiais, conteúdo ofensivo, discriminatório, ilícito, spam ou material que viole direitos de terceiros;
- reproduzir, distribuir ou explorar comercialmente o conteúdo da Plataforma sem autorização escrita.

## 5. Propriedade intelectual

Marcas, logotipos, nomes comerciais, textos, imagens, layout, código-fonte e demais elementos da Plataforma são de titularidade da Empresa ou de terceiros que lhe concederam licença, e estão protegidos pela legislação brasileira de propriedade intelectual. O acesso à Plataforma não confere ao Usuário qualquer direito sobre esses elementos.

## 6. Serviços, planos e contratação

1. Os serviços oferecidos pela Empresa — incluindo envio de mensagens pelos Canais de Envio, campanhas de comunicação e demais serviços de publicidade — são descritos na Plataforma ou em proposta comercial específica.
2. Os valores e planos podem ser alterados a qualquer momento, sem aviso prévio, sendo válido para cada contratação o preço vigente no momento da confirmação.
3. A confirmação da contratação está condicionada à aprovação do pagamento, quando aplicável.
4. Erros manifestos de precificação ou de descrição de serviço não vinculam a Empresa, que comunicará o Usuário e poderá corrigir ou cancelar a contratação, com restituição integral dos valores eventualmente pagos.

## 7. Cancelamento e reembolso

As condições específicas de cancelamento, vigência e reembolso de cada serviço contratado são disciplinadas em proposta comercial ou contrato específico, quando houver. Ficam integralmente resguardados os direitos previstos na Lei nº 8.078/1990 (Código de Defesa do Consumidor), em especial o direito de arrependimento no prazo de 7 (sete) dias corridos nas contratações realizadas fora do estabelecimento comercial, quando aplicável ao Usuário pessoa física na condição de consumidor.

## 8. Atendimento, envio de mensagens e agentes automatizados

1. O atendimento e o envio de mensagens pelos Canais Oficiais, incluindo WhatsApp e Instagram, constituem parte central dos serviços da Empresa e podem ser prestados por atendentes humanos, por Agentes Automatizados ou por ambos.
2. Quando o atendimento for conduzido por Agente Automatizado, essa condição será informada ao Usuário, que poderá, a qualquer momento, solicitar o encaminhamento a um atendente humano.
3. O envio de mensagens depende de manifestação de vontade prévia do destinatário (opt-in) e pode ser cancelado a qualquer tempo, mediante solicitação pelo próprio canal ou pelos meios informados na mensagem.
4. Respostas geradas por Agentes Automatizados têm caráter informativo. Em caso de divergência, prevalecem as informações constantes de contrato, proposta comercial e demais documentos oficiais emitidos pela Empresa.
5. A Empresa não solicita, por nenhum canal, senhas, códigos de verificação, dados completos de cartão de crédito ou pagamentos a contas de titularidade diversa da informada nos documentos oficiais.
6. O uso da API Oficial do WhatsApp pela Empresa observa as políticas comerciais e de mensageria da Meta, incluindo o uso de modelos de mensagem aprovados e o respeito às janelas de conversação aplicáveis. Nos demais Canais de Envio, observam-se as regras das operadoras de telefonia, dos provedores contratados e a regulamentação aplicável a cada meio.
7. A execução técnica do disparo pode ser realizada por provedores de mensageria contratados pela Empresa, aos quais são transmitidos os dados necessários ao envio, incluindo os números dos Destinatários e o conteúdo da campanha.
8. Quando a campanha é contratada por Usuário que fornece a própria base de contatos, cabe a ele a licitude dessa base, a comprovação do opt-in dos Destinatários e a responsabilidade pelo conteúdo submetido para envio, respondendo a Empresa pela execução técnica nos termos contratados.
9. O pedido de descadastro pode ser feito pelo próprio canal em que a mensagem foi recebida e é registrado de forma permanente: o contato descadastrado não volta a receber campanhas, ainda que seja incluído novamente em base enviada depois. Em campanha eleitoral, a mensagem informa a forma de descadastro, na forma da legislação aplicável.

## 9. Proteção de dados pessoais

O tratamento de dados pessoais observa a Lei nº 13.709/2018 (LGPD) e está detalhado na Política de Privacidade disponível na Plataforma, que integra estes Termos.

## 10. Disponibilidade e suspensão

A Empresa envida esforços para manter a Plataforma disponível de forma contínua, mas não garante funcionamento ininterrupto ou isento de falhas. O acesso poderá ser suspenso para manutenção, atualização ou por motivo de força maior, caso fortuito, falha de terceiros ou determinação de autoridade competente.

## 11. Links e serviços de terceiros

A Plataforma e os Canais Oficiais podem conter links ou integrações com serviços de terceiros, incluindo meios de pagamento e plataformas de mensageria, em especial a API Oficial do WhatsApp (Meta). A Empresa não responde pelo conteúdo, pelas políticas ou pela disponibilidade desses serviços, recomendando a leitura dos respectivos termos.

## 12. Limitação de responsabilidade

Respeitados os direitos assegurados pelo Código de Defesa do Consumidor, a Empresa não responde por danos decorrentes de: (i) uso indevido da Plataforma ou dos Canais Oficiais pelo Usuário; (ii) falhas de conexão, equipamento ou software do Usuário; (iii) indisponibilidade de serviços de terceiros; (iv) atos de terceiros que se passem pela Empresa em canais não oficiais.

## 13. Alterações destes Termos

Estes Termos podem ser alterados a qualquer momento para refletir mudanças legais, técnicas ou de negócio. A versão vigente será sempre a publicada nesta página, com indicação de versão e data. O uso continuado após a publicação implica aceitação da nova versão.

## 14. Legislação aplicável e foro

Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de Várzea Alegre, Estado do Ceará, para dirimir controvérsias, sem prejuízo do direito do consumidor de propor demanda no foro de seu domicílio, nos termos do art. 101, I, do Código de Defesa do Consumidor.

## 15. Contato

**NEX CREATIVE LTDA** (Nex Envios)
CNPJ 58.132.444/0001-60
Rua Dr. Leandro, 175, Sala 05, Centro, Várzea Alegre/CE, CEP 63.540-000

E-mail: comercial@nexenvios.com.br ou contato@nexenvios.com.br
Privacidade e LGPD: nexenviosdocs@nexenvios.com.br
Telefone: (88) 9264-0298
Site: https://nexenvios.com.br

---
`,
}

/** Os dois, na ordem em que aparecem no rodapé. */
export const DOCUMENTOS: Documento[] = [TERMOS, PRIVACIDADE]
