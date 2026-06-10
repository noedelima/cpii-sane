<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { carregarLogo, montarPdfAteste } from "@/lib/pdf-ateste";
import type { Ateste, Fornecedor, Grupo, NotaFiscal } from "@/types/database";

type AtesteRow = Ateste & {
  fornecedores?: { codigo: string; razao_social: string; cnpj: string | null } | null;
  _busy?: boolean;
};

const auth = useAuthStore();

const fornecedores = ref<Fornecedor[]>([]);
const fornecedorId = ref<number | null>(null);
const gruposDoFornecedor = ref<Grupo[]>([]);
const gruposSel = ref<Set<number>>(new Set());

const statusSel = ref<string[]>(["confirmado"]);
const ocultarAtestadas = ref(true);
const dataDe = ref("");
const dataAte = ref("");

const nfs = ref<NotaFiscal[]>([]);
const atestadas = ref<Set<number>>(new Set());
const selecionadas = ref<Set<number>>(new Set());
const limiteAtingido = ref(false);

const processoSuap = ref("");
const localEmissao = ref("Rio de Janeiro");
const observacoes = ref("");

const historico = ref<AtesteRow[]>([]);
const historicoLoading = ref(false);

const loading = ref(false);
const gerando = ref(false);
const error = ref<string | null>(null);
const sucesso = ref<string | null>(null);

const fornecedorAtual = computed(
  () => fornecedores.value.find((f) => f.id === fornecedorId.value) ?? null
);
const grupoPorId = computed(() => new Map(gruposDoFornecedor.value.map((g) => [g.id, g])));

const todasMarcadas = computed(
  () => nfs.value.length > 0 && selecionadas.value.size === nfs.value.length
);
const selecaoParcial = computed(
  () => selecionadas.value.size > 0 && selecionadas.value.size < nfs.value.length
);

async function loadFornecedores() {
  const { data } = await supabase
    .from("fornecedores")
    .select("*")
    .eq("status", "ativo")
    .order("codigo");
  fornecedores.value = (data as Fornecedor[] | null) ?? [];
}

watch(fornecedorId, async () => {
  gruposDoFornecedor.value = [];
  gruposSel.value = new Set();
  nfs.value = [];
  selecionadas.value = new Set();
  sucesso.value = null;
  if (!fornecedorId.value) return;
  const { data } = await supabase
    .from("grupos")
    .select("*")
    .eq("fornecedor_id", fornecedorId.value)
    .order("numero_arabico");
  gruposDoFornecedor.value = (data as Grupo[] | null) ?? [];
  gruposSel.value = new Set(gruposDoFornecedor.value.map((g) => g.id));
  await carregarNFs();
});

watch([gruposSel, statusSel, ocultarAtestadas, dataDe, dataAte], carregarNFs, { deep: true });

async function carregarNFs() {
  if (!fornecedorId.value || gruposSel.value.size === 0) {
    nfs.value = [];
    selecionadas.value = new Set();
    return;
  }
  loading.value = true;
  error.value = null;
  let q = supabase
    .from("notas_fiscais")
    .select("*")
    .in("grupo_id", [...gruposSel.value])
    .order("data_entrega")
    .order("numero")
    .limit(500);
  if (statusSel.value.length) q = q.in("status", statusSel.value);
  if (dataDe.value) q = q.gte("data_entrega", dataDe.value);
  if (dataAte.value) q = q.lte("data_entrega", dataAte.value);

  const { data, error: err } = await q;
  if (err) {
    error.value = err.message;
    loading.value = false;
    return;
  }
  let lista = (data as NotaFiscal[] | null) ?? [];
  limiteAtingido.value = lista.length === 500;

  const ids = lista.map((n) => n.id);
  atestadas.value = new Set();
  if (ids.length) {
    const { data: ja } = await supabase.from("atestes_nfs").select("nf_id").in("nf_id", ids);
    atestadas.value = new Set(((ja as { nf_id: number }[] | null) ?? []).map((x) => x.nf_id));
  }
  if (ocultarAtestadas.value) {
    lista = lista.filter((n) => !atestadas.value.has(n.id));
  }
  nfs.value = lista;
  selecionadas.value = new Set(lista.filter((n) => !atestadas.value.has(n.id)).map((n) => n.id));
  loading.value = false;
}

function toggleGrupo(id: number) {
  const s = new Set(gruposSel.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  gruposSel.value = s;
}
function toggleNF(id: number) {
  const s = new Set(selecionadas.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selecionadas.value = s;
}
function toggleTodas() {
  if (todasMarcadas.value) selecionadas.value = new Set();
  else selecionadas.value = new Set(nfs.value.map((n) => n.id));
}
function toggleStatus(st: string) {
  const i = statusSel.value.indexOf(st);
  if (i >= 0) statusSel.value.splice(i, 1);
  else statusSel.value.push(st);
}

const nfsSelecionadas = computed(() => nfs.value.filter((n) => selecionadas.value.has(n.id)));
const resumoPorGrupo = computed(() => {
  const m = new Map<number, { grupo: Grupo | undefined; qtd: number; total: number }>();
  for (const n of nfsSelecionadas.value) {
    let e = m.get(n.grupo_id);
    if (!e) {
      e = { grupo: grupoPorId.value.get(n.grupo_id), qtd: 0, total: 0 };
      m.set(n.grupo_id, e);
    }
    e.qtd++;
    e.total += Number(n.valor_total ?? 0);
  }
  return [...m.values()].sort(
    (a, b) => (a.grupo?.numero_arabico ?? 0) - (b.grupo?.numero_arabico ?? 0)
  );
});
const totalGeral = computed(() =>
  nfsSelecionadas.value.reduce((a, n) => a + Number(n.valor_total ?? 0), 0)
);

// ---------- emissão ----------
async function gerarAteste() {
  error.value = null;
  sucesso.value = null;
  if (!fornecedorAtual.value || nfsSelecionadas.value.length === 0) {
    error.value = "Selecione o fornecedor e ao menos uma nota fiscal.";
    return;
  }
  gerando.value = true;
  try {
    const { data: at, error: e1 } = await supabase
      .from("atestes")
      .insert({
        fornecedor_id: fornecedorAtual.value.id,
        processo_suap: processoSuap.value.trim() || null,
        local_emissao: localEmissao.value.trim() || "Rio de Janeiro",
        data_emissao: new Date().toISOString().slice(0, 10),
        observacoes: observacoes.value.trim() || null,
        valor_total: Math.round(totalGeral.value * 100) / 100,
        qtd_nfs: nfsSelecionadas.value.length,
        gerado_por: auth.user?.id ?? null,
        gerado_por_nome: auth.perfil?.nome ?? null,
      })
      .select("id")
      .single();
    if (e1 || !at) throw e1 ?? new Error("Falha ao registrar o ateste.");
    const atesteId = (at as { id: number }).id;

    const vinculos = nfsSelecionadas.value.map((n) => ({ ateste_id: atesteId, nf_id: n.id }));
    const { error: e2 } = await supabase.from("atestes_nfs").insert(vinculos);
    if (e2) throw e2;

    const { doc, numeroDoc, filename } = montarPdfAteste({
      atesteId,
      dataEmissao: new Date(),
      fornecedor: fornecedorAtual.value,
      grupoPorId: grupoPorId.value,
      nfs: nfsSelecionadas.value,
      processoSuap: processoSuap.value.trim() || null,
      localEmissao: localEmissao.value.trim() || "Rio de Janeiro",
      observacoes: observacoes.value.trim() || null,
      assinanteNome: auth.perfil?.nome ?? "",
      logoDataUrl: await carregarLogo(),
    });
    doc.save(filename);

    sucesso.value = `Ateste nº ${numeroDoc} gerado com ${nfsSelecionadas.value.length} NF(s), total ${fmtMoney(totalGeral.value)}. O PDF foi baixado — anexe ao processo no SUAP.`;
    await Promise.all([carregarNFs(), loadHistorico()]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao gerar o ateste.";
  } finally {
    gerando.value = false;
  }
}

// ---------- histórico ----------
async function loadHistorico() {
  historicoLoading.value = true;
  const { data, error: err } = await supabase
    .from("atestes")
    .select("*, fornecedores (codigo, razao_social, cnpj)")
    .order("id", { ascending: false })
    .limit(50);
  if (err) error.value = err.message;
  historico.value = (data as AtesteRow[] | null) ?? [];
  historicoLoading.value = false;
}

async function baixarDoHistorico(a: AtesteRow) {
  if (!a.fornecedores) return;
  a._busy = true;
  error.value = null;
  try {
    const [{ data: vinc, error: e1 }, { data: gs, error: e2 }] = await Promise.all([
      supabase.from("atestes_nfs").select("nf_id, notas_fiscais (*)").eq("ateste_id", a.id),
      supabase.from("grupos").select("*"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const nfsDoAteste = ((vinc as unknown as { notas_fiscais: NotaFiscal }[] | null) ?? [])
      .map((v) => v.notas_fiscais)
      .filter(Boolean)
      .sort((x, y) => (x.data_entrega < y.data_entrega ? -1 : 1));
    if (!nfsDoAteste.length) throw new Error("Ateste sem NFs vinculadas.");

    const mapa = new Map(((gs as Grupo[] | null) ?? []).map((g) => [g.id, g]));
    const { doc, filename } = montarPdfAteste({
      atesteId: a.id,
      dataEmissao: new Date(a.data_emissao + "T12:00:00"),
      fornecedor: a.fornecedores,
      grupoPorId: mapa,
      nfs: nfsDoAteste,
      processoSuap: a.processo_suap,
      localEmissao: a.local_emissao,
      observacoes: a.observacoes,
      assinanteNome: a.gerado_por_nome ?? "",
      logoDataUrl: await carregarLogo(),
    });
    doc.save(filename);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao baixar o ateste.";
  } finally {
    a._busy = false;
  }
}

async function excluirAteste(a: AtesteRow) {
  const ok = confirm(
    `Excluir o ateste nº ${String(a.id).padStart(3, "0")}/${a.data_emissao.slice(0, 4)} ` +
      `(${a.qtd_nfs} NFs, ${fmtMoney(a.valor_total)})?\n\n` +
      `As NFs voltam a ficar disponíveis para um novo ateste. O PDF já baixado deixa de valer.`
  );
  if (!ok) return;
  a._busy = true;
  error.value = null;
  const { error: err } = await supabase.from("atestes").delete().eq("id", a.id);
  a._busy = false;
  if (err) {
    error.value = err.message;
    return;
  }
  await Promise.all([loadHistorico(), carregarNFs()]);
}

onMounted(async () => {
  await Promise.all([loadFornecedores(), loadHistorico()]);
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Ateste de recebimento</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Selecione a empresa e as notas fiscais recebidas; o sistema gera o PDF de ateste
        para inclusão no processo de pagamento no SUAP e registra o documento aqui.
      </p>
    </div>

    <div class="card p-5 space-y-4">
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="label">Empresa (fornecedor)</label>
          <select v-model="fornecedorId" class="input">
            <option :value="null" disabled>Selecione…</option>
            <option v-for="f in fornecedores" :key="f.id" :value="f.id">
              {{ f.codigo }} — {{ f.razao_social }}
            </option>
          </select>
        </div>
        <div v-if="fornecedorAtual" class="self-end pb-2 text-sm text-slate-600 dark:text-slate-300">
          CNPJ: <strong>{{ fornecedorAtual.cnpj ?? "—" }}</strong>
        </div>
      </div>

      <div v-if="gruposDoFornecedor.length">
        <span class="label">Contratos / grupos da empresa</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="g in gruposDoFornecedor"
            :key="g.id"
            type="button"
            class="rounded-full border px-3 py-1 text-sm transition-colors"
            :class="gruposSel.has(g.id)
              ? 'bg-cpii-600 text-white border-cpii-600'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-cpii-500'"
            @click="toggleGrupo(g.id)"
          >{{ g.nome }}</button>
        </div>
      </div>

      <div v-if="fornecedorId" class="flex flex-wrap items-end gap-4">
        <div>
          <span class="label">Status das NFs</span>
          <div class="flex gap-2">
            <button
              v-for="st in ['pendente', 'confirmado', 'pago']"
              :key="st"
              type="button"
              class="rounded-md border px-2.5 py-1 text-xs capitalize transition-colors"
              :class="statusSel.includes(st)
                ? 'bg-cpii-600 text-white border-cpii-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'"
              @click="toggleStatus(st)"
            >{{ st }}</button>
          </div>
        </div>
        <div>
          <label class="label">Entrega de</label>
          <input v-model="dataDe" type="date" class="input" />
        </div>
        <div>
          <label class="label">até</label>
          <input v-model="dataAte" type="date" class="input" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 pb-2.5 cursor-pointer">
          <input v-model="ocultarAtestadas" type="checkbox" class="rounded border-slate-300 dark:border-slate-600" />
          Ocultar NFs já atestadas
        </label>
      </div>
    </div>

    <div v-if="fornecedorId" class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">
          Notas fiscais ({{ selecionadas.size }} de {{ nfs.length }} selecionadas)
        </h2>
        <button class="btn-ghost text-sm" @click="toggleTodas">
          {{ todasMarcadas ? "Desmarcar todas" : "Marcar todas" }}
        </button>
      </div>
      <p v-if="limiteAtingido" class="px-4 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900">
        Mostrando as primeiras 500 NFs — refine pelo período para ver todas.
      </p>

      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!nfs.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhuma NF encontrada com os filtros atuais.
      </div>
      <div v-else class="max-h-[26rem] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs sticky top-0">
            <tr>
              <th class="px-3 py-2 w-10">
                <input
                  type="checkbox"
                  class="rounded border-slate-300 dark:border-slate-600 cursor-pointer"
                  title="Marcar/desmarcar todas"
                  :checked="todasMarcadas"
                  :indeterminate="selecaoParcial"
                  @change="toggleTodas"
                />
              </th>
              <th class="px-3 py-2 text-left">NF</th>
              <th class="px-3 py-2 text-left">Entrega</th>
              <th class="px-3 py-2 text-left">Grupo</th>
              <th class="px-3 py-2 text-left">Processo pgto.</th>
              <th class="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr
              v-for="n in nfs"
              :key="n.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
              :class="{ 'opacity-60': atestadas.has(n.id) }"
              @click="toggleNF(n.id)"
            >
              <td class="px-3 py-2">
                <input
                  type="checkbox"
                  class="rounded border-slate-300 dark:border-slate-600 pointer-events-none"
                  :checked="selecionadas.has(n.id)"
                />
              </td>
              <td class="px-3 py-2 font-medium">
                {{ n.numero }}
                <span
                  v-if="atestadas.has(n.id)"
                  class="ml-1.5 text-[10px] uppercase bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded px-1 py-0.5"
                >já atestada</span>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">{{ fmtDate(n.data_entrega) }}</td>
              <td class="px-3 py-2">{{ grupoPorId.get(n.grupo_id)?.numero_romano ?? "—" }}</td>
              <td class="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[14rem] truncate" :title="n.processo_pagamento ?? ''">
                {{ n.processo_pagamento ?? "—" }}
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ fmtMoney(n.valor_total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="nfsSelecionadas.length" class="card p-5 space-y-4">
      <h2 class="font-medium text-slate-700 dark:text-slate-200">Resumo e emissão</h2>

      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          v-for="r in resumoPorGrupo"
          :key="r.grupo?.id ?? 0"
          class="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
        >
          <div class="font-medium">Grupo {{ r.grupo?.numero_romano ?? "—" }}</div>
          <div class="text-slate-500 dark:text-slate-400">{{ r.qtd }} NF(s) · {{ fmtMoney(r.total) }}</div>
        </div>
      </div>
      <p class="text-sm">
        Total do ateste:
        <strong class="tabular-nums text-base">{{ fmtMoney(totalGeral) }}</strong>
        em {{ nfsSelecionadas.length }} nota(s) fiscal(is).
      </p>

      <div class="grid sm:grid-cols-3 gap-4">
        <div>
          <label class="label">Processo SUAP (pagamento)</label>
          <input v-model="processoSuap" type="text" class="input" placeholder="23040.000000/2026-00" />
        </div>
        <div>
          <label class="label">Local de emissão</label>
          <input v-model="localEmissao" type="text" class="input" />
        </div>
        <div>
          <label class="label">Observações (entram no PDF)</label>
          <input v-model="observacoes" type="text" class="input" />
        </div>
      </div>

      <div class="flex justify-end">
        <button class="btn-primary" :disabled="gerando" @click="gerarAteste">
          {{ gerando ? "Gerando…" : "Registrar ateste e baixar PDF" }}
        </button>
      </div>
    </div>

    <div v-if="sucesso" class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-200">
      {{ sucesso }}
    </div>
    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <!-- Histórico -->
    <div class="card overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Atestes emitidos</h2>
      </div>
      <div v-if="historicoLoading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!historico.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum ateste emitido ainda.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm min-w-[52rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-4 py-2 text-left">Nº</th>
              <th class="px-4 py-2 text-left">Data</th>
              <th class="px-4 py-2 text-left">Fornecedor</th>
              <th class="px-4 py-2 text-right">NFs</th>
              <th class="px-4 py-2 text-right">Valor</th>
              <th class="px-4 py-2 text-left">Processo SUAP</th>
              <th class="px-4 py-2 text-left">Emitido por</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="a in historico" :key="a.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-4 py-2 font-medium whitespace-nowrap">
                {{ String(a.id).padStart(3, "0") }}/{{ a.data_emissao.slice(0, 4) }}
              </td>
              <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(a.data_emissao) }}</td>
              <td class="px-4 py-2">{{ a.fornecedores?.codigo ?? a.fornecedor_id }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ a.qtd_nfs }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(a.valor_total) }}</td>
              <td class="px-4 py-2 text-slate-600 dark:text-slate-300 max-w-[12rem] truncate" :title="a.processo_suap ?? ''">
                {{ a.processo_suap ?? "—" }}
              </td>
              <td class="px-4 py-2 text-slate-600 dark:text-slate-300 max-w-[10rem] truncate">
                {{ a.gerado_por_nome ?? "—" }}
              </td>
              <td class="px-4 py-2 text-right whitespace-nowrap space-x-3">
                <button
                  class="text-cpii-600 dark:text-cpii-300 text-xs hover:underline disabled:opacity-50"
                  :disabled="a._busy"
                  @click="baixarDoHistorico(a)"
                >{{ a._busy ? "…" : "Baixar PDF" }}</button>
                <button
                  class="text-red-600 dark:text-red-400 text-xs hover:underline disabled:opacity-50"
                  :disabled="a._busy"
                  @click="excluirAteste(a)"
                >Excluir</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
