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
  quantidade      numeric(14,4) not null default 0,
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

-- Migração idempotente (01/07/2026): entrega pode ser um período (de X a Y).
-- data_entrega = início (X, obrigatória); data_entrega_fim = fim (Y, opcional).
-- Quando fim é nulo ou igual ao início, a entrega é de dia único.
alter table public.notas_fiscais add column if not exists data_entrega_fim date;

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
  quantidade      numeric(14,4) not null,
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

-- Conjunto de campi do usuario (multi-campus): os vinculados em perfis_campi
-- MAIS o campus principal (perfis.campus_id), para nao perder acesso de quem
-- ainda nao tem linha em perfis_campi. Usado nas policies de recibos.
create or replace function public.current_campi()
returns setof bigint language sql stable security definer set search_path = public
as $ccs$
  select campus_id from public.perfis where id = auth.uid() and campus_id is not null
  union
  select campus_id from public.perfis_campi where perfil_id = auth.uid()
$ccs$;

-- Recibo ainda editavel pelo campus que o lancou: e de um campus do usuario,
-- ainda nao virou pagamento (sem NF vinculada, status rascunho/pendente) e nao
-- esta na quarentena. Depois disso so a SANE altera.
create or replace function public.recibo_editavel_campus(p_recibo_id bigint)
returns boolean language sql stable security definer set search_path = public
as $rec$
  select exists (
    select 1 from public.recibos r
    where r.id = p_recibo_id
      and r.campus_id in (select public.current_campi())
      and r.nf_id is null
      and r.status in ('rascunho','pendente')
      and r.deleted_at is null
  )
$rec$;

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
    or (public.current_papel() = 'campus' and campus_id in (select public.current_campi()))
  );
-- Campus corrige o proprio recibo enquanto ele nao virou pagamento (sem NF e
-- status rascunho/pendente); status e nf_id ficam protegidos pelo gatilho
-- trg_recibo_nfid_guard. Depois de vinculado/pago, so a SANE altera.
drop policy if exists p_recibos_update on public.recibos;
create policy p_recibos_update on public.recibos for update to authenticated
  using (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and campus_id in (select public.current_campi())
      and nf_id is null
      and status in ('rascunho','pendente')
      and deleted_at is null
    )
  )
  with check (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and campus_id in (select public.current_campi())
    )
  );

-- Itens de recibo: campus inclui itens em recibos do próprio campus.
drop policy if exists p_recibos_itens_insert on public.recibos_itens;
create policy p_recibos_itens_insert on public.recibos_itens for insert to authenticated
  with check (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and public.recibo_editavel_campus(recibo_id)
    )
  );
-- Campus corrige quantidades dos itens enquanto o recibo estiver editavel.
drop policy if exists p_recibos_itens_update on public.recibos_itens;
create policy p_recibos_itens_update on public.recibos_itens for update to authenticated
  using (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and public.recibo_editavel_campus(recibo_id)
    )
  )
  with check (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and public.recibo_editavel_campus(recibo_id)
    )
  );

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
  using (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and public.recibo_editavel_campus(recibo_id)
    )
  );

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
  (e.valor_inicial + e.reforco - e.cancelamento - e.anulacao - coalesce(d.debitado, 0))::numeric(14,2) as saldo,
  e.criado_por_nome, e.created_at,
  e.deleted_at, e.deleted_by_nome
from public.empenhos e
left join public.fornecedores f on f.id = e.fornecedor_id
left join (
  select empenho_id, sum(valor_debitado) as debitado
  from public.nf_empenhos
  join public.notas_fiscais nf on nf.id = nf_empenhos.nf_id and nf.deleted_at is null
  group by empenho_id
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
  from public.empenhos_grupos
  join public.empenhos e on e.id = empenhos_grupos.empenho_id and e.deleted_at is null
  group by grupo_id
) a on a.grupo_id = g.id
left join (
  select nf.grupo_id, sum(ne.valor_debitado) as utilizado
  from public.nf_empenhos ne
  join public.notas_fiscais nf on nf.id = ne.nf_id and nf.deleted_at is null
  group by nf.grupo_id
) u on u.grupo_id = g.id
left join (
  select grupo_id, count(*) as qtd_nfs
  from public.notas_fiscais where deleted_at is null group by grupo_id
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
           - coalesce(c.consumido_valor, 0)) / i.preco_unitario, 4)
    else null end                               as saldo_qtd
from public.empenhos e
join public.empenhos_itens ei on ei.empenho_id = e.id
join public.itens i on i.id = ei.item_id
left join (
  select empenho_id, item_id,
         sum(quantidade)                              as consumido_qtd,
         sum(quantidade * coalesce(valor_unitario, 0)) as consumido_valor
  from public.nf_itens
  join public.notas_fiscais nf on nf.id = nf_itens.nf_id and nf.deleted_at is null
  where empenho_id is not null
  group by empenho_id, item_id
) c on c.empenho_id = e.id and c.item_id = ei.item_id;

-- =========================================================
-- 19) Status do recibo segue a NF vinculada — 06/2026
-- =========================================================
-- Pedido SANE: ao classificar a NF como "pago", os recibos vinculados a ela
-- (via nf_recibos e o legado recibos.nf_id) passam a "pago" automaticamente, em
-- vez de serem alterados um a um (ex.: Nardelli, 50+ recibos por NF).
-- Regra conservadora: só "pago" é propagado — glosa pode ser parcial e
-- "confirmado" pode ser ato manual do campus, então não são propagados. Recibo
-- "cancelado" não é reativado. Se a NF deixa de estar paga (ou o recibo é
-- desvinculado), o recibo volta de "pago" para "pendente".

-- "pago" se houver ao menos uma NF paga vinculada ao recibo.
create or replace function public.recibo_status_sugerido(p_recibo_id bigint)
returns text language sql stable as $rss$
  select case when exists (
    select 1 from public.notas_fiscais n
    where n.status = 'pago'
      and (
        n.id in (select nr.nf_id from public.nf_recibos nr where nr.recibo_id = p_recibo_id)
        or n.id = (select r.nf_id from public.recibos r where r.id = p_recibo_id)
      )
  ) then 'pago' else null end;
$rss$;

-- Aplica o status sugerido a um recibo (não mexe em recibo cancelado).
create or replace function public.aplicar_status_recibo(p_recibo_id bigint)
returns void language plpgsql as $asr$
declare
  v_atual text;
  v_sug   text;
begin
  select status into v_atual from public.recibos where id = p_recibo_id;
  if v_atual is null or v_atual = 'cancelado' then
    return;
  end if;
  v_sug := public.recibo_status_sugerido(p_recibo_id);
  if v_sug = 'pago' then
    if v_atual is distinct from 'pago' then
      update public.recibos set status = 'pago', updated_at = now() where id = p_recibo_id;
    end if;
  elsif v_atual = 'pago' then
    update public.recibos set status = 'pendente', updated_at = now() where id = p_recibo_id;
  end if;
end;
$asr$;

-- Gatilho: mudança de status da NF recalcula os recibos vinculados.
create or replace function public.trg_nf_status_propaga()
returns trigger language plpgsql as $tnsp$
declare v_rid bigint;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  for v_rid in
    select nr.recibo_id from public.nf_recibos nr where nr.nf_id = new.id
    union
    select rc.id from public.recibos rc where rc.nf_id = new.id
  loop
    perform public.aplicar_status_recibo(v_rid);
  end loop;
  return new;
end;
$tnsp$;

drop trigger if exists trg_nf_status_propaga on public.notas_fiscais;
create trigger trg_nf_status_propaga
  after update of status on public.notas_fiscais
  for each row execute function public.trg_nf_status_propaga();

-- Gatilho: ao vincular/desvincular recibo<->NF, recalcula o recibo afetado.
create or replace function public.trg_nf_recibos_propaga()
returns trigger language plpgsql as $tnrp$
begin
  if tg_op = 'DELETE' then
    perform public.aplicar_status_recibo(old.recibo_id);
    return old;
  else
    perform public.aplicar_status_recibo(new.recibo_id);
    return new;
  end if;
end;
$tnrp$;

drop trigger if exists trg_nf_recibos_propaga_ins on public.nf_recibos;
create trigger trg_nf_recibos_propaga_ins after insert on public.nf_recibos
  for each row execute function public.trg_nf_recibos_propaga();
drop trigger if exists trg_nf_recibos_propaga_del on public.nf_recibos;
create trigger trg_nf_recibos_propaga_del after delete on public.nf_recibos
  for each row execute function public.trg_nf_recibos_propaga();

-- Backfill único: aplica a regra aos recibos já vinculados a alguma NF.
do $bf19$
declare v_rid bigint;
begin
  for v_rid in
    select distinct recibo_id from public.nf_recibos
    union
    select id from public.recibos where nf_id is not null
  loop
    perform public.aplicar_status_recibo(v_rid);
  end loop;
end $bf19$;

-- =========================================================
-- 20) Snapshot de itens da solicitação de NF — 06/2026
-- =========================================================
-- A solicitação passa a guardar os itens consolidados como enviados à empresa
-- (descrição, unidade, quantidade e VALOR UNITÁRIO no momento). Assim a SANE pode
-- ajustar o valor unitário (ex.: apostilamento ainda não refletido no cadastro do
-- item) e o PDF rebaixado do histórico continua fiel ao que foi solicitado.
create table if not exists public.solicitacoes_nf_itens (
  id             bigserial primary key,
  solicitacao_id bigint not null references public.solicitacoes_nf(id) on delete cascade,
  item_id        bigint not null references public.itens(id) on delete restrict,
  descricao      text,
  codigo_catmat  text,
  unidade        text,
  quantidade     numeric(14,4) not null default 0,
  valor_unitario numeric(14,4) not null default 0,
  unique (solicitacao_id, item_id)
);
create index if not exists idx_solic_nf_itens_solic on public.solicitacoes_nf_itens(solicitacao_id);

alter table public.solicitacoes_nf_itens enable row level security;
drop policy if exists p_solic_nf_itens_select on public.solicitacoes_nf_itens;
create policy p_solic_nf_itens_select on public.solicitacoes_nf_itens for select to authenticated
  using (true);
drop policy if exists p_solic_nf_itens_write on public.solicitacoes_nf_itens;
create policy p_solic_nf_itens_write on public.solicitacoes_nf_itens for all to authenticated
  using (public.current_papel() in ('sane','admin'))
  with check (public.current_papel() in ('sane','admin'));

-- =========================================================
-- 21) Apostilamento por valores (preços específicos por item) — 06/2026
-- =========================================================
-- Complementa o reajuste por percentual: aplica novos preços ESPECÍFICOS por item
-- (caso comum quando o apostilamento traz uma tabela de preços, não um índice
-- único). Recebe um array [{item_id, preco}], historiza o preço original na 1ª vez,
-- registra o novo preço com data-base/referência em itens_precos e atualiza o cache
-- itens.preco_unitario — assim a Solicitação de NF e os novos lançamentos já usam o
-- valor apostilado.
create or replace function public.aplicar_apostilamento_itens(
  p_itens jsonb,
  p_data_base date,
  p_referencia text default null
)
returns table (item_ref text, preco_antigo numeric, preco_novo numeric)
language plpgsql
as $ap$
declare
  v_rec record;
  v_item record;
begin
  if coalesce(public.current_papel(), '') not in ('sane', 'admin') then
    raise exception 'Apenas SANE/admin aplicam apostilamento.';
  end if;
  if p_data_base is null then
    raise exception 'Informe a data-base do apostilamento.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Lista de itens inválida.';
  end if;

  for v_rec in
    select (e ->> 'item_id')::bigint as item_id,
           round((e ->> 'preco')::numeric, 4) as preco
    from jsonb_array_elements(p_itens) e
  loop
    if v_rec.preco is null or v_rec.preco < 0 then
      continue;
    end if;
    select i.id, i.descricao, i.codigo_catmat, i.preco_unitario
      into v_item
      from public.itens i
      where i.id = v_rec.item_id
      for update;
    if not found then
      continue;
    end if;

    -- historiza o preço original na primeira aplicação
    insert into public.itens_precos (item_id, preco_unitario, vigencia_inicio, referencia)
    values (v_item.id, v_item.preco_unitario, date '1900-01-01', 'Preço original (ata)')
    on conflict (item_id, vigencia_inicio) do nothing;

    -- registra/atualiza o preço do apostilamento na data-base
    insert into public.itens_precos (item_id, preco_unitario, vigencia_inicio, referencia)
    values (v_item.id, v_rec.preco, p_data_base, p_referencia)
    on conflict (item_id, vigencia_inicio) do update
      set preco_unitario = excluded.preco_unitario,
          referencia = excluded.referencia;

    -- atualiza o cache do preço vigente
    update public.itens set preco_unitario = v_rec.preco where id = v_item.id;

    item_ref := coalesce(v_item.codigo_catmat || ' — ', '') || v_item.descricao;
    preco_antigo := v_item.preco_unitario;
    preco_novo := v_rec.preco;
    return next;
  end loop;
end;
$ap$;

-- =========================================================
-- 22) Vínculo recibo<->NF bilateral + trava de campus — 06/2026
-- =========================================================
-- Dois caminhos coexistiam sem se falar: a tela do recibo grava recibos.nf_id e a
-- tela da NF grava nf_recibos. Estes gatilhos mantêm os dois em sincronia, de forma
-- ADITIVA (sem apagar vínculos por conta própria): associar em qualquer tela aparece
-- na outra; desvincular numa tela remove o vínculo correspondente. recibos.nf_id
-- representa o vínculo "principal" (o mais recente) do recibo.

-- recibos.nf_id -> nf_recibos
create or replace function public.trg_recibo_sync_nfrec()
returns trigger language plpgsql as $srn$
begin
  if tg_op = 'UPDATE' and new.nf_id is not distinct from old.nf_id then
    return null;
  end if;
  if new.nf_id is not null then
    insert into public.nf_recibos (nf_id, recibo_id)
    values (new.nf_id, new.id)
    on conflict (nf_id, recibo_id) do nothing;
  end if;
  if tg_op = 'UPDATE' and old.nf_id is not null and old.nf_id is distinct from new.nf_id then
    delete from public.nf_recibos where nf_id = old.nf_id and recibo_id = new.id;
  end if;
  return null;
end;
$srn$;

drop trigger if exists trg_recibo_sync_nfrec on public.recibos;
create trigger trg_recibo_sync_nfrec
  after insert or update of nf_id on public.recibos
  for each row execute function public.trg_recibo_sync_nfrec();

-- nf_recibos -> recibos.nf_id (preenche o principal; recompõe ao remover o atual)
create or replace function public.trg_nfrec_sync_nfid()
returns trigger language plpgsql as $snf$
declare v_cur bigint; v_latest bigint;
begin
  if tg_op = 'INSERT' then
    update public.recibos set nf_id = new.nf_id
    where id = new.recibo_id and nf_id is null;
    return null;
  else
    select nf_id into v_cur from public.recibos where id = old.recibo_id;
    if v_cur is not distinct from old.nf_id then
      select nf_id into v_latest from public.nf_recibos
        where recibo_id = old.recibo_id order by id desc limit 1;
      update public.recibos set nf_id = v_latest
        where id = old.recibo_id and nf_id is distinct from v_latest;
    end if;
    return null;
  end if;
end;
$snf$;

drop trigger if exists trg_nfrec_sync_nfid on public.nf_recibos;
create trigger trg_nfrec_sync_nfid
  after insert or delete on public.nf_recibos
  for each row execute function public.trg_nfrec_sync_nfid();

-- Trava: somente SANE/admin (ou processos internos sem papel — ex.: migração)
-- definem/alteram recibos.nf_id. Perfis de campus não associam NF ao recibo (evita
-- erro que só a SANE veria depois). A UI já oculta o campo; isto reforça no banco.
create or replace function public.trg_recibo_nfid_guard()
returns trigger language plpgsql as $grd$
declare v_papel text := public.current_papel();
begin
  if v_papel is not null and v_papel not in ('sane', 'admin') then
    if tg_op = 'INSERT' then
      new.nf_id := null;
      -- campus nunca abre um recibo ja confirmado/pago/glosado
      if new.status is null or new.status not in ('rascunho','pendente') then
        new.status := 'pendente';
      end if;
    else
      if new.nf_id is distinct from old.nf_id then
        new.nf_id := old.nf_id;
      end if;
      -- status e da SANE (confirmar, pagar, glosar): campus nunca altera
      if new.status is distinct from old.status then
        new.status := old.status;
      end if;
    end if;
  end if;
  return new;
end;
$grd$;

drop trigger if exists trg_recibo_nfid_guard on public.recibos;
create trigger trg_recibo_nfid_guard
  before insert or update on public.recibos
  for each row execute function public.trg_recibo_nfid_guard();

-- Backfill: recibos vinculados via nf_recibos mas com nf_id nulo (associados pela
-- tela da NF antes deste sincronismo) recebem o vínculo principal (o mais recente).
update public.recibos r set nf_id = sub.nf_id
from (
  select distinct on (recibo_id) recibo_id, nf_id
  from public.nf_recibos
  order by recibo_id, id desc
) sub
where sub.recibo_id = r.id and r.nf_id is null;

-- =========================================================
-- 16) Múltiplos campi por perfil (vínculo N:N) — 06/2026
-- =========================================================
-- perfis.campus_id segue como campus PRINCIPAL (compatibilidade); perfis_campi
-- guarda o conjunto completo, permitindo um usuário responsável por vários campi.
create table if not exists public.perfis_campi (
  id        bigserial primary key,
  perfil_id uuid   not null references public.perfis(id) on delete cascade,
  campus_id bigint not null references public.campi(id) on delete cascade,
  unique (perfil_id, campus_id)
);
create index if not exists idx_perfis_campi_perfil on public.perfis_campi(perfil_id);
-- backfill do campus único atual
insert into public.perfis_campi (perfil_id, campus_id)
select id, campus_id from public.perfis where campus_id is not null
on conflict (perfil_id, campus_id) do nothing;

alter table public.perfis_campi enable row level security;
drop policy if exists p_perfis_campi_select on public.perfis_campi;
create policy p_perfis_campi_select on public.perfis_campi for select to authenticated
  using (perfil_id = auth.uid() or public.current_papel() = 'admin');
drop policy if exists p_perfis_campi_insert on public.perfis_campi;
create policy p_perfis_campi_insert on public.perfis_campi for insert to authenticated
  with check (public.current_papel() = 'admin');
drop policy if exists p_perfis_campi_delete on public.perfis_campi;
create policy p_perfis_campi_delete on public.perfis_campi for delete to authenticated
  using (public.current_papel() = 'admin');

-- conjunto de campi do usuário atual (principal + vinculados)
create or replace function public.current_campus_ids()
returns setof bigint language sql stable security definer set search_path = public
as $cci$
  select campus_id from public.perfis where id = auth.uid() and campus_id is not null
  union
  select campus_id from public.perfis_campi where perfil_id = auth.uid()
$cci$;

-- Recibos: campus insere/edita para QUALQUER campus vinculado (principal ou adicional).
drop policy if exists p_recibos_insert on public.recibos;
create policy p_recibos_insert on public.recibos for insert to authenticated
  with check (
    public.current_papel() in ('sane','admin')
    or (public.current_papel() = 'campus' and campus_id in (select public.current_campus_ids()))
  );
drop policy if exists p_recibos_itens_insert on public.recibos_itens;
create policy p_recibos_itens_insert on public.recibos_itens for insert to authenticated
  with check (
    public.current_papel() in ('sane','admin')
    or (
      public.current_papel() = 'campus'
      and exists (
        select 1 from public.recibos r
        where r.id = recibo_id and r.campus_id in (select public.current_campus_ids())
      )
    )
  );

-- =========================================================
-- 17) Auditoria, autoria (mini-log) e configurações globais — 06/2026
-- =========================================================

-- 17.1) Autoria de cadastro (mini-log local). created_at/updated_at já existem;
-- guardamos um snapshot do nome para exibir sem depender do RLS de perfis.
alter table public.recibos        add column if not exists responsavel_nome text;
alter table public.notas_fiscais  add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.notas_fiscais  add column if not exists criado_por_nome text;
alter table public.empenhos       add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.empenhos       add column if not exists criado_por_nome text;
-- backfill do nome do responsável dos recibos (a partir do perfil)
update public.recibos r set responsavel_nome = p.nome
  from public.perfis p
  where p.id = r.responsavel_user_id and r.responsavel_nome is null;

-- 17.2) Configurações globais (chave/valor) editadas pelo admin.
create table if not exists public.configuracoes (
  chave      text primary key,
  valor      text,
  descricao  text,
  updated_at timestamptz not null default now()
);
insert into public.configuracoes (chave, valor, descricao) values
  ('local_emissao_padrao', 'Rio de Janeiro', 'Local de emissão padrão nos documentos (ateste, solicitação de NF).'),
  ('cabecalho_orgao',  'COLÉGIO PEDRO II', 'Linha 1 do cabeçalho dos PDFs.'),
  ('cabecalho_setor1', 'Pró-Reitoria de Administração — PROAD', 'Linha 2 do cabeçalho dos PDFs.'),
  ('cabecalho_setor2', 'Seção de Alimentação e Nutrição — SANE', 'Linha 3 do cabeçalho dos PDFs.')
on conflict (chave) do nothing;

alter table public.configuracoes enable row level security;
drop policy if exists p_config_select on public.configuracoes;
create policy p_config_select on public.configuracoes for select to authenticated using (true);
drop policy if exists p_config_insert on public.configuracoes;
create policy p_config_insert on public.configuracoes for insert to authenticated
  with check (public.current_papel() = 'admin');
drop policy if exists p_config_update on public.configuracoes;
create policy p_config_update on public.configuracoes for update to authenticated
  using (public.current_papel() = 'admin') with check (public.current_papel() = 'admin');
drop trigger if exists trg_config_updated on public.configuracoes;
create trigger trg_config_updated before update on public.configuracoes
  for each row execute function public.set_updated_at();

-- 17.3) Log de auditoria (global). Preenchido por gatilho; leitura só admin.
create table if not exists public.audit_log (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  actor_id    uuid,
  actor_nome  text,
  acao        text not null,        -- INSERT | UPDATE | DELETE
  entidade    text not null,        -- nome da tabela
  registro_id text,                 -- id (ou chave) do registro afetado
  resumo      text,                 -- número/nome para leitura rápida
  dados       jsonb                 -- { alterados, antes, depois }
);
create index if not exists idx_audit_log_ts on public.audit_log(ts desc);
create index if not exists idx_audit_log_entidade on public.audit_log(entidade);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id);

alter table public.audit_log enable row level security;
drop policy if exists p_audit_log_select on public.audit_log;
create policy p_audit_log_select on public.audit_log for select to authenticated
  using (public.current_papel() = 'admin');
-- sem policies de escrita: clientes não inserem; só o gatilho (definer) grava.

-- função genérica de auditoria (usa jsonb — robusta a tabelas sem coluna id)
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $audit$
declare
  v_actor uuid := auth.uid();
  v_nome  text;
  v_new   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_ref   jsonb := coalesce(v_new, v_old);
  v_rid   text;
  v_changed text[];
  v_dados jsonb;
begin
  v_rid := coalesce(v_ref ->> 'id', v_ref ->> 'chave');

  if tg_op = 'UPDATE' then
    select array_agg(e.key) into v_changed
    from jsonb_each(v_new) e
    where e.value is distinct from (v_old -> e.key)
      and e.key <> 'updated_at';
    if v_changed is null then
      return new; -- nada relevante mudou (ex.: só updated_at)
    end if;
    v_dados := jsonb_build_object(
      'alterados', to_jsonb(v_changed),
      'antes',  (select jsonb_object_agg(k, v_old -> k) from unnest(v_changed) k),
      'depois', (select jsonb_object_agg(k, v_new -> k) from unnest(v_changed) k)
    );
  elsif tg_op = 'INSERT' then
    v_dados := jsonb_build_object('depois', v_new);
  else
    v_dados := jsonb_build_object('antes', v_old);
  end if;

  if v_actor is not null then
    select nome into v_nome from public.perfis where id = v_actor;
  end if;

  insert into public.audit_log (actor_id, actor_nome, acao, entidade, registro_id, resumo, dados)
  values (
    v_actor, v_nome, tg_op, tg_table_name, v_rid,
    coalesce(v_ref ->> 'numero', v_ref ->> 'nome', v_ref ->> 'chave', v_rid),
    v_dados
  );

  return coalesce(new, old);
end;
$audit$;

-- anexa o gatilho às tabelas operacionais e de cadastro
do $audit_attach$
declare t text;
begin
  for t in select unnest(array[
    'recibos','recibos_itens','notas_fiscais','nf_itens','nf_empenhos','nf_grupos','nf_recibos',
    'empenhos','empenhos_grupos','empenhos_itens','grupos','itens','itens_precos',
    'atestes','atestes_nfs','solicitacoes_nf','solicitacoes_nf_recibos','solicitacoes_nf_itens',
    'perfis','perfis_campi','campi','fornecedores','configuracoes'
  ]) loop
    execute format('drop trigger if exists trg_audit on public.%s', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%s
       for each row execute function public.fn_audit()', t);
  end loop;
end $audit_attach$;

-- =========================================================
-- 18) Precisão de quantidade: 4 casas no vínculo NE/NF — 06/2026
-- =========================================================
-- Para correspondência exata de saldo no relançamento manual de NFs/NEs antigas
-- (evita diferença de arredondamento de ~R$ 0,01). As quantidades passam de 3
-- para 4 casas decimais; os valores existentes são preservados. A view de saldos
-- por item depende da coluna, então é derrubada antes do alter e recriada depois.
drop view if exists public.vw_empenho_item_saldos;
-- views analiticas (secao 23) tambem dependem de nf_itens.quantidade:
drop view if exists public.vw_estimativa_ata;
drop view if exists public.vw_item_abc;
drop view if exists public.vw_item_consumo;
alter table public.empenhos_itens alter column quantidade type numeric(14,4);
alter table public.nf_itens       alter column quantidade type numeric(14,4);

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
           - coalesce(c.consumido_valor, 0)) / i.preco_unitario, 4)
    else null end                               as saldo_qtd
from public.empenhos e
join public.empenhos_itens ei on ei.empenho_id = e.id
join public.itens i on i.id = ei.item_id
left join (
  select empenho_id, item_id,
         sum(quantidade)                              as consumido_qtd,
         sum(quantidade * coalesce(valor_unitario, 0)) as consumido_valor
  from public.nf_itens
  join public.notas_fiscais nf on nf.id = nf_itens.nf_id and nf.deleted_at is null
  where empenho_id is not null
  group by empenho_id, item_id
) c on c.empenho_id = e.id and c.item_id = ei.item_id;


-- =====================================================================
-- 23. Views analiticas (data mining para planejamento de contratos)
--     Todas security_invoker: respeitam a RLS do usuario (SANE/admin
--     veem tudo; campus ve o proprio recorte). Consumo fisico vem de
--     recibos_itens; o faturado/valor vem de nf_itens; o orcamentario,
--     de nf_empenhos. "melhor" = maior cobertura entre fisico e faturado
--     (as duas fontes tem lacunas distintas por grupo). Datas futuras
--     sao sinalizadas, nao excluidas.
-- =====================================================================

-- 23.1 Consumo financeiro mensal (NFs), com mes futuro sinalizado
create or replace view public.vw_consumo_mensal
with (security_invoker = on) as
select m.mes, m.nfs, m.valor,
       (m.mes > date_trunc('month', current_date)::date) as futuro
from (
  select date_trunc('month', nf.data_entrega)::date as mes,
         count(*) as nfs,
         sum(coalesce(nf.valor_total, 0))::numeric(14,2) as valor
  from public.notas_fiscais nf
  where nf.data_entrega is not null
    and nf.status <> 'cancelado'
    and nf.deleted_at is null
  group by 1
) m
order by m.mes;

-- 23.2 Consumo por item x ATA: fisico (recibos) + faturado (NF) + melhor estimativa
create or replace view public.vw_item_consumo
with (security_invoker = on) as
select
  i.id                                   as item_id,
  i.descricao,
  i.grupo_id,
  g.numero_romano                        as grupo,
  g.nome                                 as grupo_nome,
  i.unidade,
  i.preco_unitario,
  i.quantidade_ata,
  coalesce(rf.qtd, 0)::numeric(14,3)     as consumido_fisico,
  coalesce(nfq.qtd, 0)::numeric(14,4)    as consumido_faturado,
  greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0))::numeric(14,4) as consumido_melhor,
  (coalesce(rf.qtd, 0) * i.preco_unitario)::numeric(14,2) as valor_fisico,
  coalesce(nfq.valor, 0)::numeric(14,2)  as valor_faturado,
  greatest(coalesce(rf.qtd, 0) * i.preco_unitario, coalesce(nfq.valor, 0))::numeric(14,2) as valor_melhor,
  case when i.quantidade_ata > 0
       then round(100 * coalesce(rf.qtd, 0) / i.quantidade_ata, 1) end as pct_ata_fisico,
  case when i.quantidade_ata > 0
       then round(100 * coalesce(nfq.qtd, 0) / i.quantidade_ata, 1) end as pct_ata_faturado,
  case when i.quantidade_ata > 0
       then round(100 * greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0)) / i.quantidade_ata, 1) end as pct_ata_melhor,
  case when i.quantidade_ata > 0
       then round(i.quantidade_ata - greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0)), 3) end as saldo_ata
from public.itens i
join public.grupos g on g.id = i.grupo_id
left join (
  select ri.item_id, sum(ri.quantidade) as qtd
  from public.recibos_itens ri
  join public.recibos r on r.id = ri.recibo_id
  where r.status <> 'cancelado' and r.deleted_at is null
  group by ri.item_id
) rf on rf.item_id = i.id
left join (
  select ni.item_id,
         sum(ni.quantidade) as qtd,
         sum(ni.quantidade * coalesce(ni.valor_unitario, 0)) as valor
  from public.nf_itens ni
  join public.notas_fiscais nf on nf.id = ni.nf_id and nf.deleted_at is null
  group by ni.item_id
) nfq on nfq.item_id = i.id;

-- 23.3 Curva ABC de itens (por valor "melhor"), com classe A/B/C
create or replace view public.vw_item_abc
with (security_invoker = on) as
with base as (
  select item_id, descricao, grupo, grupo_nome, unidade,
         consumido_melhor as qtd, valor_melhor as valor
  from public.vw_item_consumo
  where valor_melhor > 0
)
select
  b.item_id, b.descricao, b.grupo, b.grupo_nome, b.unidade, b.qtd, b.valor,
  round(100 * b.valor / nullif(sum(b.valor) over (), 0), 2) as share_pct,
  round(100 * sum(b.valor) over (order by b.valor desc
        rows between unbounded preceding and current row)
        / nullif(sum(b.valor) over (), 0), 2) as acum_pct,
  case
    when 100 * sum(b.valor) over (order by b.valor desc
         rows between unbounded preceding and current row)
         / nullif(sum(b.valor) over (), 0) <= 80 then 'A'
    when 100 * sum(b.valor) over (order by b.valor desc
         rows between unbounded preceding and current row)
         / nullif(sum(b.valor) over (), 0) <= 95 then 'B'
    else 'C'
  end as classe
from base b
order by b.valor desc;

-- 23.4 Consumo estimado por campus (fisico x preco vigente)
create or replace view public.vw_consumo_campus
with (security_invoker = on) as
select
  ca.id                                  as campus_id,
  ca.nome                                as campus,
  count(distinct r.id)                   as recibos,
  coalesce(sum(ri.quantidade * coalesce(i.preco_unitario, 0)), 0)::numeric(14,2) as valor_estimado
from public.campi ca
left join public.recibos r on r.campus_id = ca.id and r.status <> 'cancelado' and r.deleted_at is null
left join public.recibos_itens ri on ri.recibo_id = r.id
left join public.itens i on i.id = ri.item_id
group by ca.id, ca.nome
order by valor_estimado desc;

-- 23.5 Dependencia por fornecedor (orcamento utilizado via nf_empenhos)
create or replace view public.vw_fornecedor_consumo
with (security_invoker = on) as
with base as (
  select
    coalesce(f.id, 0)           as fornecedor_id,
    coalesce(f.codigo, '(sem)') as fornecedor,
    count(distinct g.id)        as grupos,
    sum(ne.valor_debitado)::numeric(14,2) as utilizado
  from public.nf_empenhos ne
  join public.notas_fiscais nf on nf.id = ne.nf_id and nf.deleted_at is null
  join public.grupos g on g.id = nf.grupo_id
  left join public.fornecedores f on f.id = g.fornecedor_id
  group by 1, 2
)
select
  b.fornecedor_id, b.fornecedor, b.grupos, b.utilizado,
  round(100 * b.utilizado / nullif(sum(b.utilizado) over (), 0), 1) as share_pct
from base b
order by b.utilizado desc;

-- 23.6 Estimativa de consumo anual por item (base para a proxima ATA / ETP).
--      Anualiza o consumo "melhor" pelo periodo de execucao observado (meses
--      entre a primeira e a ultima entrega/recebimento nao-futuros).
create or replace view public.vw_estimativa_ata
with (security_invoker = on) as
with per as (
  select
    least(
      coalesce((select min(data_recebimento) from public.recibos where status <> 'cancelado' and deleted_at is null), current_date),
      coalesce((select min(data_entrega) from public.notas_fiscais where status <> 'cancelado' and deleted_at is null and data_entrega <= current_date), current_date)
    ) as inicio,
    greatest(
      coalesce((select max(data_recebimento) from public.recibos where status <> 'cancelado' and deleted_at is null and data_recebimento <= current_date), current_date),
      coalesce((select max(data_entrega) from public.notas_fiscais where status <> 'cancelado' and deleted_at is null and data_entrega <= current_date), current_date)
    ) as fim
),
base as (
  select greatest(1, (date_part('year', age(fim, inicio)) * 12
                      + date_part('month', age(fim, inicio)) + 1))::int as meses
  from per
)
select
  ic.item_id, ic.descricao, ic.grupo, ic.grupo_nome, ic.unidade,
  ic.quantidade_ata,
  ic.consumido_melhor,
  b.meses                                          as meses_ref,
  round(ic.consumido_melhor / b.meses * 12, 2)     as estimativa_anual,
  case when ic.quantidade_ata > 0
       then round(100 * (ic.consumido_melhor / b.meses * 12) / ic.quantidade_ata, 0)
       end                                         as pct_anual_vs_ata
from public.vw_item_consumo ic
cross join base b
order by ic.grupo, ic.descricao;


-- =====================================================================
-- 24. Soft-delete / quarentena (30 dias) — notas_fiscais, recibos, empenhos
--     Exclusao = marcar deleted_at (reversivel). Um job diario (pg_cron)
--     apaga de vez o que passou de 30 dias. As views da secao 23 e os
--     resumos ignoram linhas com deleted_at.
-- =====================================================================
alter table public.notas_fiscais add column if not exists deleted_at      timestamptz;
alter table public.notas_fiscais add column if not exists deleted_by      uuid references auth.users(id) on delete set null;
alter table public.notas_fiscais add column if not exists deleted_by_nome text;
alter table public.recibos       add column if not exists deleted_at      timestamptz;
alter table public.recibos       add column if not exists deleted_by      uuid references auth.users(id) on delete set null;
alter table public.recibos       add column if not exists deleted_by_nome text;
alter table public.empenhos      add column if not exists deleted_at      timestamptz;
alter table public.empenhos      add column if not exists deleted_by      uuid references auth.users(id) on delete set null;
alter table public.empenhos      add column if not exists deleted_by_nome text;

create index if not exists idx_nf_deleted      on public.notas_fiscais (deleted_at) where deleted_at is not null;
create index if not exists idx_recibo_deleted  on public.recibos       (deleted_at) where deleted_at is not null;
create index if not exists idx_empenho_deleted on public.empenhos      (deleted_at) where deleted_at is not null;

-- Expurgo definitivo: remove o que esta ha mais de 30 dias na quarentena.
create or replace function public.purga_quarentena()
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer := 0; d integer;
begin
  delete from public.notas_fiscais where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics d = row_count; n := n + d;
  delete from public.recibos       where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics d = row_count; n := n + d;
  delete from public.empenhos      where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics d = row_count; n := n + d;
  return n;
end $fn$;

-- pg_cron (se disponivel no projeto): agenda diaria 03:17 UTC. Idempotente.
do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponivel (%). Expurgo ficara manual via select public.purga_quarentena().', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purga_quarentena_diaria') then
      perform cron.unschedule('purga_quarentena_diaria');
    end if;
    perform cron.schedule('purga_quarentena_diaria', '17 3 * * *', 'select public.purga_quarentena()');
  end if;
end $cron$;


-- =====================================================================
-- 25. Salvamento atomico de empenho (empenho + grupos + itens em 1 transacao)
--     Evita commit parcial (ex.: reforco gravado sem atualizar os itens).
--     security invoker => a RLS de cada tabela continua valendo (so sane/admin).
-- =====================================================================
create or replace function public.salvar_empenho(
  p_id              bigint,
  p_empenho         jsonb,
  p_grupos          jsonb default '[]'::jsonb,
  p_itens           jsonb default '[]'::jsonb,
  p_criado_por      uuid  default null,
  p_criado_por_nome text  default null
) returns bigint
language plpgsql
security invoker
as $se$
declare
  v_id bigint := p_id;
  g jsonb;
  it jsonb;
begin
  if v_id is null then
    insert into public.empenhos (
      numero, data_emissao, fornecedor_id, valor_inicial, reforco,
      cancelamento, anulacao, status, processo_suap, observacoes, link_pdf,
      criado_por, criado_por_nome
    ) values (
      p_empenho->>'numero',
      (p_empenho->>'data_emissao')::date,
      nullif(p_empenho->>'fornecedor_id','')::bigint,
      coalesce((p_empenho->>'valor_inicial')::numeric, 0),
      coalesce((p_empenho->>'reforco')::numeric, 0),
      coalesce((p_empenho->>'cancelamento')::numeric, 0),
      coalesce((p_empenho->>'anulacao')::numeric, 0),
      coalesce(p_empenho->>'status', 'ativo'),
      nullif(p_empenho->>'processo_suap',''),
      nullif(p_empenho->>'observacoes',''),
      nullif(p_empenho->>'link_pdf',''),
      p_criado_por,
      p_criado_por_nome
    ) returning id into v_id;
  else
    update public.empenhos set
      numero        = p_empenho->>'numero',
      data_emissao  = (p_empenho->>'data_emissao')::date,
      fornecedor_id = nullif(p_empenho->>'fornecedor_id','')::bigint,
      valor_inicial = coalesce((p_empenho->>'valor_inicial')::numeric, 0),
      reforco       = coalesce((p_empenho->>'reforco')::numeric, 0),
      cancelamento  = coalesce((p_empenho->>'cancelamento')::numeric, 0),
      anulacao      = coalesce((p_empenho->>'anulacao')::numeric, 0),
      status        = coalesce(p_empenho->>'status', 'ativo'),
      processo_suap = nullif(p_empenho->>'processo_suap',''),
      observacoes   = nullif(p_empenho->>'observacoes',''),
      link_pdf      = nullif(p_empenho->>'link_pdf','')
    where id = v_id;
    if not found then
      raise exception 'Empenho % nao encontrado ou sem permissao para alterar.', v_id;
    end if;
  end if;

  -- alocacoes por grupo (upsert por id; senao, insere)
  for g in select value from jsonb_array_elements(coalesce(p_grupos, '[]'::jsonb)) loop
    if nullif(g->>'grupo_id','') is null then
      continue;
    end if;
    if nullif(g->>'id','') is not null then
      update public.empenhos_grupos set
        grupo_id      = (g->>'grupo_id')::bigint,
        valor_alocado = coalesce((g->>'valor_alocado')::numeric, 0),
        percentual    = nullif(g->>'percentual','')::numeric,
        observacoes   = nullif(g->>'observacoes','')
      where id = (g->>'id')::bigint and empenho_id = v_id;
    else
      insert into public.empenhos_grupos (empenho_id, grupo_id, valor_alocado, percentual, observacoes)
      values (
        v_id, (g->>'grupo_id')::bigint,
        coalesce((g->>'valor_alocado')::numeric, 0),
        nullif(g->>'percentual','')::numeric,
        nullif(g->>'observacoes','')
      );
    end if;
  end loop;

  -- itens empenhados (upsert por id; novos com qtd<=0 sao ignorados)
  for it in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if nullif(it->>'item_id','') is null then
      continue;
    end if;
    if nullif(it->>'id','') is not null then
      update public.empenhos_itens set
        quantidade     = coalesce((it->>'quantidade')::numeric, 0),
        valor_unitario = nullif(it->>'valor_unitario','')::numeric
      where id = (it->>'id')::bigint and empenho_id = v_id;
    elsif coalesce((it->>'quantidade')::numeric, 0) > 0 then
      insert into public.empenhos_itens (empenho_id, item_id, quantidade, valor_unitario)
      values (
        v_id, (it->>'item_id')::bigint,
        coalesce((it->>'quantidade')::numeric, 0),
        nullif(it->>'valor_unitario','')::numeric
      );
    end if;
  end loop;

  return v_id;
end;
$se$;

revoke all on function public.salvar_empenho(bigint, jsonb, jsonb, jsonb, uuid, text) from public;
grant execute on function public.salvar_empenho(bigint, jsonb, jsonb, jsonb, uuid, text) to authenticated;


-- =====================================================================
-- 26. Salvamento atomico de nota fiscal (NF + grupos + itens em 1 transacao)
--     Evita commit parcial (ex.: NF atualizada e nf_grupos apagados sem reinserir).
--     security invoker => RLS de cada tabela continua valendo (so sane/admin).
-- =====================================================================
create or replace function public.salvar_nota_fiscal(
  p_id              bigint,
  p_nf              jsonb,
  p_grupos          jsonb default '[]'::jsonb,
  p_itens           jsonb default '[]'::jsonb,
  p_criado_por      uuid  default null,
  p_criado_por_nome text  default null
) returns bigint
language plpgsql
security invoker
as $snf$
declare
  v_id bigint := p_id;
  g jsonb;
  it jsonb;
begin
  if v_id is null then
    insert into public.notas_fiscais (
      numero, grupo_id, fornecedor_id, data_emissao, data_entrega, data_entrega_fim, valor_total,
      processo_pagamento, data_abertura_processo, status, ocorrencias, observacoes,
      link_pdf, link_instrumento_cobranca, criado_por, criado_por_nome
    ) values (
      p_nf->>'numero',
      nullif(p_nf->>'grupo_id','')::bigint,
      nullif(p_nf->>'fornecedor_id','')::bigint,
      nullif(p_nf->>'data_emissao','')::date,
      (p_nf->>'data_entrega')::date,
      nullif(p_nf->>'data_entrega_fim','')::date,
      nullif(p_nf->>'valor_total','')::numeric,
      nullif(p_nf->>'processo_pagamento',''),
      nullif(p_nf->>'data_abertura_processo','')::date,
      coalesce(p_nf->>'status','pendente'),
      nullif(p_nf->>'ocorrencias',''),
      nullif(p_nf->>'observacoes',''),
      nullif(p_nf->>'link_pdf',''),
      nullif(p_nf->>'link_instrumento_cobranca',''),
      p_criado_por,
      p_criado_por_nome
    ) returning id into v_id;
  else
    update public.notas_fiscais set
      numero                 = p_nf->>'numero',
      grupo_id               = nullif(p_nf->>'grupo_id','')::bigint,
      fornecedor_id          = nullif(p_nf->>'fornecedor_id','')::bigint,
      data_emissao           = nullif(p_nf->>'data_emissao','')::date,
      data_entrega           = (p_nf->>'data_entrega')::date,
      data_entrega_fim       = nullif(p_nf->>'data_entrega_fim','')::date,
      valor_total            = nullif(p_nf->>'valor_total','')::numeric,
      processo_pagamento     = nullif(p_nf->>'processo_pagamento',''),
      data_abertura_processo = nullif(p_nf->>'data_abertura_processo','')::date,
      status                 = coalesce(p_nf->>'status','pendente'),
      ocorrencias            = nullif(p_nf->>'ocorrencias',''),
      observacoes            = nullif(p_nf->>'observacoes',''),
      link_pdf               = nullif(p_nf->>'link_pdf',''),
      link_instrumento_cobranca = nullif(p_nf->>'link_instrumento_cobranca','')
    where id = v_id;
    if not found then
      raise exception 'NF % nao encontrada ou sem permissao para alterar.', v_id;
    end if;
  end if;

  -- grupos: apaga e reinsere o conjunto selecionado (atomico nesta transacao)
  delete from public.nf_grupos where nf_id = v_id;
  for g in select value from jsonb_array_elements(coalesce(p_grupos, '[]'::jsonb)) loop
    if nullif(g#>>'{}','') is not null then
      insert into public.nf_grupos (nf_id, grupo_id)
      values (v_id, (g#>>'{}')::bigint)
      on conflict (nf_id, grupo_id) do nothing;
    end if;
  end loop;

  -- itens (upsert por id; novos com qtd<=0 ignorados)
  for it in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if nullif(it->>'item_id','') is null then
      continue;
    end if;
    if nullif(it->>'id','') is not null then
      update public.nf_itens set
        quantidade     = coalesce((it->>'quantidade')::numeric, 0),
        valor_unitario = nullif(it->>'valor_unitario','')::numeric,
        empenho_id     = nullif(it->>'empenho_id','')::bigint
      where id = (it->>'id')::bigint and nf_id = v_id;
    elsif coalesce((it->>'quantidade')::numeric, 0) > 0 then
      insert into public.nf_itens (nf_id, item_id, quantidade, valor_unitario, empenho_id)
      values (
        v_id, (it->>'item_id')::bigint,
        coalesce((it->>'quantidade')::numeric, 0),
        nullif(it->>'valor_unitario','')::numeric,
        nullif(it->>'empenho_id','')::bigint
      );
    end if;
  end loop;

  return v_id;
end;
$snf$;

revoke all on function public.salvar_nota_fiscal(bigint, jsonb, jsonb, jsonb, uuid, text) from public;
grant execute on function public.salvar_nota_fiscal(bigint, jsonb, jsonb, jsonb, uuid, text) to authenticated;


-- =====================================================================
-- 27. Protecao do ultimo administrador
--     Garante que sempre exista ao menos um admin: bloqueia rebaixar o papel
--     ou excluir o perfil do unico admin (inclusive via cascade de auth.users).
--     security definer: a contagem precisa enxergar todos os perfis, sem RLS.
-- =====================================================================
create or replace function public.protege_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $pua$
begin
  if old.papel = 'admin'
     and (tg_op = 'DELETE' or new.papel <> 'admin')
     and not exists (
       select 1 from public.perfis
       where papel = 'admin' and id <> old.id
     )
  then
    raise exception 'Operacao bloqueada: este e o unico administrador do sistema. Promova outro usuario a admin antes de alterar ou remover este perfil.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$pua$;

drop trigger if exists trg_perfis_ultimo_admin on public.perfis;
create trigger trg_perfis_ultimo_admin
  before update or delete on public.perfis
  for each row execute function public.protege_ultimo_admin();


-- =====================================================================
-- 28. Exclusao de usuario pelo administrador
--     Remove a conta do Auth; public.perfis sai em cascata (e com ele o
--     vinculo de campi). Protecoes: so admin executa, ninguem exclui a si
--     mesmo, e o gatilho protege_ultimo_admin aborta a remocao do unico admin.
--     O historico e preservado: as FKs de usuario sao ON DELETE SET NULL e os
--     documentos guardam nome/matricula em colunas snapshot (ex.: atestes).
-- =====================================================================
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $adu$
begin
  if coalesce(public.current_papel(), '') <> 'admin' then
    raise exception 'Apenas administradores podem excluir usuarios.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Voce nao pode excluir o proprio usuario.';
  end if;
  if not exists (select 1 from public.perfis where id = target_user_id) then
    raise exception 'Usuario nao encontrado.';
  end if;

  -- vinculos de campi saem antes (idempotente mesmo se a FK ja for cascade)
  delete from public.perfis_campi where perfil_id = target_user_id;
  -- a exclusao no Auth cascateia para public.perfis, onde o gatilho
  -- protege_ultimo_admin ainda pode abortar toda a transacao.
  delete from auth.users where id = target_user_id;
end;
$adu$;

revoke all on function public.admin_delete_user(uuid) from public;
revoke execute on function public.admin_delete_user(uuid) from anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;


-- =====================================================================
-- 29. Consumo por item por empenho (planejamento de reforco)
-- =====================================================================
-- Saldo por item de cada empenho: empenhado (empenhos_itens) x consumido
-- (nf_itens com empenho_id, de NFs nao excluidas). security_invoker: respeita
-- a RLS de quem consulta.
create or replace view public.vw_empenho_item_saldo
with (security_invoker = on) as
select
  e.id            as empenho_id,
  e.numero        as empenho,
  e.data_emissao,
  e.status,
  i.id            as item_id,
  i.codigo_catmat,
  i.descricao,
  i.unidade,
  i.grupo_id,
  g.numero_romano as grupo,
  ei.quantidade::numeric(14,4)                                                   as qtd_empenhada,
  coalesce(ei.valor_unitario, i.preco_unitario)::numeric(14,4)                   as valor_unitario,
  (ei.quantidade * coalesce(ei.valor_unitario, i.preco_unitario))::numeric(14,2) as valor_empenhado,
  coalesce(c.qtd_consumida, 0)::numeric(14,4)                                    as qtd_consumida,
  coalesce(c.valor_consumido, 0)::numeric(14,2)                                  as valor_consumido,
  (ei.quantidade - coalesce(c.qtd_consumida, 0))::numeric(14,4)                  as saldo_qtd
from public.empenhos e
join public.empenhos_itens ei on ei.empenho_id = e.id
join public.itens i           on i.id = ei.item_id
left join public.grupos g     on g.id = i.grupo_id
left join (
  select ni.empenho_id, ni.item_id,
         sum(ni.quantidade)                                  as qtd_consumida,
         sum(ni.quantidade * coalesce(ni.valor_unitario, 0)) as valor_consumido
  from public.nf_itens ni
  join public.notas_fiscais nf on nf.id = ni.nf_id and nf.deleted_at is null
  where ni.empenho_id is not null
  group by ni.empenho_id, ni.item_id
) c on c.empenho_id = e.id and c.item_id = ei.item_id
where e.deleted_at is null;

-- Serie de consumo por item por empenho, datada pela ENTREGA da NF, com a
-- semana (segunda-feira) e o mes ja calculados para a tela alternar a
-- granularidade sem duplicar linhas.
create or replace view public.vw_empenho_item_consumo
with (security_invoker = on) as
select
  ni.empenho_id,
  e.numero          as empenho,
  ni.item_id,
  i.codigo_catmat,
  i.descricao,
  i.unidade,
  i.grupo_id,
  nf.id             as nf_id,
  nf.numero         as nf_numero,
  nf.data_entrega,
  (date_trunc('week', nf.data_entrega))::date as semana,
  to_char(nf.data_entrega, 'YYYY-MM')         as mes,
  sum(ni.quantidade)::numeric(14,4)                                  as quantidade,
  sum(ni.quantidade * coalesce(ni.valor_unitario, 0))::numeric(14,2) as valor
from public.nf_itens ni
join public.notas_fiscais nf on nf.id = ni.nf_id and nf.deleted_at is null
join public.empenhos e       on e.id = ni.empenho_id and e.deleted_at is null
join public.itens i          on i.id = ni.item_id
where ni.empenho_id is not null
group by ni.empenho_id, e.numero, ni.item_id, i.codigo_catmat, i.descricao,
         i.unidade, i.grupo_id, nf.id, nf.numero, nf.data_entrega;


-- =====================================================================
-- 30. Valor do item do recibo pelo preco VIGENTE NA DATA do recibo
-- =====================================================================
-- Antes o recibo exibia sempre o preco atual do catalogo: ao registrar um
-- apostilamento, os recibos antigos passavam a mostrar o preco novo. Aqui o
-- preco e resolvido pela data do recibo, na ordem:
--   1) ultimo preco de itens_precos com vigencia <= data do recibo;
--   2) se o recibo e anterior a qualquer reajuste registrado, o preco mais
--      antigo do historico (o de antes do reajuste);
--   3) sem historico nenhum, o preco atual do catalogo.
create or replace view public.vw_recibo_item_valor
with (security_invoker = on) as
select
  ri.id            as recibo_item_id,
  ri.recibo_id,
  ri.item_id,
  ri.quantidade,
  coalesce(ri.unidade, i.unidade) as unidade,
  i.descricao,
  i.codigo_catmat,
  r.data_recebimento,
  coalesce(
    (select p.preco_unitario from public.itens_precos p
      where p.item_id = ri.item_id and p.vigencia_inicio <= r.data_recebimento
      order by p.vigencia_inicio desc limit 1),
    (select p.preco_unitario from public.itens_precos p
      where p.item_id = ri.item_id
      order by p.vigencia_inicio asc limit 1),
    i.preco_unitario
  )::numeric(14,4) as preco_unitario
from public.recibos_itens ri
join public.recibos r on r.id = ri.recibo_id
join public.itens i   on i.id = ri.item_id;

-- Backfill do preco ORIGINAL: itens que ainda nao tem historico recebem o preco
-- atual do catalogo datado no inicio da vigencia da ata. Sem isto, ao registrar
-- o primeiro apostilamento os recibos ANTERIORES ao reajuste passariam a exibir
-- o preco novo (nao haveria preco antigo a que recorrer). Idempotente: so insere
-- para item sem nenhum registro em itens_precos, entao deve rodar ANTES de
-- lancar novos apostilamentos.
insert into public.itens_precos (item_id, preco_unitario, vigencia_inicio, referencia)
select
  i.id,
  i.preco_unitario,
  coalesce(g.vigencia_inicio, date '2025-01-01'),
  'Preco original da ata (registro inicial)'
from public.itens i
join public.grupos g on g.id = i.grupo_id
where coalesce(i.preco_unitario, 0) > 0
  and not exists (select 1 from public.itens_precos p where p.item_id = i.id)
on conflict (item_id, vigencia_inicio) do nothing;


-- =====================================================================
-- 31. Atas: controle de saldo por item e empenhos vinculados
-- =====================================================================
-- Uma ata pode cobrir mais de um grupo, entao tudo e agrupado por
-- grupos.numero_ata. "Consumido" segue a mesma regra de vw_item_consumo
-- (o maior entre o recebido nos recibos e o faturado nas NFs), para os
-- numeros baterem com o Dashboard e a Estimativa.

create or replace view public.vw_ata_resumo
with (security_invoker = on) as
select
  coalesce(nullif(trim(g.numero_ata), ''), 'Sem ata cadastrada') as ata,
  count(distinct g.id)                                            as qtd_grupos,
  string_agg(distinct g.numero_romano, ', ')                      as grupos,
  string_agg(distinct f.codigo, ', ')                             as fornecedores,
  string_agg(distinct g.numero_pregao, ', ')                      as pregoes,
  string_agg(distinct g.numero_tc, ', ')                          as contratos,
  min(g.vigencia_inicio)                                          as vigencia_inicio,
  max(g.vigencia_fim)                                             as vigencia_fim,
  bool_or(g.status = 'vigente')                                   as tem_grupo_vigente
from public.grupos g
left join public.fornecedores f on f.id = g.fornecedor_id
group by 1;

create or replace view public.vw_ata_empenho
with (security_invoker = on) as
select distinct
  coalesce(nullif(trim(g.numero_ata), ''), 'Sem ata cadastrada') as ata,
  e.id            as empenho_id,
  e.numero,
  e.data_emissao,
  e.status,
  e.valor_inicial,
  e.reforco,
  e.cancelamento,
  e.anulacao,
  (e.valor_inicial + e.reforco - e.cancelamento - e.anulacao)::numeric(14,2) as valor_liquido,
  coalesce(d.debitado, 0)::numeric(14,2)                                     as utilizado,
  (e.valor_inicial + e.reforco - e.cancelamento - e.anulacao
     - coalesce(d.debitado, 0))::numeric(14,2)                               as saldo
from public.empenhos e
join public.empenhos_grupos eg on eg.empenho_id = e.id
join public.grupos g           on g.id = eg.grupo_id
left join (
  select ne.empenho_id, sum(ne.valor_debitado) as debitado
  from public.nf_empenhos ne
  join public.notas_fiscais nf on nf.id = ne.nf_id and nf.deleted_at is null
  group by ne.empenho_id
) d on d.empenho_id = e.id
where e.deleted_at is null;

create or replace view public.vw_ata_item
with (security_invoker = on) as
select
  coalesce(nullif(trim(g.numero_ata), ''), 'Sem ata cadastrada') as ata,
  i.id            as item_id,
  i.descricao,
  i.codigo_catmat,
  i.unidade,
  i.status        as item_status,
  i.grupo_id,
  g.numero_romano as grupo,
  i.preco_unitario,
  i.quantidade_ata::numeric(14,3)        as quantidade_ata,
  coalesce(emp.qtd, 0)::numeric(14,4)    as qtd_empenhada,
  greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0))::numeric(14,4) as qtd_consumida,
  (i.quantidade_ata
     - greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0)))::numeric(14,4) as saldo_ata,
  (i.quantidade_ata - coalesce(emp.qtd, 0))::numeric(14,4)                as a_empenhar,
  (coalesce(emp.qtd, 0)
     - greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0)))::numeric(14,4) as saldo_empenhado,
  case when i.quantidade_ata > 0 then
    round(100 * greatest(coalesce(rf.qtd, 0), coalesce(nfq.qtd, 0)) / i.quantidade_ata, 1)
  end as pct_consumido
from public.itens i
join public.grupos g on g.id = i.grupo_id
left join (
  select ei.item_id, sum(ei.quantidade) as qtd
  from public.empenhos_itens ei
  join public.empenhos e on e.id = ei.empenho_id
  where e.deleted_at is null and e.status not in ('cancelado','anulado')
  group by ei.item_id
) emp on emp.item_id = i.id
left join (
  select ri.item_id, sum(ri.quantidade) as qtd
  from public.recibos_itens ri
  join public.recibos r on r.id = ri.recibo_id
  where r.status <> 'cancelado' and r.deleted_at is null
  group by ri.item_id
) rf on rf.item_id = i.id
left join (
  select ni.item_id, sum(ni.quantidade) as qtd
  from public.nf_itens ni
  join public.notas_fiscais nf on nf.id = ni.nf_id and nf.deleted_at is null
  group by ni.item_id
) nfq on nfq.item_id = i.id;
