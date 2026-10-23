// Estrutura da navegacao lateral: grupos, itens, icones e visibilidade.
//
// Fica fora dos componentes de proposito. Primeiro porque "quem enxerga o que"
// e regra de negocio, nao layout - e merece teste. Segundo porque o cabecalho
// horizontal anterior transbordava: o sistema foi de 6 para 13 telas em poucos
// meses, e manter a lista num unico arquivo deixa claro o custo de cada nova.
//
// Os grupos sao por TAREFA, nao por tipo de dado: a pessoa chega pensando
// "preciso lancar", "preciso do ateste", "quero ver se vai faltar".

/** Papel do usuario, como gravado em perfis.papel. */
export type Papel = "campus" | "sane" | "admin" | "outros" | null;

export interface ItemNav {
  to: string;
  label: string;
  /** Path do SVG (24x24, traco). Alguns icones usam um segundo path. */
  d: string;
  d2?: string;
  /** Quem enxerga. Ausente = todos os autenticados. */
  perfil?: "sane" | "admin";
}

export interface GrupoNav {
  /** Rotulo da secao. Vazio no primeiro grupo, que nao precisa de titulo. */
  titulo: string;
  itens: ItemNav[];
  /** Grupos de rodape ficam colados na base da barra (Ajuda, Administracao). */
  rodape?: boolean;
}

const ICONES = {
  painel:
    "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10",
  recibo:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  nota: "M9 14h6M9 10h6M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16l-3.5-2-3.5 2-3.5-2L5 21z",
  empenho:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 9v1m9-5a9 9 0 11-18 0 9 9 0 0118 0z",
  envelope:
    "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  ateste: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  grafico: "M3 3v18h18M7 16v-6m5 6V6m5 10v-4",
  ata: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6",
  sino: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1h6z",
  grupo: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  predio:
    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m6-14h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5",
  ajuda:
    "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  engrenagem:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  engrenagemMiolo: "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
} as const;

/** Mapa completo da navegacao, antes do filtro por papel. */
export const NAVEGACAO: GrupoNav[] = [
  {
    titulo: "",
    itens: [{ to: "/dashboard", label: "Dashboard", d: ICONES.painel }],
  },
  {
    titulo: "Lançar",
    itens: [
      { to: "/recibos", label: "Recibos", d: ICONES.recibo },
      { to: "/nfs", label: "Notas Fiscais", d: ICONES.nota },
      { to: "/empenhos", label: "Empenhos", d: ICONES.empenho },
    ],
  },
  {
    titulo: "Documentos",
    itens: [
      { to: "/solicitar-nf", label: "Solicitar NF", d: ICONES.envelope, perfil: "sane" },
      { to: "/ateste", label: "Ateste", d: ICONES.ateste, perfil: "sane" },
    ],
  },
  {
    titulo: "Análise",
    itens: [
      { to: "/consumo", label: "Consumo", d: ICONES.grafico, perfil: "sane" },
      { to: "/atas", label: "Atas", d: ICONES.ata, perfil: "sane" },
      { to: "/notificacoes", label: "Notificações", d: ICONES.sino, perfil: "sane" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { to: "/grupos", label: "Grupos", d: ICONES.grupo },
      { to: "/fornecedores", label: "Fornecedores", d: ICONES.predio, perfil: "sane" },
    ],
  },
  {
    titulo: "",
    rodape: true,
    itens: [
      { to: "/ajuda", label: "Ajuda", d: ICONES.ajuda },
      {
        to: "/admin",
        label: "Administração",
        d: ICONES.engrenagem,
        d2: ICONES.engrenagemMiolo,
        perfil: "admin",
      },
    ],
  },
];

/**
 * Filtra a navegacao pelo papel do usuario, descartando grupos que ficaram
 * vazios — senao o campus veria o rotulo "Análise" sem nada embaixo.
 */
export function navegacaoPara(papel: Papel): GrupoNav[] {
  const ehSane = papel === "sane" || papel === "admin";
  const ehAdmin = papel === "admin";
  return NAVEGACAO.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => {
      if (i.perfil === "admin") return ehAdmin;
      if (i.perfil === "sane") return ehSane;
      return true;
    }),
  })).filter((g) => g.itens.length > 0);
}
