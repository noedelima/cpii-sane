// Lógica compartilhada de quarentena (soft-delete) para as listas de
// notas_fiscais, recibos e empenhos. Exclusão = marcar deleted_at (reversível
// por 30 dias); restauração = limpar deleted_at. As escritas vão pelo supabase
// (roteado pelo proxy /api/rest/* em produção) sob a RLS do usuário.
import { computed, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export type TabelaQuarentena = "notas_fiscais" | "recibos" | "empenhos";

export function useQuarentena(tabela: TabelaQuarentena) {
  const auth = useAuthStore();
  const selecionados = ref<Set<number>>(new Set<number>());
  const mostrarExcluidos = ref(false);
  const confirmando = ref(false);
  const processando = ref(false);
  const erro = ref<string | null>(null);

  const qtd = computed(() => selecionados.value.size);
  const podeGerenciar = computed(() => auth.isSane);

  function selecionado(id: number): boolean {
    return selecionados.value.has(id);
  }
  function toggle(id: number) {
    const s = new Set(selecionados.value);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    selecionados.value = s;
  }
  function definirTodos(ids: number[], on: boolean) {
    selecionados.value = on ? new Set(ids) : new Set<number>();
  }
  function limpar() {
    selecionados.value = new Set<number>();
  }
  function alternarModo() {
    mostrarExcluidos.value = !mostrarExcluidos.value;
    limpar();
  }

  async function excluir(): Promise<boolean> {
    if (!selecionados.value.size) return false;
    processando.value = true;
    erro.value = null;
    try {
      const patch = {
        deleted_at: new Date().toISOString(),
        deleted_by: auth.user?.id ?? null,
        deleted_by_nome: auth.perfil?.nome ?? auth.user?.email ?? null,
      };
      const { error } = await supabase.from(tabela).update(patch).in("id", [...selecionados.value]);
      if (error) throw new Error(error.message);
      limpar();
      confirmando.value = false;
      return true;
    } catch (e) {
      erro.value = e instanceof Error ? e.message : "Falha ao excluir.";
      return false;
    } finally {
      processando.value = false;
    }
  }

  async function restaurar(): Promise<boolean> {
    if (!selecionados.value.size) return false;
    processando.value = true;
    erro.value = null;
    try {
      const { error } = await supabase
        .from(tabela)
        .update({ deleted_at: null, deleted_by: null, deleted_by_nome: null })
        .in("id", [...selecionados.value]);
      if (error) throw new Error(error.message);
      limpar();
      return true;
    } catch (e) {
      erro.value = e instanceof Error ? e.message : "Falha ao restaurar.";
      return false;
    } finally {
      processando.value = false;
    }
  }

  // Dias restantes até o expurgo definitivo (30 dias após a exclusão).
  function diasRestantes(deletedAt: string | null | undefined): number {
    if (!deletedAt) return 30;
    const ms = new Date(deletedAt).getTime() + 30 * 864e5 - Date.now();
    return Math.max(0, Math.ceil(ms / 864e5));
  }

  return {
    selecionados,
    mostrarExcluidos,
    confirmando,
    processando,
    erro,
    qtd,
    podeGerenciar,
    selecionado,
    toggle,
    definirTodos,
    limpar,
    alternarModo,
    excluir,
    restaurar,
    diasRestantes,
  };
}
