// Camada de acesso ao Supabase SEM dependências npm — usa o fetch global do Node
// (18+) contra o Auth e o PostgREST. As queries levam o JWT do usuário, então a
// RLS do banco continua sendo a autoridade (a API não usa service_role).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function bearer(request) {
  const h =
    request.headers.get("authorization") ||
    request.headers.get("Authorization") ||
    "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

// Valida o token no Supabase Auth e devolve o usuário (ou null).
async function getUser(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Chamada ao PostgREST sob a RLS do usuário. `query` = caminho + querystring
// (ex.: "recibos?select=*&status=eq.pendente"). opts: { method, body, count, prefer }.
async function rest(token, query, opts = {}) {
  const method = opts.method || "GET";
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const prefers = [];
  if (opts.count) prefers.push("count=exact");
  if (opts.prefer) prefers.push(opts.prefer);
  if (prefers.length) headers["Prefer"] = prefers.join(",");
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  let count = null;
  const cr = res.headers.get("content-range"); // ex.: "0-24/812" ou "*/812"
  if (cr && cr.indexOf("/") !== -1) {
    const total = cr.split("/")[1];
    count = total === "*" ? null : parseInt(total, 10);
  }
  const error = res.ok ? null : (data && (data.message || data.error)) || `HTTP ${res.status}`;
  return { ok: res.ok, status: res.status, data, count, error };
}

module.exports = { bearer, getUser, rest, SUPABASE_URL, SUPABASE_ANON_KEY };
