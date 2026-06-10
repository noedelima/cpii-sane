// Conexao Postgres compartilhada pelos scripts de manutencao (run-sql, import).
// Le credenciais de .env.local. O host direto db.<ref>.supabase.co e IPv6-only;
// em redes sem IPv6 (ex.: WSL) caimos para o pooler Supavisor (IPv4, porta 5432).
import { readFileSync } from "node:fs";
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
