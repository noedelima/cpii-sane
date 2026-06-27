<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { api, USE_API } from "@/lib/api";

type Row = Record<string, unknown>;
const dados = ref<Row[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const grupoSel = ref<string>("");
const margem = ref<number>(10);

const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

async function load() {
  loading.value = true;
  error.value = null;
  try {
    if (USE_API) {
      const r = await api.estimativa();
      dados.value = r.data ?? [];
    } else {
      const r = await supabase
        .from("vw_estimativa_ata")
        .select("item_id,descricao,grupo,grupo_nome,unidade,quantidade_ata,consumido_melhor,meses_ref,estimativa_anual,pct_anual_vs_ata")
        .order("grupo")
        .order("descricao");
      if (r.error) throw new Error(r.error.message);
      dados.value = (r.data as Row[]) ?? [];
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao carregar a estimativa.";
  } finally {
    loading.value = false;
  }
}

const grupos = computed(() => {
  const m = new Map<string, string>();
  for (const d of dados.value) m.set(String(d.grupo), String(d.grupo_nome ?? d.grupo));
  return [...m.entries()].map(([romano, nome]) => ({ romano, nome }));
});
const mesesRef = computed(() => (dados.value.length ? num(dados.value[0].meses_ref) : 0));

const linhas = computed(() => {
  const fator = 1 + margem.value / 100;
  return dados.value
    .filter((d) => !grupoSel.value || String(d.grupo) === grupoSel.value)
    .map((d) => {
      const est = num(d.estimativa_anual);
      return {
        item_id: d.item_id,
        descricao: String(d.descricao),
        grupo: String(d.grupo),
        unidade: String(d.unidade ?? ""),
        ata: num(d.quantidade_ata),
        consumido: num(d.consumido_melhor),
        estimativa: est,
        sugerida: Math.ceil(est * fator),
        pct: d.pct_anual_vs_ata == null ? null : num(d.pct_anual_vs_ata),
      };
    });
});

const qtd = (v: number, dec = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

function corPct(p: number | null): string {
  if (p == null) return "text-slate-400";
  if (p >= 90) return "text-red-600 dark:text-red-400";
  if (p >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-cpii-700 dark:text-cpii-300";
}

function baixarCsv() {
  const sep = ";";
  const head = ["Grupo", "Item", "Unidade", "Qtd ATA atual", "Consumido (periodo)", "Meses base", "Estimativa anual", "Qtd sugerida (+" + margem.value + "%)", "% anual vs ATA"];
  const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  const dec = (n: number) => String(n).replace(".", ",");
  const linhasCsv = linhas.value.map((l) =>
    [
      esc(l.grupo),
      esc(l.descricao),
      esc(l.unidade),
      dec(l.ata),
      dec(l.consumido),
      String(mesesRef.value),
      dec(l.estimativa),
      String(l.sugerida),
      l.pct == null ? "" : String(l.pct),
    ].join(sep)
  );
  const csv = "﻿" + [head.map(esc).join(sep), ...linhasCsv].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "estimativa-proxima-ata.csv";
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex items-center justify-between flex-wrap gap-3 mb-2">
      <h1 class="text-2xl font-semibold">Estimativa para a próxima ATA</h1>
      <RouterLink to="/dashboard" class="text-sm text-cpii-700 hover:underline dark:text-gold-300">← Voltar ao dashboard</RouterLink>
    </div>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-3xl">
      Consumo real anualizado por item, pronto para a tabela de quantidades do ETP/TR. Base: consumo "melhor"
      (maior cobertura entre recibos físicos e NFs faturadas) dividido pelo período de execução observado e
      projetado para 12 meses.
    </p>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>
    <div v-else-if="loading" class="card p-10 text-center text-slate-500 dark:text-slate-400">Calculando…</div>

    <template v-else>
      <!-- Controles -->
      <div class="card p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label class="label">Grupo</label>
          <select v-model="grupoSel" class="input min-w-[16rem]">
            <option value="">Todos os grupos</option>
            <option v-for="g in grupos" :key="g.romano" :value="g.romano">{{ g.nome }}</option>
          </select>
        </div>
        <div>
          <label class="label">Margem de segurança</label>
          <div class="flex items-center gap-2">
            <input v-model.number="margem" type="number" min="0" max="100" step="5" class="input w-24" />
            <span class="text-sm text-slate-500 dark:text-slate-400">%</span>
          </div>
        </div>
        <div class="flex-1"></div>
        <div class="text-sm text-slate-500 dark:text-slate-400">
          {{ linhas.length }} itens · base ~{{ mesesRef }} meses
        </div>
        <button class="btn-primary" @click="baixarCsv">Baixar CSV</button>
      </div>

      <!-- Tabela -->
      <div class="card overflow-x-auto">
        <table class="w-full text-sm min-w-[60rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Grupo</th>
              <th class="px-3 py-2 text-left">Item</th>
              <th class="px-3 py-2 text-left">Unid.</th>
              <th class="px-3 py-2 text-right">Qtd ATA atual</th>
              <th class="px-3 py-2 text-right">Consumido</th>
              <th class="px-3 py-2 text-right">Estimativa/ano</th>
              <th class="px-3 py-2 text-right">Qtd sugerida</th>
              <th class="px-3 py-2 text-right">% vs ATA</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="l in linhas" :key="String(l.item_id)" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-3 py-2 text-slate-500 dark:text-slate-400">{{ l.grupo }}</td>
              <td class="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{{ l.descricao }}</td>
              <td class="px-3 py-2 text-slate-500 dark:text-slate-400">{{ l.unidade }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ qtd(l.ata) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ qtd(l.consumido) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ qtd(l.estimativa) }}</td>
              <td class="px-3 py-2 text-right tabular-nums font-semibold text-cpii-700 dark:text-cpii-300">{{ qtd(l.sugerida) }}</td>
              <td class="px-3 py-2 text-right tabular-nums font-medium" :class="corPct(l.pct)">
                {{ l.pct == null ? "—" : l.pct + "%" }}
              </td>
            </tr>
            <tr v-if="!linhas.length">
              <td colspan="8" class="px-3 py-8 text-center text-slate-500 dark:text-slate-400">Sem itens para este filtro.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 mt-3 max-w-3xl">
        <strong>Como ler:</strong> "Estimativa/ano" projeta o consumo observado para 12 meses; "Qtd sugerida" aplica a
        margem de segurança sobre a estimativa. "% vs ATA" compara a estimativa anual com a quantidade hoje registrada —
        valores baixos sugerem superdimensionamento. Ajuste a base (~{{ mesesRef }} meses) ao seu juízo se o contrato
        tiver vigência diferente; o consumo do período de migração foi mantido. Use como ponto de partida, não como número final.
      </p>
    </template>
  </div>
</template>
