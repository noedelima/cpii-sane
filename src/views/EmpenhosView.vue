<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { carregarLogo } from "@/lib/pdf-ateste";
import { montarPdfEmpenhoSaldos, type EmpenhoSaldoBloco } from "@/lib/pdf-empenho-saldos";
import type { Fornecedor, Grupo, VwEmpenhoItemSaldo, VwEmpenhoSaldo } from "@/types/database";

const auth = useAuthStore();
const empenhos = ref<VwEmpenhoSaldo[]>([]);
const grupos = ref<Grupo[]>([]);
const fornecedores = ref<Fornecedor[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const busca = ref("");
const statusFiltro = ref<string>("");

// req 10 — saldo total por item ao selecionar um grupo
const painelGrupo = ref(false);
const grupoSaldoId = ref<number | null>(null);
const saldoRows = ref<VwEmpenhoItemSaldo[]>([]);
const carregandoGrupo = ref(false);

// req 11 — seleção de NEs e PDF único de saldos
const modoSelecao = ref(false);
const nesSelecionadas = ref<Set<number>>(new Set());
const gerandoPdfNes = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  const [e, g, f] = await Promise.all([
    supabase
      .from("vw_empenho_saldos")
      .select("*")
      .order("data_emissao", { ascending: false })
      .order("numero"),
    supabase.from("grupos").select("*").order("numero_arabico"),
    supabase.from("fornecedores").select("*").order("codigo"),
  ]);
  if (e.error) error.value = e.error.message;
  empenhos.value = (e.data as VwEmpenhoSaldo[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
  fornecedores.value = (f.data as Fornecedor[] | null) ?? [];
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

// ---- req 10: saldo por grupo ----
async function consultarSaldoGrupo() {
  if (!grupoSaldoId.value) {
    saldoRows.value = [];
    return;
  }
  carregandoGrupo.value = true;
  const { data, error: err } = await supabase
    .from("vw_empenho_item_saldos")
    .select("*")
    .eq("grupo_id", grupoSaldoId.value)
    .order("descricao");
  if (err) error.value = err.message;
  saldoRows.value = (data as VwEmpenhoItemSaldo[] | null) ?? [];
  carregandoGrupo.value = false;
}

interface ItemAgregado {
  item_id: number;
  descricao: string;
  catmat: string | null;
  unidade: string;
  totalEmpenhado: number;
  totalSaldoQtd: number;
  totalSaldoValor: number;
  porNe: { numero: string; saldoQtd: number | null }[];
}
const saldoGrupoAgregado = computed<ItemAgregado[]>(() => {
  const m = new Map<number, ItemAgregado>();
  for (const r of saldoRows.value) {
    let it = m.get(r.item_id);
    if (!it) {
      it = {
        item_id: r.item_id,
        descricao: r.descricao,
        catmat: r.codigo_catmat,
        unidade: r.unidade,
        totalEmpenhado: 0,
        totalSaldoQtd: 0,
        totalSaldoValor: 0,
        porNe: [],
      };
      m.set(r.item_id, it);
    }
    it.totalEmpenhado += Number(r.qtd_empenhada);
    it.totalSaldoQtd += Number(r.saldo_qtd ?? 0);
    it.totalSaldoValor += Number(r.saldo_valor);
    it.porNe.push({ numero: r.empenho_numero, saldoQtd: r.saldo_qtd == null ? null : Number(r.saldo_qtd) });
  }
  return [...m.values()].sort((a, b) => a.descricao.localeCompare(b.descricao));
});
const saldoGrupoTotalValor = computed(() =>
  saldoGrupoAgregado.value.reduce((a, it) => a + it.totalSaldoValor, 0)
);

function fmtQtd(n: number | null, un: string): string {
  if (n == null) return "—";
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${un}`;
}

// ---- req 11: PDF de saldos das NEs selecionadas ----
function toggleNe(id: number) {
  const s = new Set(nesSelecionadas.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  nesSelecionadas.value = s;
}
function toggleModoSelecao() {
  modoSelecao.value = !modoSelecao.value;
  if (!modoSelecao.value) nesSelecionadas.value = new Set();
}

async function gerarPdfNes() {
  const ids = [...nesSelecionadas.value];
  if (!ids.length) {
    error.value = "Selecione ao menos uma NE.";
    return;
  }
  gerandoPdfNes.value = true;
  error.value = null;
  try {
    const [{ data: sal }, { data: empDet }, { data: egs }] = await Promise.all([
      supabase.from("vw_empenho_item_saldos").select("*").in("empenho_id", ids).order("descricao"),
      supabase.from("empenhos").select("id, numero, data_emissao, processo_suap, fornecedor_id").in("id", ids),
      supabase.from("empenhos_grupos").select("empenho_id, grupos (nome)").in("empenho_id", ids),
    ]);
    const saldos = (sal as VwEmpenhoItemSaldo[] | null) ?? [];
    type EmpDet = { id: number; numero: string; data_emissao: string; processo_suap: string | null; fornecedor_id: number | null };
    const detalhes = (empDet as EmpDet[] | null) ?? [];
    type EgRow = { empenho_id: number; grupos: { nome: string } | null };
    const gruposPorNe = new Map<number, string[]>();
    for (const r of ((egs as unknown as EgRow[] | null) ?? [])) {
      const arr = gruposPorNe.get(r.empenho_id) ?? [];
      if (r.grupos?.nome) arr.push(r.grupos.nome);
      gruposPorNe.set(r.empenho_id, arr);
    }
    const liquidoPorNe = new Map(empenhos.value.map((e) => [e.id, Number(e.valor_liquido)]));
    const fornPorId = new Map(fornecedores.value.map((f) => [f.id, f]));

    const fornIds = new Set(detalhes.map((d) => d.fornecedor_id).filter((x): x is number => x != null));
    const fornComum = fornIds.size === 1 ? fornPorId.get([...fornIds][0]) : null;

    const blocos: EmpenhoSaldoBloco[] = detalhes
      .sort((a, b) => (a.data_emissao < b.data_emissao ? -1 : 1))
      .map((d) => {
        const itensNe = saldos.filter((s) => s.empenho_id === d.id);
        const forn = d.fornecedor_id != null ? fornPorId.get(d.fornecedor_id) : null;
        return {
          numero: d.numero,
          data_emissao: d.data_emissao,
          processo_suap: d.processo_suap,
          valor_global: liquidoPorNe.get(d.id) ?? 0,
          grupos: gruposPorNe.get(d.id) ?? [],
          fornecedorNome: fornComum ? undefined : forn?.razao_social,
          itens: itensNe.map((r) => ({
            codigo_catmat: r.codigo_catmat,
            descricao: r.descricao,
            unidade: r.unidade,
            qtd_empenhada: Number(r.qtd_empenhada),
            valor_unitario_ne: Number(r.valor_unitario_ne),
            consumido_qtd: Number(r.consumido_qtd),
            saldo_qtd: r.saldo_qtd == null ? null : Number(r.saldo_qtd),
            valor_inicial: Number(r.valor_inicial),
            saldo_valor: Number(r.saldo_valor),
          })),
        };
      });

    const { doc, filename } = montarPdfEmpenhoSaldos({
      fornecedor: fornComum
        ? { codigo: fornComum.codigo, razao_social: fornComum.razao_social, cnpj: fornComum.cnpj }
        : { codigo: "—", razao_social: "Vários fornecedores", cnpj: null },
      blocos,
      emitidoPor: auth.perfil?.nome ?? "",
      logoDataUrl: await carregarLogo(),
    });
    doc.save(filename);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao gerar o PDF de saldos.";
  } finally {
    gerandoPdfNes.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-semibold">Empenhos</h1>
      <div v-if="auth.isSane" class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-secondary"
          :class="{ 'ring-2 ring-cpii-400': painelGrupo }"
          @click="painelGrupo = !painelGrupo"
        >Saldo por grupo</button>
        <button
          type="button"
          class="btn-secondary"
          :class="{ 'ring-2 ring-cpii-400': modoSelecao }"
          @click="toggleModoSelecao"
        >PDF de saldos por NE</button>
        <RouterLink to="/empenhos/novo" class="btn-primary">+ Novo empenho</RouterLink>
      </div>
    </div>

    <!-- req 10: saldo total por item de um grupo -->
    <div v-if="painelGrupo" class="card p-5 mb-4 space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <div class="grow max-w-md">
          <label class="label">Grupo</label>
          <select v-model="grupoSaldoId" class="input" @change="consultarSaldoGrupo">
            <option :value="null" disabled>Selecione um grupo…</option>
            <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </select>
        </div>
        <p v-if="saldoGrupoAgregado.length" class="text-sm text-slate-600 dark:text-slate-300 pb-2">
          Saldo total do grupo: <strong class="tabular-nums">{{ fmtMoney(saldoGrupoTotalValor) }}</strong>
        </p>
      </div>

      <div v-if="carregandoGrupo" class="text-sm text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="grupoSaldoId && saldoGrupoAgregado.length" class="overflow-x-auto">
        <table class="w-full text-sm min-w-[44rem]">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">CatMat</th>
              <th class="text-left py-1">Item</th>
              <th class="text-right py-1">Empenhado</th>
              <th class="text-right py-1">Saldo total (qtd)</th>
              <th class="text-right py-1">Saldo (R$)</th>
              <th class="text-left py-1">Por NE</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="it in saldoGrupoAgregado" :key="it.item_id">
              <td class="py-2 text-slate-600 dark:text-slate-300">{{ it.catmat ?? "—" }}</td>
              <td class="py-2">{{ it.descricao }}</td>
              <td class="py-2 text-right tabular-nums">{{ fmtQtd(it.totalEmpenhado, it.unidade) }}</td>
              <td class="py-2 text-right tabular-nums font-medium" :class="it.totalSaldoQtd < 0 ? 'text-red-600 dark:text-red-400' : ''">
                {{ fmtQtd(it.totalSaldoQtd, it.unidade) }}
              </td>
              <td class="py-2 text-right tabular-nums">{{ fmtMoney(it.totalSaldoValor) }}</td>
              <td class="py-2 text-xs text-slate-500 dark:text-slate-400">
                {{ it.porNe.map((n) => `${n.numero}: ${fmtQtd(n.saldoQtd, it.unidade)}`).join(" · ") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="grupoSaldoId" class="text-sm text-slate-500 dark:text-slate-400">
        Nenhum item empenhado neste grupo.
      </p>
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

    <!-- barra de ação do modo seleção (req 11) -->
    <div
      v-if="modoSelecao"
      class="flex flex-wrap items-center justify-between gap-2 mb-3 rounded-md border border-cpii-200 dark:border-cpii-900 bg-cpii-50 dark:bg-cpii-950/40 px-4 py-2"
    >
      <span class="text-sm text-slate-700 dark:text-slate-200">
        {{ nesSelecionadas.size }} NE(s) selecionada(s) — marque as caixas na tabela.
      </span>
      <button class="btn-primary" :disabled="gerandoPdfNes || !nesSelecionadas.size" @click="gerarPdfNes">
        {{ gerandoPdfNes ? "Gerando…" : "Gerar PDF de saldos" }}
      </button>
    </div>

    <div class="card overflow-x-auto">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!filtrados.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum empenho encontrado.
      </div>
      <table v-else class="w-full text-sm min-w-[52rem]">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th v-if="modoSelecao" class="px-3 py-2 w-10"></th>
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
          <tr
            v-for="e in filtrados"
            :key="e.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-700/40"
            :class="{ 'cursor-pointer': modoSelecao }"
            @click="modoSelecao && toggleNe(e.id)"
          >
            <td v-if="modoSelecao" class="px-3 py-2">
              <input
                type="checkbox"
                class="rounded border-slate-300 dark:border-slate-600 pointer-events-none"
                :checked="nesSelecionadas.has(e.id)"
              />
            </td>
            <td class="px-4 py-2 font-medium">
              <RouterLink
                v-if="auth.isSane && !modoSelecao"
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
            <td v-if="modoSelecao"></td>
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
