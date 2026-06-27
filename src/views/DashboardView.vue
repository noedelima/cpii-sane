<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { api, USE_API } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { fmtMoney } from "@/lib/format";
import type { VwGrupoResumo } from "@/types/database";

const auth = useAuthStore();

/* ---------- Resumo financeiro (existente) ---------- */
const resumo = ref<VwGrupoResumo[]>([]);
const recibosPendentes = ref(0);
const nfsPendentes = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    if (USE_API) {
      const d = await api.dashboard();
      resumo.value = (d.resumo as unknown as VwGrupoResumo[]) ?? [];
      recibosPendentes.value = d.recibosPendentes ?? 0;
      nfsPendentes.value = d.nfsPendentes ?? 0;
    } else {
      const [g, r, n] = await Promise.all([
        supabase.from("vw_grupo_resumo").select("*").order("numero_arabico"),
        supabase.from("recibos").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      ]);
      if (g.error) throw new Error(g.error.message);
      resumo.value = (g.data as VwGrupoResumo[] | null) ?? [];
      recibosPendentes.value = r.count ?? 0;
      nfsPendentes.value = n.count ?? 0;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao carregar o dashboard.";
  } finally {
    loading.value = false;
  }
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

/* ---------- Inteligência de consumo (data mining) ---------- */
type Row = Record<string, unknown>;
const mensal = ref<Row[]>([]);
const itens = ref<Row[]>([]);
const abc = ref<Row[]>([]);
const campus = ref<Row[]>([]);
const fornecedores = ref<Row[]>([]);
const aLoading = ref(true);
const aError = ref<string | null>(null);

const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

async function loadAnalytics() {
  aLoading.value = true;
  aError.value = null;
  try {
    if (USE_API) {
      const a = await api.analytics();
      mensal.value = a.mensal ?? [];
      itens.value = a.itens ?? [];
      abc.value = a.abc ?? [];
      campus.value = a.campus ?? [];
      fornecedores.value = a.fornecedor ?? [];
    } else {
      const [m, it, ab, ca, fo] = await Promise.all([
        supabase.from("vw_consumo_mensal").select("mes,nfs,valor,futuro").order("mes"),
        supabase
          .from("vw_item_consumo")
          .select(
            "item_id,descricao,grupo,unidade,quantidade_ata,consumido_fisico,consumido_faturado,consumido_melhor,valor_melhor,pct_ata_melhor,saldo_ata"
          )
          .order("pct_ata_melhor", { ascending: false, nullsFirst: false }),
        supabase.from("vw_item_abc").select("descricao,grupo,valor,share_pct,acum_pct,classe").order("valor", { ascending: false }),
        supabase.from("vw_consumo_campus").select("campus,recibos,valor_estimado").order("valor_estimado", { ascending: false }),
        supabase.from("vw_fornecedor_consumo").select("fornecedor,grupos,utilizado,share_pct").order("utilizado", { ascending: false }),
      ]);
      const firstErr = [m, it, ab, ca, fo].find((x) => x.error);
      if (firstErr && firstErr.error) throw new Error(firstErr.error.message);
      mensal.value = (m.data as Row[]) ?? [];
      itens.value = (it.data as Row[]) ?? [];
      abc.value = (ab.data as Row[]) ?? [];
      campus.value = (ca.data as Row[]) ?? [];
      fornecedores.value = (fo.data as Row[]) ?? [];
    }
  } catch (e) {
    aError.value = e instanceof Error ? e.message : "Falha ao carregar a inteligência de consumo.";
  } finally {
    aLoading.value = false;
  }
}

// Dinheiro compacto p/ KPIs e eixos (R$ 1,2 mi · R$ 450 mil)
function fmtK(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (a >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  return fmtMoney(v);
}
const pct1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

/* KPIs de consumo */
const itensComAta = computed(() => itens.value.filter((i) => num(i.quantidade_ata) > 0));
const itensZerados = computed(() => itensComAta.value.filter((i) => num(i.consumido_melhor) === 0).length);
const concentracaoTop3 = computed(() => fornecedores.value.slice(0, 3).reduce((s, f) => s + num(f.share_pct), 0));
const classeA = computed(() => {
  const a = abc.value.filter((x) => x.classe === "A");
  return { n: a.length, acum: a.length ? num(a[a.length - 1].acum_pct) : 0 };
});
const mesesValidos = computed(() =>
  mensal.value.filter((m) => !m.futuro).map((m) => num(m.valor)).sort((a, b) => a - b)
);
const consumoMediano = computed(() => {
  const a = mesesValidos.value;
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
});

/* Séries dos painéis */
const maxMensal = computed(() => Math.max(1, ...mensal.value.map((m) => num(m.valor))));
const mensalView = computed(() =>
  mensal.value.map((m) => {
    const v = num(m.valor);
    const futuro = !!m.futuro;
    const artefato = !futuro && v > 2.5 * consumoMediano.value && consumoMediano.value > 0;
    const mes = String(m.mes).slice(0, 7);
    return {
      mes,
      label: mes.slice(5, 7) + "/" + mes.slice(2, 4),
      valor: v,
      pct: (v / maxMensal.value) * 100,
      futuro,
      artefato,
    };
  })
);
const temArtefato = computed(() => mensalView.value.some((m) => m.artefato));
const temFuturo = computed(() => mensalView.value.some((m) => m.futuro));

const abcTop = computed(() => abc.value.slice(0, 12));
const maxAbc = computed(() => Math.max(1, ...abc.value.map((a) => num(a.valor))));

const execTop = computed(() =>
  itens.value.filter((i) => i.pct_ata_melhor != null && num(i.quantidade_ata) > 0).slice(0, 12)
);

const campusMax = computed(() => Math.max(1, ...campus.value.map((c) => num(c.valor_estimado))));
const fornMax = computed(() => Math.max(1, ...fornecedores.value.map((f) => num(f.utilizado))));

function classeCor(c: unknown): string {
  if (c === "A") return "bg-cpii-600";
  if (c === "B") return "bg-gold-500";
  return "bg-slate-400 dark:bg-slate-500";
}

onMounted(() => {
  load();
  loadAnalytics();
});
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
                <span v-if="g.status !== 'vigente'" class="ml-2 text-xs text-slate-500 dark:text-slate-400 capitalize">({{ g.status }})</span>
              </td>
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div class="h-full rounded-full transition-all" :class="corBarra(pctUso(g))" :style="{ width: pctUso(g) + '%' }"></div>
                  </div>
                  <span class="text-xs tabular-nums text-slate-600 dark:text-slate-300 w-12 text-right">{{ pctUso(g).toFixed(1) }}%</span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ fmtMoney(g.alocado) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ fmtMoney(g.utilizado) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums font-medium" :class="Number(g.saldo) < 0 ? 'text-red-600 dark:text-red-400' : ''">{{ fmtMoney(g.saldo) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ g.qtd_nfs }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ============ Inteligência de consumo ============ -->
    <div class="mt-10 mb-4 flex items-baseline justify-between gap-2 flex-wrap">
      <div class="flex items-baseline gap-2">
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">Inteligência de consumo</h2>
        <span class="text-xs text-slate-500 dark:text-slate-400">para planejar os próximos contratos</span>
      </div>
      <RouterLink
        v-if="auth.isSane"
        to="/estimativa"
        class="text-sm font-medium text-cpii-700 hover:underline dark:text-gold-300"
      >Estimativa para a próxima ATA →</RouterLink>
    </div>

    <div v-if="aError" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ aError }}
    </div>
    <div v-else-if="aLoading" class="card p-10 text-center text-slate-500 dark:text-slate-400">Analisando consumo…</div>

    <template v-else>
      <!-- KPIs de consumo -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Itens sem consumo</p>
          <p class="text-xl font-semibold tabular-nums mt-1">
            {{ itensZerados }} <span class="text-sm font-normal text-slate-500 dark:text-slate-400">/ {{ itensComAta.length }}</span>
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ATA possivelmente superdimensionada</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Concentração (top 3 fornec.)</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ pct1(concentracaoTop3) }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">do valor utilizado — risco de dependência</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Curva ABC — classe A</p>
          <p class="text-xl font-semibold tabular-nums mt-1">
            {{ classeA.n }} itens <span class="text-sm font-normal text-slate-500 dark:text-slate-400">= {{ pct1(classeA.acum) }}</span>
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">concentram o gasto — foco da negociação</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Consumo mensal típico</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ fmtK(consumoMediano) }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">mediana (exclui meses futuros)</p>
        </div>
      </div>

      <!-- Consumo mensal -->
      <div class="card p-4 mb-6">
        <div class="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h3 class="font-medium text-slate-700 dark:text-slate-200">Consumo mensal (NFs)</h3>
          <div class="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-cpii-600 dark:bg-cpii-500"></span>normal</span>
            <span v-if="temArtefato" class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-gold-400"></span>carga inicial</span>
            <span v-if="temFuturo" class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-slate-300 dark:bg-slate-600"></span>futuro (revisar)</span>
          </div>
        </div>
        <div class="flex items-end gap-1 h-40">
          <div
            v-for="m in mensalView"
            :key="m.mes"
            class="flex-1 flex items-end justify-center min-w-0 h-full"
            :title="m.mes + ' · ' + fmtMoney(m.valor)"
          >
            <div
              class="w-full max-w-[26px] rounded-t transition-all"
              :class="m.artefato ? 'bg-gold-400' : m.futuro ? 'bg-slate-300 dark:bg-slate-600' : 'bg-cpii-600 dark:bg-cpii-500'"
              :style="{ height: Math.max(2, m.pct) + '%' }"
            ></div>
          </div>
        </div>
        <div class="flex gap-1 mt-1">
          <div v-for="(m, i) in mensalView" :key="m.mes" class="flex-1 text-center text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
            {{ i % 3 === 0 ? m.label : "" }}
          </div>
        </div>
        <p v-if="temArtefato || temFuturo" class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          <span v-if="temArtefato">O pico inicial reflete a carga de migração (lançamento retroativo). </span>
          <span v-if="temFuturo">Há NFs com data futura — provavelmente datas a revisar.</span>
        </p>
      </div>

      <div class="grid lg:grid-cols-2 gap-6 mb-6">
        <!-- Curva ABC -->
        <div class="card p-4">
          <h3 class="font-medium text-slate-700 dark:text-slate-200 mb-1">Curva ABC — itens por valor</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Maior estimativa entre físico (recibos) e faturado (NF)</p>
          <div class="space-y-2">
            <div v-for="a in abcTop" :key="String(a.descricao) + String(a.grupo)" class="flex items-center gap-2 text-sm">
              <span class="w-40 truncate text-slate-700 dark:text-slate-200" :title="String(a.descricao)">
                <span class="text-[10px] text-slate-400 dark:text-slate-500 mr-1">{{ a.grupo }}</span>{{ a.descricao }}
              </span>
              <div class="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div class="h-full rounded" :class="classeCor(a.classe)" :style="{ width: (num(a.valor) / maxAbc) * 100 + '%' }"></div>
              </div>
              <span class="w-20 text-right tabular-nums text-slate-600 dark:text-slate-300">{{ fmtK(num(a.valor)) }}</span>
              <span class="w-7 text-right text-[10px] font-semibold" :class="a.classe === 'A' ? 'text-cpii-700 dark:text-cpii-300' : a.classe === 'B' ? 'text-gold-700 dark:text-gold-300' : 'text-slate-400'">{{ a.classe }}</span>
            </div>
          </div>
        </div>

        <!-- Execução da ATA -->
        <div class="card p-4">
          <h3 class="font-medium text-slate-700 dark:text-slate-200 mb-1">Execução da ATA por item</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">% da quantidade registrada já consumida (maior estimativa)</p>
          <div class="space-y-2">
            <div v-for="i in execTop" :key="String(i.item_id)" class="flex items-center gap-2 text-sm">
              <span class="w-40 truncate text-slate-700 dark:text-slate-200" :title="String(i.descricao)">
                <span class="text-[10px] text-slate-400 dark:text-slate-500 mr-1">{{ i.grupo }}</span>{{ i.descricao }}
              </span>
              <div class="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div class="h-full rounded" :class="corBarra(num(i.pct_ata_melhor))" :style="{ width: Math.min(100, num(i.pct_ata_melhor)) + '%' }"></div>
              </div>
              <span class="w-12 text-right tabular-nums text-slate-600 dark:text-slate-300">{{ pct1(num(i.pct_ata_melhor)) }}</span>
            </div>
          </div>
        </div>

        <!-- Consumo por campus -->
        <div class="card p-4">
          <h3 class="font-medium text-slate-700 dark:text-slate-200 mb-1">Consumo por campus</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Valor estimado (recibos × preço vigente)</p>
          <div class="space-y-2">
            <div v-for="c in campus" :key="String(c.campus)" class="flex items-center gap-2 text-sm">
              <span class="w-36 truncate text-slate-700 dark:text-slate-200" :title="String(c.campus)">{{ c.campus }}</span>
              <div class="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div class="h-full rounded bg-cpii-600 dark:bg-cpii-500" :style="{ width: (num(c.valor_estimado) / campusMax) * 100 + '%' }"></div>
              </div>
              <span class="w-20 text-right tabular-nums text-slate-600 dark:text-slate-300">{{ fmtK(num(c.valor_estimado)) }}</span>
            </div>
          </div>
        </div>

        <!-- Dependência por fornecedor -->
        <div class="card p-4">
          <h3 class="font-medium text-slate-700 dark:text-slate-200 mb-1">Dependência por fornecedor</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Participação no valor utilizado</p>
          <div class="space-y-2">
            <div v-for="f in fornecedores" :key="String(f.fornecedor)" class="flex items-center gap-2 text-sm">
              <span class="w-36 truncate text-slate-700 dark:text-slate-200" :title="String(f.fornecedor)">
                {{ f.fornecedor }}
                <span v-if="num(f.grupos) > 1" class="text-[10px] text-slate-400 dark:text-slate-500">({{ f.grupos }} grupos)</span>
              </span>
              <div class="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div class="h-full rounded bg-gold-500" :style="{ width: (num(f.utilizado) / fornMax) * 100 + '%' }"></div>
              </div>
              <span class="w-12 text-right tabular-nums text-slate-600 dark:text-slate-300">{{ pct1(num(f.share_pct)) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
