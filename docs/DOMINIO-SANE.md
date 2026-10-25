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

## Ocorrências não entram nas quantidades recebidas

Item **não entregue** ou **devolvido** por má qualidade vai para
`public.recibos_ocorrencias`, nunca para `recibos_itens`. Em `recibos_itens` fica
**só o que de fato ficou no campus**, porque é essa quantidade que alimenta
consumo, saldo e conferência de valor da NF.

A ocorrência existe para outro fim: instruir a **notificação à empresa** e, se o
padrão se repetir, o relatório de penalidade. O valor estimado usa o preço
vigente **na data do recibo** (`vw_recibo_item_valor`), não o preço atual.

## Data do pedido manda no pagamento — daí a restrição de dias da semana

O campo `recibos.data_recebimento` guarda a **data do pedido**, não a da entrega
física: é por ela que o pagamento é calculado. No CPII os pedidos saem todos
para **terça-feira**, e campi que lançavam a data da entrega efetiva deslocavam o
pagamento. Entrega em dia diferente deve ser descrita nas **observações**,
mantendo a data do pedido.

A regra não foi cravada no código porque outras instituições têm outra rotina:
os dias aceitos ficam na chave de configuração `recibo_dias_semana` e o gatilho
`valida_dia_recibo` (seção 35) bloqueia **campi** fora deles. **SANE e admin
passam**, para resolver exceção real. Na edição a validação só dispara se a data
mudar, para não transformar o histórico anterior à regra num campo minado. O
padrão de fábrica libera a semana inteira.

## Projeção de reforço: ritmo vem do recibo, saldo vem do empenho

Parece natural projetar consumo a partir das NFs, já que é a NF que debita o
empenho. **Não funciona.** A NF é evento de faturamento: sai em blocos
irregulares e deixa na série buracos que não correspondem a consumo nenhum. Nos
dados de produção de 10/2026, grupos tinham julho com consumo e **junho ausente**,
e fevereiro/março jamais apareciam — o oposto do calendário letivo real.

Por isso a projeção (`src/lib/projecao.ts` + `vw_item_recibo_mensal`) usa:

- **ritmo** dos **recibos**, que são dezenas por mês e datados pelo recebimento;
- **saldo** dos **empenhos**, que é a autoridade contábil.

Duas tentativas foram descartadas e **não devem ser reintroduzidas sem dados
novos**: (1) inferir recesso escolar pelos meses sem consumo — os dados mostraram
que as lacunas seguem faturamento, e o calendário do CPII ainda sofre distorção
por greve; (2) consolidar por **item+empenho** — um item zerado numa NE costuma
ter saldo em outra, e isso gerava centenas de alertas falsos. A unidade de
análise é o **item**, somando os empenhos ativos.

## Exclusao de cadastro: so o que esta vazio, e em tres camadas

Erro de digitacao em cadastro acontece. Sem exclusao pela tela o registro vira
**residuo permanente**: um grupo chamado `ghj`, criado em 17/09/2026, ficou
meses nas listas, nos seletores e no Dashboard — e, pior, numerado como
`I`/`1`, colidindo com o Grupo I real em toda ordenacao.

A regra e sempre a mesma: **so se exclui o que nao tem nada vinculado**, e a
decisao e tomada em tres camadas independentes:

1. **A tela** conta as dependencias ao abrir e desabilita o botao com o motivo
   escrito (`src/lib/exclusao.ts`). Serve para explicar antes do clique.
2. **A RLS** limita quem pode excluir — `sane` e `admin` para grupo,
   fornecedor e empenho. Quem cadastra precisa poder limpar o proprio erro;
   deixar so com o admin resolve metade do problema.
3. **As chaves estrangeiras** sao a ultima palavra. Mesmo que 1 e 2 falhem, o
   Postgres recusa.

## Nem toda chave estrangeira significa a mesma coisa

Ao abrir a exclusao, as regras `ON DELETE` precisaram ser revistas uma a uma —
e nao eram uniformes. Vale entender o criterio antes de mexer:

- **Dependencia real** (`RESTRICT`) — o registro filho tem vida propria e
  perde-lo seria perda de informacao. Itens de um grupo, recibos, NFs, o
  rateio `nf_empenhos`.
- **Parte do proprio registro** (`CASCADE`) — `empenhos_itens` e
  `empenhos_grupos` sao partes do empenho e saem junto com ele. Bloquear a
  exclusao por causa delas impediria justamente o caso de uso: a NE cadastrada
  errada, que ja tem itens lancados e nunca foi usada.
- **`SET NULL` era o perigo.** Apaga o vinculo em silencio, sem erro, deixando
  o registro orfao. Duas correcoes foram feitas em 10/2026:
  - `grupos`, `empenhos`, `recibos` e `notas_fiscais` apontavam para
    `fornecedores` com `SET NULL`: excluir uma empresa em uso teria deixado
    dezenas de registros sem fornecedor, sem aviso nenhum.
  - `nf_itens.empenho_id` (a qual NE cada item da NF foi debitado) tambem
    estava em `SET NULL`. O rateio em `nf_empenhos` ja era `RESTRICT` e cobre
    o caso normal, mas ha uma janela real: a pessoa escolhe a NE linha a linha
    e ainda nao clicou em "Debito pelos itens", entao `nf_itens` aponta para a
    NE sem linha correspondente em `nf_empenhos`. Havia **1 empenho nessa
    situacao em producao**, de 73 ativos.

  Todas passaram a `RESTRICT`. **Nao reverter sem entender isso**: a tela
  sozinha nao protege, porque o estado pode mudar entre o carregamento e o
  clique.

Itens do catalogo sao a excecao deliberada: nao se excluem, usa-se o status
**Inativo**, porque lancamentos antigos precisam do item preservado.

## Teto de 1.000 linhas da API (PostgREST)

Consulta sem paginação **corta no teto configurado do PostgREST e não devolve
erro**. Na prática isso já fez os itens dos recibos mais recentes sumirem da
consolidação do Solicitar NF sem ninguém perceber.

Qualquer consulta que possa passar de mil linhas deve usar `buscarTudo()`
(`src/lib/consulta.ts`), que pagina por `range` — e com **ordenação
deterministica**, senão as páginas repetem ou pulam linhas.
