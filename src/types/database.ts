// Tipos do schema Supabase.
// Versão MVP — para regenerar com `npx supabase gen types typescript --project-id <ref>`
// quando quiser inferência completa.

export type StatusDoc =
  | "rascunho"
  | "pendente"
  | "confirmado"
  | "pago"
  | "glosado"
  | "cancelado";

export type StatusAtivo = "ativo" | "inativo";
export type StatusGrupo = "vigente" | "encerrado" | "suspenso";
export type StatusEmpenho = "ativo" | "esgotado" | "cancelado" | "anulado";
export type StatusItem = "ativo" | "inativo" | "cancelado";

export interface Campus {
  id: number;
  nome: string;
  sigla: string;
  codigo: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  status: StatusAtivo;
  created_at: string;
  updated_at: string;
}

export interface Fornecedor {
  id: number;
  codigo: string;
  razao_social: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  status: StatusAtivo;
  created_at: string;
  updated_at: string;
}

export interface Grupo {
  id: number;
  nome: string;
  numero_arabico: number;
  numero_romano: string;
  categoria: string;
  fornecedor_id: number | null;
  numero_ata: string | null;
  numero_tc: string | null;
  numero_pregao: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  status: StatusGrupo;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: number;
  grupo_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  preco_unitario: number;
  quantidade_ata: number;
  status: StatusItem;
  created_at: string;
  updated_at: string;
}

export interface Empenho {
  id: number;
  numero: string;
  data_emissao: string;
  fornecedor_id: number | null;
  valor_inicial: number;
  reforco: number;
  cancelamento: number;
  anulacao: number;
  processo_suap: string | null;
  link_pdf: string | null;
  status: StatusEmpenho;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

/** Histórico de preços do item (reajustes contratuais/apostilamentos). */
export interface ItemPreco {
  id: number;
  item_id: number;
  preco_unitario: number;
  vigencia_inicio: string;
  referencia: string | null;
  created_at: string;
}

/** Item/quantidade vinculado a um empenho (detalhe físico da NE). */
export interface EmpenhoItem {
  id: number;
  empenho_id: number;
  item_id: number;
  quantidade: number;
  valor_unitario: number | null;
  observacoes: string | null;
}

export interface Recibo {
  id: number;
  numero: string;
  data_recebimento: string;
  campus_id: number;
  grupo_id: number;
  fornecedor_id: number | null;
  nf_id: number | null;
  link_pdf: string | null;
  caminho_onedrive: string | null;
  observacoes: string | null;
  status: StatusDoc;
  responsavel_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReciboItem {
  id: number;
  recibo_id: number;
  item_id: number;
  quantidade: number;
  unidade: string | null;
  observacoes: string | null;
}

export interface NotaFiscal {
  id: number;
  numero: string;
  data_emissao: string | null;
  data_entrega: string;
  grupo_id: number;
  fornecedor_id: number | null;
  campus_id: number | null;
  recibo_id: number | null;
  valor_total: number | null;
  processo_pagamento: string | null;
  data_abertura_processo: string | null;
  link_pdf: string | null;
  link_instrumento_cobranca: string | null;
  caminho_onedrive: string | null;
  ocorrencias: string | null;
  avaliacao_pontualidade: string | null;
  avaliacao_qualidade: string | null;
  avaliacao_conformidade: string | null;
  observacoes: string | null;
  status: StatusDoc;
  created_at: string;
  updated_at: string;
}

/** Rateio financeiro da NF entre empenhos — fonte de verdade do débito orçamentário. */
export interface NFEmpenho {
  id: number;
  nf_id: number;
  empenho_id: number;
  valor_debitado: number;
  observacoes: string | null;
}

export interface NFItem {
  id: number;
  nf_id: number;
  item_id: number;
  empenho_id: number | null;
  quantidade: number;
  valor_unitario: number | null;
  observacoes: string | null;
}

export type Papel = "campus" | "sane" | "admin" | "outros";

/** Ateste de recebimento gerado pela SANE (PDF para o processo no SUAP). */
export interface Ateste {
  id: number;
  fornecedor_id: number;
  processo_suap: string | null;
  local_emissao: string;
  data_emissao: string;
  observacoes: string | null;
  valor_total: number;
  qtd_nfs: number;
  gerado_por: string | null;
  gerado_por_nome: string | null;
  gerado_por_matricula: string | null;
  created_at: string;
}

export interface AtesteNF {
  id: number;
  ateste_id: number;
  nf_id: number;
}

export interface Perfil {
  id: string;
  nome: string;
  email: string | null;
  matricula_siape: string | null;
  papel: Papel;
  campus_id: number | null;
  created_at: string;
  updated_at: string;
}

/** View vw_empenho_saldos — saldo calculado por empenho. */
export interface VwEmpenhoSaldo {
  id: number;
  numero: string;
  data_emissao: string;
  fornecedor_id: number | null;
  status: StatusEmpenho;
  observacoes: string | null;
  fornecedor: string | null;
  valor_liquido: number;
  utilizado: number;
  saldo: number;
}

/** View vw_grupo_resumo — alocação x utilização por grupo. */
export interface VwGrupoResumo {
  grupo_id: number;
  nome: string;
  numero_arabico: number;
  numero_romano: string;
  categoria: string;
  status: StatusGrupo;
  fornecedor: string | null;
  alocado: number;
  utilizado: number;
  saldo: number;
  qtd_nfs: number;
}

/** Grupo vinculado a uma NF (N:N — NF com dois ou mais grupos). */
export interface NFGrupo {
  id: number;
  nf_id: number;
  grupo_id: number;
}

/** Recibo vinculado a uma NF (N:N — vínculo livre dentro do grupo). */
export interface NFRecibo {
  id: number;
  nf_id: number;
  recibo_id: number;
}

export type StatusSolicitacaoNF = "aberta" | "enviada" | "atendida" | "cancelada";

/** Solicitação de emissão de NF (entrega por empresa → PDF de quantidades). */
export interface SolicitacaoNF {
  id: number;
  fornecedor_id: number;
  grupo_id: number | null;
  data_solicitacao: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  observacoes: string | null;
  status: StatusSolicitacaoNF;
  valor_estimado: number;
  qtd_recibos: number;
  gerado_por: string | null;
  gerado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolicitacaoNFRecibo {
  id: number;
  solicitacao_id: number;
  recibo_id: number;
}

/** View vw_empenho_item_saldos — saldo por item de cada empenho (qtd e R$). */
export interface VwEmpenhoItemSaldo {
  empenho_id: number;
  empenho_numero: string;
  data_emissao: string;
  fornecedor_id: number | null;
  empenho_status: StatusEmpenho;
  item_id: number;
  grupo_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  qtd_empenhada: number;
  valor_unitario_ne: number;
  preco_vigente: number;
  consumido_qtd: number;
  consumido_valor: number;
  valor_inicial: number;
  saldo_valor: number;
  saldo_qtd: number | null;
}
