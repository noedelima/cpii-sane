<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtMoney } from "@/lib/format";

interface AtaResumo {
  ata: string;
  qtd_grupos: number;
  grupos: string | null;
  fornecedores: string | null;
  pregoes: string | null;
  contratos: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  tem_grupo_vigente: boolean;
}
interface AtaEmpenho {
  ata: string;
  empenho_id: number;
  numero: string;
  data_emissao: string;
  status: string;
  valor_inicial: number;
  reforco: number;
  valor_liquido: number;
  utilizado: number;
  saldo: number;
}
interface AtaItem {
  ata: string;
  item_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  item_status: string;
  grupo: string | null;
  quantidade_ata: number;
  qtd_empenhada: number;
  qtd_consumida: number;
  saldo_ata: number;
  a_empenhar: number;
  saldo_empenhado: number;
  pct_consumido: number | null;
}

const resumos = ref<AtaResumo[]>([]);
const empenhos = ref<AtaEmpenho[]>([]);
const itens = ref<AtaItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const ataSel = ref<string | null>(null);
const busca = ref("");
const soAtivos = ref(true);

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [r, e, i] = await Promise.all([
      supabase.from("vw_ata_resumo").select("*").order("ata"),
      supabase.from("vw_ata_empenho").select("*").order("data_emissao"),
      supabase.from("vw_ata_item").select("*").order("descricao"),
    ]);
    if (r.error) throw r.error;
    if (e.error) throw e.error;
    if (i.error) throw i.error;

    resumos.value = ((r.data as Record<string, unknown>[] | null) ?? []).map((x) => ({
      ata: String(x.ata ?? ""),
      qtd_grupos: num(x.qtd_grupos),
      grupos: (x.grupos as string | null) ?? null,
      fornecedores: (x.fornecedores as string | null) ?? null,
      pregoes: (x.pregoes as string | null) ?? null,
      contratos: (x.contratos as string | null) ?? null,
      vigencia_inicio: (x.vigencia_inicio as string | null) ?? null,
      vigencia_fim: (x.vigencia_fim as string | null) ?? null,
      tem_grupo_vigente: Boolean(x.tem_grupo_vigente),
    }));
    empenhos.value = ((e.data as Record<string, unknown>[] | null) ?? []).map((x) => ({
      ata: String(x.ata ?? ""),
      empenho_id: num(x.empenho_id),
      numero: String(x.numero ?? ""),
      data_emissao: String(x.data_emissao ?? ""),
      status: String(x.status ?? ""),
      valor_inicial: num(x.valor_inicial),
      reforco: num(x.reforco),
      valor_liquido: num(x.valor_liquido),
      utilizado: num(x.utilizado),
      saldo: num(x.saldo),
    }));
    itens.value = ((i.data as Record<string, unknown>[] | null) ?? []).map((x) => ({
      ata: String(x.ata ?? ""),
      item_id: num(x.item_id),
      descricao: String(x.descricao ?? ""),
      codigo_catmat: (x.codigo_catmat as string | null) ?? null,
      unidade: String(x.unidade ?? ""),
      item_status: String(x.item_status ?? ""),
      grupo: (x.grupo as string | null) ?? null,
      quantidade_ata: num(x.quantidade_ata),
      qtd_empenhada: num(x.qtd_empenhada),
      qtd_consumida: num(x.qtd_consumida),
      saldo_ata: num(x.saldo_ata),
      a_empenhar: num(x.a_empenhar),
      saldo_empenhado: num(x.saldo_empenhado),
      pct_consumido: x.pct_consumido == null ? null : Number(x.pct_consumido),
    }));

    if (!ataSel.value && resumos.value.length) ataSel.value = resumos.value[0].ata;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error.value = /vw_ata_|does not exist|relation|schema cache/i.test(msg)
      ? "As views de atas ainda não existem no banco. Rode a seção 31 do schema.sql no SQL Editor do Supabase e recarregue."
      : msg;
  } finally {
    loading.value = false;
  }
}

const ataAtual = computed(() => resumos.value.find((r) => r.ata === ataSel.value) ?? null);
const empenhosDaAta = computed(() => empenhos.value.filter((e) => e.ata === ataSel.value));

const itensDaAta = computed(() => {
  const t = busca.value.trim().toLowerCase();
  return itens.value
    .filter((i) => i.ata === ataSel.value)
    .filter((i) => (soAtivos.value ? i.item_status === "ativo" : true))
    .filter((i) =>
      !t ? true : i.descricao.toLowerCase().includes(t) || (i.codigo_catmat ?? "").includes(t)
    )
    .sort((a, b) => (b.pct_consumido ?? -1) - (a.pct_consumido ?? -1));
});

const totaisEmpenho = computed(() => {
  let liquido = 0;
  let utilizado = 0;
  let reforco = 0;
  for (const e of empenhosDaAta.value) {
    liquido += e.valor_liquido;
    utilizado += e.utilizado;
    reforco += e.reforco;
  }
  return { liquido, utilizado, reforco, saldo: liquido - utilizado };
});

const alertas = computed(() => {
  let esgotando = 0;
  let semEmpenho = 0;
  for (const i of itensDaAta.value) {
    if (i.quantidade_ata > 0 && (i.pct_consumido ?? 0) >= 85) esgotando++;
    if (i.qtd_empenhada <= 0 && i.quantidade_ata > 0) semEmpenho++;
  }
  return { esgotando, semEmpenho };
});

function corPct(p: number | null): string {
  if (p == null) return "text-slate-400";
  if (p >= 100) return "text-red-600 dark:text-red-400 font-semibold";
  if (p >= 85) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-slate-600 dark:text-slate-300";
}

function exportarCsv() {
  const linhas = [
    ["Ata", "Grupo", "CatMat", "Item", "Un.", "Qtd ata", "Empenhado", "Consumido", "Saldo da ata", "A empenhar", "% consumido"],
    ...itensDaAta.value.map((i) => [
      i.ata,
      i.grupo ?? "",
      i.codigo_catmat ?? "",
      i.descricao,
      i.unidade,
      String(i.quantidade_ata),
      String(i.qtd_empenhada),
      String(i.qtd_consumida),
      String(i.saldo_ata),
      String(i.a_empenhar),
      i.pct_consumido == null ? "" : String(i.pct_consumido),
    ]),
  ];
  const csv = linhas
    .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ata-${(ataSel.value ?? "").replace(/[^\w.-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-[80rem] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Atas</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
          Controle de cada ata: os empenhos emitidos e reforçados e, por item, quanto foi
          empenhado, quanto já foi consumido e quanto ainda resta de saldo.
        </p>
      </div>
      <button v-if="itensDaAta.length" class="btn-secondary shrink-0" @click="exportarCsv">
        Exportar CSV
      </button>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else-if="resumos.length">
      <!-- Seleção da ata -->
      <div class="card p-4 flex flex-wrap items-end gap-4">
        <div>
          <label class="label">Ata</label>
          <select v-model="ataSel" class="input w-72">
            <option v-for="r in resumos" :key="r.ata" :value="r.ata">
              {{ r.ata }} ({{ r.qtd_grupos }} grupo{{ r.qtd_grupos > 1 ? "s" : "" }})
            </option>
          </select>
        </div>
        <div class="grow max-w-xs">
          <label class="label">Buscar item</label>
          <input v-model="busca" type="search" class="input" placeholder="Descrição ou CatMat…" />
        </div>
        <label class="flex items-center gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
          <input v-model="soAtivos" type="checkbox" class="accent-cpii-600" />
          Somente itens ativos
        </label>
      </div>

      <!-- Cabeçalho da ata -->
      <div v-if="ataAtual" class="card p-5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">
            {{ ataAtual.ata }}
            <span
              v-if="!ataAtual.tem_grupo_vigente"
              class="ml-2 rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[11px] uppercase text-slate-500 dark:text-slate-300"
            >sem grupo vigente</span>
          </h2>
          <span class="text-sm text-slate-500 dark:text-slate-400">
            Vigência: {{ ataAtual.vigencia_inicio ? fmtDate(ataAtual.vigencia_inicio) : "—" }}
            a {{ ataAtual.vigencia_fim ? fmtDate(ataAtual.vigencia_fim) : "—" }}
          </span>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div class="text-xs uppercase text-slate-400">Grupos</div>
            <div class="text-slate-700 dark:text-slate-200">{{ ataAtual.grupos ?? "—" }}</div>
          </div>
          <div>
            <div class="text-xs uppercase text-slate-400">Fornecedor(es)</div>
            <div class="text-slate-700 dark:text-slate-200">{{ ataAtual.fornecedores ?? "—" }}</div>
          </div>
          <div>
            <div class="text-xs uppercase text-slate-400">Pregão</div>
            <div class="text-slate-700 dark:text-slate-200">{{ ataAtual.pregoes ?? "—" }}</div>
          </div>
          <div>
            <div class="text-xs uppercase text-slate-400">Contrato (TC)</div>
            <div class="text-slate-700 dark:text-slate-200">{{ ataAtual.contratos ?? "—" }}</div>
          </div>
        </div>
      </div>

      <!-- Empenhos da ata -->
      <div class="card overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">
            Empenhos da ata ({{ empenhosDaAta.length }})
          </h2>
          <span class="text-sm text-slate-600 dark:text-slate-300">
            Empenhado: <strong class="tabular-nums">{{ fmtMoney(totaisEmpenho.liquido) }}</strong>
            <span v-if="totaisEmpenho.reforco > 0"> · reforços {{ fmtMoney(totaisEmpenho.reforco) }}</span>
            · Utilizado: <strong class="tabular-nums">{{ fmtMoney(totaisEmpenho.utilizado) }}</strong>
            · Saldo:
            <strong
              class="tabular-nums"
              :class="totaisEmpenho.saldo <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-300'"
            >{{ fmtMoney(totaisEmpenho.saldo) }}</strong>
          </span>
        </div>
        <div v-if="!empenhosDaAta.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
          Nenhum empenho vinculado aos grupos desta ata ainda.
        </div>
        <table v-else class="w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-4 py-2 text-left">Nº</th>
              <th class="px-4 py-2 text-left">Emissão</th>
              <th class="px-4 py-2 text-right">Inicial</th>
              <th class="px-4 py-2 text-right">Reforço</th>
              <th class="px-4 py-2 text-right">Líquido</th>
              <th class="px-4 py-2 text-right">Utilizado</th>
              <th class="px-4 py-2 text-right">Saldo</th>
              <th class="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="e in empenhosDaAta" :key="e.empenho_id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-4 py-2 font-medium">
                <RouterLink :to="`/empenhos/${e.empenho_id}`" class="text-cpii-600 dark:text-cpii-300 hover:underline">
                  {{ e.numero }}
                </RouterLink>
              </td>
              <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(e.data_emissao) }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(e.valor_inicial) }}</td>
              <td class="px-4 py-2 text-right tabular-nums">
                {{ e.reforco > 0 ? fmtMoney(e.reforco) : "—" }}
              </td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(e.valor_liquido) }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(e.utilizado) }}</td>
              <td
                class="px-4 py-2 text-right tabular-nums font-medium"
                :class="e.saldo <= 0 ? 'text-red-600 dark:text-red-400' : ''"
              >{{ fmtMoney(e.saldo) }}</td>
              <td class="px-4 py-2 capitalize">{{ e.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Saldo por item -->
      <div
        v-if="alertas.esgotando || alertas.semEmpenho"
        class="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200 flex flex-wrap gap-x-6 gap-y-1"
      >
        <span v-if="alertas.esgotando"><strong>{{ alertas.esgotando }}</strong> item(ns) com 85% ou mais da ata consumido</span>
        <span v-if="alertas.semEmpenho"><strong>{{ alertas.semEmpenho }}</strong> item(ns) da ata ainda sem empenho</span>
      </div>

      <div class="card overflow-x-auto">
        <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">
            Saldo por item ({{ itensDaAta.length }})
          </h2>
        </div>
        <div v-if="!itensDaAta.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
          Nenhum item para os filtros atuais.
        </div>
        <table v-else class="w-full text-sm min-w-[56rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Item</th>
              <th class="px-3 py-2 text-left">Grupo</th>
              <th class="px-3 py-2 text-right">Qtd da ata</th>
              <th class="px-3 py-2 text-right">Empenhado</th>
              <th class="px-3 py-2 text-right">Consumido</th>
              <th class="px-3 py-2 text-right">Saldo da ata</th>
              <th class="px-3 py-2 text-right">A empenhar</th>
              <th class="px-3 py-2 text-right">% consumido</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="i in itensDaAta" :key="i.item_id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-3 py-2 min-w-[14rem]">
                <div class="truncate max-w-[18rem]" :title="i.descricao">{{ i.descricao }}</div>
                <div class="text-xs text-slate-400">{{ i.codigo_catmat ?? "—" }} · {{ i.unidade }}</div>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">{{ i.grupo ?? "—" }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ fmtQtd(i.quantidade_ata) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ fmtQtd(i.qtd_empenhada) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ fmtQtd(i.qtd_consumida) }}</td>
              <td
                class="px-3 py-2 text-right tabular-nums font-medium"
                :class="i.saldo_ata <= 0 ? 'text-red-600 dark:text-red-400' : ''"
              >{{ fmtQtd(i.saldo_ata) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ fmtQtd(i.a_empenhar) }}</td>
              <td class="px-3 py-2 text-right tabular-nums" :class="corPct(i.pct_consumido)">
                {{ i.pct_consumido == null ? "—" : i.pct_consumido + "%" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p>
          <strong>Empenhado</strong> = quantidades dos itens nas notas de empenho ativas dos grupos desta ata
          (inclui reforços). <strong>Consumido</strong> = o maior entre o recebido nos recibos e o faturado
          nas NFs — mesma regra do Dashboard e da Estimativa.
        </p>
        <p>
          <strong>Saldo da ata</strong> = quantidade da ata − consumido. <strong>A empenhar</strong> =
          quantidade da ata − empenhado, ou seja, o que ainda pode virar empenho ou reforço.
        </p>
      </div>
    </template>

    <div v-else-if="!error" class="card p-6 text-center text-slate-500 dark:text-slate-400">
      Nenhuma ata encontrada. Cadastre o número da ata nos grupos (Grupos → abrir o grupo).
    </div>
  </div>
</template>
