-- Schema inicial do banco — CPII SANE Controle
-- Rodar no SQL Editor do Supabase Dashboard.
-- Idempotente: usa "IF NOT EXISTS" onde possível.

-- =========================================================
-- 1) Tabelas de referência (cadastros)
-- =========================================================

create table if not exists public.campi (
  id          bigserial primary key,
  nome        text not null unique,
  sigla       text not null,
  codigo      text,
  endereco    text,
  telefone    text,
  email       text,
  status      text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.fornecedores (
  id            bigserial primary key,
  codigo        text not null unique,
  razao_social  text not null,
  cnpj          text,
  telefone      text,
  email         text,
  status        text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.grupos (
  id              bigserial primary key,
  nome            text not null unique,
  numero_arabico  int  not null,
  numero_romano   text not null,
  categoria       text not null,
  fornecedor_id   bigint references public.fornecedores(id) on delete set null,
  numero_ata      text,
  numero_tc       text,
  numero_pregao   text,
  vigencia_inicio date,
  vigencia_fim    date,
  status          text not null default 'vigente' check (status in ('vigente','encerrado','suspenso')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.itens (
  id              bigserial primary key,
  grupo_id        bigint not null references public.grupos(id) on delete restrict,
  descricao       text not null,
  codigo_catmat   text,
  unidade         text not null,
  preco_unitario  numeric(14,4) not null default 0,
  quantidade_ata  numeric(14,3) not null default 0,
  status          text not null default 'ativo' check (status in ('ativo','inativo','cancelado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_itens_grupo on public.itens(grupo_id);
-- CatMat é o indexador do item dentro do grupo (busca e unicidade).
create unique index if not exists uq_itens_grupo_catmat
  on public.itens (grupo_id, codigo_catmat) where codigo_catmat is not null;

-- Histórico de preços do item (reajustes contratuais por apostilamento).
-- O preço vigente continua em itens.preco_unitario (cache); cada reajuste
-- registra aqui o novo preço com sua data-base e referência documental.
create table if not exists public.itens_precos (
  id              bigserial primary key,
  item_id         bigint not null references public.itens(id) on delete cascade,
  preco_unitario  numeric(14,4) not null,
  vigencia_inicio date not null,
  referencia      text,
  created_at      timestamptz not null default now(),
  unique (item_id, vigencia_inicio)
);
create index if not exists idx_itens_precos_item on public.itens_precos(item_id);

-- =========================================================
-- 2) Empenhos
-- =========================================================

create table if not exists public.empenhos (
  id              bigserial primary key,
  numero          text not null unique,
  data_emissao    date not null,
  fornecedor_id   bigint references public.fornecedores(id) on delete set null,
  valor_inicial   numeric(14,2) not null default 0,
  reforco         numeric(14,2) not null default 0,
  cancelamento    numeric(14,2) not null default 0,
  anulacao        numeric(14,2) not null default 0,
  processo_suap   text,
  link_pdf        text,
  status          text not null default 'ativo' check (status in ('ativo','esgotado','cancelado','anulado')),
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Migração idempotente: renomeia processo_sei → processo_suap em bancos
-- criados antes de 10/06/2026 (convenção institucional: SUAP, nunca SEI).
do $mig$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empenhos'
      and column_name = 'processo_sei'
  ) then
    alter table public.empenhos rename column processo_sei to processo_suap;
  end if;
end $mig$;

create table if not exists public.empenhos_grupos (
  id            bigserial primary key,
  empenho_id    bigint not null references public.empenhos(id) on delete cascade,
  grupo_id      bigint not null references public.grupos(id) on delete restrict,
  valor_alocado numeric(14,2) not null default 0,
  percentual    numeric(6,3),
  observacoes   text,
  unique (empenho_id, grupo_id)
);

-- Itens/quantidades vinculados ao empenho (detalhe físico da NE).
create table if not exists public.empenhos_itens (
  id              bigserial primary key,
  empenho_id      bigint not null references public.empenhos(id) on delete cascade,
  item_id         bigint not null references public.itens(id) on delete restrict,
  quantidade      numeric(14,3) not null default 0,
  -- snapshot do preço na época do empenho (o catálogo pode ser reajustado)
  valor_unitario  numeric(14,4),
  observacoes     text,
  unique (empenho_id, item_id)
);
create index if not exists idx_empenhos_itens_empenho on public.empenhos_itens(empenho_id);

-- =========================================================
-- 3) Recibos (cabeçalho + itens)
-- =========================================================

create table if not exists public.recibos (
  id                  bigserial primary key,
  numero              text not null,
  data_recebimento    date not null,
  campus_id           bigint not null references public.campi(id) on delete restrict,
  grupo_id            bigint not null references public.grupos(id) on delete restrict,
  fornecedor_id       bigint references public.fornecedores(id) on delete set null,
  nf_id               bigint, -- FK adicionada após criar notas_fiscais
  link_pdf            text,
  caminho_onedrive    text,
  observacoes         text,
  status              text not null default 'pendente'
                       check (status in ('rascunho','pendente','confirmado','pago','glosado','cancelado')),
  responsavel_user_id uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (numero, campus_id)
);
create index if not exists idx_recibos_campus on public.recibos(campus_id);
create index if not exists idx_recibos_grupo on public.recibos(grupo_id);
create index if not exists idx_recibos_status on public.recibos(status);

create table if not exists public.recibos_itens (
  id          bigserial primary key,
  recibo_id   bigint not null references public.recibos(id) on delete cascade,
  item_id     bigint not null references public.itens(id) on delete restrict,
  quantidade  numeric(14,3) not null,
  unidade     text,
  observacoes text
);
create index if not exists idx_recibos_itens_recibo on public.recibos_itens(recibo_id);

-- =========================================================
-- 4) Notas Fiscais (cabeçalho + itens, com empenho por linha)
-- =========================================================

create table if not exists public.notas_fiscais (
  id                       bigserial primary key,
  numero                   text not null,
  data_emissao             date,
  data_entrega             date not null,
  grupo_id                 bigint not null references public.grupos(id) on delete restrict,
  fornecedor_id            bigint references public.fornecedores(id) on delete set null,
  campus_id                bigint references public.campi(id) on delete set null,
  recibo_id                bigint references public.recibos(id) on delete set null,
  valor_total              numeric(14,2),
  processo_pagamento       text,
  data_abertura_processo   date,
  link_pdf                 text,
  caminho_onedrive         text,
  ocorrencias              text,
  avaliacao_pontualidade   text,
  avaliacao_qualidade      text,
  avaliacao_conformidade   text,
  observacoes              text,
  status                   text not null default 'pendente'
                            check (status in ('rascunho','pendente','confirmado','pago','glosado','cancelado')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (numero, grupo_id)
);
create index if not exists idx_nf_grupo on public.notas_fiscais(grupo_id);
create index if not exists idx_nf_status on public.notas_fiscais(status);

-- Migração idempotente: a coluna empenho_id existiu brevemente em 10/06/2026
-- e foi substituída pela tabela nf_empenhos (rateio N:N, abaixo).
alter table public.notas_fiscais drop column if exists empenho_id;

-- Adiciona FK de recibos.nf_id agora que notas_fiscais existe
do $$ begin
  alter table public.recibos
    add constraint fk_recibos_nf foreign key (nf_id)
    references public.notas_fiscais(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.nf_itens (
  id              bigserial primary key,
  nf_id           bigint not null references public.notas_fiscais(id) on delete cascade,
  item_id         bigint not null references public.itens(id) on delete restrict,
  empenho_id      bigint references public.empenhos(id) on delete set null,
  quantidade      numeric(14,3) not null,
  valor_unitario  numeric(14,4),
  observacoes     text
);
create index if not exists idx_nf_itens_nf on public.nf_itens(nf_id);

-- Rateio financeiro da NF entre empenhos (N:N) — fonte de verdade do débito
-- orçamentário. NFs migradas do Excel só têm este nível (sem itens);
-- NFs novas também detalham quantidades em nf_itens.
create table if not exists public.nf_empenhos (
  id              bigserial primary key,
  nf_id           bigint not null references public.notas_fiscais(id) on delete cascade,
  empenho_id      bigint not null references public.empenhos(id) on delete restrict,
  valor_debitado  numeric(14,2) not null default 0,
  observacoes     text,
  unique (nf_id, empenho_id)
);
create index if not exists idx_nf_empenhos_nf on public.nf_empenhos(nf_id);
create index if not exists idx_nf_empenhos_empenho on public.nf_empenhos(empenho_id);

-- Atestes de recebimento: documento PDF gerado pela SANE por fornecedor para
-- instruir o processo de pagamento no SUAP. Registro imutável (sem update).
create table if not exists public.atestes (
  id              bigserial primary key,
  fornecedor_id   bigint not null references public.fornecedores(id) on delete restrict,
  processo_suap   text,
  local_emissao   text not null default 'Rio de Janeiro',
  data_emissao    date not null default current_date,
  observacoes     text,
  valor_total     numeric(14,2) not null default 0,
  qtd_nfs         int not null default 0,
  gerado_por      uuid references auth.users(id) on delete set null,
  gerado_por_nome text,
  -- snapshot da matrícula no momento da emissão (documento não muda depois)
  gerado_por_matricula text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_atestes_fornecedor on public.atestes(fornecedor_id);
alter table public.atestes add column if not exists gerado_por_matricula text;

create table if not exists public.atestes_nfs (
  id         bigserial primary key,
  ateste_id  bigint not null references public.atestes(id) on delete cascade,
  nf_id      bigint not null references public.notas_fiscais(id) on delete restrict,
  unique (ateste_id, nf_id)
);
create index if not exists idx_atestes_nfs_nf on public.atestes_nfs(nf_id);

-- =========================================================
-- 5) Perfis (relaciona auth.users a um papel + campus)
-- =========================================================

-- Papéis: admin (gestão de usuários e cadastros), sane (itens/NFs/empenhos),
-- campus (recibos do próprio campus), outros (somente leitura/dashboard).
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text,
  matricula_siape text,
  papel       text not null default 'outros' check (papel in ('campus','sane','admin','outros')),
  campus_id   bigint references public.campi(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Migração idempotente (bancos criados antes de 10/06/2026):
alter table public.perfis add column if not exists email text;
alter table public.perfis add column if not exists matricula_siape text;
alter table public.perfis alter column papel set default 'outros';
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('campus','sane','admin','outros'));
update public.perfis p set email = u.email
  from auth.users u where u.id = p.id and p.email is null;

-- =========================================================
-- 6) Triggers para manter updated_at
-- =========================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'campi','fornecedores','grupos','itens',
    'empenhos','recibos','notas_fiscais','perfis'
  ]) loop
    execute format('drop trigger if exists trg_%s_updated on public.%s', t, t);
    execute format(
      'create trigger trg_%s_updated before update on public.%s
       for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- =========================================================
-- 7) Row Level Security (políticas mínimas — MVP)
-- =========================================================
-- Em produção, refinar: campus só vê os próprios recibos/NFs, SANE vê tudo.

alter table public.campi          enable row level security;
alter table public.fornecedores   enable row level security;
alter table public.grupos         enable row level security;
alter table public.itens          enable row level security;
alter table public.itens_precos   enable row level security;
alter table public.empenhos       enable row level security;
alter table public.empenhos_grupos enable row level security;
alter table public.empenhos_itens enable row level security;
alter table public.recibos        enable row level security;
alter table public.recibos_itens  enable row level security;
alter table public.notas_fiscais  enable row level security;
alter table public.nf_itens       enable row level security;
alter table public.nf_empenhos    enable row level security;
alter table public.atestes        enable row level security;
alter table public.atestes_nfs    enable row level security;
alter table public.perfis         enable row level security;

-- =========================================================
-- 8) Auto-criação de perfil ao cadastrar usuário no Auth
-- =========================================================
-- security definer: a inserção ocorre fora de sessão autenticada (signup),
-- então precisa contornar o RLS de public.perfis de forma controlada.
-- search_path fixo evita hijacking de função em schemas maliciosos.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.perfis (id, nome, papel, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'outros',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end; $fn$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: usuários criados antes do trigger ganham perfil agora.
insert into public.perfis (id, nome, papel, email)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'nome'), ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  'outros',
  u.email
from auth.users u
left join public.perfis p on p.id = u.id
where p.id is null;

-- Funções helper de autorização (security definer evita recursão de RLS
-- ao consultar perfis dentro das próprias policies).
create or replace function public.current_papel()
returns text language sql stable security definer set search_path = public
as $cp$ select papel from public.perfis where id = auth.uid() $cp$;

create or replace function public.current_campus_id()
returns bigint language sql stable security definer set search_path = public
as $cc$ select campus_id from public.perfis where id = auth.uid() $cc$;

-- Matriz de acesso:
--   admin  -> tudo (usuários, cadastros, deletes)
--   sane   -> escreve itens, empenhos, empenhos_grupos, NFs, nf_itens, nf_empenhos
--   campus -> insere recibos do próprio campus e itens nesses recibos
--   outros -> somente leitura (dashboard/consultas)
do $pol$
declare t text;
begin
  -- remove policies anteriores (inclusive as do MVP)
  for t in select unnest(array[
    'campi','fornecedores','grupos','itens','itens_precos','empenhos',
    'empenhos_grupos','empenhos_itens','recibos','recibos_itens',
    'notas_fiscais','nf_itens','nf_empenhos','atestes','atestes_nfs','perfis'
  ]) loop
    execute format('drop policy if exists p_%s_select on public.%s', t, t);
    execute format('drop policy if exists p_%s_insert on public.%s', t, t);
    execute format('drop policy if exists p_%s_update on public.%s', t, t);
    execute format('drop policy if exists p_%s_delete on public.%s', t, t);
  end loop;

  -- leitura geral autenticada (perfis tem regra própria abaixo)
  for t in select unnest(array[
    'campi','fornecedores','grupos','itens','itens_precos','empenhos',
    'empenhos_grupos','empenhos_itens','recibos','recibos_itens',
    'notas_fiscais','nf_itens','nf_empenhos','atestes','atestes_nfs'
  ]) loop
    execute format(
      'create policy p_%s_select on public.%s for select to authenticated using (true)', t, t);
  end loop;

  -- escrita SANE/admin no núcleo operacional (inclui grupos/catálogo da ata)
  for t in select unnest(array[
    'grupos','itens','itens_precos','empenhos','empenhos_grupos',
    'empenhos_itens','notas_fiscais','nf_itens','nf_empenhos',
    'atestes','atestes_nfs'
  ]) loop
    execute format(
      'create policy p_%s_insert on public.%s for insert to authenticated
       with check (public.current_papel() in (''sane'',''admin''))', t, t);
    execute format(
      'create policy p_%s_update on public.%s for update to authenticated
       using (public.current_papel() in (''sane'',''admin''))
       with check (public.current_papel() in (''sane'',''admin''))', t, t);
  end loop;

  -- cadastros básicos: só admin escreve
  for t in select unnest(array['campi','fornecedores']) loop
    execute format(
      'create policy p_%s_insert on public.%s for insert to authenticated
       with check (public.current_papel() = ''admin'')', t, t);
    execute format(
      'create policy p_%s_update on public.%s for update to authenticated
       using (public.current_papel() = ''admin'')
       with check (public.current_papel() = ''admin'')', t, t);
  end loop;

  -- delete: só admin
  for t in select unnest(array[
    'campi','fornecedores','grupos','itens','itens_precos','empenhos',
    'empenhos_grupos','empenhos_itens','recibos','recibos_itens',
    'notas_fiscais','nf_itens','nf_empenhos','atestes','atestes_nfs'
  ]) loop
    execute format(
      'create policy p_%s_delete on public.%s for delete to authenticated
       using (public.current_papel() = ''admin'')', t, t);
  end loop;
end $pol$;

-- Recibos: campus insere para o próprio campus; conferência/edição é da SANE.
drop policy if exists p_recibos_insert on public.recibos;
create policy p_recibos_insert on public.recibos for insert to authenticated
  with check (
    public.current_papel() in ('sane','admin')
    or (public.current_papel() = 'campus' and campus_id = public.current_campus_id())
  );
drop policy if exists p_recibos_update on public.recibos;
create policy p_recibos_update on public.recibos for update to authenticated
  using (public.current_papel() in ('sane','admin'))
  with check (public.current_papel() in ('sane','admin'));

-- Itens de recibo: campus inclui itens em recibos do próprio campus.
drop policy if exists p_recibos_itens_insert on public.recibos_itens;
create policy p_recibos_itens_insert on public.recibos_itens for insert to authenticated
  with check (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and exists (
        select 1 from public.recibos r
        where r.id = recibo_id and r.campus_id = public.current_campus_id()
      )
    )
  );
drop policy if exists p_recibos_itens_update on public.recibos_itens;
create policy p_recibos_itens_update on public.recibos_itens for update to authenticated
  using (public.current_papel() in ('sane','admin'))
  with check (public.current_papel() in ('sane','admin'));

-- Perfis: cada usuário vê o próprio; admin vê e administra todos.
-- (insert só via trigger handle_new_user, que roda como owner.)
drop policy if exists p_perfis_select on public.perfis;
create policy p_perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.current_papel() = 'admin');
drop policy if exists p_perfis_update on public.perfis;
create policy p_perfis_update on public.perfis for update to authenticated
  using (public.current_papel() = 'admin')
  with check (public.current_papel() = 'admin');
drop policy if exists p_perfis_delete on public.perfis;
create policy p_perfis_delete on public.perfis for delete to authenticated
  using (public.current_papel() = 'admin');

-- Atestes: SANE também pode excluir (ateste emitido por engano — a exclusão
-- libera as NFs para novo ateste). Override do padrão "delete só admin".
drop policy if exists p_atestes_delete on public.atestes;
create policy p_atestes_delete on public.atestes for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_atestes_nfs_delete on public.atestes_nfs;
create policy p_atestes_nfs_delete on public.atestes_nfs for delete to authenticated
  using (public.current_papel() in ('sane','admin'));

-- Documentos operacionais: SANE também pode excluir (empenhos, NFs e
-- recibos lançados com erro). As FKs protegem a integridade: NF atestada
-- bloqueia (atestes_nfs restrict) e NE com débitos bloqueia (nf_empenhos
-- restrict) — nesses casos é preciso desfazer os vínculos antes.
drop policy if exists p_empenhos_delete on public.empenhos;
create policy p_empenhos_delete on public.empenhos for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_notas_fiscais_delete on public.notas_fiscais;
create policy p_notas_fiscais_delete on public.notas_fiscais for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_recibos_delete on public.recibos;
create policy p_recibos_delete on public.recibos for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_itens_precos_delete on public.itens_precos;
create policy p_itens_precos_delete on public.itens_precos for delete to authenticated
  using (public.current_papel() in ('sane','admin'));

-- Linhas de itens (detalhe editável): SANE pode remover durante a edição.
-- nf_empenhos também: a redistribuição FIFO recalcula os débitos da NF.
drop policy if exists p_nf_empenhos_delete on public.nf_empenhos;
create policy p_nf_empenhos_delete on public.nf_empenhos for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_empenhos_itens_delete on public.empenhos_itens;
create policy p_empenhos_itens_delete on public.empenhos_itens for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_nf_itens_delete on public.nf_itens;
create policy p_nf_itens_delete on public.nf_itens for delete to authenticated
  using (public.current_papel() in ('sane','admin'));
drop policy if exists p_recibos_itens_delete on public.recibos_itens;
create policy p_recibos_itens_delete on public.recibos_itens for delete to authenticated
  using (public.current_papel() in ('sane','admin'));

-- =========================================================
-- 9) Views de apoio (security invoker: respeitam o RLS de quem consulta)
-- =========================================================

create or replace view public.vw_empenho_saldos
with (security_invoker = on) as
select
  e.id, e.numero, e.data_emissao, e.fornecedor_id, e.status, e.observacoes,
  f.codigo as fornecedor,
  (e.valor_inicial + e.reforco - e.cancelamento - e.anulacao)::numeric(14,2) as valor_liquido,
  coalesce(d.debitado, 0)::numeric(14,2) as utilizado,
  (e.valor_inicial + e.reforco - e.cancelamento - e.anulacao - coalesce(d.debitado, 0))::numeric(14,2) as saldo
from public.empenhos e
left join public.fornecedores f on f.id = e.fornecedor_id
left join (
  select empenho_id, sum(valor_debitado) as debitado
  from public.nf_empenhos group by empenho_id
) d on d.empenho_id = e.id;

create or replace view public.vw_grupo_resumo
with (security_invoker = on) as
select
  g.id as grupo_id, g.nome, g.numero_arabico, g.numero_romano, g.categoria, g.status,
  f.codigo as fornecedor,
  coalesce(a.alocado, 0)::numeric(14,2) as alocado,
  coalesce(u.utilizado, 0)::numeric(14,2) as utilizado,
  (coalesce(a.alocado, 0) - coalesce(u.utilizado, 0))::numeric(14,2) as saldo,
  coalesce(n.qtd_nfs, 0) as qtd_nfs
from public.grupos g
left join public.fornecedores f on f.id = g.fornecedor_id
left join (
  select grupo_id, sum(valor_alocado) as alocado
  from public.empenhos_grupos group by grupo_id
) a on a.grupo_id = g.id
left join (
  select nf.grupo_id, sum(ne.valor_debitado) as utilizado
  from public.nf_empenhos ne
  join public.notas_fiscais nf on nf.id = ne.nf_id
  group by nf.grupo_id
) u on u.grupo_id = g.id
left join (
  select grupo_id, count(*) as qtd_nfs
  from public.notas_fiscais group by grupo_id
) n on n.grupo_id = g.id;

-- =========================================================
-- 10) Distribuição FIFO de NF entre empenhos do grupo
-- =========================================================
-- Dois modos, decididos automaticamente:
--
--  A) NF COM itens (nf_itens): vincula ITEM A ITEM (mesmo item de catálogo,
--     identificado pelo CatMat dentro do grupo) aos empenhos ATIVOS mais
--     antigos que têm o item em empenhos_itens com saldo. O saldo é controlado
--     PELO VALOR e convertido em quantidade ao preço vigente do catálogo:
--       saldo_qtd = (qtd_empenhada x preço_da_NE - valor já consumido) / preço_vigente
--     Assim, após um reajuste (apostilamento), a quantidade restante da NE se
--     ajusta automaticamente (regra de três), pois o valor da NE não muda.
--     Linhas são divididas entre empenhos quando necessário; o que não tiver
--     cobertura fica sem vínculo (relatório 'sem_cobertura'). Ao final,
--     nf_empenhos da NF é RECALCULADO a partir dos itens vinculados.
--
--  B) NF SEM itens (ex.: migradas do Excel): comportamento financeiro
--     original — completa o valor_total nos empenhos mais antigos com saldo
--     financeiro (incremental, sem apagar rateios existentes).
--
-- Security invoker: só SANE/admin passam pelo RLS das tabelas envolvidas.

drop function if exists public.distribute_nf_fifo(bigint);

create function public.distribute_nf_fifo(p_nf_id bigint)
returns table (
  resultado text,        -- 'vinculado' | 'sem_cobertura' | 'financeiro'
  item_ref text,         -- "catmat — descricao" (nulo no modo financeiro)
  empenho_numero text,
  quantidade numeric,
  valor numeric
)
language plpgsql
as $fifo$
declare
  v_nf record;
  v_item record;
  v_emp record;
  v_tem_itens boolean;
  v_ja numeric;
  v_restante numeric;
  v_take numeric;
begin
  select * into v_nf from public.notas_fiscais where id = p_nf_id;
  if not found then
    raise exception 'NF % nao encontrada', p_nf_id;
  end if;

  select exists (select 1 from public.nf_itens where nf_id = p_nf_id) into v_tem_itens;

  if v_tem_itens then
    -- ===== modo A: FIFO por item (CatMat) =====
    for v_item in
      select ni.item_id,
             sum(ni.quantidade) as qtd_total,
             max(ni.valor_unitario) as vu,
             i.descricao,
             i.codigo_catmat
      from public.nf_itens ni
      join public.itens i on i.id = ni.item_id
      where ni.nf_id = p_nf_id
      group by ni.item_id, i.descricao, i.codigo_catmat
      order by min(ni.id)
    loop
      -- consolida (remove linhas do item; serão recriadas já vinculadas)
      delete from public.nf_itens
       where nf_id = p_nf_id and item_id = v_item.item_id;

      v_restante := v_item.qtd_total;

      for v_emp in
        select e.id, e.numero,
               (
                 ei.quantidade * coalesce(ei.valor_unitario, i.preco_unitario)
                 - coalesce((select sum(x.quantidade * coalesce(x.valor_unitario, 0))
                             from public.nf_itens x
                             where x.empenho_id = e.id
                               and x.item_id = v_item.item_id
                               and x.nf_id <> p_nf_id), 0)
               ) / nullif(i.preco_unitario, 0) as saldo_qtd
        from public.empenhos e
        join public.empenhos_itens ei
          on ei.empenho_id = e.id and ei.item_id = v_item.item_id
        join public.itens i
          on i.id = v_item.item_id
        join public.empenhos_grupos eg
          on eg.empenho_id = e.id and eg.grupo_id = i.grupo_id
        where e.status = 'ativo'
        order by e.data_emissao asc, e.id asc
        for update of e
      loop
        exit when v_restante <= 0;
        if v_emp.saldo_qtd > 0 then
          v_take := least(v_emp.saldo_qtd, v_restante);
          insert into public.nf_itens (nf_id, item_id, empenho_id, quantidade, valor_unitario)
          values (p_nf_id, v_item.item_id, v_emp.id, v_take, v_item.vu);
          v_restante := v_restante - v_take;

          resultado := 'vinculado';
          item_ref := coalesce(v_item.codigo_catmat || ' — ', '') || v_item.descricao;
          empenho_numero := v_emp.numero;
          quantidade := v_take;
          valor := round(v_take * coalesce(v_item.vu, 0), 2);
          return next;
        end if;
      end loop;

      if v_restante > 0 then
        -- sem cobertura: preserva a linha sem vínculo para decisão manual
        insert into public.nf_itens (nf_id, item_id, quantidade, valor_unitario)
        values (p_nf_id, v_item.item_id, v_restante, v_item.vu);

        resultado := 'sem_cobertura';
        item_ref := coalesce(v_item.codigo_catmat || ' — ', '') || v_item.descricao;
        empenho_numero := null;
        quantidade := v_restante;
        valor := round(v_restante * coalesce(v_item.vu, 0), 2);
        return next;
      end if;
    end loop;

    -- recalcula o débito financeiro da NF a partir dos itens vinculados
    delete from public.nf_empenhos where nf_id = p_nf_id;
    insert into public.nf_empenhos (nf_id, empenho_id, valor_debitado, observacoes)
    select p_nf_id, ni.empenho_id,
           round(sum(ni.quantidade * coalesce(ni.valor_unitario, 0)), 2),
           'Fila por item (CatMat) — mais antigo primeiro'
    from public.nf_itens ni
    where ni.nf_id = p_nf_id and ni.empenho_id is not null
    group by ni.empenho_id;

    return;
  end if;

  -- ===== modo B: FIFO financeiro (NF sem itens) =====
  if v_nf.valor_total is null or v_nf.valor_total <= 0 then
    raise exception 'NF % sem valor_total definido', p_nf_id;
  end if;

  select coalesce(sum(valor_debitado), 0) into v_ja
  from public.nf_empenhos where nf_id = p_nf_id;

  v_restante := v_nf.valor_total - v_ja;
  if v_restante <= 0 then
    return;
  end if;

  for v_emp in
    select e.id, e.numero,
           (e.valor_inicial + e.reforco - e.cancelamento - e.anulacao
            - coalesce((select sum(x.valor_debitado)
                        from public.nf_empenhos x where x.empenho_id = e.id), 0)) as saldo
    from public.empenhos e
    join public.empenhos_grupos eg
      on eg.empenho_id = e.id
     and eg.grupo_id in (
       select grupo_id from public.nf_grupos where nf_id = p_nf_id
       union select v_nf.grupo_id
     )
    where e.status = 'ativo'
    order by e.data_emissao asc, e.id asc
    for update of e
  loop
    exit when v_restante <= 0;
    if v_emp.saldo > 0 then
      v_take := least(v_emp.saldo, v_restante);
      insert into public.nf_empenhos (nf_id, empenho_id, valor_debitado, observacoes)
      values (p_nf_id, v_emp.id, v_take, 'Distribuição pela fila — mais antigo primeiro')
      on conflict (nf_id, empenho_id) do update
        set valor_debitado = public.nf_empenhos.valor_debitado + excluded.valor_debitado;
      v_restante := v_restante - v_take;

      resultado := 'financeiro';
      item_ref := null;
      empenho_numero := v_emp.numero;
      quantidade := null;
      valor := v_take;
      return next;
    end if;
  end loop;

  if v_restante > 0 then
    raise exception 'Saldo insuficiente nos empenhos ativos do grupo % para a NF %: faltam R$ %',
      v_nf.grupo_id, v_nf.numero, v_restante;
  end if;
end;
$fifo$;

-- =========================================================
-- 11) Definição de senha por administrador
-- =========================================================
-- O SMTP padrão do Supabase não entrega no domínio institucional; o admin
-- define uma senha inicial/nova para o servidor sem conhecer a anterior.
-- security definer com gate explícito de papel; sem execute para anon.

create or replace function public.admin_set_user_password(
  target_user_id uuid,
  new_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $asp$
begin
  if coalesce(public.current_papel(), '') <> 'admin' then
    raise exception 'Apenas administradores podem definir senha de usuários.';
  end if;
  if new_password is null or length(new_password) < 10 then
    raise exception 'A senha deve ter ao menos 10 caracteres.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = target_user_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$asp$;

revoke execute on function public.admin_set_user_password(uuid, text) from public;
revoke execute on function public.admin_set_user_password(uuid, text) from anon;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;

-- =========================================================
-- 12) Criação de usuário por administrador
-- =========================================================
-- Cria a conta no GoTrue (auth.users + auth.identities) já confirmada e com
-- senha, e completa o perfil (papel/campus/matrícula). O trigger
-- handle_new_user cria o perfil base; aqui só o atualizamos.

create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_nome text,
  p_papel text default 'outros',
  p_campus_id bigint default null,
  p_matricula text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $acu$
declare
  v_id uuid;
begin
  if coalesce(public.current_papel(), '') <> 'admin' then
    raise exception 'Apenas administradores podem cadastrar usuários.';
  end if;
  p_email := lower(trim(p_email));
  if p_email is null or p_email !~ '^\S+@\S+[.]\S+' then
    raise exception 'E-mail inválido.';
  end if;
  if p_password is null or length(p_password) < 10 then
    raise exception 'A senha deve ter ao menos 10 caracteres.';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome.';
  end if;
  if p_papel not in ('campus','sane','admin','outros') then
    raise exception 'Papel inválido: %', p_papel;
  end if;
  if exists (select 1 from auth.users where lower(email) = p_email) then
    raise exception 'Já existe usuário com o e-mail %.', p_email;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', trim(p_nome)),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- o trigger handle_new_user já criou o perfil; completa os dados
  update public.perfis
     set nome = trim(p_nome),
         papel = p_papel,
         campus_id = p_campus_id,
         matricula_siape = nullif(trim(coalesce(p_matricula, '')), '')
   where id = v_id;

  return v_id;
end;
$acu$;

revoke execute on function public.admin_create_user(text, text, text, text, bigint, text) from public;
revoke execute on function public.admin_create_user(text, text, text, text, bigint, text) from anon;
grant execute on function public.admin_create_user(text, text, text, text, bigint, text) to authenticated;

-- =========================================================
-- 13) Reajuste contratual (apostilamento) por grupo
-- =========================================================
-- Aplica um percentual sobre o preço vigente de todos os itens ATIVOS do
-- grupo a partir da data-base, registrando o histórico em itens_precos
-- (na primeira aplicação, o preço original também é historizado).
-- ATENÇÃO: aplicar duas vezes acumula o percentual.

create or replace function public.aplicar_reajuste_grupo(
  p_grupo_id bigint,
  p_percentual numeric,
  p_data_base date,
  p_referencia text default null
)
returns table (item_ref text, preco_antigo numeric, preco_novo numeric)
language plpgsql
as $rj$
declare
  v_item record;
  v_novo numeric;
begin
  if coalesce(public.current_papel(), '') not in ('sane', 'admin') then
    raise exception 'Apenas SANE/admin aplicam reajuste.';
  end if;
  if p_percentual is null or p_percentual <= -100 then
    raise exception 'Percentual de reajuste inválido.';
  end if;
  if p_data_base is null then
    raise exception 'Informe a data-base do reajuste.';
  end if;

  for v_item in
    select i.id, i.descricao, i.codigo_catmat, i.preco_unitario
    from public.itens i
    where i.grupo_id = p_grupo_id and i.status = 'ativo'
    order by i.descricao
    for update of i
  loop
    -- historiza o preço original na primeira aplicação
    insert into public.itens_precos (item_id, preco_unitario, vigencia_inicio, referencia)
    values (v_item.id, v_item.preco_unitario, '1900-01-01', 'Preço original (ata)')
    on conflict (item_id, vigencia_inicio) do nothing;

    v_novo := round(v_item.preco_unitario * (1 + p_percentual / 100), 4);

    insert into public.itens_precos (item_id, preco_unitario, vigencia_inicio, referencia)
    values (v_item.id, v_novo, p_data_base, p_referencia)
    on conflict (item_id, vigencia_inicio) do update
      set preco_unitario = excluded.preco_unitario,
          referencia = excluded.referencia;

    update public.itens set preco_unitario = v_novo where id = v_item.id;

    item_ref := coalesce(v_item.codigo_catmat || ' — ', '') || v_item.descricao;
    preco_antigo := v_item.preco_unitario;
    preco_novo := v_novo;
    return next;
  end loop;
end;
$rj$;

-- =========================================================
-- 14) Unificação de notas de empenho
-- =========================================================
-- Move todos os vínculos (débitos de NF, itens de NF, itens empenhados e
-- alocações de grupo) da NE de ORIGEM para a de DESTINO, soma os valores
-- financeiros e exclui a origem. Para NEs que foram lançadas em duplicidade
-- (ex.: planilha antiga dividia a NE por grupo).

create or replace function public.merge_empenhos(
  p_origem_id bigint,
  p_destino_id bigint
)
returns void
language plpgsql
as $mg$
declare
  v_o record;
  r record;
begin
  if coalesce(public.current_papel(), '') not in ('sane', 'admin') then
    raise exception 'Apenas SANE/admin unificam empenhos.';
  end if;
  if p_origem_id = p_destino_id then
    raise exception 'Origem e destino devem ser empenhos diferentes.';
  end if;
  select * into v_o from public.empenhos where id = p_origem_id for update;
  if not found then
    raise exception 'Empenho de origem não encontrado.';
  end if;
  perform 1 from public.empenhos where id = p_destino_id for update;
  if not found then
    raise exception 'Empenho de destino não encontrado.';
  end if;

  -- débitos financeiros de NFs (soma quando a NF já debita o destino)
  for r in select * from public.nf_empenhos where empenho_id = p_origem_id loop
    insert into public.nf_empenhos (nf_id, empenho_id, valor_debitado, observacoes)
    values (r.nf_id, p_destino_id, r.valor_debitado,
            coalesce(r.observacoes || ' · ', '') || 'Unificado da NE ' || v_o.numero)
    on conflict (nf_id, empenho_id) do update
      set valor_debitado = public.nf_empenhos.valor_debitado + excluded.valor_debitado;
    delete from public.nf_empenhos where id = r.id;
  end loop;

  -- itens de NF apontando para a origem passam ao destino
  update public.nf_itens set empenho_id = p_destino_id where empenho_id = p_origem_id;

  -- itens empenhados (soma quantidades quando o destino já tem o item)
  for r in select * from public.empenhos_itens where empenho_id = p_origem_id loop
    insert into public.empenhos_itens (empenho_id, item_id, quantidade, valor_unitario, observacoes)
    values (p_destino_id, r.item_id, r.quantidade, r.valor_unitario, r.observacoes)
    on conflict (empenho_id, item_id) do update
      set quantidade = public.empenhos_itens.quantidade + excluded.quantidade;
    delete from public.empenhos_itens where id = r.id;
  end loop;

  -- alocações por grupo (soma valores; mantém os dois grupos se diferentes)
  for r in select * from public.empenhos_grupos where empenho_id = p_origem_id loop
    insert into public.empenhos_grupos (empenho_id, grupo_id, valor_alocado, percentual, observacoes)
    values (p_destino_id, r.grupo_id, r.valor_alocado, r.percentual, r.observacoes)
    on conflict (empenho_id, grupo_id) do update
      set valor_alocado = public.empenhos_grupos.valor_alocado + excluded.valor_alocado;
    delete from public.empenhos_grupos where id = r.id;
  end loop;

  -- soma os valores financeiros e registra a trilha
  update public.empenhos set
    valor_inicial = valor_inicial + v_o.valor_inicial,
    reforco = reforco + v_o.reforco,
    cancelamento = cancelamento + v_o.cancelamento,
    anulacao = anulacao + v_o.anulacao,
    observacoes = coalesce(observacoes || ' · ', '')
      || 'Unificada com a NE ' || v_o.numero || ' em ' || to_char(now(), 'DD/MM/YYYY') || '.'
  where id = p_destino_id;

  delete from public.empenhos where id = p_origem_id;
end;
$mg$;

-- =========================================================
-- 15) Melhorias 06/2026 — solicitação de NF, NF multi-grupo/recibos,
--     instrumento de cobrança e saldos por item do empenho
-- =========================================================

-- 15.1) NF com dois ou mais grupos (N:N). notas_fiscais.grupo_id continua
-- sendo o grupo "principal" (compatibilidade e cabeçalhos); nf_grupos guarda
-- o conjunto completo. A distribuição pela fila resolve o grupo PELO ITEM
-- (itens.grupo_id), então itens de grupos diferentes vão aos empenhos certos.
create table if not exists public.nf_grupos (
  id        bigserial primary key,
  nf_id     bigint not null references public.notas_fiscais(id) on delete cascade,
  grupo_id  bigint not null references public.grupos(id) on delete restrict,
  unique (nf_id, grupo_id)
);
create index if not exists idx_nf_grupos_nf on public.nf_grupos(nf_id);
-- backfill: toda NF existente passa a ter ao menos o seu grupo principal
insert into public.nf_grupos (nf_id, grupo_id)
select n.id, n.grupo_id from public.notas_fiscais n
on conflict (nf_id, grupo_id) do nothing;

-- 15.2) Recibos x NF (N:N, vínculo livre dentro do grupo). recibos.nf_id é
-- mantido por compatibilidade/legado; nf_recibos passa a ser a fonte do
-- vínculo (um recibo pode ser referenciado por mais de uma NF do grupo).
create table if not exists public.nf_recibos (
  id         bigserial primary key,
  nf_id      bigint not null references public.notas_fiscais(id) on delete cascade,
  recibo_id  bigint not null references public.recibos(id) on delete cascade,
  unique (nf_id, recibo_id)
);
create index if not exists idx_nf_recibos_nf on public.nf_recibos(nf_id);
create index if not exists idx_nf_recibos_recibo on public.nf_recibos(recibo_id);
-- backfill a partir do vínculo único atual (recibos.nf_id)
insert into public.nf_recibos (nf_id, recibo_id)
select r.nf_id, r.id from public.recibos r where r.nf_id is not null
on conflict (nf_id, recibo_id) do nothing;

-- 15.3) PDF do Instrumento de Cobrança (gerado no Contratos.gov) na NF.
alter table public.notas_fiscais add column if not exists link_instrumento_cobranca text;

-- 15.4) Solicitações de emissão de NF. A SANE seleciona recibos de uma entrega
-- por empresa, registra a solicitação e gera um PDF com as quantidades finais
-- para a empresa conferir e emitir a NF.
create table if not exists public.solicitacoes_nf (
  id               bigserial primary key,
  fornecedor_id    bigint not null references public.fornecedores(id) on delete restrict,
  grupo_id         bigint references public.grupos(id) on delete set null,
  data_solicitacao date not null default current_date,
  periodo_inicio   date,
  periodo_fim      date,
  observacoes      text,
  status           text not null default 'aberta'
                    check (status in ('aberta','enviada','atendida','cancelada')),
  valor_estimado   numeric(14,2) not null default 0,
  qtd_recibos      int not null default 0,
  gerado_por       uuid references auth.users(id) on delete set null,
  gerado_por_nome  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_solic_nf_fornecedor on public.solicitacoes_nf(fornecedor_id);

create table if not exists public.solicitacoes_nf_recibos (
  id             bigserial primary key,
  solicitacao_id bigint not null references public.solicitacoes_nf(id) on delete cascade,
  recibo_id      bigint not null references public.recibos(id) on delete restrict,
  unique (solicitacao_id, recibo_id)
);
create index if not exists idx_solic_nf_recibos on public.solicitacoes_nf_recibos(solicitacao_id);

-- updated_at em solicitacoes_nf
drop trigger if exists trg_solicitacoes_nf_updated on public.solicitacoes_nf;
create trigger trg_solicitacoes_nf_updated before update on public.solicitacoes_nf
  for each row execute function public.set_updated_at();

-- 15.5) RLS das novas tabelas: leitura para autenticados; escrita SANE/admin.
alter table public.nf_grupos               enable row level security;
alter table public.nf_recibos              enable row level security;
alter table public.solicitacoes_nf         enable row level security;
alter table public.solicitacoes_nf_recibos enable row level security;

do $pol15$
declare t text;
begin
  for t in select unnest(array[
    'nf_grupos','nf_recibos','solicitacoes_nf','solicitacoes_nf_recibos'
  ]) loop
    execute format('drop policy if exists p_%s_select on public.%s', t, t);
    execute format('drop policy if exists p_%s_insert on public.%s', t, t);
    execute format('drop policy if exists p_%s_update on public.%s', t, t);
    execute format('drop policy if exists p_%s_delete on public.%s', t, t);
    execute format(
      'create policy p_%s_select on public.%s for select to authenticated using (true)', t, t);
    execute format(
      'create policy p_%s_insert on public.%s for insert to authenticated
       with check (public.current_papel() in (''sane'',''admin''))', t, t);
    execute format(
      'create policy p_%s_update on public.%s for update to authenticated
       using (public.current_papel() in (''sane'',''admin''))
       with check (public.current_papel() in (''sane'',''admin''))', t, t);
    execute format(
      'create policy p_%s_delete on public.%s for delete to authenticated
       using (public.current_papel() in (''sane'',''admin''))', t, t);
  end loop;
end $pol15$;

-- 15.6) CNPJ do fornecedor editável a partir da tela de Grupo: a SANE passa a
-- poder atualizar fornecedores (antes só admin). Inserção segue restrita a admin.
drop policy if exists p_fornecedores_update on public.fornecedores;
create policy p_fornecedores_update on public.fornecedores for update to authenticated
  using (public.current_papel() in ('sane','admin'))
  with check (public.current_papel() in ('sane','admin'));

-- 15.7) Saldo por ITEM de cada empenho (qtd e R$), base dos botões/relatórios
-- de saldo (NE individual, por grupo e PDF de saldos). Mesma regra da fila:
-- saldo_valor = qtd_empenhada x preço_da_NE - consumido; saldo_qtd convertido
-- ao preço vigente do catálogo (após apostilamento, ajusta-se sozinho).
create or replace view public.vw_empenho_item_saldos
with (security_invoker = on) as
select
  e.id                                          as empenho_id,
  e.numero                                      as empenho_numero,
  e.data_emissao,
  e.fornecedor_id,
  e.status                                      as empenho_status,
  ei.item_id,
  i.grupo_id,
  i.descricao,
  i.codigo_catmat,
  i.unidade,
  ei.quantidade                                 as qtd_empenhada,
  coalesce(ei.valor_unitario, i.preco_unitario) as valor_unitario_ne,
  i.preco_unitario                              as preco_vigente,
  coalesce(c.consumido_qtd, 0)                  as consumido_qtd,
  coalesce(c.consumido_valor, 0)::numeric(14,2) as consumido_valor,
  (ei.quantidade * coalesce(ei.valor_unitario, i.preco_unitario))::numeric(14,2) as valor_inicial,
  (ei.quantidade * coalesce(ei.valor_unitario, i.preco_unitario)
     - coalesce(c.consumido_valor, 0))::numeric(14,2) as saldo_valor,
  case when i.preco_unitario > 0
    then round((ei.quantidade * coalesce(ei.valor_unitario, i.preco_unitario)
           - coalesce(c.consumido_valor, 0)) / i.preco_unitario, 3)
    else null end                               as saldo_qtd
from public.empenhos e
join public.empenhos_itens ei on ei.empenho_id = e.id
join public.itens i on i.id = ei.item_id
left join (
  select empenho_id, item_id,
         sum(quantidade)                              as consumido_qtd,
         sum(quantidade * coalesce(valor_unitario, 0)) as consumido_valor
  from public.nf_itens
  where empenho_id is not null
  group by empenho_id, item_id
) c on c.empenho_id = e.id and c.item_id = ei.item_id;
