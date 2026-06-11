// Executa arquivos .sql (ou uma query ad hoc) no Postgres do Supabase.
// 1) tenta conexao direta (pg, porta 5432 com fallback de pooler IPv4);
// 2) se a rede bloquear 5432, cai para a Management API (HTTPS 443),
//    desde que SUPABASE_PAT esteja em .env.local.
//
// Uso:
//   node supabase/run-sql.mjs supabase/schema.sql supabase/seed.sql
//   node supabase/run-sql.mjs --query "select count(*) from public.campi"
import { readFileSync } from "node:fs";
import { connect, hasApi, queryViaApi } from "./db.mjs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Informe arquivos .sql ou --query "..."');
  process.exit(1);
}

let client = null;
try {
  client = await connect();
} catch (e) {
  console.error("conexao direta indisponivel: " + (e.code || e.message));
  if (!hasApi()) {
    console.error("Sem SUPABASE_PAT para o fallback HTTPS. Abortando.");
    process.exit(1);
  }
  console.log("usando Management API (HTTPS 443)...");
}

try {
  if (args[0] === "--query") {
    const sql = args.slice(1).join(" ");
    if (client) {
      const r = await client.query(sql);
      const rows = Array.isArray(r) ? r.flatMap((x) => x.rows) : r.rows;
      console.log(JSON.stringify(rows, null, 2));
    } else {
      const rows = await queryViaApi(sql);
      console.log(JSON.stringify(rows, null, 2));
    }
  } else {
    for (const file of args) {
      const sql = readFileSync(file, "utf8");
      console.log("-- " + file + " (" + sql.length + " bytes)");
      if (client) await client.query(sql);
      else await queryViaApi(sql);
      console.log("OK");
    }
  }
} finally {
  if (client) await client.end();
}
