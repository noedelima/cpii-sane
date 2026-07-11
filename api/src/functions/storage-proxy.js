const { app } = require("@azure/functions");
const { bearer } = require("../shared/supa");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Headers da requisicao repassados ao Storage (upload/representacao/cache).
const FWD_REQ = ["content-type", "cache-control", "x-upsert", "accept", "content-disposition"];
// Headers da resposta devolvidos ao cliente.
const FWD_RES = ["content-type", "cache-control", "content-disposition", "etag", "last-modified"];

// Proxy transparente do Supabase Storage sob as policies do usuario. O supabase-js
// e roteado para ca (ver src/lib/supabase.ts) quando VITE_USE_API=1 E
// VITE_PROXY_STORAGE=1 (flag off por padrao). Passa binario nos dois sentidos
// (upload/download). NAO revalida o JWT (o Storage ja verifica). O download por
// URL assinada e anonimo e continua indo direto ao Supabase (nao passa por aqui).
app.http("storage-proxy", {
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  authLevel: "anonymous",
  route: "storage/{*path}",
  handler: async (request, context) => {
    try {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return { status: 500, jsonBody: { error: "API sem SUPABASE_URL/ANON_KEY." } };
      }
      const token = bearer(request);
      if (!token) return { status: 401, jsonBody: { error: "Autenticacao necessaria." } };

      const path = request.params.path || "";
      const qidx = request.url.indexOf("?");
      const query = qidx !== -1 ? request.url.slice(qidx) : "";
      const target = `${SUPABASE_URL}/storage/v1/${path}${query}`;

      const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
      for (const h of FWD_REQ) {
        const v = request.headers.get(h);
        if (v) headers[h] = v;
      }

      // corpo binario apenas nos metodos que o levam (upload/atualizacao)
      const init = { method: request.method, headers };
      if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
        const buf = Buffer.from(await request.arrayBuffer());
        if (buf.length) init.body = buf;
      }

      const res = await fetch(target, init);

      const outHeaders = {};
      for (const h of FWD_RES) {
        const v = res.headers.get(h);
        if (v) outHeaders[h] = v;
      }

      // resposta binaria (download) ou JSON (sign/list/upload) — devolvida como bytes
      const body = Buffer.from(await res.arrayBuffer());
      const out = { status: res.status, headers: outHeaders };
      if (body.length) out.body = body;
      return out;
    } catch (e) {
      context.error("storage-proxy erro:", e);
      return { status: 502, jsonBody: { error: "Storage proxy: " + ((e && e.message) || "falha ao encaminhar") } };
    }
  },
});
