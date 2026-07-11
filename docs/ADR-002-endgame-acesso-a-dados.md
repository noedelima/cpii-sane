# ADR-002 — Endgame do acesso a dados (camada de API): opções e recomendação

**Status:** proposto (aguarda decisão) · **Data:** 2026-07 · **Decisor:** Noé (eng. responsável)

## Contexto

Arquitetura atual (ver `ADR-001` e `API-CAMADA.md`): a SPA fala com o Supabase
pelo `supabase-js`; com `VITE_USE_API=1` (produção no Azure SWA), as chamadas
REST/PostgREST são roteadas para `/api/rest/*` (proxy universal) e há alguns
endpoints dedicados (`/api/dashboard`, `/api/recibos`, `/api/notas-fiscais`,
`/api/empenhos`, `/api/grupos`). **Em todos os casos, a API encaminha o JWT do
próprio usuário ao PostgREST** (com a anon key). Não há `service_role`; a API é
"zero dependências" (usa só `fetch`). A **RLS é a autoridade** — a segurança do
banco vale igual pelo navegador ou pela API.

O "endgame" previsto no `ADR-001` (passos 4–5) é tornar a API o **caminho único**
ao banco: revogar os grants do PostgREST por tabela (travando o acesso direto do
navegador), com a API acessando o banco por **`pg` direto (pooler Supavisor)** ou
por **`service_role`**.

## Constatação que motiva este ADR

Sob o desenho atual, **revogar os grants não agrega segurança**: como a API usa o
mesmo papel `authenticated` que o navegador, a RLS já protege os dois caminhos de
forma idêntica. O valor real do endgame é **outro**, e só existe se houver um
destes drivers concretos:

1. **Regra de negócio no servidor** (lógica que não pode viver no cliente);
2. **Observabilidade/auditoria central** (log de acesso por endpoint);
3. **Ocultar o schema** do cliente (contrato de API estável, desacoplado das
   tabelas).

Sem ao menos um desses, o endgame é **risco sem retorno**.

## Forças e restrições

- **Custo zero permanente**; **free tier** do Supabase → **não há branch de
  preview** para testar isolado (o teste seria em produção).
- **RLS como fonte única de verdade** tem sido a escolha de segurança (menor
  superfície de erro).
- A API **"zero deps"** foi decisão consciente para **evitar bundling** de pacotes
  nas managed functions do SWA.
- Produção é um **sistema financeiro ao vivo** (SANE) — não pode sair do ar; há
  **LGPD** (dados pessoais em perfis/assinaturas).

## Opções para o caminho de dados da API

### Opção A — `service_role` nas Functions + autorização no código
As Functions usam a `service_role` key (secret no SWA) e acessam o banco
**ignorando a RLS**; cada endpoint reimplementa a autorização (usuário, papel,
campus, o que pode ler/escrever).
- **Prós:** caminho único; permite regra de negócio e ocultar schema; dispensa `pg`.
- **Contras:** **abandona a RLS como autoridade** → toda a segurança passa a
  depender do código; um endpoint que esqueça um check **vaza dado** (financeiro/
  PII); superfície de ataque grande e difícil de auditar; exige reescrever a
  autorização de **todos** os endpoints e do proxy. Risco alto para time pequeno.

### Opção B — `pg` direto via pooler (Supavisor) nas Functions
As Functions abrem conexão `pg` (porta 5432, pooler IPv4) com um papel de banco
dedicado; SQL por endpoint (a RLS pode ser mantida via `set request.jwt.claims`/
`set role`, ou reimplementada em SQL).
- **Prós:** caminho único; controle fino; observabilidade.
- **Contras:** **reintroduz a dependência `pg`** nas managed functions (o problema
  de bundling que se evitou de propósito); gestão de conexões em ambiente
  serverless (cold start, limites do free); segredo de banco no SWA; mais peças
  móveis. Também exige reescrever endpoints.

### Opção C (recomendada) — manter a RLS como autoridade; endpoints dedicados sob demanda
Seguir com o proxy universal + endpoints dedicados **sob a RLS** (sem
`service_role`, sem `pg`). Criar endpoints específicos **apenas quando** um caso
pedir regra de negócio/observabilidade/estabilidade de contrato; esses endpoints
reaproveitam o `db()` atual (PostgREST com o token do usuário) e podem, pontual-
mente, agregar validação/observabilidade **por cima**, sem abrir mão da RLS. Os
grants **não** são revogados.
- **Prós:** risco baixo; nada quebra; preserva a RLS como fonte única; sem
  bundling; **os endpoints construídos aqui são reaproveitáveis** (não viram
  trabalho jogado fora). Atende ao objetivo do item #2 sem o risco do #3.
- **Contras:** não cria caminho **exclusivo** nem oculta o schema — o que só
  importa se um driver real aparecer.

## Decisão proposta

Adotar a **Opção C** como padrão. Só migrar para A ou B (endgame destrutivo)
**se e quando** surgir um driver concreto (regra server-side, observabilidade
central, ou requisito de ocultar schema) — e, mesmo assim, de forma **faseada**,
tabela a tabela, atrás de flag, com **rollback instantâneo** (re-grant).

**Onde entram os endpoints dedicados (#2):** sob a Opção C são construídos no
padrão atual (JWT do usuário → PostgREST via `db()`), portanto **reaproveitáveis**;
sob A/B seriam reescritos. Por isso **não** os construímos "no vácuo" antes de
decidir o caminho — evita trabalho dobrado.

## Plano de cutover (caso A ou B seja escolhido no futuro)

1. Introduzir o novo caminho (service_role **ou** `pg`) numa fatia de baixo risco,
   **atrás de flag**, sem revogar nada.
2. Migrar o **proxy universal** para o novo caminho — **pré-requisito**, pois ele
   usa o papel `authenticated` (é o que torna a revogação tudo-ou-nada hoje).
3. Endpoint por endpoint, validar em produção com a flag ligada.
4. Só então **revogar o grant** da tabela no PostgREST (trava o navegador).
5. Decidir se o Storage entra no mesmo caminho.

**Rollback:** re-grant reverte a trava; flip da flag reverte o roteamento; **o
banco nunca se move**. RLS permanece ligada o tempo todo (defesa em profundidade).

## Consequências

- **Curto prazo:** o proxy de storage (#1) já foi implementado **atrás de flag**
  (`VITE_PROXY_STORAGE`, off por padrão) — nada destrutivo em produção. A RLS
  segue como autoridade.
- Endpoints dedicados adicionais entram **sob demanda**, no padrão atual.
- O **endgame destrutivo** fica condicionado a um driver concreto e a um cutover
  faseado — não é executado agora.
