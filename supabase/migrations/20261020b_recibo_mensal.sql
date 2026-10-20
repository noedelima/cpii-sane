-- Serie mensal de consumo a partir dos RECIBOS.
-- Pode ser reaplicada sem executar schema/seed completos.
--
-- Por que recibo e nao nota fiscal: a NF e evento de faturamento e sai em
-- blocos irregulares, deixando buracos na serie que nao correspondem a
-- consumo nenhum. O recibo e datado pelo recebimento no campus, acontece as
-- dezenas por mes e e o registro mais proximo do consumo real.
--
-- O saldo continua vindo do empenho (vw_empenho_item_saldo), que e a
-- autoridade contabil. Cada numero da sua melhor fonte.
begin;

create or replace view public.vw_item_recibo_mensal
with (security_invoker = on) as
select
  ri.item_id,
  r.grupo_id,
  to_char(r.data_recebimento, 'YYYY-MM')  as mes,
  sum(ri.quantidade)::numeric(14,4)       as quantidade
from public.recibos_itens ri
join public.recibos r on r.id = ri.recibo_id and r.deleted_at is null
where r.data_recebimento is not null
group by ri.item_id, r.grupo_id, to_char(r.data_recebimento, 'YYYY-MM');

commit;
