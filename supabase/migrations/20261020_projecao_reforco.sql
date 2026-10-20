-- Projecao de reforco: serie mensal de consumo + prazo de tramitacao.
-- Pode ser reaplicada sem executar schema/seed completos.
begin;

-- Serie mensal de consumo por empenho+item (mes = entrega da NF).
-- Uma linha por mes em vez de uma por NF: o Dashboard carrega a serie
-- inteira para projetar, e isso reduz bastante o volume trafegado.
create or replace view public.vw_item_consumo_mensal
with (security_invoker = on) as
select
  ni.empenho_id,
  ni.item_id,
  i.grupo_id,
  to_char(nf.data_entrega, 'YYYY-MM')              as mes,
  sum(ni.quantidade)::numeric(14,4)                as quantidade
from public.nf_itens ni
join public.notas_fiscais nf on nf.id = ni.nf_id and nf.deleted_at is null
join public.empenhos e       on e.id = ni.empenho_id and e.deleted_at is null
join public.itens i          on i.id = ni.item_id
where ni.empenho_id is not null
  and nf.data_entrega is not null
group by ni.empenho_id, ni.item_id, i.grupo_id, to_char(nf.data_entrega, 'YYYY-MM');

-- Prazo medio de tramitacao do reforco, em dias corridos.
insert into public.configuracoes (chave, valor, descricao) values
  ('reforco_prazo_dias', '45',
   'Prazo médio, em dias corridos, para tramitar um reforço de empenho. Usado para calcular a data-limite de abertura do processo no painel de reforços.')
on conflict (chave) do nothing;

commit;
