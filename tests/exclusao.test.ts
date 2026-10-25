import { describe, expect, it } from "vitest";
import { mensagemErroExclusao, motivoBloqueio } from "../src/lib/exclusao";

describe("motivoBloqueio", () => {
  it("libera quando nao ha nenhuma dependencia", () => {
    expect(
      motivoBloqueio([
        { rotulo: "itens", quantidade: 0 },
        { rotulo: "recibos", quantidade: 0 },
      ])
    ).toBeNull();
  });

  it("libera quando a lista vem vazia", () => {
    expect(motivoBloqueio([])).toBeNull();
  });

  it("bloqueia com uma dependencia", () => {
    expect(motivoBloqueio([{ rotulo: "itens", quantidade: 45 }])).toBe(
      "Não é possível excluir: há 45 itens vinculado(s)."
    );
  });

  it("junta duas dependencias com e", () => {
    const m = motivoBloqueio([
      { rotulo: "itens", quantidade: 45 },
      { rotulo: "recibos", quantidade: 12 },
    ]);
    expect(m).toBe("Não é possível excluir: há 45 itens e 12 recibos vinculado(s).");
  });

  it("junta tres ou mais com virgula e e no fim", () => {
    const m = motivoBloqueio([
      { rotulo: "itens", quantidade: 45 },
      { rotulo: "NEs", quantidade: 3 },
      { rotulo: "recibos", quantidade: 12 },
    ]);
    expect(m).toBe("Não é possível excluir: há 45 itens, 3 NEs e 12 recibos vinculado(s).");
  });

  it("ignora os tipos zerados ao montar a lista", () => {
    const m = motivoBloqueio([
      { rotulo: "itens", quantidade: 0 },
      { rotulo: "NEs", quantidade: 2 },
      { rotulo: "recibos", quantidade: 0 },
    ]);
    expect(m).toBe("Não é possível excluir: há 2 NEs vinculado(s).");
  });
});

describe("mensagemErroExclusao", () => {
  it("explica a violacao de chave estrangeira sem jargao", () => {
    const m = mensagemErroExclusao({ code: "23503", message: "violates foreign key constraint" });
    expect(m).toContain("lançamentos vinculados");
    expect(m).not.toContain("23503");
    expect(m).not.toContain("foreign key");
  });

  it("reconhece a violacao tambem pelo texto, sem o codigo", () => {
    const m = mensagemErroExclusao(new Error('update or delete violates foreign key constraint'));
    expect(m).toContain("lançamentos vinculados");
  });

  it("explica falta de permissao", () => {
    const m = mensagemErroExclusao({ code: "42501", message: "permission denied" });
    expect(m).toContain("permissão");
  });

  it("repassa outros erros como vieram", () => {
    expect(mensagemErroExclusao(new Error("Falha de rede"))).toBe("Falha de rede");
  });

  it("nao quebra com erro vazio ou nulo", () => {
    expect(mensagemErroExclusao(null)).toBe("Falha ao excluir.");
    expect(mensagemErroExclusao(undefined)).toBe("Falha ao excluir.");
  });
});
