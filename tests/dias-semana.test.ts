import { describe, expect, it } from "vitest";
import {
  avisoDataRecibo,
  diaDaSemanaISO,
  listarDias,
  parseDiasSemana,
  semRestricao,
  serializarDiasSemana,
} from "../src/lib/dias-semana";

describe("parseDiasSemana", () => {
  it("le a lista configurada", () => {
    expect(parseDiasSemana("2")).toEqual([2]);
    expect(parseDiasSemana("1,3,5")).toEqual([1, 3, 5]);
    expect(parseDiasSemana(" 5 , 1 ")).toEqual([1, 5]);
  });

  it("libera todos os dias quando nao ha configuracao", () => {
    expect(parseDiasSemana("")).toHaveLength(7);
    expect(parseDiasSemana(null)).toHaveLength(7);
    expect(parseDiasSemana(undefined)).toHaveLength(7);
  });

  it("nao trava o sistema com configuracao invalida", () => {
    // valores fora de 0..6 ou lixo nao podem resultar em lista vazia
    expect(parseDiasSemana("9,abc")).toHaveLength(7);
    expect(parseDiasSemana(",,,")).toHaveLength(7);
  });

  it("descarta duplicatas e ordena", () => {
    expect(parseDiasSemana("3,1,3,1")).toEqual([1, 3]);
  });

  it("serializa de volta no mesmo formato", () => {
    expect(serializarDiasSemana([5, 1, 1])).toBe("1,5");
    expect(parseDiasSemana(serializarDiasSemana([2]))).toEqual([2]);
  });
});

describe("semRestricao", () => {
  it("reconhece a semana inteira como ausencia de regra", () => {
    expect(semRestricao([0, 1, 2, 3, 4, 5, 6])).toBe(true);
    expect(semRestricao([1, 2, 3, 4, 5])).toBe(false);
  });
});

describe("diaDaSemanaISO", () => {
  it("le a data como data civil, sem deslocar por fuso", () => {
    // 20/10/2026 e uma terca-feira
    expect(diaDaSemanaISO("2026-10-20")).toBe(2);
    expect(diaDaSemanaISO("2026-10-19")).toBe(1);
    expect(diaDaSemanaISO("2026-10-25")).toBe(0);
  });

  it("ignora entrada malformada", () => {
    expect(diaDaSemanaISO("")).toBeNull();
    expect(diaDaSemanaISO("20/10/2026")).toBeNull();
  });
});

describe("listarDias", () => {
  it("escreve a lista de forma legivel", () => {
    expect(listarDias([2])).toBe("terça-feira");
    expect(listarDias([1, 2])).toBe("segunda-feira e terça-feira");
    expect(listarDias([5, 1, 2])).toBe("segunda-feira, terça-feira e sexta-feira");
  });
});

describe("avisoDataRecibo", () => {
  const sóTerça = [2];

  it("nao avisa quando a data cai num dia permitido", () => {
    expect(avisoDataRecibo("2026-10-20", sóTerça)).toBeNull();
  });

  it("avisa quando a data cai em dia bloqueado", () => {
    const msg = avisoDataRecibo("2026-10-21", sóTerça);
    expect(msg).toContain("quarta-feira");
    expect(msg).toContain("terça-feira");
  });

  it("nao avisa quando nao ha restricao configurada", () => {
    expect(avisoDataRecibo("2026-10-21", [0, 1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it("nao avisa com data vazia, para nao poluir o formulario em branco", () => {
    expect(avisoDataRecibo("", sóTerça)).toBeNull();
  });
});
