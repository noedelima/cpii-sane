<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate } from "@/lib/format";
import type { Grupo } from "@/types/database";

type GrupoRow = Grupo & {
  fornecedores?: { codigo: string } | null;
  itens?: { count: number }[];
};

const auth = useAuthStore();
const grupos = ref<GrupoRow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  const { data, error: err } = await supabase
    .from("grupos")
    .select("*, fornecedores (codigo), itens (count)")
    .order("numero_arabico");
  if (err) error.value = err.message;
  grupos.value = (data as GrupoRow[] | null) ?? [];
  loading.value = false;
}

const statusClasse: Record<string, string> = {
  vigente: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
  encerrado: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  suspenso: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
};

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-semibold">Grupos de fornecimento</h1>
      <RouterLink v-if="auth.isSane" to="/grupos/novo" class="btn-primary">
        + Novo grupo
      </RouterLink>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>

    <div class="card overflow-x-auto">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!grupos.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum grupo cadastrado.
      </div>
      <table v-else class="w-full text-sm min-w-[56rem]">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-4 py-2 text-left">Grupo</th>
            <th class="px-4 py-2 text-left">Categoria</th>
            <th class="px-4 py-2 text-left">Fornecedor</th>
            <th class="px-4 py-2 text-left">Ata / TC</th>
            <th class="px-4 py-2 text-left">Vigência</th>
            <th class="px-4 py-2 text-right">Itens</th>
            <th class="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="g in grupos" :key="g.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
            <td class="px-4 py-2 font-medium">
              <RouterLink
                v-if="auth.isSane"
                :to="`/grupos/${g.id}`"
                class="text-cpii-600 dark:text-cpii-300 hover:underline"
              >{{ g.nome }}</RouterLink>
              <template v-else>{{ g.nome }}</template>
            </td>
            <td class="px-4 py-2">{{ g.categoria }}</td>
            <td class="px-4 py-2">{{ g.fornecedores?.codigo ?? "—" }}</td>
            <td class="px-4 py-2 text-slate-600 dark:text-slate-300">
              {{ [g.numero_ata, g.numero_tc].filter(Boolean).join(" / ") || "—" }}
            </td>
            <td class="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
              <template v-if="g.vigencia_inicio || g.vigencia_fim">
                {{ fmtDate(g.vigencia_inicio) }} – {{ fmtDate(g.vigencia_fim) }}
              </template>
              <template v-else>—</template>
            </td>
            <td class="px-4 py-2 text-right tabular-nums">{{ g.itens?.[0]?.count ?? 0 }}</td>
            <td class="px-4 py-2">
              <span
                class="inline-block rounded-full border px-2 py-0.5 text-xs capitalize"
                :class="statusClasse[g.status] ?? ''"
              >{{ g.status }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
