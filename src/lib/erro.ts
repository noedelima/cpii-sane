// Extrai uma mensagem legível de QUALQUER erro: Error, PostgrestError do
// supabase (objeto { message, details, hint, code } — que NÃO é instanceof Error,
// por isso o "e instanceof Error ? ... : fallback" engolia o motivo real),
// string solta, ou objeto genérico. Sempre devolve algo útil.
export function msgErro(e: unknown, fallback = "Ocorreu um erro."): string {
  if (e == null) return fallback;
  if (typeof e === "string") return e || fallback;
  if (e instanceof Error && e.message) return e.message;
  const o = e as {
    message?: string;
    details?: string;
    hint?: string;
    error?: string;
    error_description?: string;
    code?: string;
  };
  const base = o.message || o.error_description || o.error || o.details;
  if (base) return o.code ? `${base} (${o.code})` : base;
  if (o.hint) return o.hint;
  if (o.code) return `Erro ${o.code}`;
  return fallback;
}
