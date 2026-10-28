-- =====================================================================
-- Saldo em transito: entregue, ainda nao faturado
-- =====================================================================
-- O saldo de vw_empenho_item_saldo desconta o que foi FATURADO (nf_itens),
-- nao o que foi ENTREGUE. Entre uma coisa e outra existe uma janela, e nela
-- o saldo aparece maior do que e — justamente quando o fiscal consulta para
-- decidir se envia um pedido.
--
-- A janela foi medida em producao (28/10/2026), sobre 1.739 recibos dos
-- ultimos 180 dias que ja tinham NF, comparando a data do recibo com a data
-- de lancamento da NF:
--     mediana 21 dias | media 22 | p90 42 | maximo 54
-- E, restrita a 60 dias, a quantidade em transito equivalia em media a 66,6%
-- do saldo exibido dos itens afetados (135 de 159 itens com saldo).
--
-- Por que a janela, e nao todos os recibos sem NF: ate meados de 2026 a
-- correspondencia recibo-NF era feita manualmente e muitos vinculos deixaram
-- de ser registrados. Esses recibos antigos JA estao descontados do saldo (a
-- NF foi lancada; so o vinculo falta), entao soma-los seria descontar duas
-- vezes. A janela separa o atraso real do passivo historico de vinculo.

insert into public.configuracoes (chave, valor, descricao) values
  ('transito_janela_dias', '60',
   'Quantos dias para tras o Planejamento de pedidos considera um recibo sem nota fiscal como "em trânsito" (entregue e ainda não faturado). Medido em produção: a NF costuma ser lançada 21 dias depois do recibo, 42 dias no percentil 90. Recibos mais antigos que isso quase sempre já foram faturados sem o vínculo registrado, e somá-los descontaria duas vezes.')
on conflict (chave) do nothing;

update public.configuracoes
   set descricao = 'Quantos dias para tras o Planejamento de pedidos considera um recibo sem nota fiscal como "em trânsito" (entregue e ainda não faturado). Medido em produção: a NF costuma ser lançada 21 dias depois do recibo, 42 dias no percentil 90. Recibos mais antigos que isso quase sempre já foram faturados sem o vínculo registrado, e somá-los descontaria duas vezes.'
 where chave = 'transito_janela_dias'
   and descricao is distinct from 'Quantos dias para tras o Planejamento de pedidos considera um recibo sem nota fiscal como "em trânsito" (entregue e ainda não faturado). Medido em produção: a NF costuma ser lançada 21 dias depois do recibo, 42 dias no percentil 90. Recibos mais antigos que isso quase sempre já foram faturados sem o vínculo registrado, e somá-los descontaria duas vezes.';

-- Um recibo conta como em transito quando nao tem NF por nenhum dos dois
-- caminhos: nem recibos.nf_id, nem a tabela de vinculo nf_recibos.
-- security_invoker: respeita a RLS de quem consulta.
create or replace view public.vw_item_transito
with (security_invoker = on) as
select
  i.id                              as item_id,
  i.grupo_id,
  sum(ri.quantidade)::numeric(14,4) as qtd_transito,
  count(distinct r.id)              as recibos,
  min(r.data_recebimento)           as mais_antigo,
  max(r.data_recebimento)           as mais_recente
from public.recibos r
join public.recibos_itens ri on ri.recibo_id = r.id
join public.itens i          on i.id = ri.item_id
where r.nf_id is null
  and not exists (select 1 from public.nf_recibos nr where nr.recibo_id = r.id)
  and r.status <> 'cancelado'
  -- O regex evita que um valor digitado errado na configuracao derrube a view
  -- inteira com erro de cast: fora do formato, vale o padrao de 60 dias.
  and r.data_recebimento >= current_date - coalesce(
        (select case when valor ~ '^[0-9]+$' then valor::int end
           from public.configuracoes where chave = 'transito_janela_dias'),
        60)
group by i.id, i.grupo_id;

comment on view public.vw_item_transito is
  'Quantidade entregue (recibos) ainda nao faturada, por item, dentro da janela de transito_janela_dias. Usada pelo Planejamento de pedidos para corrigir o saldo, que so desconta o faturado.';
