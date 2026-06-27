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

## Setup do Supabase

1. Crie um projeto em https://supabase.com/dashboard
2. Em **Project Settings > API** copie `Project URL` e `anon public` key
3. Em **SQL Editor**, rode na ordem:
   - `supabase/schema.sql` (tabelas, índices, triggers, RLS por papel, views e função FIFO)
   - `supabase/seed.sql` (popula campi, fornecedores e grupos)
   - `supabase/storage.sql` (buckets de PDFs e policies)

   Alternativa via CLI (requer `SUPABASE_DB_HOST`/`SUPABASE_DB_PASSWORD` no `.env.local`):
   `node supabase/apply.mjs`

### Scripts de manutenção (`supabase/`)

- `apply.mjs` — aplica schema + seed + storage (idempotente)
- `run-sql.mjs` — executa arquivos .sql ou `--query "..."` ad hoc
- `import.mjs` — importa o Excel mestre legado (`--dry-run` / `--force`)
- `db.mjs` — conexão compartilhada (fallback automático para pooler IPv4)

### Papéis de acesso

| Papel | Permissões |
| --- | --- |
| `admin` | tudo: usuários, cadastros básicos, exclusões |
| `sane` | itens, empenhos, notas fiscais e rateios |
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
│   ├── lib/supabase.ts        # client Supabase
│   ├── stores/auth.ts         # Pinia store de autenticação
│   ├── router/                # rotas
│   ├── views/                 # telas (Home, Login, Recibos, ReciboForm)
│   ├── components/            # componentes reutilizáveis
│   ├── types/database.ts      # tipos TypeScript do schema
│   └── App.vue
├── supabase/
│   ├── schema.sql             # DDL do banco
│   └── seed.sql               # dados iniciais
└── .github/workflows/deploy.yml
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

E uma tabela auxiliar:

- **perfis** — papel do usuário (campus/sane/admin) e campus vinculado

## Licença

MIT
