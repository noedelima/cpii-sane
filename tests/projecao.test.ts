import { describe, expect, it } from "vitest";
import {
  indiceParaMes,
  inferirMesesLetivos,
  mesParaIndice,
  projetar,
  situacao,
  type SerieMes,
} from "../src/lib/projecao";

/** Gera uma serie mensal continua a partir de um mes inicial. */
function serie(inicio: string, quantidades: number[]): SerieMes[] {
  const i0 = mesParaIndice(inicio);
  return quantidades.map((q, k) => ({ mes: indiceParaMes(i0 + k), quantidade: q }));
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

describe("calendario", () => {
  it("converte mes e indice nos dois sentidos", () => {
    expect(indiceParaMes(mesParaIndice("2026-03"))).toBe("2026-03");
    expect(mesParaIndice("2026-01") + 1).toBe(mesParaIndice("2026-02"));
    expect(indiceParaMes(mesParaIndice("2025-12") + 1)).toBe("2026-01");
  });
});

describe("inferirMesesLetivos", () => {
  it("marca como recesso o mes que ficou zerado em todas as ocorrencias", () => {
    // marco/2025 a junho/2026, sem nenhum consumo em julho e em janeiro
    const meses: string[] = [];
    for (let i = mesParaIndice("2025-03"); i <= mesParaIndice("2026-06"); i++) {
      const m = (i % 12) + 1;
      if (m === 7 || m === 1) continue;
      meses.push(indiceParaMes(i));
    }
    const letivos = inferirMesesLetivos(meses);
    expect(letivos.has(7)).toBe(false);
    expect(letivos.has(1)).toBe(false);
    expect(letivos.has(3)).toBe(true);
    expect(letivos.has(8)).toBe(true);
  });

  it("nao marca recesso quando o mes teve consumo em pelo menos um ano", () => {
    const meses = ["2025-07", "2025-08", "2026-07"];
    expect(inferirMesesLetivos(meses).has(7)).toBe(true);
  });

  it("trata mes nunca observado como letivo (hipotese conservadora)", () => {
    // so dois meses de historico: nada se sabe sobre os demais
    const letivos = inferirMesesLetivos(["2026-03", "2026-04"]);
    expect(letivos.size).toBe(12);
  });

  it("sem historico nenhum, assume o ano inteiro letivo", () => {
    expect(inferirMesesLetivos([]).size).toBe(12);
  });
});

describe("projetar", () => {
  const hoje = new Date(Date.UTC(2026, 9, 20)); // 20/10/2026
  // grupo ativo de marco/2026 a outubro/2026, sem julho (recesso)
  const mesesGrupo = [
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-08",
    "2026-09",
    "2026-10",
  ];

  it("com consumo estavel, projeta esgotamento proporcional ao saldo", () => {
    const r = projetar({
      saldo: 300,
      serie: serie("2026-03", [100, 100, 100, 100, 0, 100, 100, 100]).filter(
        (s) => s.mes !== "2026-07"
      ),
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    expect(r.medianaMensal).toBe(100);
    expect(r.tendencia).toBe("estavel");
    // 300 de saldo a 100/mes: acaba no terceiro mes letivo apos outubro
    expect(dia(r.esgotamento!)).toBe("2027-01-31");
    expect(r.confianca).toBe("alta");
  });

  it("pula o recesso ao caminhar pelo calendario", () => {
    // recesso em julho E em janeiro
    const grupoComDoisRecessos = [
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-08",
      "2026-09",
      "2026-10",
    ];
    const s = grupoComDoisRecessos.map((mes) => ({ mes, quantidade: 100 }));
    const r = projetar({
      saldo: 300,
      serie: s,
      mesesAtivosDoGrupo: grupoComDoisRecessos,
      prazoDias: 45,
      hoje,
    });
    // nov, dez e — pulando janeiro — fevereiro
    expect(dia(r.esgotamento!)).toBe("2027-02-28");
  });

  it("detecta consumo em alta e projeta esgotamento mais cedo que a mediana", () => {
    const r = projetar({
      saldo: 400,
      serie: serie("2026-03", [40, 60, 80, 100, 0, 120, 140, 160]).filter(
        (s) => s.mes !== "2026-07"
      ),
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    expect(r.tendencia).toBe("alta");
    expect(r.inclinacao).toBeGreaterThan(0);
    expect(r.esgotamentoLinear!.getTime()).toBeLessThan(r.esgotamentoMediana!.getTime());
    // o alerta usa a projecao mais conservadora
    expect(r.metodo).toBe("linear");
    expect(r.esgotamento).toEqual(r.esgotamentoLinear);
  });

  it("usa a mediana quando ela esgota antes da reta", () => {
    // consumo em queda: a reta estica o prazo, a mediana e mais conservadora
    const r = projetar({
      saldo: 300,
      serie: serie("2026-03", [200, 180, 160, 140, 0, 120, 100, 80]).filter(
        (s) => s.mes !== "2026-07"
      ),
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    expect(r.tendencia).toBe("queda");
    expect(r.metodo).toBe("mediana");
    expect(r.esgotamento).toEqual(r.esgotamentoMediana);
  });

  it("recua o prazo de tramitacao para achar a data-limite", () => {
    const r = projetar({
      saldo: 300,
      serie: serie("2026-03", [100, 100, 100, 100, 0, 100, 100, 100]).filter(
        (s) => s.mes !== "2026-07"
      ),
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    const diff =
      (r.esgotamento!.getTime() - r.dataLimite!.getTime()) / 86_400_000;
    expect(diff).toBe(45);
  });

  it("nao projeta sem consumo nenhum", () => {
    const r = projetar({
      saldo: 500,
      serie: [],
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    expect(r.esgotamento).toBeNull();
    expect(r.dataLimite).toBeNull();
    expect(r.confianca).toBe("baixa");
  });

  it("marca confianca baixa com poucas observacoes", () => {
    const r = projetar({
      saldo: 100,
      serie: serie("2026-09", [50, 50]),
      mesesAtivosDoGrupo: ["2026-09", "2026-10"],
      prazoDias: 45,
      hoje,
    });
    expect(r.n).toBe(2);
    expect(r.confianca).toBe("baixa");
  });

  it("saldo zerado aparece como esgotado, sem projecao", () => {
    const r = projetar({
      saldo: 0,
      serie: serie("2026-03", [100, 100, 100]),
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    expect(r.esgotamento).toEqual(hoje);
    expect(situacao(r, 0, hoje)).toBe("esgotado");
  });

  it("saldo folgado nao gera alerta", () => {
    const r = projetar({
      saldo: 100_000,
      serie: serie("2026-03", [100, 100, 100, 100, 0, 100, 100, 100]).filter(
        (s) => s.mes !== "2026-07"
      ),
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    // alem do horizonte de projecao
    expect(r.esgotamento).toBeNull();
    expect(situacao(r, 100_000, hoje)).toBe("ok");
  });

  it("conta os meses letivos zerados, mas ignora os de recesso", () => {
    // o item ficou sem compra em maio (mes letivo): esse zero conta
    const r = projetar({
      saldo: 300,
      serie: [
        { mes: "2026-03", quantidade: 120 },
        { mes: "2026-04", quantidade: 120 },
        { mes: "2026-06", quantidade: 120 },
        { mes: "2026-08", quantidade: 120 },
        { mes: "2026-09", quantidade: 120 },
        { mes: "2026-10", quantidade: 120 },
      ],
      mesesAtivosDoGrupo: mesesGrupo,
      prazoDias: 45,
      hoje,
    });
    // 7 meses letivos observados (marco a outubro sem julho), um deles zerado
    expect(r.n).toBe(7);
    expect(r.mediaMensal).toBeCloseTo((120 * 6) / 7, 5);
  });
});

describe("situacao", () => {
  const hoje = new Date(Date.UTC(2026, 9, 20));
  const base = {
    n: 8,
    mediaMensal: 100,
    medianaMensal: 100,
    inclinacao: 0,
    tendencia: "estavel" as const,
    esgotamentoLinear: null,
    esgotamentoMediana: null,
    esgotamento: null,
    metodo: null,
    confianca: "alta" as const,
    divergente: false,
  };

  it("data-limite ja vencida é atraso", () => {
    const r = { ...base, dataLimite: new Date(Date.UTC(2026, 9, 1)) };
    expect(situacao(r, 500, hoje)).toBe("atrasado");
  });

  it("data-limite dentro da janela manda abrir o processo", () => {
    const r = { ...base, dataLimite: new Date(Date.UTC(2026, 10, 5)) };
    expect(situacao(r, 500, hoje)).toBe("abrir");
  });

  it("data-limite distante fica em monitoramento", () => {
    const r = { ...base, dataLimite: new Date(Date.UTC(2026, 11, 20)) };
    expect(situacao(r, 500, hoje)).toBe("monitorar");
  });
});
