// Projecao de consumo para antecipar reforco de empenho.
//
// A unidade de analise e o ITEM, nao o par item+empenho: um item pode estar
// zerado numa NE e ter saldo em outra, e quem compra olha o estoque do item.
// Por isso o saldo entra somado entre os empenhos ativos, e a serie de consumo
// tambem.
//
// Sobre sazonalidade: a primeira versao tentava inferir o recesso escolar dos
// meses sem consumo. Os dados de producao refutaram a ideia - as lacunas da
// serie acompanham o ritmo de FATURAMENTO, nao o de consumo, e a inferencia
// chegou a marcar fevereiro e marco como ferias. Alem disso o calendario do
// CPII sofre distorcao por greve. A projecao aqui portanto NAO modela
// sazonalidade: caminha por meses corridos e, em vez de cravar uma data,
// devolve uma FAIXA entre as duas projecoes (reta e mediana). O alerta usa a
// ponta mais proxima, que e a hipotese conservadora.

export interface SerieMes {
  /** Mes no formato YYYY-MM. */
  mes: string;
  quantidade: number;
}

export type Confianca = "alta" | "media" | "baixa";
export type Tendencia = "alta" | "queda" | "estavel";

export interface ParametrosProjecao {
  /** Saldo do item somado entre os empenhos ativos. */
  saldo: number;
  /** Consumo mensal do item (todos os empenhos juntos). */
  serie: SerieMes[];
  /** Prazo de tramitacao do reforco, em dias corridos. */
  prazoDias: number;
  /** Data de referencia (normalmente hoje). */
  hoje: Date;
  /** Minimo de meses observados para arriscar uma data. Padrao 3. */
  minObservacoes?: number;
}

export interface ResultadoProjecao {
  /** Meses observados, do primeiro consumo ao ultimo mes com dados. */
  n: number;
  mediaMensal: number;
  medianaMensal: number;
  /** Variacao estimada do consumo por mes (positiva = em alta). */
  inclinacao: number;
  tendencia: Tendencia;
  esgotamentoLinear: Date | null;
  esgotamentoMediana: Date | null;
  /** Ponta mais proxima da faixa: e ela que manda no alerta. */
  esgotamentoCedo: Date | null;
  /** Ponta mais distante da faixa. */
  esgotamentoTarde: Date | null;
  /** Esgotamento mais proximo menos o prazo de tramitacao. */
  dataLimite: Date | null;
  confianca: Confianca;
  /** Historico curto demais para projetar data (so ritmo e tendencia). */
  historicoInsuficiente: boolean;
}

/** Horizonte maximo da projecao, em meses. */
const HORIZONTE_MESES = 60;

// ---------------------------------------------------------------- calendario

/** 'YYYY-MM' -> indice absoluto (ano * 12 + mes - 1). */
export function mesParaIndice(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return a * 12 + (m - 1);
}

/** indice absoluto -> 'YYYY-MM'. */
export function indiceParaMes(i: number): string {
  const a = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}`;
}

function indiceDaData(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function diasNoMes(indice: number): number {
  const a = Math.floor(indice / 12);
  const m = indice % 12;
  return new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
}

// ------------------------------------------------------------------ medidas

function mediana(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Minimos quadrados sobre t = 0..n-1. */
function regressao(v: number[]): { inclinacao: number; intercepto: number } {
  const n = v.length;
  if (n < 2) return { inclinacao: 0, intercepto: n ? v[0] : 0 };
  const mediaT = (n - 1) / 2;
  const mediaY = v.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    num += (t - mediaT) * (v[t] - mediaY);
    den += (t - mediaT) ** 2;
  }
  const inclinacao = den === 0 ? 0 : num / den;
  return { inclinacao, intercepto: mediaY - inclinacao * mediaT };
}

// ----------------------------------------------------------------- projecao

/**
 * Caminha pelos meses futuros acumulando o consumo previsto por
 * `previsao(passo)` ate zerar o saldo. Interpola o dia dentro do mes em que o
 * saldo acaba; devolve null se nao esgota dentro do horizonte.
 */
function caminhar(
  saldo: number,
  inicio: number,
  previsao: (passo: number) => number
): Date | null {
  let restante = saldo;
  for (let passo = 0; passo < HORIZONTE_MESES; passo++) {
    const consumo = Math.max(0, previsao(passo));
    // consumo projetado zerou: nesse ritmo o saldo nunca acaba
    if (consumo <= 0) return null;

    if (consumo >= restante) {
      const indice = inicio + passo;
      const dias = diasNoMes(indice);
      const dia = Math.min(dias, Math.max(1, Math.ceil((restante / consumo) * dias)));
      return new Date(Date.UTC(Math.floor(indice / 12), indice % 12, dia));
    }
    restante -= consumo;
  }
  return null;
}

function somaDias(d: Date, dias: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

/**
 * Projeta o esgotamento do saldo de um item e a data-limite para abrir o
 * reforco. Devolve as duas projecoes (reta e mediana) como uma faixa.
 */
export function projetar(p: ParametrosProjecao): ResultadoProjecao {
  const min = p.minObservacoes ?? 3;

  const vazio: ResultadoProjecao = {
    n: 0,
    mediaMensal: 0,
    medianaMensal: 0,
    inclinacao: 0,
    tendencia: "estavel",
    esgotamentoLinear: null,
    esgotamentoMediana: null,
    esgotamentoCedo: null,
    esgotamentoTarde: null,
    dataLimite: null,
    confianca: "baixa",
    historicoInsuficiente: true,
  };

  const comConsumo = p.serie.filter((s) => s.quantidade > 0);
  if (!comConsumo.length) return vazio;

  // Serie densa em meses corridos, do primeiro consumo ao ultimo mes com
  // dados. Um mes sem compra no meio da serie conta como zero: e consumo
  // baixo de verdade, e nao ha como distinguir de atraso de faturamento.
  const porMes = new Map(p.serie.map((s) => [mesParaIndice(s.mes), s.quantidade]));
  const indices = comConsumo.map((s) => mesParaIndice(s.mes));
  const ini = Math.min(...indices);
  const fim = Math.max(...indices);

  const valores: number[] = [];
  for (let i = ini; i <= fim; i++) valores.push(porMes.get(i) ?? 0);

  const n = valores.length;
  const mediaMensal = valores.reduce((a, b) => a + b, 0) / n;
  const medianaMensal = mediana(valores);
  const { inclinacao, intercepto } = regressao(valores);

  const tendencia: Tendencia =
    mediaMensal > 0 && Math.abs(inclinacao) / mediaMensal >= 0.1
      ? inclinacao > 0
        ? "alta"
        : "queda"
      : "estavel";

  const confianca: Confianca = n >= 12 ? "alta" : n >= 6 ? "media" : "baixa";

  const base: ResultadoProjecao = {
    ...vazio,
    n,
    mediaMensal,
    medianaMensal,
    inclinacao,
    tendencia,
    confianca,
    historicoInsuficiente: n < min,
  };

  // Saldo ja esgotado em TODOS os empenhos: o reforco e para ontem.
  if (p.saldo <= 0) {
    return {
      ...base,
      esgotamentoCedo: p.hoje,
      esgotamentoTarde: p.hoje,
      dataLimite: p.hoje,
    };
  }

  // Historico curto demais: informa ritmo e tendencia, mas nao arrisca data.
  if (n < min) return base;

  // Projeta a partir do mes seguinte ao ultimo com dados, nunca no passado.
  const inicio = Math.max(fim + 1, indiceDaData(p.hoje));

  const esgotamentoLinear = caminhar(
    p.saldo,
    inicio,
    (t) => intercepto + inclinacao * (n + t)
  );
  const esgotamentoMediana =
    medianaMensal > 0 ? caminhar(p.saldo, inicio, () => medianaMensal) : null;

  const datas = [esgotamentoLinear, esgotamentoMediana].filter(
    (d): d is Date => d != null
  );
  const esgotamentoCedo = datas.length
    ? new Date(Math.min(...datas.map((d) => d.getTime())))
    : null;
  const esgotamentoTarde = datas.length
    ? new Date(Math.max(...datas.map((d) => d.getTime())))
    : null;

  return {
    ...base,
    esgotamentoLinear,
    esgotamentoMediana,
    esgotamentoCedo,
    esgotamentoTarde,
    dataLimite: esgotamentoCedo ? somaDias(esgotamentoCedo, -p.prazoDias) : null,
  };
}

export type SituacaoReforco = "esgotado" | "atrasado" | "abrir" | "monitorar" | "ok";

/**
 * Traduz a projecao em uma situacao acionavel, comparando a data-limite com
 * hoje. `antecedenciaDias` e a janela em que o item ja entra no painel.
 */
export function situacao(
  r: ResultadoProjecao,
  saldo: number,
  hoje: Date,
  antecedenciaDias = 30
): SituacaoReforco {
  if (saldo <= 0) return "esgotado";
  if (!r.dataLimite) return "ok";
  const dias = (r.dataLimite.getTime() - hoje.getTime()) / 86_400_000;
  if (dias < 0) return "atrasado";
  if (dias <= antecedenciaDias) return "abrir";
  if (dias <= antecedenciaDias * 3) return "monitorar";
  return "ok";
}
