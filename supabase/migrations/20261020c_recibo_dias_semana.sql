-- Dias da semana aceitos na DATA DE RECEBIMENTO do recibo.
-- Pode ser reaplicada sem executar schema/seed completos.
--
-- Motivacao: no CPII o pagamento e calculado pela data do PEDIDO, nao pela da
-- entrega efetiva, e os pedidos saem todos para terca-feira. Campi que lancam
-- outra data deslocam o pagamento. Em vez de cravar "terca" no sistema - o que
-- so serviria ao CPII, e outras instituicoes ja demonstraram interesse -, os
-- dias aceitos sao configuraveis.
--
-- Formato: lista separada por virgula no padrao do extract(dow): 0=domingo,
-- 1=segunda ... 6=sabado. Vazio ou ausente = todos os dias (comportamento
-- anterior preservado, importante para quem ja usa o sistema).
begin;

-- A legenda e escrita para a tela, que usa caixas de selecao: nao menciona a
-- codificacao numerica nem o valor vazio, que o editor nem deixa produzir.
-- O update vem junto porque o insert com "do nothing" nao corrige a descricao
-- de uma instalacao que ja tenha a chave gravada.
insert into public.configuracoes (chave, valor, descricao) values
  ('recibo_dias_semana', '0,1,2,3,4,5,6',
   'Dias da semana em que a data do pedido do recibo pode cair. Desmarque um dia para impedir os campi de lançar recibos com data nesse dia — SANE e admin continuam podendo, para resolver exceções.')
on conflict (chave) do nothing;

update public.configuracoes
   set descricao = 'Dias da semana em que a data do pedido do recibo pode cair. Desmarque um dia para impedir os campi de lançar recibos com data nesse dia — SANE e admin continuam podendo, para resolver exceções.'
 where chave = 'recibo_dias_semana'
   and descricao is distinct from 'Dias da semana em que a data do pedido do recibo pode cair. Desmarque um dia para impedir os campi de lançar recibos com data nesse dia — SANE e admin continuam podendo, para resolver exceções.';

-- Gatilho de validacao. Fica no banco, e nao so na tela, porque a tela pode
-- ser contornada e a regra precisa valer para qualquer caminho de escrita.
create or replace function public.valida_dia_recibo()
returns trigger
language plpgsql
security definer
set search_path = public
as $vdr$
declare
  v_cfg    text;
  v_dias   int[];
  v_dow    int;
  v_papel  text;
  v_nomes  text[] := array['domingo','segunda-feira','terça-feira','quarta-feira',
                           'quinta-feira','sexta-feira','sábado'];
  v_lista  text;
begin
  -- Na edicao, so valida se a data mudou: recibos antigos, lancados antes da
  -- regra existir, continuam editaveis sem precisar mexer na data.
  if tg_op = 'UPDATE' and new.data_recebimento is not distinct from old.data_recebimento then
    return new;
  end if;
  if new.data_recebimento is null then
    return new;
  end if;

  -- SANE e admin passam: sao eles que resolvem a excecao real (feriado que
  -- deslocou a entrega, correcao de lancamento). A regra existe para o campus.
  v_papel := public.current_papel();
  if v_papel in ('sane', 'admin') then
    return new;
  end if;

  select valor into v_cfg from public.configuracoes where chave = 'recibo_dias_semana';
  if v_cfg is null or btrim(v_cfg) = '' then
    return new; -- nada configurado: todos os dias valem
  end if;

  select array_agg(x::int) into v_dias
  from unnest(string_to_array(v_cfg, ',')) as t(x)
  where btrim(x) ~ '^[0-6]$';

  if v_dias is null or array_length(v_dias, 1) = 0 then
    return new; -- configuracao invalida: nao trava o sistema
  end if;

  v_dow := extract(dow from new.data_recebimento)::int;
  if v_dow = any (v_dias) then
    return new;
  end if;

  select string_agg(v_nomes[d + 1], ', ' order by d) into v_lista
  from unnest(v_dias) as u(d);

  raise exception
    'A data do recibo cai em %, e o recebimento só é aceito em: %. Ajuste a data ou peça à SANE.',
    v_nomes[v_dow + 1], v_lista
    using errcode = 'check_violation';
end;
$vdr$;

revoke all on function public.valida_dia_recibo() from public;

drop trigger if exists trg_valida_dia_recibo on public.recibos;
create trigger trg_valida_dia_recibo
  before insert or update of data_recebimento on public.recibos
  for each row execute function public.valida_dia_recibo();

commit;
