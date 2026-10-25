// Regras de exclusao de cadastro (grupo, fornecedor).
//
// Erro de digitacao em cadastro acontece, e sem exclusao pela tela o registro
// errado vira residuo permanente: fica nas listas, nos seletores e no
// Dashboard, dependendo de um desenvolvedor para sumir. Por outro lado,
// cadastro COM historico nunca pode ser apagado - ele sustenta pagamento.
//
// A regra, entao, e simples: so se exclui o que esta vazio. Esta decisao tem
// tres camadas independentes, de proposito:
//   1. aqui, para a tela explicar o motivo ANTES de a pessoa clicar;
//   2. a RLS, que limita quem pode excluir;
//   3. o `on delete restrict` das chaves estrangeiras, que e a ultima palavra -
//      mesmo que 1 e 2 falhem, o banco recusa.

/** Contagem de registros que dependem do cadastro, por tipo. */
export interface Dependencia {
  /** Rotulo no plural, como aparece para o usuario ("itens", "recibos"). */
  rotulo: string;
  quantidade: number;
}

/**
 * Motivo pelo qual o cadastro NAO pode ser excluido, pronto para a tela, ou
 * null quando esta livre.
 */
export function motivoBloqueio(deps: Dependencia[]): string | null {
  const presentes = deps.filter((d) => d.quantidade > 0);
  if (!presentes.length) return null;
  const partes = presentes.map((d) => `${d.quantidade} ${d.rotulo}`);
  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  return `Não é possível excluir: há ${lista} vinculado(s).`;
}

/**
 * Traduz o erro do Postgres para linguagem de usuario. A checagem acima roda
 * antes, mas pode ficar desatualizada entre o carregamento da tela e o clique
 * - outra pessoa pode ter lancado algo nesse meio-tempo. Nesse caso quem
 * barra e o banco (23503, foreign_key_violation), e a mensagem crua nao serve.
 */
export function mensagemErroExclusao(e: unknown): string {
  const codigo =
    typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  const texto = e instanceof Error ? e.message : String(e ?? "");

  if (codigo === "23503" || /foreign key|violates/i.test(texto)) {
    return (
      "Este cadastro passou a ter lançamentos vinculados enquanto a tela estava " +
      "aberta e não pode mais ser excluído. Recarregue a página para ver a situação atual."
    );
  }
  if (codigo === "42501" || /row-level security|permission denied/i.test(texto)) {
    return "Seu perfil não tem permissão para excluir este cadastro.";
  }
  return texto || "Falha ao excluir.";
}
