// Dias da semana aceitos na data de recebimento do recibo.
//
// A regra e configuravel (chave recibo_dias_semana) porque e particular de
// cada instituicao: no CPII o pagamento sai pela data do PEDIDO, e os pedidos
// saem para terca-feira, mas outra escola tera outra rotina.
//
// A autoridade e o gatilho no banco (valida_dia_recibo). O que esta aqui serve
// para avisar o usuario ANTES de ele tentar salvar - nao substitui a validacao
// server-side.

/** Padrao do extract(dow) do Postgres: 0 = domingo ... 6 = sabado. */
export const NOMES_DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export const NOMES_DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/**
 * Le a configuracao "0,1,2". Vazia, ausente ou invalida devolve todos os dias:
 * a regra nunca deve travar o sistema por configuracao malformada.
 */
export function parseDiasSemana(valor: string | null | undefined): number[] {
  const todos = [0, 1, 2, 3, 4, 5, 6];
  if (!valor || !valor.trim()) return todos;
  const dias = [
    ...new Set(
      valor
        .split(",")
        .map((p) => p.trim())
        // Sem descartar os vazios, ",,," viraria [0] (Number("") e zero) e a
        // configuracao quebrada trancaria os campi no domingo.
        .filter((p) => /^[0-6]$/.test(p))
        .map(Number)
    ),
  ].sort((a, b) => a - b);
  return dias.length ? dias : todos;
}

export function serializarDiasSemana(dias: number[]): string {
  return [...new Set(dias)].sort((a, b) => a - b).join(",");
}

/** true quando todos os sete dias estao liberados (ou seja, sem restricao). */
export function semRestricao(dias: number[]): boolean {
  return dias.length >= 7;
}

/**
 * Dia da semana de uma data no formato YYYY-MM-DD, lida como data civil.
 * Usar new Date("2026-10-20") direto daria UTC e poderia cair no dia anterior
 * em fusos a oeste - exatamente o erro que esta regra existe para evitar.
 */
export function diaDaSemanaISO(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const [, a, mes, d] = m;
  return new Date(Number(a), Number(mes) - 1, Number(d)).getDay();
}

/** Lista legivel: "segunda-feira, terça-feira e sexta-feira". */
export function listarDias(dias: number[]): string {
  const nomes = [...dias].sort((a, b) => a - b).map((d) => NOMES_DIAS[d]);
  if (!nomes.length) return "nenhum dia";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Mensagem de aviso para a data escolhida, ou null quando a data e aceita.
 * Devolve null tambem quando nao ha restricao configurada.
 */
export function avisoDataRecibo(iso: string, dias: number[]): string | null {
  if (semRestricao(dias)) return null;
  const dow = diaDaSemanaISO(iso);
  if (dow == null) return null;
  if (dias.includes(dow)) return null;
  return `Esta data cai em ${NOMES_DIAS[dow]}. O recebimento só é aceito em ${listarDias(dias)}.`;
}
