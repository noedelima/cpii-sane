/** Formatação pt-BR compartilhada pelas telas. */

export function fmtMoney(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return (Number.isFinite(n) ? (n as number) : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

/**
 * Formata a entrega de uma NF como dia único ou período.
 * - fim vazio ou igual ao início -> "dd/mm/aaaa"
 * - fim diferente do início      -> "De dd/mm/aaaa a dd/mm/aaaa"
 */
export function fmtEntrega(
  ini: string | null | undefined,
  fim?: string | null | undefined
): string {
  if (!ini) return "—";
  const a = ini.slice(0, 10);
  const b = fim ? fim.slice(0, 10) : "";
  if (b && b !== a) return `De ${fmtDate(a)} a ${fmtDate(b)}`;
  return fmtDate(a);
}

/**
 * Quantidade fisica: ate 3 casas, sem zeros a direita inuteis.
 * 862 -> "862" | 12.5 -> "12,5" | 1234.567 -> "1.234,567"
 */
export function fmtQtd(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  if (!Number.isFinite(n as number)) return "0";
  return (n as number).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  return `${((v ?? 0) * 100).toFixed(digits).replace(".", ",")}%`;
}
