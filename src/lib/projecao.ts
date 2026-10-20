// Projecao de consumo para antecipar reforco de empenho.
//
// Por que nao basta "saldo / media":
//   1) O consumo escolar para em julho e entre dezembro e janeiro. Se os meses
//      de recesso entram na media, o ritmo cai, a cobertura parece maior do que
//      e, e o alerta de reforco chega TARDE - o erro perigoso.
//   2) Uma media simples nao enxerga consumo em alta: um item que cresce mes a
//      mes esgota antes do que a media sugere.
//
// Aqui o recesso e inferido dos proprios dados (meses em que NENHUM item do
// grupo consumiu) e a projecao caminha pelo calendario futuro PULANDO esses
// meses. Duas projecoes sao calculadas - regressao linear e mediana - e o
// alerta usa a mais conservadora, isto e, a que esgota primeiro.
//
// Limite conhecido da inferencia: um mes sem NF por atraso de faturamento (e
// nao por recesso) e lido como recesso. Com mais de um ano de historico o
// efeito se dilui, porque so vira recesso o mes que ficou zerado em TODAS as
// ocorrencias observadas.

export interface SerieMes {
  /** Mes no formato YYYY-MM. */
  mes: string;
  quantidade: number;
}

export type Confianca = "alta" | "media" | "baixa";
export type Tendencia = "alta" | "queda" | "estavel";

export interface ParametrosProjecao {
  /** Saldo atual do item naquele empenho, em quantidade. */
  saldo: number;
  /** Consumo mensal observado do item (so os meses com consumo). */
  serie: SerieMes[];
  /** Meses (YYYY-MM) em que o GRUPO consumiu algo: define o calendario letivo. */
  mesesAtivosDoGrupo: string[];
  /** Prazo de tramitacao do reforco, em dias corridos. */
  prazoDias: number;
  /** Data de referencia (normalmente hoje). */
  hoje: Date;
}

export interface ResultadoProjecao {
  /** Meses letivos usados no calculo, desde o primeiro consumo do item. */
  n: number;
  mediaMensal: number;
  medianaMensal: number;
  /** Variacao estimada do consumo por mes (positiva = em alta). */
  inclinacao: number;
  tendencia: Tendencia;
  esgotamentoLinear: Date | null;
  esgotamentoMediana: Date | null;
  /** A mais proxima das duas: e ela que manda no alerta. */
  esgotamento: Date | null;
  metodo: "linear" | "mediana" | null;
  /** Esgotamento menos o prazo de tramitacao: quando abrir o processo. */
  dataLimite: Date | null;
  confianca: Confianca;
  /** Os dois metodos divergem mais de 45 dias entre si. */
  divergente: boolean;
}

/** Horizonte maximo da projecao, em meses letivos. */
const HORIZONTE_MESES = 60;
/** Divergencia entre os metodos a partir da qual a projecao e sinalizada. */
const DIAS_DIVERGENCIA = 45;

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

/**
 * Descobre quais meses do ano (1..12) sao letivos, a partir dos meses em que o
 * grupo registrou consumo. Um mes do ano so e considerado recesso se, em TODAS
 * as vezes em que foi observado, ficou zerado. Mes nunca observado conta como
 * letivo - a hipotese conservadora, que antecipa o alerta em vez de atrasa-lo.
 */
export function inferirMesesLetivos(mesesComConsumo: string[]): Set<number> {
  const todos = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  if (!mesesComConsumo.length) return todos;

  const ativos = new Set(mesesComConsumo.map(mesParaIndice));
  const ini = Math.min(...ativos);
  const fim = Math.max(...ativos);

  const observado = new Map<number, number>();
  const comConsumo = new Map<number, number>();
  for (let i = ini; i <= fim; i++) {
    const mesDoAno = (i % 12) + 1;
    observado.set(mesDoAno, (observado.get(mesDoAno) ?? 0) + 1);
    if (ativos.has(i)) comConsumo.set(mesDoAno, (comConsumo.get(mesDoAno) ?? 0) + 1);
  }

  const letivos = new Set<number>();
  for (const mesDoAno of todos) {
    const obs = observado.get(mesDoAno) ?? 0;
    const ativo = comConsumo.get(mesDoAno) ?? 0;
    if (obs === 0 || ativo > 0) letivos.add(mesDoAno);
  }
  return letivos;
}

function ehLetivo(indice: number, letivos: Set<number>): boolean {
  return letivos.has((indice % 12) + 1);
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
 * Caminha pelos meses letivos futuros acumulando o consumo previsto por
 * `previsao(passo)` ate zerar o saldo. Devolve a data estimada, interpolando o
 * dia dentro do mes em que o saldo acaba, ou null se nao esgota no horizonte.
 */
function caminhar(
  saldo: number,
  inicio: number,
  letivos: Set<number>,
  previsao: (passo: number) => number
): Date | null {
  let restante = saldo;
  let passo = 0;
  let indice = inicio;
  let visitados = 0;

  while (visitados < HORIZONTE_MESES) {
    if (!ehLetivo(indice, letivos)) {
      indice++;
      continue;
    }
    const consumo = Math.max(0, previsao(passo));
    // consumo projetado zerou: nesse ritmo o saldo nunca acaba
    if (consumo <= 0) return null;

    if (consumo >= restante) {
      const fracao = restante / consumo;
      const dias = diasNoMes(indice);
      const dia = Math.min(dias, Math.max(1, Math.ceil(fracao * dias)));
      const ano = Math.floor(indice / 12);
      const mes = indice % 12;
      return new Date(Date.UTC(ano, mes, dia));
    }
    restante -= consumo;
    passo++;
    visitados++;
    indice++;
  }
  return null;
}

function somaDias(d: Date, dias: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

function difDias(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/**
 * Projeta o esgotamento do saldo de um item e a data-limite para abrir o
 * reforco. Devolve as duas projecoes e elege a mais conservadora.
 */
export function projetar(p: ParametrosProjecao): ResultadoProjecao {
  const letivos = inferirMesesLetivos(p.mesesAtivosDoGrupo);

  const vazio: ResultadoProjecao = {
    n: 0,
    mediaMensal: 0,
    medianaMensal: 0,
    inclinacao: 0,
    tendencia: "estavel",
    esgotamentoLinear: null,
    esgotamentoMediana: null,
    esgotamento: null,
    metodo: null,
    dataLimite: null,
    confianca: "baixa",
    divergente: false,
  };

  const comConsumo = p.serie.filter((s) => s.quantidade > 0);
  if (!comConsumo.length) return vazio;

  // Serie densa: do primeiro consumo do item ate o ultimo mes com dados do
  // grupo, so meses letivos. O zero de um mes letivo e informacao real (nao
  // comprou naquele mes); o zero de um recesso nao e, e por isso fica de fora.
  const porMes = new Map(p.serie.map((s) => [mesParaIndice(s.mes), s.quantidade]));
  const ini = Math.min(...comConsumo.map((s) => mesParaIndice(s.mes)));
  const ultimoDadoGrupo = p.mesesAtivosDoGrupo.length
    ? Math.max(...p.mesesAtivosDoGrupo.map(mesParaIndice))
    : Math.max(...comConsumo.map((s) => mesParaIndice(s.mes)));

  const valores: number[] = [];
  for (let i = ini; i <= ultimoDadoGrupo; i++) {
    if (!ehLetivo(i, letivos)) continue;
    valores.push(porMes.get(i) ?? 0);
  }
  if (!valores.length) return vazio;

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

  const confianca: Confianca = n >= 6 ? "alta" : n >= 3 ? "media" : "baixa";

  const base: ResultadoProjecao = {
    ...vazio,
    n,
    mediaMensal,
    medianaMensal,
    inclinacao,
    tendencia,
    confianca,
  };

  // Saldo ja esgotado: nao ha o que projetar, o reforco e para ontem.
  if (p.saldo <= 0) {
    return { ...base, esgotamento: p.hoje, dataLimite: p.hoje, metodo: null };
  }

  // Projeta a partir do mes seguinte ao ultimo com dados, nunca no passado.
  const inicio = Math.max(ultimoDadoGrupo + 1, indiceDaData(p.hoje));

  const esgotamentoLinear = caminhar(p.saldo, inicio, letivos, (t) =>
    // t conta a partir do fim da serie observada
    intercepto + inclinacao * (n + t)
  );
  const esgotamentoMediana =
    medianaMensal > 0 ? caminhar(p.saldo, inicio, letivos, () => medianaMensal) : null;

  let esgotamento: Date | null = null;
  let metodo: "linear" | "mediana" | null = null;
  if (esgotamentoLinear && esgotamentoMediana) {
    const linearPrimeiro = esgotamentoLinear <= esgotamentoMediana;
    esgotamento = linearPrimeiro ? esgotamentoLinear : esgotamentoMediana;
    metodo = linearPrimeiro ? "linear" : "mediana";
  } else if (esgotamentoLinear) {
    esgotamento = esgotamentoLinear;
    metodo = "linear";
  } else if (esgotamentoMediana) {
    esgotamento = esgotamentoMediana;
    metodo = "mediana";
  }

  const divergente =
    !!esgotamentoLinear &&
    !!esgotamentoMediana &&
    difDias(esgotamentoLinear, esgotamentoMediana) > DIAS_DIVERGENCIA;

  return {
    ...base,
    esgotamentoLinear,
    esgotamentoMediana,
    esgotamento,
    metodo,
    dataLimite: esgotamento ? somaDias(esgotamento, -p.prazoDias) : null,
    divergente,
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
