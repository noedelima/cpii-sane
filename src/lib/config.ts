// Configurações globais (tabela public.configuracoes), com cache em memória.
// Usado pela aba de Configurações (admin) e pelos geradores de PDF.
import { supabase } from "@/lib/supabase";
import { parseDiasSemana } from "@/lib/dias-semana";
import type { Configuracao } from "@/types/database";

let cache: Map<string, string> | null = null;

export async function carregarConfig(): Promise<Map<string, string>> {
  if (cache) return cache;
  const { data } = await supabase.from("configuracoes").select("chave, valor");
  cache = new Map(
    ((data as Pick<Configuracao, "chave" | "valor">[] | null) ?? []).map((c) => [
      c.chave,
      c.valor ?? "",
    ])
  );
  return cache;
}

/** Limpa o cache (chamar após editar configurações). */
export function recarregarConfig() {
  cache = null;
}

function pick(m: Map<string, string>, chave: string, fallback: string): string {
  const v = m.get(chave);
  return v && v.trim() ? v : fallback;
}

export interface CabecalhoPdf {
  orgao: string;
  setor1: string;
  setor2: string;
}

/** Cabeçalho institucional para os PDFs (com fallback aos valores padrão). */
export async function getCabecalho(): Promise<CabecalhoPdf> {
  const m = await carregarConfig();
  return {
    orgao: pick(m, "cabecalho_orgao", "COLÉGIO PEDRO II"),
    setor1: pick(m, "cabecalho_setor1", "Pró-Reitoria de Administração — PROAD"),
    setor2: pick(m, "cabecalho_setor2", "Seção de Alimentação e Nutrição — SANE"),
  };
}

export async function getLocalEmissao(): Promise<string> {
  const m = await carregarConfig();
  return pick(m, "local_emissao_padrao", "Rio de Janeiro");
}

/**
 * Dias da semana aceitos na data de recebimento do recibo (0=domingo).
 * A validacao de verdade e o gatilho valida_dia_recibo no banco; isto serve
 * para a tela avisar antes de o usuario tentar salvar.
 */
export async function getDiasRecibo(): Promise<number[]> {
  const m = await carregarConfig();
  return parseDiasSemana(m.get("recibo_dias_semana"));
}

/**
 * Prazo medio de tramitacao de um reforco de empenho, em dias corridos.
 * E o quanto o painel de reforcos se antecipa a data prevista de esgotamento.
 */
export async function getPrazoReforcoDias(): Promise<number> {
  const m = await carregarConfig();
  const n = Number(pick(m, "reforco_prazo_dias", "45"));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 45;
}
