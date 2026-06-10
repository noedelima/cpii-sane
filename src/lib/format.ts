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

export function fmtPct(v: number | null | undefined, digits = 1): string {
  return `${((v ?? 0) * 100).toFixed(digits).replace(".", ",")}%`;
}
