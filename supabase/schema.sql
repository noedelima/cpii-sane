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
  processo_sei    text,
  link_pdf        text,
  status          text not null default 'ativo' check (status in ('ativo','esgotado','cancelado','anulado')),
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.empenhos_grupos (
  id            bigserial primary key,
  empenho_id    bigint not null references public.empenhos(id) on delete cascade,
  grupo_id      bigint not null references public.grupos(id) on delete restrict,
  valor_alocado numeric(14,2) not null default 0,
  percentual    numeric(6,3),
  observacoes   text,
  unique (empenho_id, grupo_id)
);

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

-- =========================================================
-- 5) Perfis (relaciona auth.users a um papel + campus)
-- =========================================================

create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  papel       text not null default 'campus' check (papel in ('campus','sane','admin')),
  campus_id   bigint references public.campi(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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
alter table public.empenhos       enable row level security;
alter table public.empenhos_grupos enable row level security;
alter table public.recibos        enable row level security;
alter table public.recibos_itens  enable row level security;
alter table public.notas_fiscais  enable row level security;
alter table public.nf_itens       enable row level security;
alter table public.perfis         enable row level security;

-- MVP: todo usuário autenticado pode ler e inserir. Refinaremos depois.
do $$
declare t text;
begin
  for t in select unnest(array[
    'campi','fornecedores','grupos','itens','empenhos','empenhos_grupos',
    'recibos','recibos_itens','notas_fiscais','nf_itens','perfis'
  ]) loop
    execute format('drop policy if exists p_%s_select on public.%s', t, t);
    execute format('drop policy if exists p_%s_insert on public.%s', t, t);
    execute format('drop policy if exists p_%s_update on public.%s', t, t);
    execute format(
      'create policy p_%s_select on public.%s for select using (auth.role() = ''authenticated'')',
      t, t
    );
    execute format(
      'create policy p_%s_insert on public.%s for insert with check (auth.role() = ''authenticated'')',
      t, t
    );
    execute format(
      'create policy p_%s_update on public.%s for update using (auth.role() = ''authenticated'')',
      t, t
    );
  end loop;
end $$;
