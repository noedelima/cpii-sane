<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import type { Grupo } from "@/types/database";

// Linhas das views vw_empenho_item_saldo / vw_empenho_item_consumo.
interface SaldoRow {
  empenho_id: number;
  empenho: string;
  status: string;
  item_id: number;
  codigo_catmat: string | null;
  descricao: string;
  unidade: string;
  grupo_id: number;
  qtd_empenhada: number;
  qtd_consumida: number;
  valor_consumido: number;
  saldo_qtd: number;
}
interface ConsumoRow {
  empenho_id: number;
  empenho: string;
  item_id: number;
  codigo_catmat: string | null;
  descricao: string;
  unidade: string;
  grupo_id: number;
  semana: string; // YYYY-MM-DD (segunda-feira)
  mes: string; // YYYY-MM
  quantidade: number;
}

type Granularidade = "semana" | "mes";
type Status = "esgotado" | "urgente" | "atencao" | "ok" | "sem";

interface Linha {
  empenho_id: number;
  empenho: string;
  item_id: number;
  codigo_catmat: string | null;
  descricao: string;
  unidade: string;
  qtdEmpenhada: number | null;
  qtdConsumida: number;
  saldo: number | null;
  serie: number[];
  ritmo: number;
  cobertura: number | null;
  status: Status;
}

const grupos = ref<Grupo[]>([]);
const saldos = ref<SaldoRow[]>([]);
const consumo = ref<ConsumoRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const grupoFiltro = ref<number | null>(null);
const empenhoFiltro = ref<number | null>(null);
const granularidade = ref<Granularidade>("semana");
const janela = ref(12);

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtQtd = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

async function loadGrupos() {
  const { data } = await supabase
    .from("grupos")
    .select("*")
    .order("numero_arabico");
  grupos.value = (data as Grupo[] | null) ?? [];
}

async function load() {
  loading.value = true;
  error.value = null;
  empenhoFiltro.value = null;
  try {
    let qs = supabase.from("vw_empenho_item_saldo").select("*");
    let qc = supabase.from("vw_empenho_item_consumo").select("*");
    if (grupoFiltro.value) {
      qs = qs.eq("grupo_id", grupoFiltro.value);
      qc = qc.eq("grupo_id", grupoFiltro.value);
    }
    const [s, c] = await Promise.all([qs, qc]);
    if (s.error) throw s.error;
    if (c.error) throw c.error;
    saldos.value = ((s.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      empenho_id: num(r.empenho_id),
      empenho: String(r.empenho ?? ""),
      status: String(r.status ?? ""),
      item_id: num(r.item_id),
      codigo_catmat: (r.codigo_catmat as string | null) ?? null,
      descricao: String(r.descricao ?? ""),
      unidade: String(r.unidade ?? ""),
      grupo_id: num(r.grupo_id),
      qtd_empenhada: num(r.qtd_empenhada),
      qtd_consumida: num(r.qtd_consumida),
      valor_consumido: num(r.valor_consumido),
      saldo_qtd: num(r.saldo_qtd),
    }));
    consumo.value = ((c.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      empenho_id: num(r.empenho_id),
      empenho: String(r.empenho ?? ""),
      item_id: num(r.item_id),
      codigo_catmat: (r.codigo_catmat as string | null) ?? null,
      descricao: String(r.descricao ?? ""),
      unidade: String(r.unidade ?? ""),
      grupo_id: num(r.grupo_id),
      semana: String(r.semana ?? ""),
      mes: String(r.mes ?? ""),
      quantidade: num(r.quantidade),
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = /vw_empenho_item|does not exist|relation|schema cache/i.test(msg)
      ? "As views de consumo ainda não existem no banco. Rode a seção 29 do schema.sql no SQL Editor do Supabase e recarregue."
      : msg;
    saldos.value = [];
    consumo.value = [];
  } finally {
    loading.value = false;
  }
}

watch(grupoFiltro, load);

// --- geração das colunas de período ---
const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
const toISO = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function segundaStr(base: Date, semanasAtras: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow - semanasAtras * 7);
  return toISO(d);
}
function mesStr(base: Date, mesesAtras: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() - mesesAtras, 1);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}

const periodos = computed<string[]>(() => {
  const now = new Date();
  const n = janela.value;
  const arr: string[] = [];
  for (let k = n - 1; k >= 0; k--) {
    arr.push(granularidade.value === "semana" ? segundaStr(now, k) : mesStr(now, k));
  }
  return arr;
});

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function rotuloPeriodo(pk: string): string {
  if (granularidade.value === "semana") {
    const p = pk.split("-");
    return p[2] + "/" + p[1];
  }
  const p = pk.split("-");
  return MESES[Number(p[1]) - 1] + "/" + p[0].slice(2);
}
const unidadePeriodo = computed(() => (granularidade.value === "semana" ? "sem" : "mês"));

// consumo agregado por (empenho|item) -> período -> quantidade
const consumoPorChave = computed(() => {
  const m = new Map<string, Map<string, number>>();
  for (const c of consumo.value) {
    const k = c.empenho_id + "|" + c.item_id;
    const pk = granularidade.value === "semana" ? c.semana : c.mes;
    let mm = m.get(k);
    if (!mm) {
      mm = new Map();
      m.set(k, mm);
    }
    mm.set(pk, (mm.get(pk) ?? 0) + c.quantidade);
  }
  return m;
});

const limites = computed(() =>
  granularidade.value === "semana" ? { urgente: 4, atencao: 8 } : { urgente: 1.5, atencao: 3 }
);

const empenhosDisponiveis = computed(() => {
  const m = new Map<number, string>();
  for (const s of saldos.value) m.set(s.empenho_id, s.empenho);
  for (const c of consumo.value) if (!m.has(c.empenho_id)) m.set(c.empenho_id, c.empenho);
  return [...m.entries()].map(([id, numero]) => ({ id, numero })).sort((a, b) =>
    a.numero.localeCompare(b.numero)
  );
});

const linhas = computed<Linha[]>(() => {
  const mapaSaldo = new Map<string, SaldoRow>();
  for (const s of saldos.value) mapaSaldo.set(s.empenho_id + "|" + s.item_id, s);

  const chaves = new Set<string>([...mapaSaldo.keys(), ...consumoPorChave.value.keys()]);
  const metaConsumo = new Map<string, ConsumoRow>();
  for (const c of consumo.value) {
    const k = c.empenho_id + "|" + c.item_id;
    if (!metaConsumo.has(k)) metaConsumo.set(k, c);
  }

  const out: Linha[] = [];
  for (const k of chaves) {
    const s = mapaSaldo.get(k);
    const meta = s ?? metaConsumo.get(k);
    if (!meta) continue;
    if (empenhoFiltro.value && meta.empenho_id !== empenhoFiltro.value) continue;

    const porPeriodo = consumoPorChave.value.get(k);
    const serie = periodos.value.map((pk) => porPeriodo?.get(pk) ?? 0);

    // ritmo = média dos períodos desde o primeiro consumo dentro da janela
    const primeiro = serie.findIndex((v) => v > 0);
    const ativos = primeiro === -1 ? 0 : serie.length - primeiro;
    const totalJanela = serie.reduce((a, b) => a + b, 0);
    const ritmo = ativos > 0 ? totalJanela / ativos : 0;

    const saldo = s ? s.saldo_qtd : null;
    const qtdConsumida = s ? s.qtd_consumida : consumo.value
      .filter((c) => c.empenho_id + "|" + c.item_id === k)
      .reduce((a, c) => a + c.quantidade, 0);

    let cobertura: number | null = null;
    if (saldo != null) {
      if (saldo <= 0) cobertura = 0;
      else if (ritmo > 0) cobertura = saldo / ritmo;
      else cobertura = null; // sem consumo recente para projetar
    }

    let status: Status = "ok";
    if (saldo != null && saldo <= 0) status = "esgotado";
    else if (cobertura != null && cobertura <= limites.value.urgente) status = "urgente";
    else if (cobertura != null && cobertura <= limites.value.atencao) status = "atencao";
    else if (ritmo === 0) status = "sem";

    out.push({
      empenho_id: meta.empenho_id,
      empenho: meta.empenho,
      item_id: meta.item_id,
      codigo_catmat: meta.codigo_catmat,
      descricao: meta.descricao,
      unidade: meta.unidade,
      qtdEmpenhada: s ? s.qtd_empenhada : null,
      qtdConsumida,
      saldo,
      serie,
      ritmo,
      cobertura,
      status,
    });
  }

  const ordem: Record<Status, number> = { esgotado: 0, urgente: 1, atencao: 2, ok: 3, sem: 4 };
  return out.sort((a, b) => {
    if (ordem[a.status] !== ordem[b.status]) return ordem[a.status] - ordem[b.status];
    const ca = a.cobertura ?? Infinity;
    const cb = b.cobertura ?? Infinity;
    if (ca !== cb) return ca - cb;
    return a.empenho.localeCompare(b.empenho) || a.descricao.localeCompare(b.descricao);
  });
});

const resumo = computed(() => {
  let esgotado = 0;
  let urgente = 0;
  let atencao = 0;
  for (const l of linhas.value) {
    if (l.status === "esgotado") esgotado++;
    else if (l.status === "urgente") urgente++;
    else if (l.status === "atencao") atencao++;
  }
  return { esgotado, urgente, atencao };
});

const badge: Record<Status, { label: string; cls: string }> = {
  esgotado: { label: "Esgotado", cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
  urgente: { label: "Reforço", cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
  atencao: { label: "Atenção", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  ok: { label: "OK", cls: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
  sem: { label: "Sem consumo", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300" },
};

function coberturaTexto(l: Linha): string {
  if (l.saldo == null) return "—";
  if (l.saldo <= 0) return "esgotado";
  if (l.cobertura == null) return "sem ritmo";
  return l.cobertura.toFixed(1) + " " + unidadePeriodo.value;
}

onMounted(async () => {
  await loadGrupos();
  await load();
});
</script>

<template>
  <div class="mx-auto max-w-[80rem] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Consumo por empenho</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
        Consumo de cada item por empenho ao longo do tempo (datado pela entrega da NF), com o
        saldo e a projeção de quando cada item deve esgotar — para planejar os reforços.
      </p>
    </div>

    <!-- Filtros -->
    <div class="card p-4 flex flex-wrap items-end gap-4">
      <div>
        <label class="label">Grupo</label>
        <select v-model="grupoFiltro" class="input w-52">
          <option :value="null">Todos os grupos</option>
          <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
        </select>
      </div>
      <div>
        <label class="label">Empenho</label>
        <select v-model="empenhoFiltro" class="input w-52">
          <option :value="null">Todos os empenhos</option>
          <option v-for="e in empenhosDisponiveis" :key="e.id" :value="e.id">{{ e.numero }}</option>
        </select>
      </div>
      <div>
        <label class="label">Granularidade</label>
        <div class="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
          <button
            type="button"
            class="px-3 py-2 text-sm"
            :class="granularidade === 'semana' ? 'bg-cpii-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
            @click="granularidade = 'semana'; janela = 12"
          >Semanal</button>
          <button
            type="button"
            class="px-3 py-2 text-sm border-l border-slate-300 dark:border-slate-600"
            :class="granularidade === 'mes' ? 'bg-cpii-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
            @click="granularidade = 'mes'; janela = 6"
          >Mensal</button>
        </div>
      </div>
      <div>
        <label class="label">Períodos</label>
        <select v-model.number="janela" class="input w-28">
          <template v-if="granularidade === 'semana'">
            <option :value="8">8 semanas</option>
            <option :value="12">12 semanas</option>
            <option :value="16">16 semanas</option>
          </template>
          <template v-else>
            <option :value="6">6 meses</option>
            <option :value="12">12 meses</option>
          </template>
        </select>
      </div>
    </div>

    <!-- Resumo de reforço -->
    <div
      v-if="!loading && (resumo.esgotado || resumo.urgente || resumo.atencao)"
      class="rounded-md border p-3 text-sm flex flex-wrap gap-x-6 gap-y-1"
      :class="resumo.esgotado || resumo.urgente
        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'"
    >
      <span v-if="resumo.esgotado"><strong>{{ resumo.esgotado }}</strong> item(ns) esgotado(s)</span>
      <span v-if="resumo.urgente"><strong>{{ resumo.urgente }}</strong> com reforço urgente (≤ {{ limites.urgente }} {{ unidadePeriodo }} de saldo)</span>
      <span v-if="resumo.atencao"><strong>{{ resumo.atencao }}</strong> em atenção (≤ {{ limites.atencao }} {{ unidadePeriodo }})</span>
      <span class="text-xs opacity-80">Ordenados no topo da tabela.</span>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <!-- Tabela -->
    <div class="card overflow-x-auto">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!linhas.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum consumo encontrado para os filtros atuais.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-3 py-2 text-left sticky left-0 bg-slate-50 dark:bg-slate-700/50">Empenho</th>
            <th class="px-3 py-2 text-left">Item</th>
            <th class="px-3 py-2 text-right">Empenhado</th>
            <th class="px-3 py-2 text-right">Consumido</th>
            <th class="px-3 py-2 text-right">Saldo</th>
            <th class="px-3 py-2 text-right">Ritmo/{{ unidadePeriodo }}</th>
            <th class="px-3 py-2 text-right">Cobertura</th>
            <th class="px-3 py-2 text-center">Situação</th>
            <th
              v-for="pk in periodos"
              :key="pk"
              class="px-2 py-2 text-right whitespace-nowrap border-l border-slate-200 dark:border-slate-600"
            >{{ rotuloPeriodo(pk) }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr
            v-for="l in linhas"
            :key="l.empenho_id + '-' + l.item_id"
            class="hover:bg-slate-50 dark:hover:bg-slate-700/40"
          >
            <td class="px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-white dark:bg-slate-800">{{ l.empenho }}</td>
            <td class="px-3 py-2 min-w-[14rem]">
              <div class="truncate max-w-[16rem]" :title="l.descricao">{{ l.descricao }}</div>
              <div class="text-xs text-slate-400">{{ l.codigo_catmat ?? "—" }} · {{ l.unidade }}</div>
            </td>
            <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">
              {{ l.qtdEmpenhada == null ? "—" : fmtQtd(l.qtdEmpenhada) }}
            </td>
            <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">{{ fmtQtd(l.qtdConsumida) }}</td>
            <td
              class="px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium"
              :class="l.saldo != null && l.saldo <= 0 ? 'text-red-600 dark:text-red-400' : ''"
            >
              {{ l.saldo == null ? "—" : fmtQtd(l.saldo) }}
            </td>
            <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">
              {{ l.ritmo > 0 ? fmtQtd(l.ritmo) : "—" }}
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">{{ coberturaTexto(l) }}</td>
            <td class="px-3 py-2 text-center">
              <span class="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold" :class="badge[l.status].cls">
                {{ badge[l.status].label }}
              </span>
            </td>
            <td
              v-for="(v, idx) in l.serie"
              :key="idx"
              class="px-2 py-2 text-right tabular-nums whitespace-nowrap border-l border-slate-100 dark:border-slate-700/60"
              :class="v > 0 ? '' : 'text-slate-300 dark:text-slate-600'"
            >
              {{ v > 0 ? fmtQtd(v) : "·" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="text-xs text-slate-500 dark:text-slate-400 space-y-1">
      <p>
        <strong>Consumido</strong> = quantidades das NFs atribuídas ao empenho (distribuição pela fila
        ou débito por item), datadas pela entrega. <strong>Saldo</strong> = empenhado − consumido.
      </p>
      <p>
        <strong>Ritmo</strong> = média por {{ unidadePeriodo }} desde o primeiro consumo na janela;
        <strong>Cobertura</strong> = saldo ÷ ritmo (quantos {{ unidadePeriodo === 'mês' ? 'meses' : 'períodos' }} o
        saldo ainda cobre). Itens de empenhos sem detalhe de itens não têm empenhado/saldo (aparecem com “—”).
      </p>
    </div>
  </div>
</template>
