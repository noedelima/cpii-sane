// Aplica schema.sql + seed.sql + storage.sql no Supabase via conexao Postgres
// direta (driver pg, com fallback para o pooler IPv4). Nao depende de PAT.
// Uso: node supabase/apply.mjs
import { readFileSync } from "node:fs";
import { connect } from "./db.mjs";

const files = ["supabase/schema.sql", "supabase/seed.sql", "supabase/storage.sql"];

const client = await connect();
try {
  for (const f of files) {
    const sql = readFileSync(f, "utf8");
    console.log("-- " + f + " (" + sql.length + " bytes)");
    await client.query(sql);
    console.log("OK");
  }

  const check =
    "select " +
    "(select count(*) from public.campi) as campi, " +
    "(select count(*) from public.fornecedores) as fornecedores, " +
    "(select count(*) from public.grupos) as grupos, " +
    "(select count(*) from public.itens) as itens, " +
    "(select count(*) from public.empenhos) as empenhos, " +
    "(select count(*) from public.notas_fiscais) as notas_fiscais, " +
    "(select count(*) from public.nf_empenhos) as nf_empenhos, " +
    "(select count(*) from public.recibos) as recibos, " +
    "(select count(*) from public.perfis) as perfis";
  const r = await client.query(check);
  console.log("contagens:", JSON.stringify(r.rows[0]));
} finally {
  await client.end();
}
