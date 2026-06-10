// Executa arquivos .sql (ou uma query ad hoc) no Postgres do Supabase
// via conexao direta (driver pg), lendo credenciais de .env.local.
// Alternativa ao apply.mjs quando o SUPABASE_PAT estiver expirado.
//
// Uso:
//   node supabase/run-sql.mjs supabase/schema.sql supabase/seed.sql
//   node supabase/run-sql.mjs --query "select count(*) from public.campi"
import { readFileSync } from "node:fs";
import { connect } from "./db.mjs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Informe arquivos .sql ou --query "..."');
  process.exit(1);
}

const client = await connect();
try {
  if (args[0] === "--query") {
    const r = await client.query(args.slice(1).join(" "));
    const rows = Array.isArray(r) ? r.flatMap((x) => x.rows) : r.rows;
    console.log(JSON.stringify(rows, null, 2));
  } else {
    for (const file of args) {
      const sql = readFileSync(file, "utf8");
      console.log("-- " + file + " (" + sql.length + " bytes)");
      await client.query(sql);
      console.log("OK");
    }
  }
} finally {
  await client.end();
}
