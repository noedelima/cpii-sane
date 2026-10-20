import { describe, expect, it } from "vitest";
import {
  indiceParaMes,
  mesParaIndice,
  projetar,
  situacao,
  type ResultadoProjecao,
  type SerieMes,
} from "../src/lib/projecao";

/** Gera uma serie mensal continua a partir de um mes inicial. */
function serie(inicio: string, quantidades: number[]): SerieMes[] {
  const i0 = mesParaIndice(inicio);
  return quantidades.map((q, k) => ({ mes: indiceParaMes(i0 + k), quantidade: q }));
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const hoje = new Date(Date.UTC(2026, 9, 20)); // 20/10/2026

describe("calendario", () => {
  it("converte mes e indice nos dois sentidos", () => {
    expect(indiceParaMes(mesParaIndice("2026-03"))).toBe("2026-03");
    expect(indiceParaMes(mesParaIndice("2025-12") + 1)).toBe("2026-01");
  });
});

describe("projetar", () => {
  it("com consumo estavel, projeta esgotamento proporcional ao saldo", () => {
    const r = projetar({
      saldo: 300,
      serie: serie("2026-03", [100, 100, 100, 100, 100, 100, 100, 100]),
      prazoDias: 45,
      hoje,
    });
    expect(r.medianaMensal).toBe(100);
    expect(r.tendencia).toBe("estavel");
    // 300 de saldo a 100/mes, a partir de novembro
    expect(dia(r.esgotamentoCedo!)).toBe("2027-01-31");
    // sem sazonalidade: a faixa nao pula meses
    expect(dia(r.esgotamentoTarde!)).toBe("2027-01-31");
  });

  it("detecta consumo em alta e antecipa o esgotamento", () => {
    const r = projetar({
      saldo: 400,
      serie: serie("2026-03", [40, 60, 80, 100, 120, 140, 160, 180]),
      prazoDias: 45,
      hoje,
    });
    expect(r.tendencia).toBe("alta");
    expect(r.inclinacao).toBeGreaterThan(0);
    // a reta esgota antes da mediana e define a ponta curta da faixa
    expect(r.esgotamentoLinear!.getTime()).toBeLessThan(r.esgotamentoMediana!.getTime());
    expect(r.esgotamentoCedo).toEqual(r.esgotamentoLinear);
    expect(r.esgotamentoTarde).toEqual(r.esgotamentoMediana);
  });

  it("com consumo em queda, a mediana e a ponta conservadora", () => {
    const r = projetar({
      saldo: 300,
      serie: serie("2026-03", [200, 180, 160, 140, 120, 100, 80, 60]),
      prazoDias: 45,
      hoje,
    });
    expect(r.tendencia).toBe("queda");
    expect(r.esgotamentoCedo).toEqual(r.esgotamentoMediana);
  });

  it("recua o prazo de tramitacao a partir da ponta mais proxima", () => {
    const r = projetar({
      saldo: 300,
      serie: serie("2026-03", [100, 100, 100, 100, 100, 100, 100, 100]),
      prazoDias: 45,
      hoje,
    });
    const diff = (r.esgotamentoCedo!.getTime() - r.dataLimite!.getTime()) / 86_400_000;
    expect(diff).toBe(45);
  });

  it("conta como zero o mes sem compra no meio da serie", () => {
    const r = projetar({
      saldo: 300,
      serie: [
        { mes: "2026-03", quantidade: 120 },
        { mes: "2026-04", quantidade: 120 },
        // maio sem compra
        { mes: "2026-06", quantidade: 120 },
      ],
      prazoDias: 45,
      hoje,
    });
    expect(r.n).toBe(4);
    expect(r.mediaMensal).toBeCloseTo((120 * 3) / 4, 5);
  });

  it("nao projeta data com historico curto demais", () => {
    const r = projetar({
      saldo: 100,
      serie: serie("2026-09", [50, 50]),
      prazoDias: 45,
      hoje,
    });
    expect(r.n).toBe(2);
    expect(r.historicoInsuficiente).toBe(true);
    expect(r.esgotamentoCedo).toBeNull();
    expect(r.dataLimite).toBeNull();
    // mas ainda informa o ritmo observado
    expect(r.medianaMensal).toBe(50);
    expect(situacao(r, 100, hoje)).toBe("ok");
  });

  it("nao projeta sem consumo nenhum", () => {
    const r = projetar({ saldo: 500, serie: [], prazoDias: 45, hoje });
    expect(r.esgotamentoCedo).toBeNull();
    expect(r.confianca).toBe("baixa");
  });

  it("saldo zerado aparece como esgotado", () => {
    const r = projetar({
      saldo: 0,
      serie: serie("2026-03", [100, 100, 100]),
      prazoDias: 45,
      hoje,
    });
    expect(r.esgotamentoCedo).toEqual(hoje);
    expect(situacao(r, 0, hoje)).toBe("esgotado");
  });

  it("saldo folgado nao gera alerta", () => {
    const r = projetar({
      saldo: 1_000_000,
      serie: serie("2026-03", [100, 100, 100, 100, 100, 100, 100, 100]),
      prazoDias: 45,
      hoje,
    });
    expect(r.esgotamentoCedo).toBeNull();
    expect(situacao(r, 1_000_000, hoje)).toBe("ok");
  });

  it("gradua a confianca pelo tamanho do historico", () => {
    const curto = projetar({
      saldo: 100,
      serie: serie("2026-05", [10, 10, 10, 10]),
      prazoDias: 45,
      hoje,
    });
    const longo = projetar({
      saldo: 100,
      serie: serie("2025-09", Array(14).fill(10)),
      prazoDias: 45,
      hoje,
    });
    expect(curto.confianca).toBe("baixa");
    expect(longo.confianca).toBe("alta");
  });

  it("nao projeta para o passado quando os dados estao atrasados", () => {
    // ultima NF lancada em marco, mas hoje e outubro
    const r = projetar({
      saldo: 300,
      serie: serie("2025-10", [100, 100, 100, 100, 100, 100]),
      prazoDias: 45,
      hoje,
    });
    expect(r.esgotamentoCedo!.getTime()).toBeGreaterThanOrEqual(
      Date.UTC(2026, 9, 1)
    );
  });
});

describe("situacao", () => {
  const base: ResultadoProjecao = {
    n: 12,
    mediaMensal: 100,
    medianaMensal: 100,
    inclinacao: 0,
    tendencia: "estavel",
    esgotamentoLinear: null,
    esgotamentoMediana: null,
    esgotamentoCedo: null,
    esgotamentoTarde: null,
    dataLimite: null,
    confianca: "alta",
    historicoInsuficiente: false,
  };

  it("data-limite ja vencida é atraso", () => {
    expect(
      situacao({ ...base, dataLimite: new Date(Date.UTC(2026, 9, 1)) }, 500, hoje)
    ).toBe("atrasado");
  });

  it("data-limite dentro da janela manda abrir o processo", () => {
    expect(
      situacao({ ...base, dataLimite: new Date(Date.UTC(2026, 10, 5)) }, 500, hoje)
    ).toBe("abrir");
  });

  it("data-limite distante fica em monitoramento", () => {
    expect(
      situacao({ ...base, dataLimite: new Date(Date.UTC(2026, 11, 20)) }, 500, hoje)
    ).toBe("monitorar");
  });

  it("sem data projetada nao alerta", () => {
    expect(situacao(base, 500, hoje)).toBe("ok");
  });
});
