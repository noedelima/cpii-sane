import { describe, expect, it } from "vitest";
import {
  arredondar,
  avaliar,
  avisoColagem,
  conferir,
  consolidarSaldo,
  lerColagem,
  lerNumero,
} from "../src/lib/planejamento";

describe("consolidarSaldo", () => {
  it("soma o item em todos os empenhos ativos", () => {
    const m = consolidarSaldo([
      { item_id: 1, saldo_qtd: 100, status: "ativo" },
      { item_id: 1, saldo_qtd: 50, status: "ativo" },
      { item_id: 2, saldo_qtd: 10, status: "ativo" },
    ]);
    expect(m.get(1)).toBe(150);
    expect(m.get(2)).toBe(10);
  });

  it("ignora empenho que nao esta ativo", () => {
    const m = consolidarSaldo([
      { item_id: 1, saldo_qtd: 100, status: "ativo" },
      { item_id: 1, saldo_qtd: 900, status: "encerrado" },
    ]);
    expect(m.get(1)).toBe(100);
  });

  it("deixa o negativo puxar o total para baixo, em vez de zera-lo", () => {
    // consumo acima do empenhado numa NE e informacao, nao ruido
    const m = consolidarSaldo([
      { item_id: 1, saldo_qtd: 100, status: "ativo" },
      { item_id: 1, saldo_qtd: -30, status: "ativo" },
    ]);
    expect(m.get(1)).toBe(70);
  });

  it("aceita numero como texto, que e como o PostgREST entrega numeric", () => {
    const m = consolidarSaldo([{ item_id: 1, saldo_qtd: "12.5000", status: "ativo" }]);
    expect(m.get(1)).toBe(12.5);
  });

  it("ignora nulo e valor nao numerico sem quebrar", () => {
    const m = consolidarSaldo([
      { item_id: 1, saldo_qtd: null, status: "ativo" },
      { item_id: 1, saldo_qtd: "abc", status: "ativo" },
      { item_id: 1, saldo_qtd: 5, status: "ativo" },
    ]);
    expect(m.get(1)).toBe(5);
  });
});

describe("avaliar", () => {
  it("desconta o transito antes do planejado", () => {
    const r = avaliar(100, 30, 50, true);
    expect(r.disponivel).toBe(70);
    expect(r.saldoFinal).toBe(20);
    expect(r.situacao).toBe("ok");
  });

  it("acusa falta quando o planejado passa do disponivel", () => {
    const r = avaliar(100, 30, 80, true);
    expect(r.saldoFinal).toBe(-10);
    expect(r.situacao).toBe("sem-saldo");
  });

  it("o transito sozinho ja pode zerar o item", () => {
    // o caso que a medicao mostrou: 6 itens virariam zero so com o transito
    const r = avaliar(50, 60, 0, true);
    expect(r.disponivel).toBe(-10);
    expect(r.situacao).toBe("sem-saldo");
  });

  it("saldo exatamente zero ainda e ok, nao falta", () => {
    expect(avaliar(100, 0, 100, true).situacao).toBe("ok");
    expect(avaliar(100, 0, 100, true).saldoFinal).toBe(0);
  });

  it("separa item sem empenho de item sem saldo", () => {
    expect(avaliar(0, 0, 10, false).situacao).toBe("sem-empenho");
    expect(avaliar(0, 0, 10, true).situacao).toBe("sem-saldo");
  });

  it("nao arrasta erro de ponto flutuante para a tela", () => {
    expect(avaliar(0.3, 0.1, 0.2, true).saldoFinal).toBe(0);
  });
});

describe("lerNumero", () => {
  it("le o padrao brasileiro", () => {
    expect(lerNumero("1.234,5")).toBe(1234.5);
    expect(lerNumero("1234,5")).toBe(1234.5);
    expect(lerNumero("80")).toBe(80);
  });

  it("le o padrao americano", () => {
    expect(lerNumero("1,234.5")).toBe(1234.5);
    expect(lerNumero("1234.5")).toBe(1234.5);
  });

  it("trata celula vazia como zero, que e o que a planilha tem de sobra", () => {
    expect(lerNumero("")).toBe(0);
    expect(lerNumero("   ")).toBe(0);
  });

  it("aguenta espaco nao separavel, que vem colado do Excel", () => {
    expect(lerNumero("1 200")).toBe(1200);
  });

  it("devolve null para texto, para a tela poder avisar", () => {
    expect(lerNumero("kg")).toBeNull();
    expect(lerNumero("-")).toBeNull();
    expect(lerNumero("12a")).toBeNull();
  });

  it("aceita valor com R$, caso venha da coluna errada", () => {
    expect(lerNumero("R$ 22,40")).toBe(22.4);
  });
});

describe("lerColagem", () => {
  it("le uma coluna de quantidades", () => {
    const r = lerColagem("80\n0\n120\n");
    expect(r.quantidades).toEqual([80, 0, 120]);
    expect(r.colunas).toBe(1);
    expect(r.invalidas).toEqual([]);
  });

  it("soma o bloco de campi, como na planilha de pedidos", () => {
    // trecho real: Carré (tudo zero) e Lombo (80+100+40+120+12 = 352)
    const bloco = ["0\t0\t0\t0\t0", "80\t100\t40\t120\t12"].join("\n");
    const r = lerColagem(bloco);
    expect(r.colunas).toBe(5);
    expect(r.quantidades).toEqual([0, 352]);
  });

  it("confere com o total da planilha do Grupo V", () => {
    // linha do Lombo suíno: C..O somam 862, que e o que a coluna P mostra
    const linha = "80\t100\t40\t120\t12\t80\t20\t100\t150\t0\t0\t80\t80";
    expect(lerColagem(linha).quantidades).toEqual([862]);
  });

  it("descarta a linha vazia que o Excel costuma mandar no fim", () => {
    expect(lerColagem("10\n20\n\n").quantidades).toEqual([10, 20]);
  });

  it("aponta a linha com texto no meio, sem descartar o resto", () => {
    const r = lerColagem("10\n kg \n30");
    expect(r.invalidas).toEqual([2]);
    expect(r.quantidades).toEqual([10, 0, 30]);
  });

  it("aceita quebra de linha do Windows", () => {
    expect(lerColagem("10\r\n20").quantidades).toEqual([10, 20]);
  });

  it("nao quebra com colagem vazia", () => {
    expect(lerColagem("").quantidades).toEqual([]);
    expect(lerColagem("\n\n").quantidades).toEqual([]);
  });
});

describe("conferir", () => {
  it("casa na ordem da tela e corta o excedente", () => {
    const r = conferir(["Carré", "Lombo", "Sobrepaleta"], [0, 862, 10, 999]);
    expect(r).toEqual([
      { descricao: "Carré", quantidade: 0 },
      { descricao: "Lombo", quantidade: 862 },
      { descricao: "Sobrepaleta", quantidade: 10 },
    ]);
  });

  it("colagem curta cobre so os primeiros itens", () => {
    expect(conferir(["A", "B", "C"], [1])).toEqual([{ descricao: "A", quantidade: 1 }]);
  });
});

describe("avisoColagem", () => {
  it("cala quando bate", () => {
    expect(avisoColagem(20, 20)).toBeNull();
  });

  it("avisa sobra e falta com a contagem", () => {
    expect(avisoColagem(20, 22)).toMatch(/2 últimas serão ignoradas/);
    expect(avisoColagem(20, 18)).toMatch(/2 últimos ficarão sem quantidade/);
  });
});

describe("arredondar", () => {
  it("mantem 4 casas, como o banco", () => {
    expect(arredondar(1.23456)).toBe(1.2346);
    expect(arredondar(0.1 + 0.2)).toBe(0.3);
  });
});
