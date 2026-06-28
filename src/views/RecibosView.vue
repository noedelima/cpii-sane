<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { api, USE_API } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useQuarentena } from "@/lib/useQuarentena";
import type { Campus, Grupo, Recibo } from "@/types/database";

type ReciboRow = Recibo & {
  campi?: { nome: string } | null;
  grupos?: { nome: string } | null;
  deleted_at?: string | null;
  deleted_by_nome?: string | null;
};

const PAGE = 50;

const recibos = ref<ReciboRow[]>([]);
const campi = ref<Campus[]>([]);
const grupos = ref<Grupo[]>([]);
const total = ref(0);
const pagina = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);

const busca = ref("");
const campusFiltro = ref<number | "">("");
const grupoFiltro = ref<number | "">("");
const statusFiltro = ref<string>("");
let buscaTimer: ReturnType<typeof setTimeout> | null = null;

const {
  mostrarExcluidos,
  confirmando,
  processando,
  erro: erroQuar,
  qtd: qtdSel,
  podeGerenciar,
  selecionado,
  toggle,
  definirTodos,
  limpar,
  alternarModo,
  excluir,
  restaurar,
  diasRestantes,
} = useQuarentena("recibos");

const idsPagina = computed(() => recibos.value.map((r) => r.id));
const todosSelecionados = computed(
  () => idsPagina.value.length > 0 && idsPagina.value.every((id) => selecionado(id))
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    if (USE_API) {
      const res = await api.recibos({
        page: pagina.value,
        busca: busca.value.trim(),
        campus: campusFiltro.value === "" ? undefined : campusFiltro.value,
        grupo: grupoFiltro.value === "" ? undefined : grupoFiltro.value,
        status: statusFiltro.value,
        excluidos: mostrarExcluidos.value ? 1 : undefined,
      });
      recibos.value = (res.data as unknown as ReciboRow[]) ?? [];
      total.value = res.total ?? 0;
    } else {
      let q = supabase
        .from("recibos")
        .select("*, campi (nome), grupos (nome)", { count: "exact" })
        .order("data_recebimento", { ascending: false })
        .order("id", { ascending: false })
        .range(pagina.value * PAGE, pagina.value * PAGE + PAGE - 1);
      if (busca.value.trim()) q = q.ilike("numero", `%${busca.value.trim()}%`);
      if (campusFiltro.value !== "") q = q.eq("campus_id", campusFiltro.value);
      if (grupoFiltro.value !== "") q = q.eq("grupo_id", grupoFiltro.value);
      if (statusFiltro.value) q = q.eq("status", statusFiltro.value);
      q = mostrarExcluidos.value ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      const { data, count, error: err } = await q;
      if (err) throw new Error(err.message);
      recibos.value = (data as ReciboRow[] | null) ?? [];
      total.value = count ?? 0;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao carregar recibos.";
  } finally {
    loading.value = false;
  }
}

async function loadRefs() {
  const [c, g] = await Promise.all([
    supabase.from("campi").select("*").eq("status", "ativo").order("nome"),
    supabase.from("grupos").select("*").order("numero_arabico"),
  ]);
  campi.value = (c.data as Campus[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
}

function alternarTodos() {
  definirTodos(idsPagina.value, !todosSelecionados.value);
}
async function confirmarExclusao() {
  if (await excluir()) await load();
}
async function confirmarRestauracao() {
  if (await restaurar()) await load();
}
function abrirConfirmacao() {
  confirmando.value = true;
}
function fecharConfirmacao() {
  confirmando.value = false;
}

watch([campusFiltro, grupoFiltro, statusFiltro, mostrarExcluidos], () => {
  pagina.value = 0;
  limpar();
  void load();
});
watch(busca, () => {
  if (buscaTimer) clearTimeout(buscaTimer);
  buscaTimer = setTimeout(() => {
    pagina.value = 0;
    void load();
  }, 350);
});
watch(pagina, load);

const dataHora = (ts: string | null) => (ts ? new Date(ts).toLocaleString("pt-BR") : "—");

const statusClasse: Record<string, string> = {
  rascunho: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  pendente: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  confirmado: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  pago: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
  glosado: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900",
  cancelado: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};

onMounted(async () => {
  await Promise.all([loadRefs(), load()]);
});
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-semibold">
        Recibos
        <span v-if="mostrarExcluidos" class="font-normal text-slate-400 dark:text-slate-500">· quarentena</span>
      </h1>
      <div class="flex items-center gap-2">
        <button v-if="podeGerenciar" class="btn-secondary" @click="alternarModo()">
          {{ mostrarExcluidos ? "← Ver ativos" : "Ver excluídos" }}
        </button>
        <RouterLink v-if="!mostrarExcluidos" to="/recibos/novo" class="btn-primary">+ Novo recibo</RouterLink>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 mb-4">
      <input v-model="busca" type="search" placeholder="Buscar por número…" class="input max-w-[13rem]" />
      <select v-model="campusFiltro" class="input max-w-[13rem]">
        <option value="">Todos os campi</option>
        <option v-for="c in campi" :key="c.id" :value="c.id">{{ c.nome }}</option>
      </select>
      <select v-model="grupoFiltro" class="input max-w-[17rem]">
        <option value="">Todos os grupos</option>
        <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
      </select>
      <select v-model="statusFiltro" class="input max-w-[11rem]">
        <option value="">Todos os status</option>
        <option value="rascunho">Rascunho</option>
        <option value="pendente">Pendente</option>
        <option value="confirmado">Confirmado</option>
        <option value="pago">Pago</option>
        <option value="glosado">Glosado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </div>

    <!-- Barra de ação em lote -->
    <div
      v-if="podeGerenciar && qtdSel"
      class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-cpii-600/30 bg-cpii-50 px-4 py-2.5 text-sm dark:border-cpii-500/30 dark:bg-cpii-900/30"
    >
      <span class="font-medium text-cpii-800 dark:text-cpii-100">{{ qtdSel }} selecionado(s)</span>
      <div class="flex-1"></div>
      <button v-if="!mostrarExcluidos" class="btn bg-red-600 text-white hover:bg-red-700" @click="abrirConfirmacao()">
        Excluir selecionados
      </button>
      <button v-else class="btn-primary" :disabled="processando" @click="confirmarRestauracao">
        {{ processando ? "Restaurando…" : "Restaurar selecionados" }}
      </button>
      <button class="btn-ghost" @click="limpar()">Limpar</button>
    </div>

    <div v-if="error || erroQuar" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error || erroQuar }}
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!recibos.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        {{ mostrarExcluidos ? "Nenhum recibo na quarentena." : "Nenhum recibo encontrado." }}
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th v-if="podeGerenciar" class="px-3 py-2 w-10">
              <input type="checkbox" :checked="todosSelecionados" class="accent-cpii-600" @change="alternarTodos" />
            </th>
            <th class="px-4 py-2 text-left">Nº</th>
            <th class="px-4 py-2 text-left">Data</th>
            <th class="px-4 py-2 text-left">Campus</th>
            <th class="px-4 py-2 text-left">Grupo</th>
            <th class="px-4 py-2 text-left">NF</th>
            <th class="px-4 py-2 text-left">Status</th>
            <th v-if="mostrarExcluidos" class="px-4 py-2 text-left">Excluído</th>
            <th v-else class="px-4 py-2 text-left">Autor</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="r in recibos" :key="r.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
            <td v-if="podeGerenciar" class="px-3 py-2">
              <input type="checkbox" :checked="selecionado(r.id)" class="accent-cpii-600" @change="toggle(r.id)" />
            </td>
            <td class="px-4 py-2 font-medium">
              <RouterLink :to="`/recibos/${r.id}`" class="text-cpii-600 dark:text-cpii-300 hover:underline">{{ r.numero }}</RouterLink>
            </td>
            <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(r.data_recebimento) }}</td>
            <td class="px-4 py-2">{{ r.campi?.nome ?? "—" }}</td>
            <td class="px-4 py-2">{{ r.grupos?.nome ?? "—" }}</td>
            <td class="px-4 py-2">{{ r.nf_id ? "vinculada" : "—" }}</td>
            <td class="px-4 py-2">
              <span class="inline-block rounded-full border px-2 py-0.5 text-xs capitalize" :class="statusClasse[r.status] ?? ''">{{ r.status }}</span>
            </td>
            <td v-if="mostrarExcluidos" class="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
              <span :title="`Excluído em ${dataHora(r.deleted_at ?? null)} por ${r.deleted_by_nome ?? '—'}`">
                {{ r.deleted_by_nome ?? "—" }}
              </span>
              <span class="ml-1 text-xs" :class="diasRestantes(r.deleted_at) <= 7 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'">
                · expira em {{ diasRestantes(r.deleted_at) }}d
              </span>
            </td>
            <td v-else class="px-4 py-2 text-slate-600 dark:text-slate-300" :title="`Cadastrado em ${dataHora(r.created_at)}`">
              {{ r.responsavel_nome ?? "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between mt-4 text-sm text-slate-600 dark:text-slate-300">
      <span>{{ total }} recibos · página {{ pagina + 1 }} de {{ Math.max(1, Math.ceil(total / PAGE)) }}</span>
      <div class="flex gap-2">
        <button class="btn-secondary" :disabled="pagina === 0" @click="pagina--">← Anterior</button>
        <button class="btn-secondary" :disabled="(pagina + 1) * PAGE >= total" @click="pagina++">Próxima →</button>
      </div>
    </div>

    <!-- Modal: confirmar exclusão -->
    <div v-if="confirmando" class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 px-4" @click.self="fecharConfirmacao()">
      <div class="card w-full max-w-md p-5 space-y-4">
        <h2 class="font-semibold text-slate-800 dark:text-slate-100">Excluir {{ qtdSel }} recibo(s)?</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          Os itens vão para a <strong>quarentena</strong> e podem ser restaurados por <strong>30 dias</strong>; depois são
          apagados em definitivo. Esta ação fica registrada no log.
        </p>
        <p v-if="erroQuar" class="text-sm text-red-600 dark:text-red-400">{{ erroQuar }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="fecharConfirmacao()">Cancelar</button>
          <button class="btn bg-red-600 text-white hover:bg-red-700" :disabled="processando" @click="confirmarExclusao">
            {{ processando ? "Excluindo…" : "Excluir" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
