# Regras de domínio — SANE (controle de recibos/NF/empenhos)

Notas de negócio que explicam decisões do modelo de dados. Mantenha aqui o
"porquê" das particularidades, para não serem tratadas como bug em manutenções
futuras.

## Recibos com numeração repetida (mesmo número em Campi diferentes)

A empresa **C. Teixeira** (grupos **Estocáveis A** e **Estocáveis B**) emite
recibos de **numeração única, diferenciados apenas pelo Campus recebedor**. Por
isso existem vários recibos com o mesmo número — por exemplo, vários
`060/2025-B`, um por Campus.

- No banco isso é **legítimo**: a unicidade do recibo é por **`numero` +
  `campus_id`** (`unique (numero, campus_id)` em `public.recibos`), não só pelo
  número.
- Como as NFs são por **contrato/grupo**, a mesma numeração de recibo é
  **associada várias vezes**, em Campi diferentes. Isso gera **multi-vínculo
  legítimo** em `public.nf_recibos` (N:N). **Não é duplicidade/erro** — é o
  desenho pedido pela SANE.

## Vínculo recibo ⇄ NF é bilateral e aditivo

Duas telas associam recibo e NF por caminhos diferentes:

- **Tela do recibo** grava `recibos.nf_id` (vínculo "principal"/mais recente).
- **Tela da NF** grava `public.nf_recibos` (N:N, fonte do multi-vínculo).

Os gatilhos da **seção 21/22 do `schema.sql`** mantêm os dois em sincronia de
forma **ADITIVA e não-destrutiva**: associar em qualquer tela aparece na outra;
desvincular numa tela remove apenas o vínculo correspondente. Adicionar/remover
uma associação **nunca** mexe nas demais — preservando o multi-vínculo acima.

## Quem associa NF ao recibo

Apenas **SANE/admin** associam NF ao recibo. A interface já oculta o campo para
perfis de campus; um gatilho `BEFORE` em `public.recibos` reforça isso no banco
(campus/outros não definem nem alteram `recibos.nf_id`). Objetivo: evitar erro de
cadastro do campus que só seria percebido depois pela SANE.

## Apostilamento (reajuste de preços)

- **Por percentual** (`aplicar_reajuste_grupo`): aplica um índice único sobre
  todos os itens ativos do grupo.
- **Por valores** (`aplicar_apostilamento_itens`): aplica preços **específicos
  por item** (caso comum quando o termo traz uma tabela de preços). Ambos
  historizam em `public.itens_precos` (com data-base e referência) e atualizam o
  cache `itens.preco_unitario`, que é o preço que a Solicitação de NF e os novos
  lançamentos usam.

## Status do recibo segue a NF paga

Quando a NF é marcada como **`pago`**, os recibos vinculados passam a `pago`
automaticamente (gatilho na seção 19 do `schema.sql`). Recibo `cancelado` não é
reativado; se a NF deixa de estar paga, o recibo volta a `pendente`.
