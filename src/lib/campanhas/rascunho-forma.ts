import { z } from 'zod'

/**
 * A forma do rascunho do disparo.
 *
 * Mora fora de `rascunho.ts` porque aquele módulo é `server-only` — ele fala
 * com o banco — e o assistente é componente de cliente. `import type` de um
 * módulo server-only funciona por acidente de compilação; um arquivo separado
 * é o que torna a dependência honesta nos dois sentidos.
 */

/**
 * O formato do rascunho.
 *
 * Validado na volta, e não só na ida. O payload é jsonb: uma versão antiga da
 * tela, um campo renomeado ou uma linha mexida à mão devolveriam `undefined`
 * no meio de um `useState` e quebrariam a tela inteira, no lugar de
 * simplesmente ignorar um rascunho que não serve mais.
 */
export const formaDoRascunho = z.object({
  passo: z.number().int().min(1).max(4).catch(1),
  configId: z.string().uuid().nullable().catch(null),
  listas: z.array(z.string().uuid()).max(200).catch([]),
  etiquetas: z.array(z.string().max(80)).max(200).catch([]),
  todaABase: z.boolean().catch(false),
  nome: z.string().max(120).catch(''),
  corpo: z.string().max(20_000).catch(''),
  mediaUrl: z.string().max(2_000).catch(''),
  eleitoral: z.boolean().catch(false),
  ritmo: z.number().int().min(1).max(10_000).catch(60),
  abreAs: z.number().int().min(0).max(23).catch(8),
  fechaAs: z.number().int().min(0).max(23).catch(21),
  quando: z.enum(['agora', 'agendar']).catch('agora'),
  agendarEm: z.string().max(40).catch(''),
  perfilNome: z.string().max(120).catch(''),
  perfilFoto: z.string().max(2_000).catch(''),
  perfilNome2: z.string().max(120).catch(''),
  perfilFoto2: z.string().max(2_000).catch(''),
  politicaDocumento: z.string().max(40).catch(''),
  politicaPartido: z.string().max(120).catch(''),
})

export type Rascunho = z.infer<typeof formaDoRascunho>
