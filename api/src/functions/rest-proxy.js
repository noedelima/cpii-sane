const { app } = require("@azure/functions");
const { bearer } = require("../shared/supa");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Headers da requisição repassados ao PostgREST (filtros/representação/paginação).
const FWD_REQ = ["prefer", "range", "content-type", "accept", "accept-profile", "content-profile"];
// Headers da resposta devolvidos ao cliente (contagem/representação).
const FWD_RES = ["content-range", "content-type", "content-location", "content-profile"];

// Proxy transparente do PostgREST sob a RLS do usuário. O supabase-js do front é
// roteado para cá (ver src/lib/supabase.ts) quando VITE_USE_API=1. NÃO revalida o
// JWT (o próprio PostgREST verifica assinatura + RLS) — evita round-trip extra.
app.http("rest-proxy", {
  methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "rest/{*path}",
  handler: async (request) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { status: 500, jsonBody: { error: "API sem SUPABASE_URL/ANON_KEY." } };
    }
    const token = bearer(request);
    if (!token) return { status: 401, jsonBody: { error: "Autenticação necessária." } };

    const path = request.params.path || "";
    const qidx = request.url.indexOf("?");
    const query = qidx !== -1 ? request.url.slice(qidx) : "";
    const target = `${SUPABASE_URL}/rest/v1/${path}${query}`;

    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
    for (const h of FWD_REQ) {
      const v = request.headers.get(h);
      if (v) headers[h] = v;
    }

    let body;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }

    const res = await fetch(target, { method: request.method, headers, body });
    const text = await res.text();

    const outHeaders = {};
    for (const h of FWD_RES) {
      const v = res.headers.get(h);
      if (v) outHeaders[h] = v;
    }
    if (!outHeaders["content-type"]) outHeaders["content-type"] = "application/json";

    return { status: res.status, headers: outHeaders, body: text };
  },
});
