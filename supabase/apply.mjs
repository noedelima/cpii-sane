// Aplica schema.sql + seed.sql no Supabase via Management API.
// Uso: node supabase/apply.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const ref = env.SUPABASE_PROJECT_REF;
const pat = env.SUPABASE_PAT;
if (!ref || !pat) {
  console.error("Faltam SUPABASE_PROJECT_REF ou SUPABASE_PAT em .env.local");
  process.exit(1);
}

async function runSql(label, sql) {
  console.log(`\n-- ${label} (${sql.length} bytes) --`);
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const txt = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status}: ${txt.substring(0, 800)}`);
    process.exit(1);
  }
  console.log(`OK (${r.status}). Resposta: ${txt.substring(0, 400)}`);
  return txt;
}

const schema = readFileSync("supabase/schema.sql", "utf8");
await runSql("schema.sql", schema);

const seed = readFileSync("supabase/seed.sql", "utf8");
await runSql("seed.sql", seed);

const check = `select
  (select count(*) from public.campi)        as campi,
  (select count(*) from public.fornecedores) as fornecedores,
  (select count(*) from public.grupos)       as grupos,
  (select count(*) from public.itens)        as itens,
  (select count(*) from public.empenhos)     as empenhos,
  (select count(*) from public.recibos)      as recibos`;
await runSql("contagens", check);
