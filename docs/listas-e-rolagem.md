# Listas e rolagem dos painéis

Todas as listas de registros usam uma área de altura máxima, sem remover itens do resultado carregado. A quantidade de linhas visíveis varia com a altura do conteúdo e a tela: textos longos não aumentam a página inteira.

- `ListaRolavel`, em `src/components/ui/base.tsx`: até 30rem (480px), limitada também a 65% da altura da tela. Aproximadamente 8 linhas de tabela comum.
- Variante `compacta`: até 21rem (336px), limitada a 60% da tela. Aproximadamente 5 entradas do log.
- `Tabela` aplica o limite automaticamente a qualquer tabela nova; cabeçalho fixo, rolagem horizontal e vertical na mesma área.
- As áreas têm nome acessível, foco visível e navegação pelo teclado. Nenhuma depende de hidratação ou consultas adicionais.
- Filtros, paginação e formulários de criação fora das listas continuam visíveis. Edição dentro de um registro permanece acessível pela rolagem.
- Cards lado a lado se alinham pelo topo e não se esticam para acompanhar o histórico vizinho.
- O menu lateral fica limitado à altura da janela no computador e já tem rolagem própria no celular.

## Mapeamento de tabelas (20 instâncias)

| Tela | Conteúdo | Limite |
| --- | --- | --- |
| `/admin` | Quem mais consumiu | Compacto |
| `/admin/clientes` | Clientes | Padrão |
| `/admin/clientes/[id]` | Extrato e acessos (2 tabelas) | Compacto |
| `/admin/usuarios` | Usuários | Padrão |
| `/admin/equipe` | Time Nex | Padrão |
| `/admin/envios` | Envios | Padrão |
| `/admin/operacao` | Campanhas com pendências | Padrão |
| `/campanhas` | Campanhas | Padrão |
| `/campanhas/[id]` | Motivos de falha | Padrão |
| `/contatos` | Contatos | Padrão |
| `/contatos/listas` | Importações recentes | Compacto |
| `/contatos/importar` | Linhas recusadas | Padrão |
| `/saldo` | Saldo e extrato | Padrão |
| `/historico` | Histórico de envios | Padrão |
| `/respostas` | Respostas recebidas | Padrão |
| `/configuracoes` | Extrato da conta | Compacto |
| `/configuracoes/equipe` | Equipe da conta | Padrão |
| `/configuracoes/api` | Chaves de API | Padrão |
| `/canais` | Números conectados | Padrão |

## Listas fora das tabelas

| Tela/componente | Conteúdo | Limite |
| --- | --- | --- |
| `/admin` | O que aconteceu (auditoria) | Compacto |
| `/admin/precos` | Preços padrão / exceções por cliente | Compacto / padrão |
| `/admin/clientes/[id]` | Preços por canal | Compacto |
| `/admin/provedores` | Provedores configurados | Padrão |
| `/painel` | Campanhas em curso / ranking de uso por canal | Compacto |
| `/contatos/listas` | Suas listas | Padrão |
| `/contatos/importar` | Amostra de contatos válidos | Compacto, amostra existente de 5 |
| `ColarNumeros` | Erros de números colados | Compacto, amostra existente de 5 |
| `/canais` | Configurações de cada canal | Padrão; criação fora da lista |
| `/disparo` | Escolher canal | Padrão |
| `/disparo` | Escolher listas e etiquetas / fontes na confirmação | Compacto |
| `/campanhas/[id]` | Fontes do público | Compacto |
| Navegação dos dois painéis | Itens do menu | Altura da janela |

## Elementos revisados que já são limitados

- Opções de clientes, listas, etiquetas e campanhas em campos `select`: abertas pelo controle nativo do navegador, sem aumentar a página.
- Etiquetas por contato: até 4 e indicador do restante, como antes.
- Escopos de API, papéis, horários, passos do disparo, marcadores e regras: conjuntos fixos de configuração, sem acúmulo de registros.
- Diagnóstico de prontidão: conjunto fixo de verificações; pendências variáveis estão na tabela limitada.
- Campos do cadastro, indicadores e gráficos de período: conteúdo fixo ou agregado. Não são históricos que aumentam por registro.
- Navegação pública, textos institucionais e documentos jurídicos: conteúdo editorial fixo, sem truncamento de leitura.

A mudança não altera os limites de consulta, permissões, filtros ou paginação existentes. Novas listas de registros devem usar `ListaRolavel`; novas tabelas devem usar `Tabela`.
