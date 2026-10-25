import { describe, expect, it } from "vitest";
import { avisoNumeroGrupo, conflitosDeNumero, type GrupoNumerado } from "../src/lib/grupos";

const outros: GrupoNumerado[] = [
  { id: 1, nome: "Grupo I - Hortifruti A - REFISERVI", numero_romano: "I", numero_arabico: 1 },
  { id: 2, nome: "Grupo II - Hortifruti B - REFISERVI", numero_romano: "II", numero_arabico: 2 },
  { id: 3, nome: "Grupo III - Carnes Bovinas - NARDELLI", numero_romano: "III", numero_arabico: 3 },
  { id: 4, nome: "Grupo III - Carnes Bovinas - RJB", numero_romano: "III", numero_arabico: 3 },
];

describe("conflitosDeNumero", () => {
  it("acusa o numero ja usado por outro grupo", () => {
    const c = conflitosDeNumero({ id: null, numero_romano: "I", numero_arabico: 1 }, outros);
    expect(c.map((g) => g.id)).toEqual([1]);
  });

  it("acusa os dois quando o numero se repete legitimamente", () => {
    const c = conflitosDeNumero({ id: null, numero_romano: "III", numero_arabico: 3 }, outros);
    expect(c.map((g) => g.id)).toEqual([3, 4]);
  });

  it("ignora o proprio grupo em edicao", () => {
    const c = conflitosDeNumero({ id: 1, numero_romano: "I", numero_arabico: 1 }, outros);
    expect(c).toEqual([]);
  });

  it("acusa mesmo quando so o romano coincide", () => {
    const c = conflitosDeNumero({ id: null, numero_romano: "II", numero_arabico: 99 }, outros);
    expect(c.map((g) => g.id)).toEqual([2]);
  });

  it("acusa mesmo quando so o arabico coincide", () => {
    const c = conflitosDeNumero({ id: null, numero_romano: "XIV", numero_arabico: 2 }, outros);
    expect(c.map((g) => g.id)).toEqual([2]);
  });

  it("compara o romano sem diferenciar caixa nem espacos", () => {
    const c = conflitosDeNumero({ id: null, numero_romano: " ii ", numero_arabico: null }, outros);
    expect(c.map((g) => g.id)).toEqual([2]);
  });

  it("nao acusa numero livre", () => {
    expect(
      conflitosDeNumero({ id: null, numero_romano: "XI", numero_arabico: 11 }, outros)
    ).toEqual([]);
  });

  it("nao acusa nada com o formulario em branco", () => {
    expect(conflitosDeNumero({ id: null, numero_romano: "", numero_arabico: null }, outros)).toEqual(
      []
    );
    expect(
      conflitosDeNumero({ id: null, numero_romano: null, numero_arabico: null }, outros)
    ).toEqual([]);
  });

  it("nao quebra sem outros grupos", () => {
    expect(conflitosDeNumero({ id: null, numero_romano: "I", numero_arabico: 1 }, [])).toEqual([]);
  });
});

describe("avisoNumeroGrupo", () => {
  it("fica em silencio sem conflito", () => {
    expect(avisoNumeroGrupo([])).toBeNull();
  });

  it("nomeia o grupo em conflito e nao proibe", () => {
    const m = avisoNumeroGrupo([outros[0]])!;
    expect(m).toContain("Grupo I - Hortifruti A - REFISERVI");
    expect(m).toContain("Pode ser proposital");
  });

  it("lista os dois quando ha mais de um", () => {
    const m = avisoNumeroGrupo([outros[2], outros[3]])!;
    expect(m).toContain("NARDELLI e Grupo III - Carnes Bovinas - RJB");
    expect(m).toContain("esses grupos");
  });
});
