# Acesso e prontidão operacional da Nex Envios

Revisão de 10/09/2026, sobre `1b38152394eb0bfae510cb8c4fc79a304fa6ec14`.

## O que foi entregue

| Área | Endereço | Comportamento |
| --- | --- | --- |
| Entrada única | `/entrar` | Clientes e sócios usam o mesmo login, com recuperação e primeiro acesso. A conta autenticada determina o destino: painel do cliente ou administração exclusiva. As permissões são conferidas no servidor. |
| Compatibilidade com links antigos | `/entrar/admin` | Redireciona para `/entrar`, sem uma tela separada de acesso. |
| Primeiro acesso | `/primeiro-acesso` | Solicita link para a conta previamente criada pela Nex. Não permite cadastro público sem autorização. |
| Recuperação | `/recuperar` e `/definir-senha/[token]` | Link de uso único; novo link invalida os anteriores; mudança de senha derruba sessões antigas. |
| Gestão dos sócios | `/admin` | Clientes, usuários, time Nex, preços, provedores e envios, com as autorizações centralizadas. |
| Liberação da operação | `/admin/operacao` | Mostra agendador, e-mail de acesso, canais da plataforma, preços, contas sem administrador e campanhas sem acompanhamento. |
| Créditos do cliente | `/saldo` | Saldo, valor comprometido, limite disponível e últimos 100 lançamentos, restritos à empresa autenticada. |

A criação de cliente grava empresa, administrador, crédito inicial e auditoria na mesma transação. Senha ou link aparecem no resultado autenticado, sem parâmetros de URL. Convites podem ser copiados pela administração quando o e-mail transacional não está disponível.

| Papel | Escopo |
| --- | --- |
| Administrador Nex (`superadmin`) | Gestão global, configurações comerciais e usuários do time Nex. Exige vínculo com a organização interna. |
| Suporte (`suporte`) | Consulta operacional e assistência aos acessos de clientes. Não altera preços, provedores ou executa disparos. |
| Administrador da conta (`admin`) | Operação e equipe da própria empresa. Não concede papéis Nex. |
| Operador (`operador`) | Operação da própria empresa; sem gestão de acessos. |
| Visualizador (`visualizador`) | Consulta da própria empresa. |

## Correções com impacto na operação

- Removida a autorização do cron baseada apenas em `x-vercel-cron`. O cabeçalho `Authorization: Bearer CRON_SECRET` agora é obrigatório; o lote máximo é 100.
- Limite de tentativas de login persistido no Postgres, por origem e conta, com identificadores em hash. O limite anterior em memória era independente em cada instância.
- Tokens de senha deixaram de ser escritos nos logs. Convite e recuperação se invalidam mutuamente; consumo de token e redefinição são atômicos.
- Operadores não conseguem alterar usuários chamando diretamente o serviço de acessos. As telas usam a mesma proteção para o último administrador ativo e o último sócio administrador.
- Cancelamento da empresa invalida sessões e links. Contas suspensas não podem executar novas operações de escrita. Mudanças de papel revogam sessões.
- Chaves de API precisam de escopos explícitos; chave sem escopo não ganha permissão automaticamente. O registro de último uso passou a ser executado.
- Reservas de campanhas em andamento são descontadas do orçamento disponível. A criação trava a organização e reconfere o saldo antes de aceitar outra campanha.
- Débito, custo realizado e contador de processamento externo são atualizados em uma transação. Consultas concorrentes ou contagens regressivas do provedor não cobram mensagens novamente.
- Campanhas delegadas já nascem fora da fila de envios individuais. Uma interrupção durante o upload não pode fazer o motor tentar enviar cada contato outra vez.
- Resposta ambígua ao envio externo mantém a campanha aguardando conferência, com saldo comprometido. O sistema não presume que uma falha de rede significa que o provedor rejeitou o envio.
- Respostas recebidas são importadas antes de concluir o acompanhamento da campanha; falha nessa importação permite nova consulta. Motivo de rejeição permanece visível.
- Downloads de mídia bloqueiam endereços privados, validam DNS no socket e cada redirecionamento, e têm limites de tamanho e tempo.
- Painéis distinguem totais agregados do provedor dos indicadores baseados em envios individuais. Corrigida a contagem de campanhas aguardando e o estado inicial do painel de clientes com campanhas delegadas.
- Corrigido o gradiente duplicado do logotipo, que fazia o símbolo desaparecer em telas pequenas.

## O que a inspeção do ambiente mostrou

O repositório integra **Monitor de Envios**, no endereço `https://monitordeenvios.com/api`. O pedido menciona **Manda Envios**. Não foi presumido que sejam o mesmo fornecedor nem foi trocado o endereço sem o contrato correto.

Na consulta do banco havia apenas a organização interna, dois administradores Nex e campanhas pequenas de teste. Foram identificadas uma campanha aguardando com mais de 800 falhas de acompanhamento e campanhas antigas com código externo marcadas como falha. O motivo recorrente é “Campanha não encontrada”. Não é prova de que nada foi enviado: esses registros precisam de conciliação com o fornecedor. Nenhum status histórico, saldo ou credencial de produção foi alterado nesta revisão.

Os dois canais Monitor ativos pertencem à organização interna; não havia canal global da plataforma. Clientes novos não herdam os canais internos. É necessário cadastrar os canais comercializados em `/admin/provedores`, com as credenciais e preços apropriados, ou configurar canais específicos por cliente.

O batimento estava recente durante a inspeção: a execução automática está ativa. Após publicar a correção, é necessário confirmar que o agendador envia o Bearer e continua atualizando o batimento. A configuração diária de fallback em `vercel.json` sozinha não atende ao acompanhamento por minuto.

## Banco e publicação

A migração `0014_acesso_e_operacao.sql` foi aplicada no projeto Supabase conectado e registrada em `_migrations`. Ela adiciona somente a tabela do limite de autenticação e seu índice. Foi conferido que RLS está habilitado e que `anon` e `authenticated` não têm permissão de leitura nessa tabela. A aplicação continua usando autenticação própria, com acesso ao Postgres pelo servidor; não houve migração de usuários para Supabase Auth.

Antes dessa mudança, `_migrations` só registrava os arquivos até `0009`, embora as estruturas de `0010` a `0013` já estivessem presentes. Os arquivos são idempotentes, mas esse histórico deve ser reconciliado pelo responsável pela publicação; não foram inseridos registros afirmando execuções históricas que não pudemos comprovar.

O código foi preparado em branch separada. A publicação do código, deste relatório e do PR no repositório público foi autorizada pelo responsável em 10/09/2026. O estado das verificações e da implantação deve ser acompanhado no PR e na Vercel. A aplicação em produção só terá as novas telas e proteções depois da publicação dessa branch. A tabela adicional é compatível com a versão anterior; eventual rollback deve preservar dados operacionais e não exige apagar a tabela.

## Validação e limites

- 198 testes aprovados em 21 arquivos, incluindo autenticação, isolamento, acessos, motor, agendamento e integração com servidor falso do provedor.
- Testes de banco locais executados em PGlite com uma conexão; isso não substitui validação de concorrência entre múltiplas conexões PostgreSQL. O workflow adicionado executa a suíte em PostgreSQL 16 no GitHub.
- TypeScript, lint e build de produção verificados.
- Fluxo de navegador sobre o build de produção, sem erros de JavaScript ou console, com empresa e usuários fictícios: login dos sócios, criação de cliente com crédito inicial, login do cliente, bloqueio de `/admin` e extrato. Conferência de layout em desktop e celular.
- A suíte simula respostas do provedor. Não houve disparo, recarga comercial ou envio de e-mail para pessoas reais durante a validação.
- Não foi comprovada a entrega transacional do Resend, nem a aceitação/entrega de uma campanha real. O painel informa a presença da variável; isso não garante remetente verificado ou entrega na caixa postal.

## Pendências para liberar clientes

1. Confirmar se “Manda Envios” é o Monitor configurado. Obter a documentação e a credencial corretas caso seja outro serviço.
2. Conciliar os códigos externos com erro e as falhas históricas, usando a conta correta no fornecedor; não repetir os disparos sem essa conferência.
3. Cadastrar e validar os canais da plataforma e os preços dos canais vendidos. Validar especificamente o contrato de **SMS**: o adaptador atual usa o upload de campanhas com perfis e não envia um seletor explícito de canal.
4. Validar remetente e entrega de convite/recuperação. Conferir `APP_URL` com HTTPS, banco, chave de criptografia e segredo do cron no ambiente publicado, sem compartilhar os valores.
5. Publicar a branch revisada, confirmar os resultados do workflow e verificar que o agendador continua autenticado e ativo.
6. Executar um piloto autorizado com destinatários de teste, verificando aceitação, código de acompanhamento, aprovação, processamento, respostas, descadastro e conciliação do extrato Nex com o fornecedor.

A revisão corrige os defeitos identificados; não constitui garantia de ausência de todos os bugs nem libera comercialmente a integração externa sem o piloto acima.
