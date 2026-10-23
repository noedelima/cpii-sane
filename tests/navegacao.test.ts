import { describe, expect, it } from "vitest";
import { NAVEGACAO, navegacaoPara } from "../src/lib/navegacao";

/** Todos os destinos visiveis para um papel, achatados. */
function rotas(papel: Parameters<typeof navegacaoPara>[0]): string[] {
  return navegacaoPara(papel).flatMap((g) => g.itens.map((i) => i.to));
}

describe("navegacaoPara", () => {
  it("campus enxerga o dia a dia, nunca as telas da SANE", () => {
    const r = rotas("campus");
    expect(r).toContain("/dashboard");
    expect(r).toContain("/recibos");
    expect(r).toContain("/ajuda");
    for (const restrita of [
      "/ateste",
      "/solicitar-nf",
      "/consumo",
      "/atas",
      "/notificacoes",
      "/fornecedores",
      "/admin",
    ]) {
      expect(r).not.toContain(restrita);
    }
  });

  it("sane enxerga tudo menos a administracao", () => {
    const r = rotas("sane");
    expect(r).toContain("/consumo");
    expect(r).toContain("/ateste");
    expect(r).toContain("/fornecedores");
    expect(r).not.toContain("/admin");
  });

  it("admin enxerga tudo", () => {
    const r = rotas("admin");
    expect(r).toContain("/admin");
    expect(r).toContain("/consumo");
    expect(r.length).toBe(NAVEGACAO.flatMap((g) => g.itens).length);
  });

  it("perfil outros fica no basico, sem erro", () => {
    const r = rotas("outros");
    expect(r).toContain("/dashboard");
    expect(r).not.toContain("/consumo");
  });

  it("papel nulo nao quebra a navegacao", () => {
    expect(() => rotas(null)).not.toThrow();
    expect(rotas(null)).toContain("/dashboard");
  });

  it("nao sobra grupo vazio para nenhum papel", () => {
    for (const p of ["campus", "sane", "admin", "outros", null] as const) {
      for (const g of navegacaoPara(p)) {
        expect(g.itens.length).toBeGreaterThan(0);
      }
    }
  });

  it("todo item tem rota, rotulo e icone", () => {
    for (const g of NAVEGACAO) {
      for (const i of g.itens) {
        expect(i.to.startsWith("/")).toBe(true);
        expect(i.label.length).toBeGreaterThan(0);
        expect(i.d.length).toBeGreaterThan(10);
      }
    }
  });

  it("nao ha rota duplicada no menu", () => {
    const todas = NAVEGACAO.flatMap((g) => g.itens.map((i) => i.to));
    expect(new Set(todas).size).toBe(todas.length);
  });
});
