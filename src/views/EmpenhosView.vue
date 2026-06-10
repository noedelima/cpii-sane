<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { VwEmpenhoSaldo } from "@/types/database";

const auth = useAuthStore();
const empenhos = ref<VwEmpenhoSaldo[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const busca = ref("");
const statusFiltro = ref<string>("");

async function load() {
  loading.value = true;
  error.value = null;
  const { data, error: err } = await supabase
    .from("vw_empenho_saldos")
    .select("*")
    .order("data_emissao", { ascending: false })
    .order("numero");
  if (err) error.value = err.message;
  empenhos.value = (data as VwEmpenhoSaldo[] | null) ?? [];
  loading.value = false;
}

const filtrados = computed(() =>
  empenhos.value.filter((e) => {
    if (statusFiltro.value && e.status !== statusFiltro.value) return false;
    if (busca.value) {
      const q = busca.value.toLowerCase();
      if (!e.numero.toLowerCase().includes(q) && !(e.fornecedor ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  })
);

const totais = computed(() => {
  const t = { liquido: 0, utilizado: 0, saldo: 0 };
  for (const e of filtrados.value) {
    t.liquido += Number(e.valor_liquido);
    t.utilizado += Number(e.utilizado);
    t.saldo += Number(e.saldo);
  }
  return t;
});

const statusClasse: Record<string, string> = {
  ativo: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
  esgotado: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  cancelado: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  anulado: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-semibold">Empenhos</h1>
      <RouterLink v-if="auth.isSane" to="/empenhos/novo" class="btn-primary">
        + Novo empenho
      </RouterLink>
    </div>

    <div class="flex flex-wrap gap-3 mb-4">
      <input
        v-model="busca"
        type="search"
        placeholder="Buscar por número ou fornecedor…"
        class="input max-w-xs"
      />
      <select v-model="statusFiltro" class="input max-w-[12rem]">
        <option value="">Todos os status</option>
        <option value="ativo">Ativo</option>
        <option value="esgotado">Esgotado</option>
        <option value="cancelado">Cancelado</option>
        <option value="anulado">Anulado</option>
      </select>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>

    <div class="card overflow-x-auto">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!filtrados.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum empenho encontrado.
      </div>
      <table v-else class="w-full text-sm min-w-[52rem]">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-4 py-2 text-left">Número</th>
            <th class="px-4 py-2 text-left">Emissão</th>
            <th class="px-4 py-2 text-left">Fornecedor</th>
            <th class="px-4 py-2 text-right">Valor líquido</th>
            <th class="px-4 py-2 text-right">Utilizado</th>
            <th class="px-4 py-2 text-right">Saldo</th>
            <th class="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="e in filtrados" :key="e.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
            <td class="px-4 py-2 font-medium">
              <RouterLink
                v-if="auth.isSane"
                :to="`/empenhos/${e.id}`"
                class="text-cpii-600 dark:text-cpii-300 hover:underline"
              >{{ e.numero }}</RouterLink>
              <template v-else>{{ e.numero }}</template>
            </td>
            <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(e.data_emissao) }}</td>
            <td class="px-4 py-2">{{ e.fornecedor ?? "—" }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(e.valor_liquido) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(e.utilizado) }}</td>
            <td
              class="px-4 py-2 text-right tabular-nums font-medium"
              :class="Number(e.saldo) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'"
            >{{ fmtMoney(e.saldo) }}</td>
            <td class="px-4 py-2">
              <span
                class="inline-block rounded-full border px-2 py-0.5 text-xs capitalize"
                :class="statusClasse[e.status] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
              >{{ e.status }}</span>
            </td>
          </tr>
        </tbody>
        <tfoot class="bg-slate-50 dark:bg-slate-700/50 font-medium">
          <tr>
            <td class="px-4 py-2" colspan="3">Totais ({{ filtrados.length }} empenhos)</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(totais.liquido) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(totais.utilizado) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(totais.saldo) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
