<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { carregarLogo } from "@/lib/pdf-ateste";
import { montarPdfSolicitacaoNF } from "@/lib/pdf-solicitacao-nf";
import { getCabecalho } from "@/lib/config";
import type { Fornecedor, Grupo, Recibo, SolicitacaoNF } from "@/types/database";

type ReciboRow = Recibo & { campi?: { nome: string } | null };
type SolicRow = SolicitacaoNF & {
  fornecedores?: { codigo: string; razao_social: string; cnpj: string | null } | null;
  _busy?: boolean;
};
interface ReciboItemRow {
  recibo_id: number;
  item_id: number;
  quantidade: number;
  unidade: string | null;
}

const auth = useAuthStore();

const fornecedores = ref<Fornecedor[]>([]);
const fornecedorId = ref<number | null>(null);
const gruposDoFornecedor = ref<Grupo[]>([]);
const grupoFiltro = ref<number | null>(null);
const dataDe = ref("");
const dataAte = ref("");
const observacoes = ref("");

const recibos = ref<ReciboRow[]>([]);
const selecionados = ref<Set<number>>(new Set());
const reciboItens = ref<Map<number, ReciboItemRow[]>>(new Map());
const itensMeta = ref<Map<number, { descricao: string; codigo_catmat: string | null; unidade: string; preco_unitario: number }>>(new Map());

const historico = ref<SolicRow[]>([]);
const loading = ref(false);
const gerando = ref(false);
const error = ref<string | null>(null);
const sucesso = ref<string | null>(null);

const fornecedorAtual = computed(
  () => fornecedores.value.find((f) => f.id === fornecedorId.value) ?? null
);
const grupoPorId = computed(() => new Map(gruposDoFornecedor.value.map((g) => [g.id, g])));
const recibosSelecionados = computed(() => recibos.value.filter((r) => selecionados.value.has(r.id)));

interface ItemConsolidado {
  item_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
}
const itensConsolidados = computed<ItemConsolidado[]>(() => {
  const m = new Map<number, ItemConsolidado>();
  for (const r of recibosSelecionados.value) {
    for (const ri of reciboItens.value.get(r.id) ?? []) {
      const meta = itensMeta.value.get(ri.item_id);
      let e = m.get(ri.item_id);
      if (!e) {
        e = {
          item_id: ri.item_id,
          descricao: meta?.descricao ?? "—",
          codigo_catmat: meta?.codigo_catmat ?? null,
          unidade: ri.unidade ?? meta?.unidade ?? "",
          quantidade: 0,
          valor_unitario: Number(meta?.preco_unitario ?? 0),
        };
        m.set(ri.item_id, e);
      }
      e.quantidade += Number(ri.quantidade);
    }
  }
  return [...m.values()].sort((a, b) => a.descricao.localeCompare(b.descricao));
});
const valorEstimado = computed(() =>
  itensConsolidados.value.reduce((a, it) => a + it.quantidade * it.valor_unitario, 0)
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
  grupoFiltro.value = null;
  recibos.value = [];
  selecionados.value = new Set();
  sucesso.value = null;
  if (!fornecedorId.value) return;
  const { data } = await supabase
    .from("grupos")
    .select("*")
    .eq("fornecedor_id", fornecedorId.value)
    .order("numero_arabico");
  gruposDoFornecedor.value = (data as Grupo[] | null) ?? [];
  await carregarRecibos();
});

watch([grupoFiltro, dataDe, dataAte], carregarRecibos);

async function carregarRecibos() {
  if (!fornecedorId.value) return;
  loading.value = true;
  error.value = null;
  // O recibo não guarda fornecedor_id — o fornecedor vem do grupo. Filtra-se então
  // pelos grupos do fornecedor (ou pelo grupo selecionado).
  const gruposIds = gruposDoFornecedor.value.map((g) => g.id);
  if (!gruposIds.length) {
    recibos.value = [];
    selecionados.value = new Set();
    loading.value = false;
    return;
  }
  let q = supabase
    .from("recibos")
    .select("*, campi (nome)")
    .order("data_recebimento", { ascending: false })
    .limit(300);
  if (grupoFiltro.value) q = q.eq("grupo_id", grupoFiltro.value);
  else q = q.in("grupo_id", gruposIds);
  if (dataDe.value) q = q.gte("data_recebimento", dataDe.value);
  if (dataAte.value) q = q.lte("data_recebimento", dataAte.value);
  const { data, error: err } = await q;
  if (err) {
    error.value = err.message;
    loading.value = false;
    return;
  }
  recibos.value = (data as ReciboRow[] | null) ?? [];
  selecionados.value = new Set(recibos.value.map((r) => r.id));
  await carregarItensDosRecibos();
  loading.value = false;
}

async function carregarItensDosRecibos() {
  reciboItens.value = new Map();
  itensMeta.value = new Map();
  const ids = recibos.value.map((r) => r.id);
  if (!ids.length) return;
  const { data: ris } = await supabase
    .from("recibos_itens")
    .select("recibo_id, item_id, quantidade, unidade")
    .in("recibo_id", ids);
  const linhas = (ris as ReciboItemRow[] | null) ?? [];
  for (const ri of linhas) {
    const arr = reciboItens.value.get(ri.recibo_id) ?? [];
    arr.push(ri);
    reciboItens.value.set(ri.recibo_id, arr);
  }
  const itemIds = Array.from(new Set(linhas.map((l) => l.item_id)));
  if (itemIds.length) {
    const { data: its } = await supabase
      .from("itens")
      .select("id, descricao, codigo_catmat, unidade, preco_unitario")
      .in("id", itemIds);
    for (const it of (its as { id: number; descricao: string; codigo_catmat: string | null; unidade: string; preco_unitario: number }[] | null) ?? []) {
      itensMeta.value.set(it.id, {
        descricao: it.descricao,
        codigo_catmat: it.codigo_catmat,
        unidade: it.unidade,
        preco_unitario: Number(it.preco_unitario),
      });
    }
  }
}

function toggleRecibo(id: number) {
  const s = new Set(selecionados.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selecionados.value = s;
}
const todosMarcados = computed(
  () => recibos.value.length > 0 && selecionados.value.size === recibos.value.length
);
function toggleTodos() {
  if (todosMarcados.value) selecionados.value = new Set();
  else selecionados.value = new Set(recibos.value.map((r) => r.id));
}

function gruposSelecionadosNomes(): string[] {
  const ids = new Set(recibosSelecionados.value.map((r) => r.grupo_id));
  return [...ids].map((id) => grupoPorId.value.get(id)?.nome).filter(Boolean) as string[];
}
function periodoSelecionado(): { inicio: string | null; fim: string | null } {
  const datas = recibosSelecionados.value.map((r) => r.data_recebimento).sort();
  return {
    inicio: datas[0] ?? (dataDe.value || null),
    fim: datas[datas.length - 1] ?? (dataAte.value || null),
  };
}

async function gerarSolicitacao() {
  error.value = null;
  sucesso.value = null;
  if (!fornecedorAtual.value || !recibosSelecionados.value.length) {
    error.value = "Selecione a empresa e ao menos um recibo.";
    return;
  }
  gerando.value = true;
  try {
    const periodo = periodoSelecionado();
    const gruposSel = new Set(recibosSelecionados.value.map((r) => r.grupo_id));
    const grupoUnico = grupoFiltro.value ?? (gruposSel.size === 1 ? [...gruposSel][0] : null);

    const { data: sol, error: e1 } = await supabase
      .from("solicitacoes_nf")
      .insert({
        fornecedor_id: fornecedorAtual.value.id,
        grupo_id: grupoUnico,
        data_solicitacao: new Date().toISOString().slice(0, 10),
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        observacoes: observacoes.value.trim() || null,
        status: "aberta",
        valor_estimado: Math.round(valorEstimado.value * 100) / 100,
        qtd_recibos: recibosSelecionados.value.length,
        gerado_por: auth.user?.id ?? null,
        gerado_por_nome: auth.perfil?.nome ?? null,
      })
      .select("id")
      .single();
    if (e1 || !sol) throw e1 ?? new Error("Falha ao registrar a solicitação.");
    const solId = (sol as { id: number }).id;

    const vinc = recibosSelecionados.value.map((r) => ({ solicitacao_id: solId, recibo_id: r.id }));
    const { error: e2 } = await supabase.from("solicitacoes_nf_recibos").insert(vinc);
    if (e2) throw e2;

    const { doc, filename } = montarPdfSolicitacaoNF({
      solicitacaoId: solId,
      dataSolicitacao: new Date(),
      fornecedor: fornecedorAtual.value,
      grupos: gruposSelecionadosNomes(),
      periodo,
      recibos: recibosSelecionados.value.map((r) => ({
        numero: r.numero,
        campus: r.campi?.nome ?? "—",
        data_recebimento: r.data_recebimento,
      })),
      itens: itensConsolidados.value.map((it) => ({
        codigo_catmat: it.codigo_catmat,
        descricao: it.descricao,
        unidade: it.unidade,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
      })),
      observacoes: observacoes.value.trim() || null,
      emitidoPor: auth.perfil?.nome ?? "",
      logoDataUrl: await carregarLogo(),
      cabecalho: await getCabecalho(),
    });
    doc.save(filename);

    sucesso.value = `Solicitação nº ${String(solId).padStart(3, "0")} registrada com ${recibosSelecionados.value.length} recibo(s). O PDF foi baixado — envie à empresa para emissão da NF.`;
    await loadHistorico();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao gerar a solicitação.";
  } finally {
    gerando.value = false;
  }
}

const statusLabel: Record<string, string> = {
  aberta: "Aberta",
  enviada: "Enviada",
  atendida: "Atendida",
  cancelada: "Cancelada",
};

async function loadHistorico() {
  const { data } = await supabase
    .from("solicitacoes_nf")
    .select("*, fornecedores (codigo, razao_social, cnpj)")
    .order("id", { ascending: false })
    .limit(50);
  historico.value = (data as SolicRow[] | null) ?? [];
}

async function mudarStatus(s: SolicRow, novo: string) {
  s._busy = true;
  const { error: err } = await supabase
    .from("solicitacoes_nf")
    .update({ status: novo })
    .eq("id", s.id);
  s._busy = false;
  if (err) error.value = err.message;
  else s.status = novo as SolicitacaoNF["status"];
}

async function rebaixarPdf(s: SolicRow) {
  if (!s.fornecedores) return;
  s._busy = true;
  error.value = null;
  try {
    const { data: vinc } = await supabase
      .from("solicitacoes_nf_recibos")
      .select("recibos (*, campi (nome))")
      .eq("solicitacao_id", s.id);
    type V = { recibos: ReciboRow | null };
    const recs = ((vinc as unknown as V[] | null) ?? []).map((v) => v.recibos).filter(Boolean) as ReciboRow[];
    if (!recs.length) throw new Error("Solicitação sem recibos vinculados.");
    const recIds = recs.map((r) => r.id);
    const { data: ris } = await supabase
      .from("recibos_itens")
      .select("recibo_id, item_id, quantidade, unidade")
      .in("recibo_id", recIds);
    const linhas = (ris as ReciboItemRow[] | null) ?? [];
    const itemIds = Array.from(new Set(linhas.map((l) => l.item_id)));
    const metaMap = new Map<number, { descricao: string; codigo_catmat: string | null; unidade: string; preco_unitario: number }>();
    if (itemIds.length) {
      const { data: its } = await supabase
        .from("itens")
        .select("id, descricao, codigo_catmat, unidade, preco_unitario")
        .in("id", itemIds);
      for (const it of (its as { id: number; descricao: string; codigo_catmat: string | null; unidade: string; preco_unitario: number }[] | null) ?? []) {
        metaMap.set(it.id, { descricao: it.descricao, codigo_catmat: it.codigo_catmat, unidade: it.unidade, preco_unitario: Number(it.preco_unitario) });
      }
    }
    const cons = new Map<number, ItemConsolidado>();
    for (const ri of linhas) {
      const meta = metaMap.get(ri.item_id);
      let e = cons.get(ri.item_id);
      if (!e) {
        e = { item_id: ri.item_id, descricao: meta?.descricao ?? "—", codigo_catmat: meta?.codigo_catmat ?? null, unidade: ri.unidade ?? meta?.unidade ?? "", quantidade: 0, valor_unitario: Number(meta?.preco_unitario ?? 0) };
        cons.set(ri.item_id, e);
      }
      e.quantidade += Number(ri.quantidade);
    }
    const gruposNomes = Array.from(new Set(recs.map((r) => r.grupo_id)))
      .map((id) => gruposDoFornecedor.value.find((g) => g.id === id)?.nome)
      .filter(Boolean) as string[];
    const { doc, filename } = montarPdfSolicitacaoNF({
      solicitacaoId: s.id,
      dataSolicitacao: new Date(s.data_solicitacao + "T12:00:00"),
      fornecedor: s.fornecedores,
      grupos: gruposNomes,
      periodo: { inicio: s.periodo_inicio, fim: s.periodo_fim },
      recibos: recs.map((r) => ({ numero: r.numero, campus: r.campi?.nome ?? "—", data_recebimento: r.data_recebimento })),
      itens: [...cons.values()].sort((a, b) => a.descricao.localeCompare(b.descricao)),
      observacoes: s.observacoes,
      emitidoPor: s.gerado_por_nome ?? "",
      logoDataUrl: await carregarLogo(),
      cabecalho: await getCabecalho(),
    });
    doc.save(filename);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao baixar o PDF.";
  } finally {
    s._busy = false;
  }
}

onMounted(async () => {
  await Promise.all([loadFornecedores(), loadHistorico()]);
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Solicitar emissão de NF</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Selecione a empresa e os recibos de uma entrega; o sistema consolida as quantidades finais
        e gera um PDF para a empresa conferir e emitir a nota fiscal. A solicitação fica registrada
        para acompanhamento.
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

      <div v-if="fornecedorId" class="flex flex-wrap items-end gap-4">
        <div>
          <label class="label">Grupo (opcional)</label>
          <select v-model="grupoFiltro" class="input max-w-xs">
            <option :value="null">Todos os grupos</option>
            <option v-for="g in gruposDoFornecedor" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </select>
        </div>
        <div>
          <label class="label">Recebimento de</label>
          <input v-model="dataDe" type="date" class="input" />
        </div>
        <div>
          <label class="label">até</label>
          <input v-model="dataAte" type="date" class="input" />
        </div>
      </div>
    </div>

    <div v-if="fornecedorId" class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">
          Recibos ({{ selecionados.size }} de {{ recibos.length }} selecionados)
        </h2>
        <button class="btn-ghost text-sm" @click="toggleTodos">
          {{ todosMarcados ? "Desmarcar todos" : "Marcar todos" }}
        </button>
      </div>
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!recibos.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum recibo encontrado para os filtros atuais.
      </div>
      <div v-else class="max-h-80 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs sticky top-0">
            <tr>
              <th class="px-3 py-2 w-10"></th>
              <th class="px-3 py-2 text-left">Recibo</th>
              <th class="px-3 py-2 text-left">Campus</th>
              <th class="px-3 py-2 text-left">Grupo</th>
              <th class="px-3 py-2 text-left">Recebimento</th>
              <th class="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr
              v-for="r in recibos"
              :key="r.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
              @click="toggleRecibo(r.id)"
            >
              <td class="px-3 py-2">
                <input
                  type="checkbox"
                  class="rounded border-slate-300 dark:border-slate-600 pointer-events-none"
                  :checked="selecionados.has(r.id)"
                />
              </td>
              <td class="px-3 py-2 font-medium">{{ r.numero }}</td>
              <td class="px-3 py-2">{{ r.campi?.nome ?? "—" }}</td>
              <td class="px-3 py-2">{{ grupoPorId.get(r.grupo_id)?.numero_romano ?? "—" }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ fmtDate(r.data_recebimento) }}</td>
              <td class="px-3 py-2 capitalize">{{ r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="recibosSelecionados.length" class="card p-5 space-y-4">
      <h2 class="font-medium text-slate-700 dark:text-slate-200">Quantidades finais consolidadas</h2>
      <div v-if="itensConsolidados.length" class="overflow-x-auto">
        <table class="w-full text-sm min-w-[40rem]">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">CatMat</th>
              <th class="text-left py-1">Item</th>
              <th class="text-right py-1">Qtd total</th>
              <th class="text-right py-1">Vlr unit. (ref.)</th>
              <th class="text-right py-1">Total (ref.)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="it in itensConsolidados" :key="it.item_id">
              <td class="py-2 text-slate-600 dark:text-slate-300">{{ it.codigo_catmat ?? "—" }}</td>
              <td class="py-2">{{ it.descricao }}</td>
              <td class="py-2 text-right tabular-nums">{{ it.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) }} {{ it.unidade }}</td>
              <td class="py-2 text-right tabular-nums">{{ fmtMoney(it.valor_unitario) }}</td>
              <td class="py-2 text-right tabular-nums">{{ fmtMoney(it.quantidade * it.valor_unitario) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t border-slate-300 dark:border-slate-600 font-medium">
              <td class="py-2" colspan="4">Total estimado</td>
              <td class="py-2 text-right tabular-nums">{{ fmtMoney(valorEstimado) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">
        Os recibos selecionados não têm itens lançados — o PDF listará apenas os recibos.
      </p>

      <div>
        <label class="label">Observações (entram no PDF)</label>
        <input v-model="observacoes" type="text" class="input" />
      </div>

      <div class="flex justify-end">
        <button class="btn-primary" :disabled="gerando" @click="gerarSolicitacao">
          {{ gerando ? "Gerando…" : "Registrar solicitação e baixar PDF" }}
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
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Solicitações registradas</h2>
      </div>
      <div v-if="!historico.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhuma solicitação registrada ainda.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm min-w-[52rem]">
          <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
            <tr>
              <th class="px-4 py-2 text-left">Nº</th>
              <th class="px-4 py-2 text-left">Data</th>
              <th class="px-4 py-2 text-left">Fornecedor</th>
              <th class="px-4 py-2 text-right">Recibos</th>
              <th class="px-4 py-2 text-right">Estimado</th>
              <th class="px-4 py-2 text-left">Status</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="s in historico" :key="s.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <td class="px-4 py-2 font-medium whitespace-nowrap">
                {{ String(s.id).padStart(3, "0") }}/{{ s.data_solicitacao.slice(0, 4) }}
              </td>
              <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(s.data_solicitacao) }}</td>
              <td class="px-4 py-2">{{ s.fornecedores?.codigo ?? s.fornecedor_id }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ s.qtd_recibos }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ fmtMoney(s.valor_estimado) }}</td>
              <td class="px-4 py-2">
                <select
                  :value="s.status"
                  class="input py-1 text-xs"
                  :disabled="s._busy"
                  @change="mudarStatus(s, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="(lbl, val) in statusLabel" :key="val" :value="val">{{ lbl }}</option>
                </select>
              </td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <button
                  class="text-cpii-600 dark:text-cpii-300 text-xs hover:underline disabled:opacity-50"
                  :disabled="s._busy"
                  @click="rebaixarPdf(s)"
                >{{ s._busy ? "…" : "Baixar PDF" }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
