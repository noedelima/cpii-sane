<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import type { AuditLog } from "@/types/database";

const ENTIDADES: Record<string, string> = {
  recibos: "Recibo",
  recibos_itens: "Item de recibo",
  notas_fiscais: "Nota Fiscal",
  nf_itens: "Item de NF",
  nf_empenhos: "Débito NF × NE",
  nf_grupos: "Grupo da NF",
  nf_recibos: "Recibo × NF",
  empenhos: "Empenho",
  empenhos_grupos: "Alocação de NE",
  empenhos_itens: "Item de NE",
  grupos: "Grupo",
  itens: "Item (catálogo)",
  itens_precos: "Preço (histórico)",
  atestes: "Ateste",
  atestes_nfs: "NF do ateste",
  solicitacoes_nf: "Solicitação de NF",
  solicitacoes_nf_recibos: "Recibo da solicitação",
  perfis: "Usuário (perfil)",
  perfis_campi: "Campus do usuário",
  campi: "Campus",
  fornecedores: "Fornecedor",
  configuracoes: "Configuração",
};
const entidadeOpcoes = Object.entries(ENTIDADES).sort((a, b) => a[1].localeCompare(b[1]));
const rotuloEntidade = (e: string) => ENTIDADES[e] ?? e;

const PAGE = 50;
const registros = ref<AuditLog[]>([]);
const page = ref(0);
const temMais = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const expandido = ref<number | null>(null);

const fEntidade = ref("");
const fAcao = ref("");
const fDe = ref("");
const fAte = ref("");
const fBusca = ref("");
let buscaTimer: ReturnType<typeof setTimeout> | null = null;

const dataHora = (ts: string) => new Date(ts).toLocaleString("pt-BR");

const acaoClasse: Record<string, string> = {
  INSERT: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
  UPDATE: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  DELETE: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};
const acaoLabel: Record<string, string> = { INSERT: "Inclusão", UPDATE: "Edição", DELETE: "Exclusão" };

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
interface DiffLinha {
  campo: string;
  antes?: string;
  depois?: string;
}
function linhasDiff(a: AuditLog): DiffLinha[] {
  const d = a.dados;
  if (!d) return [];
  if (a.acao === "UPDATE" && d.alterados) {
    return d.alterados.map((c) => ({
      campo: c,
      antes: fmtVal(d.antes?.[c]),
      depois: fmtVal(d.depois?.[c]),
    }));
  }
  const obj = a.acao === "DELETE" ? d.antes : d.depois;
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([k]) => !["created_at", "updated_at"].includes(k))
    .map(([campo, v]) => ({ campo, depois: fmtVal(v) }));
}

async function load() {
  loading.value = true;
  error.value = null;
  const from = page.value * PAGE;
  let q = supabase
    .from("audit_log")
    .select("*")
    .order("ts", { ascending: false })
    .range(from, from + PAGE);
  if (fEntidade.value) q = q.eq("entidade", fEntidade.value);
  if (fAcao.value) q = q.eq("acao", fAcao.value);
  if (fDe.value) q = q.gte("ts", fDe.value + "T00:00:00");
  if (fAte.value) q = q.lte("ts", fAte.value + "T23:59:59");
  if (fBusca.value.trim()) {
    const b = fBusca.value.trim();
    q = q.or(`resumo.ilike.%${b}%,actor_nome.ilike.%${b}%`);
  }
  const { data, error: err } = await q;
  if (err) {
    error.value = err.message;
    loading.value = false;
    return;
  }
  const linhas = (data as AuditLog[] | null) ?? [];
  temMais.value = linhas.length > PAGE;
  registros.value = linhas.slice(0, PAGE);
  loading.value = false;
}

function recarregar() {
  page.value = 0;
  load();
}
watch([fEntidade, fAcao, fDe, fAte], recarregar);
watch(fBusca, () => {
  if (buscaTimer) clearTimeout(buscaTimer);
  buscaTimer = setTimeout(recarregar, 350);
});

function proxima() {
  if (!temMais.value) return;
  page.value++;
  load();
}
function anterior() {
  if (page.value === 0) return;
  page.value--;
  load();
}

const intervalo = computed(() => {
  if (!registros.value.length) return "";
  const ini = page.value * PAGE + 1;
  return `${ini}–${ini + registros.value.length - 1}`;
});

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-4">
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Registro detalhado de inclusões, edições e exclusões no sistema, com autor, data/hora e
      os campos alterados (antes → depois). Capturado automaticamente pelo banco de dados.
    </p>

    <div class="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="label">Entidade</label>
        <select v-model="fEntidade" class="input max-w-[14rem]">
          <option value="">Todas</option>
          <option v-for="[val, lbl] in entidadeOpcoes" :key="val" :value="val">{{ lbl }}</option>
        </select>
      </div>
      <div>
        <label class="label">Ação</label>
        <select v-model="fAcao" class="input max-w-[10rem]">
          <option value="">Todas</option>
          <option value="INSERT">Inclusão</option>
          <option value="UPDATE">Edição</option>
          <option value="DELETE">Exclusão</option>
        </select>
      </div>
      <div>
        <label class="label">De</label>
        <input v-model="fDe" type="date" class="input" />
      </div>
      <div>
        <label class="label">Até</label>
        <input v-model="fAte" type="date" class="input" />
      </div>
      <div class="grow">
        <label class="label">Buscar (nº/nome ou autor)</label>
        <input v-model="fBusca" type="search" class="input max-w-xs" placeholder="ex.: 000.021 ou Ana" />
      </div>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!registros.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum registro de log para os filtros atuais.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm min-w-[52rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Data/hora</th>
              <th class="px-3 py-2 text-left">Autor</th>
              <th class="px-3 py-2 text-left">Ação</th>
              <th class="px-3 py-2 text-left">Entidade</th>
              <th class="px-3 py-2 text-left">Registro</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <template v-for="r in registros" :key="r.id">
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <td class="px-3 py-2 whitespace-nowrap">{{ dataHora(r.ts) }}</td>
                <td class="px-3 py-2">{{ r.actor_nome ?? "—" }}</td>
                <td class="px-3 py-2">
                  <span class="inline-block rounded-full border px-2 py-0.5 text-xs" :class="acaoClasse[r.acao]">
                    {{ acaoLabel[r.acao] ?? r.acao }}
                  </span>
                </td>
                <td class="px-3 py-2">{{ rotuloEntidade(r.entidade) }}</td>
                <td class="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[16rem] truncate" :title="r.resumo ?? ''">
                  {{ r.resumo ?? r.registro_id ?? "—" }}
                </td>
                <td class="px-3 py-2 text-right">
                  <button
                    class="text-cpii-600 dark:text-cpii-300 text-xs hover:underline"
                    @click="expandido = expandido === r.id ? null : r.id"
                  >{{ expandido === r.id ? "ocultar" : "detalhes" }}</button>
                </td>
              </tr>
              <tr v-if="expandido === r.id" class="bg-slate-50 dark:bg-slate-800/40">
                <td colspan="6" class="px-4 py-3">
                  <div v-if="linhasDiff(r).length" class="space-y-1">
                    <div
                      v-for="(d, i) in linhasDiff(r)"
                      :key="i"
                      class="grid grid-cols-[10rem_1fr] gap-2 text-xs"
                    >
                      <span class="font-medium text-slate-600 dark:text-slate-300">{{ d.campo }}</span>
                      <span class="font-mono">
                        <template v-if="r.acao === 'UPDATE'">
                          <span class="text-red-600 dark:text-red-400 line-through">{{ d.antes }}</span>
                          <span class="text-slate-400"> → </span>
                          <span class="text-green-700 dark:text-green-300">{{ d.depois }}</span>
                        </template>
                        <span v-else :class="r.acao === 'DELETE' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-300'">
                          {{ d.depois ?? d.antes }}
                        </span>
                      </span>
                    </div>
                  </div>
                  <p v-else class="text-xs text-slate-500 dark:text-slate-400">Sem detalhes adicionais.</p>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-if="!loading && registros.length" class="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-sm">
        <span class="text-slate-500 dark:text-slate-400">Registros {{ intervalo }}</span>
        <div class="flex gap-2">
          <button class="btn-ghost" :disabled="page === 0" @click="anterior">Anterior</button>
          <button class="btn-secondary" :disabled="!temMais" @click="proxima">Próximas</button>
        </div>
      </div>
    </div>
  </div>
</template>
