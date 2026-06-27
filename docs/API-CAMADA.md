# Camada de API (Azure Functions) — guia e estado

Camada de abstração entre o frontend e o Supabase, servida em `/api/*` pelo
próprio Azure Static Web Apps (plano Free). Implementada de forma incremental
(strangler fig) atrás de uma flag de build — sem afetar a produção (GitHub Pages).

## Arquitetura

```
navegador (sessão Supabase)
  → SWA  /api/*  (Azure Functions, Node 18, ZERO dependências npm)
      → valida o JWT do Supabase (GET /auth/v1/user)
      → consulta o PostgREST COM o token do usuário  → RLS continua mandando
  → JSON → view renderiza
```

- **Sem service_role, sem segredo novo.** As Functions usam só a URL e a anon key
  (públicas), em *app settings* do SWA (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- **RLS é a autoridade.** Como a query vai com o token do usuário, a segurança do
  banco vale igual ao acesso direto. A API não eleva privilégio.
- **Zero dependências** nas Functions (só `@azure/functions`): usam o `fetch`
  global contra o REST/Auth do Supabase. Isso evitou o problema de bundling de
  pacotes nas managed functions.

## ⚠️ Duas pegadinhas (essenciais — não remover sem entender)

1. **O SWA consome o header `Authorization`** para a própria autenticação. Se o
   token do Supabase for enviado em `Authorization: Bearer ...`, a Function recebe
   um token adulterado e o Supabase responde `403 bad_jwt: signature is invalid`.
   **Solução:** o frontend manda o token no header **`x-sb-token`** (ver
   `src/lib/api.ts`), que o SWA repassa intacto; o `bearer()` lê dele primeiro.

2. **`fetch` global exige Node ≥ 18.** As managed functions sobem em Node 16 por
   padrão (onde `fetch` é `undefined` → tudo falha silenciosamente). **Solução:**
   `"platform": { "apiRuntime": "node:18" }` em `public/staticwebapp.config.json`.

Também: `"/api/*"` está no `navigationFallback.exclude` para uma rota de API
inexistente não cair no SPA.

## Flag de estrangulamento

`VITE_USE_API` (build): **ligada só no SWA** (workflow `azure-swa.yml`),
**desligada no GitHub Pages**. Cada view faz:

```ts
if (USE_API) { /* api.xxx() */ } else { /* supabase direto (fallback) */ }
```

Assim a produção (Pages) segue 100% no caminho direto, e o SWA exercita a API.
Para promover a API a produção: migrar o host canônico para o SWA (Fase final do
ADR-001) — aí a flag fica ligada para todos.

## Estrutura

```
api/
├── host.json                  # extension bundle v4
├── package.json               # só @azure/functions (zero deps)
└── src/
    ├── shared/
    │   ├── supa.js            # getUser (valida JWT) + rest (PostgREST sob RLS) + bearer
    │   └── http.js            # json(), withAuth() wrapper, qInt/qStr
    └── functions/
        ├── health.js          # GET /api/health  (sem auth)
        ├── me.js              # GET /api/me       (perfil do logado)
        ├── dashboard.js       # GET /api/dashboard
        ├── recibos.js         # GET /api/recibos?page&busca&campus&grupo&status
        └── notas-fiscais.js   # GET /api/notas-fiscais?page&busca&grupo&status
```

## Endpoints prontos e validados (no SWA, ponta a ponta)

| Endpoint | View | Padrão | Status |
|----------|------|--------|--------|
| `/api/health` | — | diagnóstico | ✅ |
| `/api/me` | — | auth (perfil) | ✅ |
| `/api/dashboard` | DashboardView | agregados (vw_grupo_resumo + contagens) | ✅ validado |
| `/api/recibos` | RecibosView | lista paginada + filtros + relações | ✅ validado |
| `/api/notas-fiscais` | NotasFiscaisView | lista paginada + filtros + relações | ✅ validado |
| `/api/rest/{*path}` | **todas as demais** (via supabase-js) | proxy transparente do PostgREST (reads + writes + RPC) | ✅ validado |

### Proxy universal (`/api/rest/*`)

O `src/lib/supabase.ts` injeta um `fetch` custom que, com a flag ligada, **roteia
toda chamada REST/PostgREST do supabase-js para `/api/rest/*`** (token no
`x-sb-token`). O proxy repassa ao PostgREST com o token do usuário → **RLS é a
autoridade**. Não revalida o JWT (o PostgREST já verifica) — sem round-trip extra.
Resultado: **todas as telas** (e os RPCs: apostilamento, FIFO, merge…) passam pela
API sem precisar de código por tela. Auth e Storage seguem diretos.

## Como adicionar um endpoint de leitura (padrão de lista)

1. **Function** `api/src/functions/<nome>.js`:

```js
const { app } = require("@azure/functions");
const { json, withAuth, qInt, qStr } = require("../shared/http");
const PAGE = 50;
app.http("<nome>", { methods: ["GET"], authLevel: "anonymous", route: "<nome>",
  handler: withAuth(async ({ request, db }) => {
    const page = qInt(request, "page", 0);
    const status = qStr(request, "status");
    let q = "<tabela>?select=*,<relacao>(<col>)&order=<col>.desc&limit=" + PAGE + "&offset=" + page*PAGE;
    if (status) q += `&status=eq.${encodeURIComponent(status)}`;
    const r = await db(q, { count: true });
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [], total: r.count || 0 });
  }),
});
```

2. **Cliente** em `src/lib/api.ts`: adicionar `nome: (params) => request("GET", "/<nome>" + qs(params))`.
3. **View**: trocar o `load()` por `if (USE_API) { api.nome(...) } else { /* supabase direto */ }`.
4. Build, push, validar no SWA (sessão logada).

Mapa PostgREST: `.eq("x", v)`→`x=eq.v` · `.ilike("x","%t%")`→`x=ilike.*t*` ·
`.order("x",{ascending:false})`→`order=x.desc` · `.range(a,b)`→`limit&offset` ·
`{count:"exact"}`→`{ count:true }` (lê o total do header Content-Range) ·
embed `.select("*, rel(col)")`→`select=*,rel(col)`.

## Cobertura: tudo via API

Com o proxy `/api/rest/*`, **todas as telas** (leituras, escritas e RPC) já passam
pela camada de API quando `VITE_USE_API=1` — validado no SWA: Dashboard, Recibos,
NFs, Empenhos, Grupos (reads) e PATCH em recibos (write). Telas de
detalhe/formulário e RPCs roteiam pelo proxy automaticamente.

### Pendências (refinamento — não bloqueia)

- **Storage** (upload de PDFs) ainda fala **direto** com o Supabase (funciona pela
  origem do SWA). Um proxy `/api/storage/*` é opcional.
- **Endpoints dedicados:** trocar chamadas do proxy por endpoints específicos
  (como `/api/dashboard`) onde quiser **desacoplar do schema** ou pôr regra de
  negócio/observabilidade. O proxy é o caminho universal; os específicos são a
  evolução natural.
- **PDFs** seguem efêmeros no navegador (jsPDF).

## Reverter / desligar

Tirar `VITE_USE_API` do workflow do SWA → todas as views voltam ao supabase
direto. Nenhuma migração de dados envolvida.
