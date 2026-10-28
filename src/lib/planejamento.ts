/**
 * Regras do Planejamento de pedidos.
 *
 * Area CONSULTIVA: nada aqui desconta saldo de empenho nenhum. O fiscal
 * informa quanto pretende pedir e ve, antes de enviar, se ha saldo.
 *
 * Tres numeros entram na conta de cada item:
 *   saldo     — o que vw_empenho_item_saldo mostra: empenhado menos FATURADO;
 *   transito  — entregue e ainda nao faturado (vw_item_transito), que o saldo
 *               acima ainda nao descontou;
 *   planejado — o que o fiscal pretende pedir agora.
 *
 * disponivel = saldo - transito   (o que realmente sobra hoje)
 * saldoFinal = disponivel - planejado
 */

export type Situacao = "ok" | "sem-saldo" | "sem-empenho";

export interface LinhaSaldo {
  item_id: number;
  saldo_qtd: number | string | null;
  status?: string | null;
}

/**
 * Soma o saldo do item em todos os empenhos ativos. Um item pode estar
 * esgotado numa NE e ter saldo em outra: o que importa para o pedido e o
 * total. Saldo negativo de uma NE nao e zerado — ele representa consumo
 * acima do empenhado e deve puxar o total para baixo.
 */
export function consolidarSaldo(linhas: LinhaSaldo[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of linhas) {
    if (l.status != null && l.status !== "ativo") continue;
    const q = Number(l.saldo_qtd ?? 0);
    if (!Number.isFinite(q)) continue;
    m.set(l.item_id, (m.get(l.item_id) ?? 0) + q);
  }
  return m;
}

export interface Resultado {
  disponivel: number;
  saldoFinal: number;
  situacao: Situacao;
}

/** `temEmpenho` separa "acabou o saldo" de "este item nunca foi empenhado". */
export function avaliar(
  saldo: number,
  transito: number,
  planejado: number,
  temEmpenho: boolean
): Resultado {
  const disponivel = arredondar(saldo - transito);
  const saldoFinal = arredondar(disponivel - planejado);
  let situacao: Situacao = "ok";
  if (!temEmpenho) situacao = "sem-empenho";
  else if (saldoFinal < 0) situacao = "sem-saldo";
  return { disponivel, saldoFinal, situacao };
}

/** 4 casas, como as quantidades no banco; evita 0.1+0.2 na tela. */
export function arredondar(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Le um numero como ele sai de uma planilha brasileira.
 * "1.234,5" -> 1234.5 | "1234,5" -> 1234.5 | "1,234.5" -> 1234.5 | "" -> 0
 * Texto que nao vira numero devolve null, para a tela poder avisar em vez de
 * silenciosamente tratar como zero.
 */
export function lerNumero(bruto: string): number | null {
  const t = bruto.trim().replace(/\s| /g, "");
  if (!t) return 0;
  // Remove moeda e sinais de milhar ambiguos decidindo pelo ULTIMO separador.
  const limpo = t.replace(/^R\$?/i, "");
  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  let normal: string;
  if (ultimaVirgula >= 0 && ultimaVirgula > ultimoPonto) {
    // virgula e o decimal: pontos sao milhar
    normal = limpo.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto >= 0 && ultimoPonto > ultimaVirgula) {
    // ponto e o decimal: virgulas sao milhar
    normal = limpo.replace(/,/g, "");
  } else {
    normal = limpo.replace(/[.,]/g, "");
  }
  if (!/^-?\d*\.?\d*$/.test(normal) || normal === "" || normal === "-") return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export interface Colagem {
  /** Uma quantidade por linha colada, ja somando as colunas de campi. */
  quantidades: number[];
  /** Linhas (1-based) em que alguma celula nao era numero. */
  invalidas: number[];
  /** Quantas colunas o bloco colado tinha. */
  colunas: number;
}

/**
 * Converte o texto vindo do Ctrl+V do Excel.
 *
 * Aceita os dois formatos que a planilha de pedidos produz:
 *   - uma coluna  (a de QUANTIDADE TOTAL);
 *   - o bloco dos campi (C:O), somando cada linha — o que dispensa depender
 *     da coluna de total, que na planilha e so uma formula.
 * Linhas totalmente vazias no fim sao descartadas (o Excel costuma mandar uma).
 */
export function lerColagem(texto: string): Colagem {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();

  const quantidades: number[] = [];
  const invalidas: number[] = [];
  let colunas = 0;

  linhas.forEach((linha, idx) => {
    const celulas = linha.split("\t");
    colunas = Math.max(colunas, celulas.length);
    let soma = 0;
    let ruim = false;
    for (const c of celulas) {
      const n = lerNumero(c);
      if (n === null) {
        ruim = true;
        continue;
      }
      soma += n;
    }
    if (ruim) invalidas.push(idx + 1);
    quantidades.push(arredondar(soma));
  });

  return { quantidades, invalidas, colunas };
}

export interface Conferencia {
  descricao: string;
  quantidade: number;
}

/**
 * Casa as quantidades coladas com os itens NA ORDEM DA TELA.
 *
 * A colagem e posicional porque a planilha dos campi nao traz o CatMat. Isso
 * e seguro enquanto as duas ordens coincidirem — e, se nao coincidirem, o erro
 * e silencioso: numeros certos nos itens errados, tudo verde. Por isso esta
 * funcao devolve a lista para conferencia na tela ANTES de aplicar, em vez de
 * escrever direto nos campos.
 */
export function conferir(descricoes: string[], quantidades: number[]): Conferencia[] {
  return quantidades
    .slice(0, descricoes.length)
    .map((quantidade, i) => ({ descricao: descricoes[i], quantidade }));
}

/** Mensagem do descompasso entre o que foi colado e o que a tela tem. */
export function avisoColagem(itens: number, colados: number): string | null {
  if (colados === itens) return null;
  if (colados > itens) {
    return `Você colou ${colados} linhas, e este grupo tem ${itens} itens. As ${
      colados - itens
    } últimas serão ignoradas — confira se copiou linhas a mais (cabeçalho ou total).`;
  }
  return `Você colou ${colados} linhas, e este grupo tem ${itens} itens. Os ${
    itens - colados
  } últimos ficarão sem quantidade — confira se a seleção começou na primeira linha de item.`;
}
