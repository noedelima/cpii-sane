<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";

interface Ocorrencia {
  id: number;
  recibo_id: number;
  recibo_numero: string;
  data_recebimento: string;
  campus: string;
  grupo: string | null;
  fornecedor_id: number | null;
  fornecedor: string | null;
  fornecedor_nome: string | null;
  item_id: number;
  item: string;
  codigo_catmat: string | null;
  unidade: string;
  tipo: "nao_entregue" | "devolvido";
  quantidade: number;
  valor_estimado: number;
  observacoes: string | null;
  situacao: string;
  data_notificacao: string | null;
  referencia: string | null;
  created_by_nome: string | null;
  _saving?: boolean;
}

const auth = useAuthStore();

const linhas = ref<Ocorrencia[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const de = ref("");
const ate = ref("");
const fornecedorFiltro = ref<number | "">("");
const tipoFiltro = ref<string>("");
const situacaoFiltro = ref<string>("");
const busca = ref("");
const agruparPor = ref<"fornecedor" | "item">("fornecedor");

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const rotuloTipo = (t: string) => (t === "nao_entregue" ? "Não entregue" : "Devolvido");

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { data, error: err } = await supabase
      .from("vw_ocorrencias")
      .select("*")
      .order("data_recebimento", { ascending: false });
    if (err) throw err;
    linhas.value = ((data as Record<string, unknown>[] | null) ?? []).map((x) => ({
      id: num(x.id),
      recibo_id: num(x.recibo_id),
      recibo_numero: String(x.recibo_numero ?? ""),
      data_recebimento: String(x.data_recebimento ?? ""),
      campus: String(x.campus ?? ""),
      grupo: (x.grupo as string | null) ?? null,
      fornecedor_id: x.fornecedor_id == null ? null : num(x.fornecedor_id),
      fornecedor: (x.fornecedor as string | null) ?? null,
      fornecedor_nome: (x.fornecedor_nome as string | null) ?? null,
      item_id: num(x.item_id),
      item: String(x.item ?? ""),
      codigo_catmat: (x.codigo_catmat as string | null) ?? null,
      unidade: String(x.unidade ?? ""),
      tipo: (x.tipo as "nao_entregue" | "devolvido") ?? "nao_entregue",
      quantidade: num(x.quantidade),
      valor_estimado: num(x.valor_estimado),
      observacoes: (x.observacoes as string | null) ?? null,
      situacao: String(x.situacao ?? "registrada"),
      data_notificacao: (x.data_notificacao as string | null) ?? null,
      referencia: (x.referencia as string | null) ?? null,
      created_by_nome: (x.created_by_nome as string | null) ?? null,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = /vw_ocorrencias|does not exist|relation|schema cache/i.test(msg)
      ? "A estrutura de ocorrências ainda não existe no banco. Rode a seção 32 do schema.sql no SQL Editor do Supabase e recarregue."
      : msg;
  } finally {
    loading.value = false;
  }
}

const fornecedores = computed(() => {
  const m = new Map<number, string>();
  for (const l of linhas.value) {
    if (l.fornecedor_id != null) m.set(l.fornecedor_id, l.fornecedor ?? String(l.fornecedor_id));
  }
  return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
});

const filtradas = computed(() => {
  const t = busca.value.trim().toLowerCase();
  return linhas.value.filter((l) => {
    if (de.value && l.data_recebimento < de.value) return false;
    if (ate.value && l.data_recebimento > ate.value) return false;
    if (fornecedorFiltro.value !== "" && l.fornecedor_id !== fornecedorFiltro.value) return false;
    if (tipoFiltro.value && l.tipo !== tipoFiltro.value) return false;
    if (situacaoFiltro.value && l.situacao !== situacaoFiltro.value) return false;
    if (t && !l.item.toLowerCase().includes(t) && !(l.codigo_catmat ?? "").includes(t)) return false;
    return true;
  });
});

const totais = computed(() => {
  let naoEntregue = 0;
  let devolvido = 0;
  let valor = 0;
  let pendentes = 0;
  for (const l of filtradas.value) {
    if (l.tipo === "nao_entregue") naoEntregue++;
    else devolvido++;
    valor += l.valor_estimado;
    if (l.situacao === "registrada") pendentes++;
  }
  return { total: filtradas.value.length, naoEntregue, devolvido, valor, pendentes };
});

interface Agrupado {
  chave: string;
  rotulo: string;
  detalhe: string;
  ocorrencias: number;
  qtdNaoEntregue: number;
  qtdDevolvida: number;
  valor: number;
}

const agrupadas = computed<Agrupado[]>(() => {
  const m = new Map<string, Agrupado>();
  for (const l of filtradas.value) {
    const chave =
      agruparPor.value === "fornecedor"
        ? String(l.fornecedor_id ?? "sem")
        : String(l.item_id);
    let g = m.get(chave);
    if (!g) {
      g = {
        chave,
        rotulo:
          agruparPor.value === "fornecedor"
            ? l.fornecedor ?? "Sem fornecedor"
            : l.item,
        detalhe:
          agruparPor.value === "fornecedor"
            ? l.fornecedor_nome ?? ""
            : `${l.codigo_catmat ?? "—"} · ${l.unidade}`,
        ocorrencias: 0,
        qtdNaoEntregue: 0,
        qtdDevolvida: 0,
        valor: 0,
      };
      m.set(chave, g);
    }
    g.ocorrencias++;
    if (l.tipo === "nao_entregue") g.qtdNaoEntregue += l.quantidade;
    else g.qtdDevolvida += l.quantidade;
    g.valor += l.valor_estimado;
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
});

async function salvarAcompanhamento(l: Ocorrencia) {
  if (!auth.isSane) return;
  l._saving = true;
  error.value = null;
  const { error: err } = await supabase
    .from("recibos_ocorrencias")
    .update({
      situacao: l.situacao,
      data_notificacao: l.data_notificacao || null,
      referencia: l.referencia?.trim() || null,
    })
    .eq("id", l.id);
  l._saving = false;
  if (err) error.value = err.message;
}

const situacaoClasse: Record<string, string> = {
  registrada: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  notificada: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  respondida: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  arquivada: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
};

function exportarCsv() {
  const linhasCsv = [
    ["Data", "Recibo", "Campus", "Grupo", "Fornecedor", "CatMat", "Item", "Un.", "Ocorrência", "Quantidade", "Valor estimado", "Observação", "Situação", "Notificado em", "Referência"],
    ...filtradas.value.map((l) => [
      l.data_recebimento,
      l.recibo_numero,
      l.campus,
      l.grupo ?? "",
      l.fornecedor ?? "",
      l.codigo_catmat ?? "",
      l.item,
      l.unidade,
      rotuloTipo(l.tipo),
      String(l.quantidade),
      String(l.valor_estimado),
      l.observacoes ?? "",
      l.situacao,
      l.data_notificacao ?? "",
      l.referencia ?? "",
    ]),
  ];
  const csv = linhasCsv
    .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "notificacoes.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function limparFiltros() {
  de.value = "";
  ate.value = "";
  fornecedorFiltro.value = "";
  tipoFiltro.value = "";
  situacaoFiltro.value = "";
  busca.value = "";
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-[80rem] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Notificações</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
          Faltas e devoluções registradas pelos campi nos recibos, consolidadas por fornecedor e
          por item — base para notificar a empresa e instruir relatórios de penalidade ou rescisão.
        </p>
      </div>
      <button v-if="filtradas.length" class="btn-secondary shrink-0" @click="exportarCsv">
        Exportar CSV
      </button>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <!-- Filtros -->
    <div class="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="label">De</label>
        <input v-model="de" type="date" class="input" />
      </div>
      <div>
        <label class="label">Até</label>
        <input v-model="ate" type="date" class="input" />
      </div>
      <div>
        <label class="label">Fornecedor</label>
        <select v-model="fornecedorFiltro" class="input w-48">
          <option value="">Todos</option>
          <option v-for="f in fornecedores" :key="f.id" :value="f.id">{{ f.nome }}</option>
        </select>
      </div>
      <div>
        <label class="label">Ocorrência</label>
        <select v-model="tipoFiltro" class="input w-48">
          <option value="">Todas</option>
          <option value="nao_entregue">Não entregue</option>
          <option value="devolvido">Devolvido</option>
        </select>
      </div>
      <div>
        <label class="label">Situação</label>
        <select v-model="situacaoFiltro" class="input w-40">
          <option value="">Todas</option>
          <option value="registrada">Registrada</option>
          <option value="notificada">Notificada</option>
          <option value="respondida">Respondida</option>
          <option value="arquivada">Arquivada</option>
        </select>
      </div>
      <div class="grow max-w-xs">
        <label class="label">Item</label>
        <input v-model="busca" type="search" class="input" placeholder="Descrição ou CatMat…" />
      </div>
      <button class="btn-ghost text-sm pb-2" @click="limparFiltros">Limpar</button>
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <!-- Totais -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="card p-4">
          <div class="text-xs uppercase text-slate-400">Ocorrências</div>
          <div class="text-2xl font-semibold">{{ totais.total }}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs uppercase text-slate-400">Não entregues</div>
          <div class="text-2xl font-semibold text-red-600 dark:text-red-400">{{ totais.naoEntregue }}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs uppercase text-slate-400">Devoluções</div>
          <div class="text-2xl font-semibold text-amber-600 dark:text-amber-400">{{ totais.devolvido }}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs uppercase text-slate-400">Valor estimado</div>
          <div class="text-2xl font-semibold tabular-nums">{{ fmtMoney(totais.valor) }}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs uppercase text-slate-400">Ainda sem notificar</div>
          <div class="text-2xl font-semibold">{{ totais.pendentes }}</div>
        </div>
      </div>

      <!-- Consolidado -->
      <div class="card overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Consolidado</h2>
          <div class="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
            <button
              type="button"
              class="px-3 py-1.5 text-sm"
              :class="agruparPor === 'fornecedor' ? 'bg-cpii-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              @click="agruparPor = 'fornecedor'"
            >Por fornecedor</button>
            <button
              type="button"
              class="px-3 py-1.5 text-sm border-l border-slate-300 dark:border-slate-600"
              :class="agruparPor === 'item' ? 'bg-cpii-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              @click="agruparPor = 'item'"
            >Por item</button>
          </div>
        </div>
        <div v-if="!agrupadas.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
          Nenhuma ocorrência para os filtros atuais.
        </div>
        <table v-else class="w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-4 py-2 text-left">{{ agruparPor === "fornecedor" ? "Fornecedor" : "Item" }}</th>
              <th class="px-4 py-2 text-right">Ocorrências</th>
              <th class="px-4 py-2 text-right">Qtd não entregue</th>
              <th class="px-4 py-2 text-right">Qtd devolvida</th>
              <th class="px-4 py-2 text-right">Valor estimado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="g in agrupadas" :key="g.chave" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-4 py-2">
                <div class="font-medium">{{ g.rotulo }}</div>
                <div class="text-xs text-slate-400">{{ g.detalhe }}</div>
              </td>
              <td class="px-4 py-2 text-right tabular-nums">{{ g.ocorrencias }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtQtd(g.qtdNaoEntregue) }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtQtd(g.qtdDevolvida) }}</td>
              <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmtMoney(g.valor) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Detalhamento -->
      <div class="card overflow-x-auto">
        <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">
            Ocorrências ({{ filtradas.length }})
          </h2>
        </div>
        <div v-if="!filtradas.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
          Nenhuma ocorrência para os filtros atuais.
        </div>
        <table v-else class="w-full text-sm min-w-[62rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Data</th>
              <th class="px-3 py-2 text-left">Recibo</th>
              <th class="px-3 py-2 text-left">Campus</th>
              <th class="px-3 py-2 text-left">Fornecedor</th>
              <th class="px-3 py-2 text-left">Item</th>
              <th class="px-3 py-2 text-right">Qtd</th>
              <th class="px-3 py-2 text-left">Ocorrência</th>
              <th class="px-3 py-2 text-right">Valor</th>
              <th class="px-3 py-2 text-left">Acompanhamento</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="l in filtradas" :key="l.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40 align-top">
              <td class="px-3 py-2 whitespace-nowrap">{{ fmtDate(l.data_recebimento) }}</td>
              <td class="px-3 py-2 whitespace-nowrap">
                <RouterLink :to="`/recibos/${l.recibo_id}`" class="text-cpii-600 dark:text-cpii-300 hover:underline">
                  {{ l.recibo_numero }}
                </RouterLink>
              </td>
              <td class="px-3 py-2">{{ l.campus }}</td>
              <td class="px-3 py-2">{{ l.fornecedor ?? "—" }}</td>
              <td class="px-3 py-2 min-w-[13rem]">
                <div class="truncate max-w-[16rem]" :title="l.item">{{ l.item }}</div>
                <div v-if="l.observacoes" class="text-xs text-slate-400 italic">{{ l.observacoes }}</div>
              </td>
              <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {{ fmtQtd(l.quantidade) }} {{ l.unidade }}
              </td>
              <td class="px-3 py-2">
                <span
                  class="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
                  :class="l.tipo === 'nao_entregue'
                    ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'"
                >{{ rotuloTipo(l.tipo) }}</span>
              </td>
              <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">{{ fmtMoney(l.valor_estimado) }}</td>
              <td class="px-3 py-2 min-w-[16rem]">
                <template v-if="auth.isSane">
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      v-model="l.situacao"
                      class="input py-1 text-xs w-32"
                      :disabled="l._saving"
                      @change="salvarAcompanhamento(l)"
                    >
                      <option value="registrada">Registrada</option>
                      <option value="notificada">Notificada</option>
                      <option value="respondida">Respondida</option>
                      <option value="arquivada">Arquivada</option>
                    </select>
                    <input
                      v-model="l.data_notificacao"
                      type="date"
                      class="input py-1 text-xs w-36"
                      :disabled="l._saving"
                      title="Data da notificação"
                      @change="salvarAcompanhamento(l)"
                    />
                  </div>
                  <input
                    v-model="l.referencia"
                    type="text"
                    class="input py-1 text-xs mt-1"
                    placeholder="Processo SUAP ou referência do e-mail"
                    :disabled="l._saving"
                    @change="salvarAcompanhamento(l)"
                  />
                </template>
                <template v-else>
                  <span class="inline-block rounded px-1.5 py-0.5 text-[11px] capitalize" :class="situacaoClasse[l.situacao] ?? ''">
                    {{ l.situacao }}
                  </span>
                  <div v-if="l.data_notificacao" class="text-xs text-slate-400 mt-1">
                    notificado em {{ fmtDate(l.data_notificacao) }}
                  </div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400">
        As ocorrências são lançadas pelos campi no próprio recibo e <strong>não entram</strong> nas
        quantidades recebidas nem no consumo — são o registro da falta ou devolução. O
        <strong>valor estimado</strong> usa o preço vigente na data do recibo. O acompanhamento
        (situação, data e referência) é preenchido pela SANE.
      </p>
    </template>
  </div>
</template>
