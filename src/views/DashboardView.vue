<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { fmtMoney } from "@/lib/format";
import type { VwGrupoResumo } from "@/types/database";

const resumo = ref<VwGrupoResumo[]>([]);
const recibosPendentes = ref(0);
const nfsPendentes = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  const [g, r, n] = await Promise.all([
    supabase.from("vw_grupo_resumo").select("*").order("numero_arabico"),
    supabase
      .from("recibos")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase
      .from("notas_fiscais")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
  ]);
  if (g.error) error.value = g.error.message;
  resumo.value = (g.data as VwGrupoResumo[] | null) ?? [];
  recibosPendentes.value = r.count ?? 0;
  nfsPendentes.value = n.count ?? 0;
  loading.value = false;
}

const kpi = computed(() => {
  const t = { alocado: 0, utilizado: 0, saldo: 0, nfs: 0 };
  for (const g of resumo.value) {
    t.alocado += Number(g.alocado);
    t.utilizado += Number(g.utilizado);
    t.saldo += Number(g.saldo);
    t.nfs += Number(g.qtd_nfs);
  }
  return t;
});

function pctUso(g: VwGrupoResumo): number {
  const a = Number(g.alocado);
  if (a <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(g.utilizado) / a) * 100));
}

function corBarra(p: number): string {
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-amber-500";
  return "bg-cpii-600 dark:bg-cpii-400";
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
    <h1 class="text-2xl font-semibold mb-6">Dashboard</h1>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>

    <div v-if="loading" class="card p-10 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total alocado</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ fmtMoney(kpi.alocado) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Utilizado</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ fmtMoney(kpi.utilizado) }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {{ kpi.alocado > 0 ? ((kpi.utilizado / kpi.alocado) * 100).toFixed(1) : "0,0" }}% do alocado
          </p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo</p>
          <p class="text-xl font-semibold tabular-nums mt-1" :class="kpi.saldo < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-300'">
            {{ fmtMoney(kpi.saldo) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">NFs lançadas</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ kpi.nfs }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {{ nfsPendentes }} NFs e {{ recibosPendentes }} recibos pendentes
          </p>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <div class="px-4 pt-4 pb-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Execução por grupo</h2>
        </div>
        <table class="w-full text-sm min-w-[56rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-4 py-2 text-left">Grupo</th>
              <th class="px-4 py-2 text-left w-64">Utilização</th>
              <th class="px-4 py-2 text-right">Alocado</th>
              <th class="px-4 py-2 text-right">Utilizado</th>
              <th class="px-4 py-2 text-right">Saldo</th>
              <th class="px-4 py-2 text-right">NFs</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="g in resumo" :key="g.grupo_id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-4 py-2.5">
                <span class="font-medium">{{ g.nome }}</span>
                <span
                  v-if="g.status !== 'vigente'"
                  class="ml-2 text-xs text-slate-500 dark:text-slate-400 capitalize"
                >({{ g.status }})</span>
              </td>
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="corBarra(pctUso(g))"
                      :style="{ width: pctUso(g) + '%' }"
                    ></div>
                  </div>
                  <span class="text-xs tabular-nums text-slate-600 dark:text-slate-300 w-12 text-right">
                    {{ pctUso(g).toFixed(1) }}%
                  </span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ fmtMoney(g.alocado) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ fmtMoney(g.utilizado) }}</td>
              <td
                class="px-4 py-2.5 text-right tabular-nums font-medium"
                :class="Number(g.saldo) < 0 ? 'text-red-600 dark:text-red-400' : ''"
              >{{ fmtMoney(g.saldo) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ g.qtd_nfs }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
