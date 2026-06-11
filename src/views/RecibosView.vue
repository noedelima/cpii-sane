<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import type { Recibo } from "@/types/database";

type ReciboRow = Recibo & {
  campi?: { nome: string } | null;
  grupos?: { nome: string } | null;
};

const recibos = ref<ReciboRow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  const { data, error: err } = await supabase
    .from("recibos")
    .select("*, campi (nome), grupos (nome)")
    .order("data_recebimento", { ascending: false })
    .limit(50);
  if (err) error.value = err.message;
  recibos.value = (data as ReciboRow[] | null) ?? [];
  loading.value = false;
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">Recibos</h1>
      <RouterLink to="/recibos/novo" class="btn-primary">+ Novo recibo</RouterLink>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!recibos.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum recibo cadastrado ainda.
        <RouterLink to="/recibos/novo" class="text-cpii-600 dark:text-cpii-300 hover:underline">Criar o primeiro</RouterLink>.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-4 py-2 text-left">Nº</th>
            <th class="px-4 py-2 text-left">Data</th>
            <th class="px-4 py-2 text-left">Campus</th>
            <th class="px-4 py-2 text-left">Grupo</th>
            <th class="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="r in recibos" :key="r.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
            <td class="px-4 py-2 font-medium">
              <RouterLink :to="`/recibos/${r.id}`" class="text-cpii-600 dark:text-cpii-300 hover:underline">
                {{ r.numero }}
              </RouterLink>
            </td>
            <td class="px-4 py-2">{{ r.data_recebimento }}</td>
            <td class="px-4 py-2">{{ r.campi?.nome ?? "—" }}</td>
            <td class="px-4 py-2">{{ r.grupos?.nome ?? "—" }}</td>
            <td class="px-4 py-2 capitalize">{{ r.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
