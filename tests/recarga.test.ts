import { describe, expect, it } from "vitest";
import { deveRecarregar, ehChunkObsoleto } from "../src/lib/recarga";

describe("ehChunkObsoleto", () => {
  it("reconhece a mensagem do Chrome/Edge", () => {
    // mensagem real observada em producao apos um deploy
    const e = new TypeError(
      "Failed to fetch dynamically imported module: https://portal/assets/AdminView-Ds3rvPB2.js"
    );
    expect(ehChunkObsoleto(e)).toBe(true);
  });

  it("reconhece a mensagem do Firefox", () => {
    expect(ehChunkObsoleto(new Error("error loading dynamically imported module"))).toBe(true);
  });

  it("reconhece a mensagem do Safari", () => {
    expect(ehChunkObsoleto(new Error("Importing a module script failed."))).toBe(true);
  });

  it("reconhece a recusa por MIME, que e o sintoma do index.html devolvido no lugar do chunk", () => {
    expect(
      ehChunkObsoleto(
        new Error(
          'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'
        )
      )
    ).toBe(true);
  });

  it("ignora erro comum da aplicacao", () => {
    expect(ehChunkObsoleto(new Error("Falha ao gravar recibo."))).toBe(false);
    expect(ehChunkObsoleto(new Error("NetworkError when attempting to fetch resource."))).toBe(
      false
    );
  });

  it("nao estoura com valor que nao e Error", () => {
    expect(ehChunkObsoleto(null)).toBe(false);
    expect(ehChunkObsoleto(undefined)).toBe(false);
    expect(ehChunkObsoleto({ qualquer: "coisa" })).toBe(false);
    expect(ehChunkObsoleto("failed to fetch dynamically imported module")).toBe(true);
  });
});

describe("deveRecarregar", () => {
  const chunk = new Error("Failed to fetch dynamically imported module: /assets/x.js");

  it("recarrega na primeira vez", () => {
    expect(deveRecarregar(chunk, false)).toBe(true);
  });

  it("nao recarrega de novo: laco de recarga e pior que a tela em branco", () => {
    expect(deveRecarregar(chunk, true)).toBe(false);
  });

  it("nao recarrega por erro que recarga nao resolve", () => {
    expect(deveRecarregar(new Error("Erro ao salvar."), false)).toBe(false);
  });
});
