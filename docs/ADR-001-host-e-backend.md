# ADR-001 — Host do frontend + camada de backend (abstração)

**Status:** aceito · **Data:** 2026-06 · **Decisor:** Noé (eng. responsável)

## Contexto

Hoje: SPA Vue 3 hospedada no **GitHub Pages**, falando **direto** com o Supabase
(Postgres + Auth + Storage) pelo `supabase-js` (PostgREST). Não há camada de
backend entre o navegador e o banco — o frontend está acoplado ao schema.

Objetivos: (1) introduzir uma **camada de abstração de backend** (API), (2)
**unificar** front + API, (3) **custo zero permanente** (sem apoio institucional).

## Decisão

- **Frontend + API no Azure Static Web Apps (plano Free):** hospedagem estática
  do SPA + **Azure Functions gerenciadas** no mesmo domínio (`/api/*`) como a
  camada de API. Grátis para sempre dentro dos limites do Free (~100 GB/mês).
- **Supabase permanece** como **Postgres + Auth + Storage** (grátis para sempre
  dentro dos limites). NÃO migrar o banco para Azure (Postgres/Blob lá só são
  grátis por 12 meses) nem para Azure SQL/Cosmos (exigiria reescrever o
  relacional). NÃO usar a auth embutida do SWA — mantém-se o **Supabase Auth**.
- **Storage dos recibos:** quando a pressão crescer, mover só os PDFs para o
  **Cloudflare R2** (10 GB grátis, egress zero). Adiado até precisar.
- **RLS permanece ligada** como defesa em profundidade durante toda a migração.

### Como a API fala com o Supabase

A Function **valida o JWT do Supabase** (via JWKS do projeto) e então acessa o
banco com a **service_role** (segredo no App Settings do SWA), aplicando a
autorização no código. Endgame opcional: trocar para conexão `pg` direta pelo
**pooler (Supavisor)** e aposentar o PostgREST por tabela.

## Alternativas rejeitadas

- **Unificar tudo na Azure** (Postgres Flexible + Blob): grátis só 12 meses →
  vira custo (~US$ 15+/mês). Reprova no requisito de custo zero permanente.
- **Firebase:** é BaaS (o que se quer evitar) e Firestore exigiria reescrever o
  domínio relacional.
- **Vercel Hobby:** uso não-comercial; sistema institucional → exigiria Pro.
- **Fly.io:** não tem mais free tier para contas novas.
- *(Cloud Run é equivalente ao SWA e também serviria; escolhido o SWA por
  integrar front+API+rota num recurso só.)*

## Plano de migração (strangler fig — produção sempre no ar)

1. **Re-hospedar o SPA atual SEM mudar lógica** no SWA, em paralelo ao GitHub
   Pages. Validar. Virar a URL canônica; manter o Pages como redirect/fallback
   por alguns dias. *(Risco baixo: mesmo app, mesmo Supabase.)*
2. **Subir o esqueleto da API** (`api/` com Azure Functions) + `src/lib/api.ts`
   no front com **flag por chamada**. Migrar uma **fatia de baixo risco**
   primeiro (sugestão: cunhar URL assinada de PDF, ou as solicitações de NF).
3. **Estrangular endpoint por endpoint**, em produção, atrás de flag — cada
   fatia validada e reversível.
4. Quando uma tabela só for acessada pela API, **revogar o grant** dela no
   PostgREST (trava o acesso direto do navegador).
5. *(Opcional, depois)* storage → R2. **Auth fica no Supabase** (mover auth é o
   passo mais disruptivo — adiado ou permanente).

## Divisão de tarefas

- **Assistente (lado código):** workflow do GitHub Actions para o SWA,
  `staticwebapp.config.json`, esqueleto das Functions, cliente `api.ts` + flags,
  ajustes de build.
- **Noé (lado Azure):** criar o recurso Static Web App (Portal ou `az`/`swa`),
  pegar o **deployment token** e cadastrá-lo como **secret** no GitHub; definir
  `SUPABASE_URL`/service_role nos App Settings do SWA.

## Riscos e rollback

Troca de host é reversível (Pages permanece até a virada estar estável). RLS
ligada o tempo todo. Cada fatia atrás de flag, com flip de volta instantâneo. O
**banco nunca se move**. Auth intocada.
