/**
 * Busca TODAS as linhas de uma consulta, contornando o teto de linhas da API.
 *
 * O PostgREST (Supabase) devolve no máximo o "Max rows" do projeto — 1000 por
 * padrão — quando a consulta não pagina, e faz esse corte **em silêncio**: não
 * há erro, a resposta simplesmente vem incompleta. Foi o que fez os itens dos
 * recibos mais recentes sumirem da consolidação da Solicitação de NF (cerca de
 * 250 recibos x 6 itens passavam de 1000 linhas, e as linhas excedentes eram
 * descartadas a partir das mais novas).
 *
 * IMPORTANTE: a consulta precisa ter ordenação DETERMINÍSTICA (ex.: .order("id")
 * ou a combinação de colunas que identifica a linha). Sem isso, o banco pode
 * devolver as faixas em ordens diferentes e as páginas repetem ou pulam linhas.
 */
const TAMANHO_PAGINA = 1000;
const MAX_PAGINAS = 500; // trava de seguranca: 500k linhas

export async function buscarTudo<T>(
  pagina: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanho = TAMANHO_PAGINA
): Promise<T[]> {
  const todas: T[] = [];
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const de = i * tamanho;
    const { data, error } = await pagina(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    const linhas = data ?? [];
    todas.push(...linhas);
    // pagina incompleta = acabaram as linhas
    if (linhas.length < tamanho) break;
  }
  return todas;
}
