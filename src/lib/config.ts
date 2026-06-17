// Configurações globais (tabela public.configuracoes), com cache em memória.
// Usado pela aba de Configurações (admin) e pelos geradores de PDF.
import { supabase } from "@/lib/supabase";
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
