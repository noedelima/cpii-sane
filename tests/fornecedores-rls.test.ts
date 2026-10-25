import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("migrações liberam INSERT e, depois, DELETE para a SANE, mantendo os demais perfis bloqueados", async () => {
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
    // Estado apos a migracao de 09/2025: a SANE cadastra, mas nao exclui.
    await db.exec("set test.papel = 'sane';");
    expect((await db.query("delete from fornecedores returning id")).rows).toHaveLength(0);
    await db.exec("set test.papel = 'admin';");
    expect((await db.query("delete from fornecedores returning id")).rows).toHaveLength(2);

    // Secao 36: quem cadastra passa a poder limpar o proprio erro. Sem isso,
    // um registro digitado errado vira residuo permanente - foi o que
    // aconteceu com o grupo "ghj", que ficou meses nas listas.
    await db.exec("reset role;");
    const mig36 = readFileSync(
      "supabase/migrations/20261025_exclusao_cadastro_sane.sql",
      "utf8"
    );
    await db.exec(mig36);
    await db.exec(mig36); // reaplicacao idempotente
    await db.exec("set role authenticated;");

    await db.exec("set test.papel = 'sane';");
    await db.query("insert into fornecedores(codigo,razao_social) values ('dig','Digitado errado')");
    expect((await db.query("delete from fornecedores returning id")).rows).toHaveLength(1);

    // Campus e outros continuam de fora.
    await db.exec("set test.papel = 'admin';");
    await db.query("insert into fornecedores(codigo,razao_social) values ('fix','Fixo')");
    for (const papel of ["campus", "outros"]) {
      await db.exec(`set test.papel = '${papel}';`);
      expect((await db.query("delete from fornecedores returning id")).rows).toHaveLength(0);
    }
  } finally {
    await db.close();
  }
}, 30000);
