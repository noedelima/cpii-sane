// Conferencia da numeracao dos grupos.
//
// O numero romano/arabico ordena o grupo em praticamente toda tela: Dashboard,
// Atas, Consumo, seletores. Numero repetido faz dois grupos sentarem lado a
// lado como se fossem o mesmo - foi assim que um cadastro de teste chamado
// "ghj", numerado I/1, passou meses colado no Grupo I - Hortifruti A.
//
// Mas repetir NAO e necessariamente erro: o Grupo III existe duas vezes de
// forma legitima (NARDELLI e RJB), porque sao contratos diferentes da mesma
// categoria. Por isso aqui so se AVISA; bloquear atrapalharia o uso correto.

export interface GrupoNumerado {
  id: number;
  nome: string;
  numero_romano: string | null;
  numero_arabico: number | null;
}

/**
 * Grupos ja existentes que usam o mesmo numero romano ou arabico, ignorando o
 * proprio grupo em edicao. Lista vazia = sem conflito.
 */
export function conflitosDeNumero(
  atual: { id: number | null; numero_romano: string | null; numero_arabico: number | null },
  outros: GrupoNumerado[]
): GrupoNumerado[] {
  const romano = (atual.numero_romano ?? "").trim().toUpperCase();
  const arabico = atual.numero_arabico;
  if (!romano && arabico == null) return [];

  return outros.filter((g) => {
    if (atual.id != null && g.id === atual.id) return false;
    const mesmoRomano =
      !!romano && (g.numero_romano ?? "").trim().toUpperCase() === romano;
    const mesmoArabico = arabico != null && g.numero_arabico === arabico;
    return mesmoRomano || mesmoArabico;
  });
}

/** Texto do aviso, ou null quando nao ha conflito. */
export function avisoNumeroGrupo(conflitos: GrupoNumerado[]): string | null {
  if (!conflitos.length) return null;
  const nomes = conflitos.map((g) => g.nome);
  const lista =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  const plural = nomes.length > 1;
  return (
    `Este número já é usado por ${lista}. ` +
    `Pode ser proposital — contratos diferentes da mesma categoria dividem a numeração —, ` +
    `mas ${plural ? "esses grupos" : "esse grupo"} vai aparecer junto deste em todas as listas.`
  );
}
