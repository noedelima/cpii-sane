# CPII SANE — Controle de Empenhos e Notas Fiscais

Sistema web para registro e acompanhamento de **empenhos, notas fiscais e recibos** de gêneros alimentícios da SANE (Seção de Alimentação e Nutrição) do **Colégio Pedro II**.

## Stack

- **Frontend:** Vue 3 + TypeScript + Vite + Tailwind CSS
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL gerenciado + Auth + Storage)
- **Camada de API:** Azure Functions em `/api/*` (validam o JWT do Supabase e consultam o banco sob a RLS do usuário) — ver `docs/API-CAMADA.md`
- **Hospedagem:** Azure Static Web Apps (produção); o GitHub Pages redireciona para o novo endereço. Deploy automático via GitHub Actions.

## Como rodar localmente

```bash
npm install
cp .env.example .env.local
# Edite .env.local com a URL e anon key do seu projeto Supabase
npm run dev
```

A aplicação inicia em http://localhost:5173.

```bash
npm test          # suíte (vitest)
npm run build     # type-check + build de produção
```

A lógica com regra de negócio não trivial fica isolada em módulos puros, sem Vue
nem Supabase, justamente para ser testada: `src/lib/projecao.ts` (projeção de
reforço) e `src/lib/dias-semana.ts` (dias aceitos no recibo).

## Setup do Supabase

1. Crie um projeto em https://supabase.com/dashboard
2. Em **Project Settings > API** copie `Project URL` e `anon public` key
3. Em **SQL Editor**, rode na ordem:
   - `supabase/schema.sql` (tabelas, índices, triggers, RLS por papel, views e função FIFO)
   - `supabase/seed.sql` (popula campi, fornecedores e grupos)
   - `supabase/storage.sql` (buckets de PDFs e policies)

   Alternativa via CLI (requer `SUPABASE_DB_HOST`/`SUPABASE_DB_PASSWORD` no `.env.local`):
   `node supabase/apply.mjs`

### Migrações incrementais (`supabase/migrations/`)

O `schema.sql` é a DDL completa e canônica. Para uma instalação **que já está em
produção**, cada mudança também vai como arquivo avulso e idempotente em
`supabase/migrations/`, para ser colado no SQL Editor sem rodar schema e seed
inteiros.

> **Atenção:** mudança de código que depende de objeto novo no banco **não
> funciona sozinha** — a migração correspondente precisa ser aplicada. E repare
> que `insert ... on conflict do nothing` **não corrige linha existente**: para
> alterar uma configuração já gravada, a migração precisa trazer um `update`
> explícito.

### Scripts de manutenção (`supabase/`)

- `apply.mjs` — aplica schema + seed + storage (idempotente)
- `run-sql.mjs` — executa arquivos .sql ou `--query "..."` ad hoc
- `import.mjs` — importa o Excel mestre legado (`--dry-run` / `--force`)
- `db.mjs` — conexão compartilhada (fallback automático para pooler IPv4)

### Papéis de acesso

| Papel | Permissões |
| --- | --- |
| `admin` | tudo: usuários, cadastros básicos, exclusões |
| `sane` | fornecedores (cadastro/atualização), grupos, itens, empenhos, notas fiscais e rateios |
| `campus` | recibos do próprio campus (e itens desses recibos) |
| `outros` | somente visualização (padrão de novos usuários) |

Novos usuários entram como `outros`; o admin promove em **Usuários** no app.

## Deploy / Produção

**Produção:** Azure Static Web Apps — `https://lemon-hill-0dc723c0f.7.azurestaticapps.net`
(o antigo GitHub Pages redireciona para lá). Deploy automático no push para `main`:

- `.github/workflows/azure-swa.yml` — builda o app + a API (`/api`) e publica no Azure SWA.
  Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `AZURE_STATIC_WEB_APPS_API_TOKEN`;
  flag `VITE_USE_API=1` (liga a camada de API). App settings do SWA: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- `.github/workflows/deploy.yml` — publica no GitHub Pages apenas um **redirect** para o SWA.

Arquitetura e camada de API: `docs/ADR-001-host-e-backend.md` e `docs/API-CAMADA.md`.

## Estrutura do projeto

```
cpii-sane/
├── src/
│   ├── lib/
│   │   ├── supabase.ts        # client Supabase
│   │   ├── consulta.ts        # buscarTudo(): paginação (teto de 1.000 linhas da API)
│   │   ├── projecao.ts        # projeção de esgotamento e data-limite do reforço
│   │   ├── dias-semana.ts     # dias aceitos na data do pedido do recibo
│   │   ├── config.ts          # configurações globais (cache em memória)
│   │   └── pdf-*.ts           # geradores de PDF (ateste, saldos, lançamento)
│   ├── stores/auth.ts         # Pinia store de autenticação
│   ├── router/                # rotas
│   ├── views/                 # telas (recibos, NFs, empenhos, atas, consumo, ajuda…)
│   ├── components/            # componentes reutilizáveis (PainelReforcos, PdfUpload…)
│   ├── types/database.ts      # tipos TypeScript do schema
│   └── App.vue
├── supabase/
│   ├── schema.sql             # DDL completa e canônica
│   ├── migrations/            # mudanças avulsas para aplicar em produção
│   └── seed.sql               # dados iniciais
├── tests/                     # vitest (regras de negócio e RLS)
├── docs/                      # ADRs e regras de domínio
└── .github/workflows/
```

## Modelo de dados

11 tabelas principais:

- **campi** — os 15 campi do CPII
- **fornecedores** — empresas contratadas
- **grupos** — grupos de fornecimento (I a X)
- **itens** — catálogo da ata (vinculado a um grupo, com CatMat)
- **empenhos** — notas de empenho emitidas
- **empenhos_grupos** — N:N para empenhos compartilhados entre grupos
- **recibos** — recibos enviados pelos campi
- **recibos_itens** — itens de cada recibo
- **notas_fiscais** — NFs emitidas pelos fornecedores
- **nf_itens** — itens de cada NF (quantidades físicas)
- **nf_empenhos** — rateio financeiro N:N entre NF e empenhos (fonte de verdade do débito orçamentário; a função `distribute_nf_fifo` grava aqui)

Tabelas de apoio:

- **perfis** / **perfis_campi** — papel do usuário (campus/sane/admin) e campi vinculados (N:N)
- **itens_precos** — histórico de preços por item (apostilamento), com vigência
- **nf_recibos** / **nf_grupos** — vínculos N:N da NF com recibos e grupos
- **recibos_anexos** — PDFs adicionais do recibo
- **recibos_ocorrencias** — itens não entregues ou devolvidos (não entram nas quantidades recebidas)
- **solicitacoes_nf** (+ `_recibos`, `_itens`) — pedidos de emissão de NF à empresa
- **atestes** / **atestes_nfs** — atestes de recebimento emitidos
- **configuracoes** — parâmetros globais chave/valor editados pelo admin
- **audit_log** — trilha de auditoria preenchida por gatilho

As particularidades de negócio do modelo — e as decisões que parecem bug mas não
são — estão em `docs/DOMINIO-SANE.md`. Vale ler antes de “corrigir” algo aqui.

## Licença

MIT
