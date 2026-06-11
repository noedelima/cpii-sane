<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtMoney } from "@/lib/format";
import PdfUpload from "@/components/PdfUpload.vue";
import type { Grupo, Item, NFEmpenho, NotaFiscal, Recibo, VwEmpenhoSaldo } from "@/types/database";

type RateioRow = NFEmpenho & { empenhos?: { numero: string } | null };

interface LinhaNFItem {
  id?: number;
  item_id: number;
  quantidade: number;
  valor_unitario: number | null;
  _descricao: string;
  _unidade: string;
  _catmat: string | null;
  _empenhoNumero?: string | null;
}

type ReciboRow = Recibo & { campi?: { nome: string } | null };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const nfId = computed(() => (route.params.id ? Number(route.params.id) : null));
const editMode = computed(() => nfId.value != null);

const grupos = ref<Grupo[]>([]);
const empenhosDoGrupo = ref<VwEmpenhoSaldo[]>([]);

const numero = ref("");
const grupoId = ref<number | null>(null);
const dataEmissao = ref<string>("");
const dataEntrega = ref(new Date().toISOString().slice(0, 10));
const valorTotal = ref<number | null>(null);
const processoPagamento = ref("");
const dataAberturaProcesso = ref<string>("");
const status = ref<NotaFiscal["status"]>("pendente");
const ocorrencias = ref("");
const observacoes = ref("");
const linkPdf = ref<string | null>(null);

const rateios = ref<RateioRow[]>([]);
const rateioEmpenhoId = ref<number | null>(null);
const rateioValor = ref<number | null>(null);

// itens da NF (seleção a partir do catálogo do grupo)
const nfItens = ref<LinhaNFItem[]>([]);
const itensDoGrupoNF = ref<Item[]>([]);
const novoItemId = ref<number | null>(null);
const novaQtd = ref<number | null>(null);

// recibos vinculados a esta NF
const recibosVinculados = ref<ReciboRow[]>([]);
const mesclando = ref(false);

const loading = ref(false);
const saving = ref(false);
const distribuindo = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

const grupoAtual = computed(() => grupos.value.find((g) => g.id === grupoId.value));
const somaRateada = computed(() =>
  rateios.value.reduce((a, r) => a + Number(r.valor_debitado), 0)
);
const faltaRatear = computed(() => (valorTotal.value ?? 0) - somaRateada.value);
const somaItensNF = computed(() =>
  nfItens.value.reduce((a, l) => a + l.quantidade * (l.valor_unitario ?? 0), 0)
);
const itemSelecionadoNF = computed(
  () => itensDoGrupoNF.value.find((i) => i.id === novoItemId.value) ?? null
);

async function loadRefs() {
  const { data } = await supabase.from("grupos").select("*").order("numero_arabico");
  grupos.value = (data as Grupo[] | null) ?? [];
}

async function loadItensDoGrupoNF() {
  itensDoGrupoNF.value = [];
  novoItemId.value = null;
  if (!grupoId.value) return;
  const { data } = await supabase
    .from("itens")
    .select("*")
    .eq("grupo_id", grupoId.value)
    .eq("status", "ativo")
    .order("descricao");
  itensDoGrupoNF.value = (data as Item[] | null) ?? [];
}

function addNFItem() {
  const item = itemSelecionadoNF.value;
  if (!item || !novaQtd.value || novaQtd.value <= 0) return;
  if (nfItens.value.some((l) => l.item_id === item.id)) {
    error.value = "Este item já está na NF — edite a quantidade na linha existente.";
    return;
  }
  nfItens.value.push({
    item_id: item.id,
    quantidade: novaQtd.value,
    valor_unitario: Number(item.preco_unitario),
    _descricao: item.descricao,
    _unidade: item.unidade,
    _catmat: item.codigo_catmat,
  });
  novoItemId.value = null;
  novaQtd.value = null;
}

async function removeNFItem(idx: number) {
  const l = nfItens.value[idx];
  if (l.id) {
    if (!confirm(`Remover ${l._descricao} da NF?`)) return;
    const { error: err } = await supabase.from("nf_itens").delete().eq("id", l.id);
    if (err) {
      error.value = err.message;
      return;
    }
  }
  nfItens.value.splice(idx, 1);
}

function usarSomaComoTotal() {
  valorTotal.value = Math.round(somaItensNF.value * 100) / 100;
}

async function loadNFItens() {
  if (!nfId.value) return;
  const { data } = await supabase
    .from("nf_itens")
    .select("*, itens (descricao, unidade, codigo_catmat), empenhos (numero)")
    .eq("nf_id", nfId.value)
    .order("id");
  type NIRow = {
    id: number; item_id: number; quantidade: number; valor_unitario: number | null;
    itens: { descricao: string; unidade: string; codigo_catmat: string | null } | null;
    empenhos: { numero: string } | null;
  };
  nfItens.value = ((data as unknown as (NIRow[] | null)) ?? []).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    quantidade: Number(r.quantidade),
    valor_unitario: r.valor_unitario == null ? null : Number(r.valor_unitario),
    _descricao: r.itens?.descricao ?? "—",
    _unidade: r.itens?.unidade ?? "",
    _catmat: r.itens?.codigo_catmat ?? null,
    _empenhoNumero: r.empenhos?.numero ?? null,
  }));
}

async function loadRecibosVinculados() {
  if (!nfId.value) return;
  const { data } = await supabase
    .from("recibos")
    .select("*, campi (nome)")
    .eq("nf_id", nfId.value)
    .order("data_recebimento");
  recibosVinculados.value = (data as ReciboRow[] | null) ?? [];
}

async function baixarRecibosUnificados() {
  const comPdf = recibosVinculados.value.filter((r) => r.link_pdf);
  if (!comPdf.length) {
    error.value = "Nenhum recibo vinculado possui PDF anexado.";
    return;
  }
  mesclando.value = true;
  error.value = null;
  const pulados: string[] = [];
  try {
    const { PDFDocument } = await import("pdf-lib");
    const final = await PDFDocument.create();
    for (const r of comPdf) {
      try {
        let url = r.link_pdf as string;
        if (!/^https?:\/\//i.test(url)) {
          const { data } = await supabase.storage
            .from("pdfs-recibos")
            .createSignedUrl(url, 600);
          if (!data?.signedUrl) throw new Error("sem URL");
          url = data.signedUrl;
        }
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const bytes = await resp.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await final.copyPages(doc, doc.getPageIndices());
        for (const p of pages) final.addPage(p);
      } catch {
        pulados.push(String(r.numero));
      }
    }
    if (final.getPageCount() === 0) {
      throw new Error("Não foi possível ler nenhum dos PDFs (links externos podem bloquear o download).");
    }
    const out = await final.save();
    const blob = new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `recibos-nf-${numero.value || nfId.value}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (pulados.length) {
      error.value = `PDF gerado, mas alguns recibos não puderam ser incluídos: ${pulados.join(", ")} (sem PDF legível ou link externo).`;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao unificar os PDFs.";
  } finally {
    mesclando.value = false;
  }
}

async function loadEmpenhosDoGrupo() {
  empenhosDoGrupo.value = [];
  rateioEmpenhoId.value = null;
  if (!grupoId.value) return;
  // empenhos alocados ao grupo, com saldo calculado pela view
  const { data: ids } = await supabase
    .from("empenhos_grupos")
    .select("empenho_id")
    .eq("grupo_id", grupoId.value);
  const lista = ((ids as { empenho_id: number }[] | null) ?? []).map((x) => x.empenho_id);
  if (!lista.length) return;
  const { data } = await supabase
    .from("vw_empenho_saldos")
    .select("*")
    .in("id", lista)
    .order("data_emissao");
  empenhosDoGrupo.value = (data as VwEmpenhoSaldo[] | null) ?? [];
}

async function loadRateios() {
  if (!nfId.value) return;
  const { data, error: err } = await supabase
    .from("nf_empenhos")
    .select("*, empenhos (numero)")
    .eq("nf_id", nfId.value)
    .order("id");
  if (err) {
    error.value = err.message;
    return;
  }
  rateios.value = (data as RateioRow[] | null) ?? [];
}

async function loadNF() {
  if (!nfId.value) return;
  loading.value = true;
  const { data, error: err } = await supabase
    .from("notas_fiscais")
    .select("*")
    .eq("id", nfId.value)
    .single();
  if (err) {
    error.value = err.message;
    loading.value = false;
    return;
  }
  const nf = data as NotaFiscal;
  numero.value = nf.numero;
  grupoId.value = nf.grupo_id;
  dataEmissao.value = nf.data_emissao ?? "";
  dataEntrega.value = nf.data_entrega;
  valorTotal.value = nf.valor_total == null ? null : Number(nf.valor_total);
  processoPagamento.value = nf.processo_pagamento ?? "";
  dataAberturaProcesso.value = nf.data_abertura_processo ?? "";
  status.value = nf.status;
  ocorrencias.value = nf.ocorrencias ?? "";
  observacoes.value = nf.observacoes ?? "";
  linkPdf.value = nf.link_pdf;
  await Promise.all([
    loadEmpenhosDoGrupo(),
    loadItensDoGrupoNF(),
    loadRateios(),
    loadNFItens(),
    loadRecibosVinculados(),
  ]);
  loading.value = false;
}

async function salvar(voltar = true) {
  error.value = null;
  if (!numero.value.trim() || !grupoId.value || !dataEntrega.value) {
    error.value = "Preencha número, grupo e data de entrega.";
    return false;
  }
  saving.value = true;
  try {
    const payload = {
      numero: numero.value.trim(),
      grupo_id: grupoId.value,
      fornecedor_id: grupoAtual.value?.fornecedor_id ?? null,
      data_emissao: dataEmissao.value || null,
      data_entrega: dataEntrega.value,
      valor_total: valorTotal.value,
      processo_pagamento: processoPagamento.value.trim() || null,
      data_abertura_processo: dataAberturaProcesso.value || null,
      status: status.value,
      ocorrencias: ocorrencias.value.trim() || null,
      observacoes: observacoes.value.trim() || null,
      link_pdf: linkPdf.value,
    };
    if (editMode.value && nfId.value) {
      const { error: err } = await supabase
        .from("notas_fiscais")
        .update(payload)
        .eq("id", nfId.value);
      if (err) throw err;
      // persiste itens da NF (update/insert)
      for (const l of nfItens.value) {
        if (!l.item_id || l.quantidade <= 0) continue;
        const linha = {
          nf_id: nfId.value,
          item_id: l.item_id,
          quantidade: l.quantidade,
          valor_unitario: l.valor_unitario,
        };
        if (l.id) {
          const { error: e2 } = await supabase.from("nf_itens").update(linha).eq("id", l.id);
          if (e2) throw e2;
        } else {
          const { error: e2 } = await supabase.from("nf_itens").insert(linha);
          if (e2) throw e2;
        }
      }
      if (voltar) router.push("/nfs");
      return true;
    } else {
      const { data, error: err } = await supabase
        .from("notas_fiscais")
        .insert(payload)
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Falha ao criar NF.");
      // segue para o modo edição para permitir o rateio
      router.replace(`/nfs/${(data as { id: number }).id}`);
      return true;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
    return false;
  } finally {
    saving.value = false;
  }
}

async function distribuirFifo() {
  if (!nfId.value) return;
  error.value = null;
  aviso.value = null;
  // garante que o cabeçalho (inclusive valor_total) está gravado antes do rateio
  const ok = await salvar(false);
  if (!ok) return;
  distribuindo.value = true;
  try {
    const { data, error: err } = await supabase.rpc("distribute_nf_fifo", {
      p_nf_id: nfId.value,
    });
    if (err) throw err;
    await Promise.all([loadRateios(), loadEmpenhosDoGrupo(), loadNFItens()]);
    type Rel = { resultado: string; item_ref: string | null; quantidade: number | null };
    const rel = ((data as unknown as Rel[]) ?? []);
    const vinc = rel.filter((r) => r.resultado === "vinculado").length;
    const sem = rel.filter((r) => r.resultado === "sem_cobertura");
    const fin = rel.filter((r) => r.resultado === "financeiro").length;
    if (fin) {
      aviso.value = `Distribuição FIFO financeira concluída (${fin} empenho(s) debitados).`;
    } else {
      aviso.value =
        `FIFO por item concluído: ${vinc} vínculo(s) pelo empenho mais antigo com saldo.` +
        (sem.length
          ? ` Sem cobertura em empenho: ${sem.map((s) => s.item_ref).join("; ")} — ` +
            `empenhe o item (ou vincule manualmente) e redistribua.`
          : "");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha na distribuição FIFO.";
  } finally {
    distribuindo.value = false;
  }
}

async function addRateioManual() {
  if (!nfId.value || !rateioEmpenhoId.value || !rateioValor.value || rateioValor.value <= 0) return;
  error.value = null;
  const { error: err } = await supabase.from("nf_empenhos").insert({
    nf_id: nfId.value,
    empenho_id: rateioEmpenhoId.value,
    valor_debitado: rateioValor.value,
    observacoes: "Rateio manual",
  });
  if (err) {
    error.value = err.message.includes("duplicate")
      ? "Este empenho já está rateado nesta NF — edite o valor existente."
      : err.message;
    return;
  }
  rateioEmpenhoId.value = null;
  rateioValor.value = null;
  await Promise.all([loadRateios(), loadEmpenhosDoGrupo()]);
}

async function salvarRateio(r: RateioRow) {
  error.value = null;
  const { error: err } = await supabase
    .from("nf_empenhos")
    .update({ valor_debitado: r.valor_debitado })
    .eq("id", r.id);
  if (err) error.value = err.message;
  else await loadEmpenhosDoGrupo();
}

async function removerRateio(r: RateioRow) {
  if (!auth.isAdmin) {
    error.value = "Apenas o administrador remove rateios gravados.";
    return;
  }
  if (!confirm(`Remover o débito de ${fmtMoney(r.valor_debitado)}?`)) return;
  const { error: err } = await supabase.from("nf_empenhos").delete().eq("id", r.id);
  if (err) error.value = err.message;
  else await Promise.all([loadRateios(), loadEmpenhosDoGrupo()]);
}

onMounted(async () => {
  await loadRefs();
  await loadNF();
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ editMode ? `NF ${numero || "…"}` : "Nova nota fiscal" }}
    </h1>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Cabeçalho</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Nº da NF</label>
            <input v-model="numero" type="text" class="input" required />
          </div>
          <div>
            <label class="label">Grupo</label>
            <select v-model="grupoId" class="input" required @change="loadEmpenhosDoGrupo">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
            </select>
          </div>
          <div>
            <label class="label">Data de emissão</label>
            <input v-model="dataEmissao" type="date" class="input" />
          </div>
          <div>
            <label class="label">Data de entrega</label>
            <input v-model="dataEntrega" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Valor total (R$)</label>
            <input v-model.number="valorTotal" type="number" step="0.01" min="0" class="input" />
          </div>
          <div>
            <label class="label">Status</label>
            <select v-model="status" class="input">
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
              <option value="pago">Pago</option>
              <option value="glosado">Glosado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label class="label">Processo de pagamento (SUAP)</label>
            <input v-model="processoPagamento" type="text" class="input" placeholder="23040.000000/2026-00" />
          </div>
          <div>
            <label class="label">Abertura do processo</label>
            <input v-model="dataAberturaProcesso" type="date" class="input" />
          </div>
          <PdfUpload v-model="linkPdf" bucket="pdfs-nfs" label="PDF da nota fiscal" />
          <div v-if="grupoAtual" class="text-sm text-slate-600 dark:text-slate-300 self-end pb-2">
            Fornecedor do grupo: <strong>{{ grupoAtual.nome.split("-").pop()?.trim() }}</strong>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Ocorrências</label>
            <textarea v-model="ocorrencias" rows="2" class="input"></textarea>
          </div>
          <div>
            <label class="label">Observações</label>
            <textarea v-model="observacoes" rows="2" class="input"></textarea>
          </div>
        </div>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Itens da NF</h2>
          <button
            v-if="nfItens.length"
            type="button"
            class="btn-ghost text-sm"
            @click="usarSomaComoTotal"
          >Usar soma ({{ fmtMoney(somaItensNF) }}) como valor total</button>
        </div>

        <div class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-6">
            <label class="label">Item do grupo (CatMat — nome)</label>
            <select v-model="novoItemId" class="input" :disabled="!grupoId">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="i in itensDoGrupoNF" :key="i.id" :value="i.id">
                {{ i.codigo_catmat ? i.codigo_catmat + " — " : "" }}{{ i.descricao }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Qtd ({{ itemSelecionadoNF?.unidade ?? "un" }})</label>
            <input v-model.number="novaQtd" type="number" step="0.001" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Valor unit.</label>
            <input :value="itemSelecionadoNF ? fmtMoney(itemSelecionadoNF.preco_unitario) : ''" type="text" class="input bg-slate-50 dark:bg-slate-700/50" disabled />
          </div>
          <div class="sm:col-span-2">
            <button type="button" class="btn-secondary w-full" @click="addNFItem">Adicionar</button>
          </div>
        </div>

        <table v-if="nfItens.length" class="w-full text-sm">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">CatMat</th>
              <th class="text-left py-1">Item</th>
              <th class="text-left py-1">Empenho</th>
              <th class="text-right py-1">Qtd</th>
              <th class="text-right py-1">Valor unit.</th>
              <th class="text-right py-1">Subtotal</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="(l, idx) in nfItens" :key="l.id ?? `n${idx}`">
              <td class="py-2 text-slate-600 dark:text-slate-300 w-24">{{ l._catmat ?? "—" }}</td>
              <td class="py-2">{{ l._descricao }}</td>
              <td class="py-2 w-32">
                <span
                  v-if="l._empenhoNumero"
                  class="inline-block rounded-full border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs"
                >{{ l._empenhoNumero }}</span>
                <span
                  v-else
                  class="inline-block rounded-full border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs"
                  title="Sem vínculo — rode a distribuição FIFO ou empenhe o item"
                >pendente</span>
              </td>
              <td class="py-2 text-right w-28">
                <input v-model.number="l.quantidade" type="number" step="0.001" min="0" class="input text-right" />
              </td>
              <td class="py-2 text-right tabular-nums w-28">{{ fmtMoney(l.valor_unitario) }}</td>
              <td class="py-2 text-right tabular-nums w-28">{{ fmtMoney(l.quantidade * (l.valor_unitario ?? 0)) }}</td>
              <td class="py-2 text-right w-20">
                <button type="button" class="text-red-600 dark:text-red-400 text-xs hover:underline" @click="removeNFItem(idx)">
                  remover
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          Nenhum item lançado — selecione acima. (Os itens são gravados ao salvar a NF.)
        </p>
        <p v-if="nfItens.length" class="text-xs text-slate-500 dark:text-slate-400">
          “Distribuir FIFO” vincula cada item ao empenho mais antigo que o possui com
          saldo de quantidade (pelo CatMat), dividindo entre empenhos se preciso, e
          recalcula o débito financeiro. Se alterar itens, redistribua.
        </p>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Recibos vinculados</h2>
          <button
            type="button"
            class="btn-secondary"
            :disabled="mesclando || !recibosVinculados.some((r) => r.link_pdf)"
            @click="baixarRecibosUnificados"
          >
            {{ mesclando ? "Unificando…" : `Baixar PDFs unificados (${recibosVinculados.filter((r) => r.link_pdf).length})` }}
          </button>
        </div>

        <table v-if="recibosVinculados.length" class="w-full text-sm">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">Nº</th>
              <th class="text-left py-1">Campus</th>
              <th class="text-left py-1">Recebimento</th>
              <th class="text-left py-1">Status</th>
              <th class="text-left py-1">PDF</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="r in recibosVinculados" :key="r.id">
              <td class="py-2 font-medium">
                <RouterLink :to="`/recibos/${r.id}`" class="text-cpii-600 dark:text-cpii-300 hover:underline">
                  {{ r.numero }}
                </RouterLink>
              </td>
              <td class="py-2">{{ r.campi?.nome ?? "—" }}</td>
              <td class="py-2">{{ r.data_recebimento }}</td>
              <td class="py-2 capitalize">{{ r.status }}</td>
              <td class="py-2">{{ r.link_pdf ? "anexado" : "—" }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          Nenhum recibo associado a esta NF ainda — a associação é feita na edição do recibo.
        </p>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Débito em empenhos</h2>
          <button
            type="button"
            class="btn-primary"
            :disabled="distribuindo || !valorTotal"
            @click="distribuirFifo"
          >
            {{ distribuindo ? "Distribuindo…" : "Distribuir FIFO" }}
          </button>
        </div>

        <p class="text-sm text-slate-600 dark:text-slate-300">
          Valor da NF: <strong class="tabular-nums">{{ fmtMoney(valorTotal) }}</strong> ·
          Rateado: <strong class="tabular-nums">{{ fmtMoney(somaRateada) }}</strong> ·
          <span :class="Math.abs(faltaRatear) < 0.01 ? 'text-green-700 dark:text-green-300' : 'text-amber-600 dark:text-amber-400'">
            {{ Math.abs(faltaRatear) < 0.01 ? "Conciliado ✓" : `Falta ratear ${fmtMoney(faltaRatear)}` }}
          </span>
        </p>

        <table v-if="rateios.length" class="w-full text-sm">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">Empenho</th>
              <th class="text-right py-1">Valor debitado</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="r in rateios" :key="r.id">
              <td class="py-2 font-medium">{{ r.empenhos?.numero ?? r.empenho_id }}</td>
              <td class="py-2 text-right w-44">
                <input
                  v-model.number="r.valor_debitado"
                  type="number"
                  step="0.01"
                  min="0"
                  class="input text-right"
                  @change="salvarRateio(r)"
                />
              </td>
              <td class="py-2 text-right w-20">
                <button
                  v-if="auth.isAdmin"
                  class="text-red-600 dark:text-red-400 text-xs hover:underline"
                  @click="removerRateio(r)"
                >remover</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          Nenhum débito lançado. Use “Distribuir FIFO” ou adicione manualmente.
        </p>

        <div class="grid sm:grid-cols-12 gap-3 items-end border-t border-slate-200 dark:border-slate-700 pt-4">
          <div class="sm:col-span-7">
            <label class="label">Empenho do grupo (saldo)</label>
            <select v-model="rateioEmpenhoId" class="input">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="e in empenhosDoGrupo" :key="e.id" :value="e.id">
                {{ e.numero }} — saldo {{ fmtMoney(e.saldo) }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-3">
            <label class="label">Valor</label>
            <input v-model.number="rateioValor" type="number" step="0.01" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <button type="button" class="btn-secondary w-full" @click="addRateioManual">
              Adicionar
            </button>
          </div>
        </div>
      </div>

      <p v-else class="text-sm text-slate-500 dark:text-slate-400">
        Salve a NF para liberar itens, recibos vinculados e o débito em empenhos (FIFO ou manual).
      </p>

      <div v-if="aviso" class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-700 dark:text-green-300">
        {{ aviso }}
      </div>
      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
        {{ error }}
      </div>

      <div class="flex justify-end gap-2">
        <button @click="router.push('/nfs')" type="button" class="btn-ghost">Voltar</button>
        <button @click="salvar()" :disabled="saving" type="button" class="btn-primary">
          {{ saving ? "Salvando…" : editMode ? "Salvar alterações" : "Criar NF" }}
        </button>
      </div>
    </template>
  </div>
</template>
