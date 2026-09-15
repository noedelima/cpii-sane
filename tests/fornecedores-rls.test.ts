import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("migração libera INSERT para sane/admin, mantém demais perfis bloqueados e DELETE só admin", async () => {
  const db = new PGlite();
  try {
    const schema = readFileSync("supabase/schema.sql", "utf8");
    // Usa a tabela e as policies reais. Apenas a identidade Supabase é simulada.
    const tabela = schema.match(/create table if not exists public\.fornecedores \([\s\S]*?\n\);/)![0];
    const policies = schema.match(/do \$pol\$[\s\S]*?end \$pol\$;/)![0];
    const nomes = [...new Set([...policies.matchAll(/'([a-z_]+)'/g)].map(m => m[1]))]
      .filter(n => !["sane", "admin", "campus", "outros", "fornecedores"].includes(n));
    await db.exec(`create role authenticated; ${tabela}
      create function public.current_papel() returns text language sql stable as
      $$ select current_setting('test.papel', true) $$;`);
    for (const nome of nomes) await db.exec(`create table if not exists public.${nome} (id int);`);
    await db.exec(policies);
    await db.exec(`alter table fornecedores enable row level security;
      grant usage on schema public to authenticated;
      grant all on fornecedores to authenticated;
      grant usage, select on sequence fornecedores_id_seq to authenticated;`);
    await db.exec("set role authenticated; set test.papel = 'sane';");
    await expect(db.query("insert into fornecedores (codigo,razao_social) values ('antes','Antes')")).rejects.toThrow();
    await db.exec("reset role;");
    const migration = readFileSync("supabase/migrations/20260915_fornecedores_sane.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration); // reaplicação idempotente
    await db.exec("set role authenticated;");
    for (const papel of ["sane", "admin", "campus", "outros"]) {
      await db.exec(`set test.papel = '${papel}';`);
      const insert = db.query("insert into fornecedores(codigo,razao_social) values ($1,$1) returning id", [papel]);
      if (["sane", "admin"].includes(papel)) expect((await insert).rows).toHaveLength(1);
      else await expect(insert).rejects.toThrow();
    }
    await db.exec("set test.papel = 'sane';");
    expect((await db.query("delete from fornecedores returning id")).rows).toHaveLength(0);
    await db.exec("set test.papel = 'admin';");
    expect((await db.query("delete from fornecedores returning id")).rows).toHaveLength(2);
  } finally {
    await db.close();
  }
}, 30000);
