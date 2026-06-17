<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import type { Campus, Grupo, Recibo } from "@/types/database";

type ReciboRow = Recibo & {
  campi?: { nome: string } | null;
  grupos?: { nome: string } | null;
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

async function load() {
  loading.value = true;
  error.value = null;
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

  const { data, count, error: err } = await q;
  if (err) error.value = err.message;
  recibos.value = (data as ReciboRow[] | null) ?? [];
  total.value = count ?? 0;
  loading.value = false;
}

async function loadRefs() {
  const [c, g] = await Promise.all([
    supabase.from("campi").select("*").eq("status", "ativo").order("nome"),
    supabase.from("grupos").select("*").order("numero_arabico"),
  ]);
  campi.value = (c.data as Campus[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
}

watch([campusFiltro, grupoFiltro, statusFiltro], () => {
  pagina.value = 0;
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
      <h1 class="text-2xl font-semibold">Recibos</h1>
      <RouterLink to="/recibos/novo" class="btn-primary">+ Novo recibo</RouterLink>
    </div>

    <div class="flex flex-wrap gap-3 mb-4">
      <input
        v-model="busca"
        type="search"
        placeholder="Buscar por número…"
        class="input max-w-[13rem]"
      />
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

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!recibos.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum recibo encontrado.
        <RouterLink to="/recibos/novo" class="text-cpii-600 dark:text-cpii-300 hover:underline">Criar um novo</RouterLink>.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-4 py-2 text-left">Nº</th>
            <th class="px-4 py-2 text-left">Data</th>
            <th class="px-4 py-2 text-left">Campus</th>
            <th class="px-4 py-2 text-left">Grupo</th>
            <th class="px-4 py-2 text-left">NF</th>
            <th class="px-4 py-2 text-left">Status</th>
            <th class="px-4 py-2 text-left">Autor</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="r in recibos" :key="r.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
            <td class="px-4 py-2 font-medium">
              <RouterLink :to="`/recibos/${r.id}`" class="text-cpii-600 dark:text-cpii-300 hover:underline">
                {{ r.numero }}
              </RouterLink>
            </td>
            <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(r.data_recebimento) }}</td>
            <td class="px-4 py-2">{{ r.campi?.nome ?? "—" }}</td>
            <td class="px-4 py-2">{{ r.grupos?.nome ?? "—" }}</td>
            <td class="px-4 py-2">{{ r.nf_id ? "vinculada" : "—" }}</td>
            <td class="px-4 py-2">
              <span
                class="inline-block rounded-full border px-2 py-0.5 text-xs capitalize"
                :class="statusClasse[r.status] ?? ''"
              >{{ r.status }}</span>
            </td>
            <td class="px-4 py-2 text-slate-600 dark:text-slate-300" :title="`Cadastrado em ${dataHora(r.created_at)}`">
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
        <button
          class="btn-secondary"
          :disabled="(pagina + 1) * PAGE >= total"
          @click="pagina++"
        >Próxima →</button>
      </div>
    </div>
  </div>
</template>
