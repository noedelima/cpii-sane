// Conexao Postgres compartilhada pelos scripts de manutencao (run-sql, import).
// Le credenciais de .env.local. O host direto db.<ref>.supabase.co e IPv6-only;
// em redes sem IPv6 (ex.: WSL) caimos para o pooler Supavisor (IPv4, porta 5432).
import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import tls from "node:tls";
import pg from "pg";

export function loadEnv() {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

export async function connect() {
  const env = loadEnv();
  const host = env.SUPABASE_DB_HOST;
  const password = env.SUPABASE_DB_PASSWORD;
  const ref = env.SUPABASE_PROJECT_REF;
  if (!host || !password) {
    throw new Error("Faltam SUPABASE_DB_HOST ou SUPABASE_DB_PASSWORD em .env.local");
  }

  const mk = (h, u) => ({
    host: h,
    port: Number(env.SUPABASE_DB_PORT || 5432),
    user: u,
    password,
    database: "postgres",
    // ssl sem verificacao de CA: aceitavel para script de manutencao local.
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    connectionTimeoutMillis: 15000,
  });

  const poolerUser = ref ? "postgres." + ref : "postgres";
  const candidates = [
    mk(host, host.includes("pooler") ? poolerUser : "postgres"),
    mk(env.SUPABASE_DB_HOST_POOLER || "aws-0-us-east-2.pooler.supabase.com", poolerUser),
    mk("aws-1-us-east-2.pooler.supabase.com", poolerUser),
  ];

  let lastErr;
  for (const cfg of candidates) {
    const c = new pg.Client(cfg);
    try {
      await c.connect();
      console.log("conectado via " + cfg.host);
      return c;
    } catch (e) {
      lastErr = e;
      console.error("falhou " + cfg.host + ": " + (e.code || e.message));
      try { await c.end(); } catch { /* ignore */ }
    }
  }
  throw lastErr;
}

// Fallback HTTPS: Management API (porta 443), para redes que bloqueiam 5432.
// Requer SUPABASE_PAT e SUPABASE_PROJECT_REF em .env.local.
export function hasApi() {
  const env = loadEnv();
  return Boolean(env.SUPABASE_PAT && env.SUPABASE_PROJECT_REF);
}

// Em rede com inspecao TLS (FortiGate/CP2-AD-CA), a cadeia do proxy nao fecha
// no trust store do Node (raiz corporativa ausente). Estrategia: certificate
// pinning — tmp/proxy-ca-pins.json (gerado por tmp/extract-ca.mjs) guarda os
// fingerprints sha256 da cadeia do proxy; a requisicao so e enviada (incluindo
// o token) depois que algum fingerprint da cadeia apresentada confere.
function loadPins() {
  try {
    if (existsSync("tmp/proxy-ca-pins.json")) {
      return JSON.parse(readFileSync("tmp/proxy-ca-pins.json", "utf8"));
    }
  } catch { /* sem pins */ }
  return null;
}

function chainMatchesPins(socket, pins) {
  let c = socket.getPeerCertificate(true);
  const seen = new Set();
  while (c && c.fingerprint256 && !seen.has(c.fingerprint256)) {
    seen.add(c.fingerprint256);
    if (pins.includes(c.fingerprint256)) return true;
    if (c.issuerCertificate === c) break;
    c = c.issuerCertificate;
  }
  return false;
}

function decodeChunked(text) {
  let out = "";
  let rest = text;
  for (;;) {
    const j = rest.indexOf("\r\n");
    if (j < 0) break;
    const size = parseInt(rest.slice(0, j), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    out += rest.slice(j + 2, j + 2 + size);
    rest = rest.slice(j + 2 + size + 2);
  }
  return out;
}

// HTTP/1.1 minimo sobre tls.connect: os headers (com o token) so sao escritos
// apos a validacao do pin, entao nada vaza se a cadeia nao conferir.
function pinnedRequest(url, { method, headers, body }, pins) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const socket = tls.connect(
      { host: u.hostname, port: 443, servername: u.hostname, rejectUnauthorized: false },
      () => {
        if (!chainMatchesPins(socket, pins)) {
          socket.destroy();
          reject(new Error(
            "Pin TLS nao confere para " + u.hostname +
            " — cadeia diferente do proxy institucional conhecido. Regere com node tmp/extract-ca.mjs se o proxy mudou."
          ));
          return;
        }
        const payload = body || "";
        const lines = [
          method + " " + u.pathname + u.search + " HTTP/1.1",
          "Host: " + u.hostname,
          "Connection: close",
          "Content-Length: " + Buffer.byteLength(payload),
        ];
        for (const [k, v] of Object.entries(headers || {})) lines.push(k + ": " + v);
        socket.write(lines.join("\r\n") + "\r\n\r\n" + payload);
      }
    );
    const parts = [];
    socket.on("data", (d) => parts.push(d));
    socket.on("error", reject);
    socket.on("close", () => {
      const s = Buffer.concat(parts).toString("utf8");
      const i = s.indexOf("\r\n\r\n");
      if (i < 0) return reject(new Error("Resposta HTTP invalida do proxy."));
      const head = s.slice(0, i);
      let text = s.slice(i + 4);
      const status = Number((head.match(/^HTTP\/1\.[01] (\d{3})/) || [])[1] || 0);
      if (/transfer-encoding:\s*chunked/i.test(head)) text = decodeChunked(text);
      resolve({ status, text });
    });
  });
}

function httpsJson(url, opts) {
  const pins = loadPins();
  if (pins && pins.length) return pinnedRequest(url, opts, pins);
  // rede sem inspecao TLS: https padrao com verificacao normal
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: opts.method, headers: opts.headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, text: data }));
      }
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export async function queryViaApi(sql) {
  const env = loadEnv();
  const ref = env.SUPABASE_PROJECT_REF;
  const pat = env.SUPABASE_PAT;
  if (!ref || !pat) {
    throw new Error("SUPABASE_PAT/SUPABASE_PROJECT_REF ausentes em .env.local");
  }
  const { status, text } = await httpsJson(
    "https://api.supabase.com/v1/projects/" + ref + "/database/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + pat,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (status < 200 || status >= 300) {
    throw new Error("Management API HTTP " + status + ": " + String(text).slice(0, 500));
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
