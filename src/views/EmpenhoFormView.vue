<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import PdfUpload from "@/components/PdfUpload.vue";
import { carregarLogo } from "@/lib/pdf-ateste";
import { montarPdfEmpenhoSaldos } from "@/lib/pdf-empenho-saldos";
import { getCabecalho } from "@/lib/config";
import type { Empenho, Fornecedor, Grupo, Item, VwEmpenhoItemSaldo } from "@/types/database";

interface Alocacao {
  id?: number;
  grupo_id: number | null;
  valor_alocado: number | null;
  percentual: number | null;
  observacoes: string | null;
}

interface LinhaEmpItem {
  id?: number;
  item_id: number;
  quantidade: number;
  valor_unitario: number | null;
  _descricao: string;
  _unidade: string;
  _catmat: string | null;
}

interface NfPagaRow {
  numero: string;
  data_emissao: string | null;
  valor_debitado: number;
  processo_pagamento: string | null;
  data_abertura_processo: string | null;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const empenhoId = computed(() =>
  route.params.id ? Number(route.params.id) : null
);
const editMode = computed(() => empenhoId.value != null);

const fornecedores = ref<Fornecedor[]>([]);
const grupos = ref<Grupo[]>([]);

const numero = ref("");
const dataEmissao = ref(new Date().toISOString().slice(0, 10));
const fornecedorId = ref<number | null>(null);
const valorInicial = ref<number | null>(null);
const reforco = ref<number>(0);
const cancelamento = ref<number>(0);
const anulacao = ref<number>(0);
const status = ref<Empenho["status"]>("ativo");
const processoSuap = ref("");
const observacoes = ref("");
const linkPdf = ref<string | null>(null);
const criadoPorNome = ref<string | null>(null);
const criadoEm = ref<string | null>(null);
const atualizadoEm = ref<string | null>(null);
const dataHora = (ts: string | null) => (ts ? new Date(ts).toLocaleString("pt-BR") : "—");

const alocacoes = ref<Alocacao[]>([]);

// itens/quantidades do empenho (por seleção a partir dos grupos alocados)
const empItens = ref<LinhaEmpItem[]>([]);
const itemGrupoSel = ref<number | null>(null);
const itensDoGrupoSel = ref<Item[]>([]);
const novoItemId = ref<number | null>(null);
const novaQtd = ref<number | null>(null);
// consumo (R$ e qtd) por item nesta NE e preço vigente do catálogo
const consumoPorItem = ref<Map<number, { qtd: number; valor: number }>>(new Map());
const precoVigente = ref<Map<number, number>>(new Map());

// unificação / exclusão
const unificarDestinoId = ref<number | null>(null);
const candidatosUnificacao = ref<{ id: number; numero: string }[]>([]);
const unificando = ref(false);
const excluindo = ref(false);

// saldos / conferência (reqs 8 e 9)
const nfsPagas = ref<NfPagaRow[]>([]);
const mostrarNfsPagas = ref(false);
const carregandoNfs = ref(false);
const gerandoPdf = ref(false);

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const valorLiquido = computed(
  () => (valorInicial.value ?? 0) + reforco.value - cancelamento.value - anulacao.value
);
const somaAlocada = computed(() =>
  alocacoes.value.reduce((a, l) => a + (l.valor_alocado ?? 0), 0)
);
const somaItens = computed(() =>
  empItens.value.reduce((a, l) => a + l.quantidade * (l.valor_unitario ?? 0), 0)
);
const gruposAlocados = computed(() =>
  grupos.value.filter((g) => alocacoes.value.some((a) => a.grupo_id === g.id))
);
const itemSelecionado = computed(
  () => itensDoGrupoSel.value.find((i) => i.id === novoItemId.value) ?? null
);

/** Saldo físico da linha: (valor empenhado - valor consumido) / preço vigente. */
function saldoLinha(l: LinhaEmpItem): number | null {
  const pv = precoVigente.value.get(l.item_id);
  if (!pv) return null;
  const consumido = consumoPorItem.value.get(l.item_id)?.valor ?? 0;
  return (l.quantidade * (l.valor_unitario ?? pv) - consumido) / pv;
}

/** Preço vigente na data de emissão da NE (histórico de apostilamentos). */
async function precoNaData(itemId: number, data: string): Promise<number | null> {
  const { data: rows } = await supabase
    .from("itens_precos")
    .select("preco_unitario")
    .eq("item_id", itemId)
    .lte("vigencia_inicio", data)
    .order("vigencia_inicio", { ascending: false })
    .limit(1);
  const r = (rows as { preco_unitario: number }[] | null) ?? [];
  return r.length ? Number(r[0].preco_unitario) : null;
}

async function loadItensDoGrupoSel() {
  itensDoGrupoSel.value = [];
  novoItemId.value = null;
  if (!itemGrupoSel.value) return;
  const { data } = await supabase
    .from("itens")
    .select("*")
    .eq("grupo_id", itemGrupoSel.value)
    .eq("status", "ativo")
    .order("descricao");
  itensDoGrupoSel.value = (data as Item[] | null) ?? [];
}

async function addEmpItem() {
  const item = itemSelecionado.value;
  if (!item || !novaQtd.value || novaQtd.value <= 0) return;
  if (empItens.value.some((l) => l.item_id === item.id)) {
    error.value = "Este item já está no empenho — edite a quantidade na linha existente.";
    return;
  }
  // usa o preço vigente NA DATA DE EMISSÃO da NE (NEs antigas: preço pré-reajuste);
  // o campo segue editável na linha para ajustes manuais
  const historico = dataEmissao.value ? await precoNaData(item.id, dataEmissao.value) : null;
  empItens.value.push({
    item_id: item.id,
    quantidade: novaQtd.value,
    valor_unitario: historico ?? Number(item.preco_unitario),
    _descricao: item.descricao,
    _unidade: item.unidade,
    _catmat: item.codigo_catmat,
  });
  precoVigente.value.set(item.id, Number(item.preco_unitario));
  novoItemId.value = null;
  novaQtd.value = null;
}

async function excluirEmpenho() {
  if (!empenhoId.value) return;
  if (!confirm(`Excluir a NE ${numero.value}?\n\nEsta ação não pode ser desfeita.`)) return;
  excluindo.value = true;
  error.value = null;
  const { error: err } = await supabase.from("empenhos").delete().eq("id", empenhoId.value);
  excluindo.value = false;
  if (err) {
    error.value = err.message.includes("nf_empenhos")
      ? "Esta NE tem débitos de notas fiscais vinculados. Transfira-os (unificação) ou remova os débitos nas NFs antes de excluir."
      : err.message;
    return;
  }
  router.push("/empenhos");
}

async function loadCandidatosUnificacao() {
  if (!empenhoId.value) return;
  let q = supabase
    .from("empenhos")
    .select("id, numero")
    .neq("id", empenhoId.value)
    .order("data_emissao", { ascending: false })
    .limit(200);
  if (fornecedorId.value) q = q.eq("fornecedor_id", fornecedorId.value);
  const { data } = await q;
  candidatosUnificacao.value = (data as { id: number; numero: string }[] | null) ?? [];
}

async function unificarEmpenho() {
  if (!empenhoId.value || !unificarDestinoId.value) return;
  const destino = candidatosUnificacao.value.find((x) => x.id === unificarDestinoId.value);
  const ok = confirm(
    `Unificar a NE ${numero.value} na NE ${destino?.numero}?\n\n` +
      `Todos os vínculos (débitos de NFs, itens, alocações) serão transferidos, ` +
      `os valores serão somados e ESTA NE (${numero.value}) será excluída.`
  );
  if (!ok) return;
  unificando.value = true;
  error.value = null;
  const { error: err } = await supabase.rpc("merge_empenhos", {
    p_origem_id: empenhoId.value,
    p_destino_id: unificarDestinoId.value,
  });
  unificando.value = false;
  if (err) {
    error.value = err.message;
    return;
  }
  router.push(`/empenhos/${unificarDestinoId.value}`);
  // recarrega a tela no destino
  setTimeout(() => window.location.reload(), 50);
}

async function removeEmpItem(idx: number) {
  const l = empItens.value[idx];
  if (l.id) {
    if (!confirm(`Remover ${l._descricao} do empenho?`)) return;
    const { error: err } = await supabase.from("empenhos_itens").delete().eq("id", l.id);
    if (err) {
      error.value = err.message;
      return;
    }
  }
  empItens.value.splice(idx, 1);
}

async function loadRefs() {
  const [f, g] = await Promise.all([
    supabase.from("fornecedores").select("*").eq("status", "ativo").order("codigo"),
    supabase.from("grupos").select("*").order("numero_arabico"),
  ]);
  fornecedores.value = (f.data as Fornecedor[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
}

async function loadEmpenho() {
  if (!empenhoId.value) return;
  loading.value = true;
  const [e, a] = await Promise.all([
    supabase.from("empenhos").select("*").eq("id", empenhoId.value).single(),
    supabase.from("empenhos_grupos").select("*").eq("empenho_id", empenhoId.value).order("id"),
  ]);
  if (e.error) {
    error.value = e.error.message;
    loading.value = false;
    return;
  }
  const emp = e.data as Empenho;
  numero.value = emp.numero;
  dataEmissao.value = emp.data_emissao;
  fornecedorId.value = emp.fornecedor_id;
  valorInicial.value = Number(emp.valor_inicial);
  reforco.value = Number(emp.reforco);
  cancelamento.value = Number(emp.cancelamento);
  anulacao.value = Number(emp.anulacao);
  status.value = emp.status;
  processoSuap.value = emp.processo_suap ?? "";
  observacoes.value = emp.observacoes ?? "";
  linkPdf.value = emp.link_pdf;
  criadoPorNome.value = emp.criado_por_nome;
  criadoEm.value = emp.created_at;
  atualizadoEm.value = emp.updated_at;
  alocacoes.value = ((a.data as Alocacao[] | null) ?? []).map((l) => ({
    ...l,
    valor_alocado: Number(l.valor_alocado),
    percentual: l.percentual == null ? null : Number(l.percentual),
  }));

  const ei = await supabase
    .from("empenhos_itens")
    .select("*, itens (descricao, unidade, codigo_catmat)")
    .eq("empenho_id", empenhoId.value)
    .order("id");
  type EIRow = {
    id: number; item_id: number; quantidade: number; valor_unitario: number | null;
    itens: { descricao: string; unidade: string; codigo_catmat: string | null } | null;
  };
  empItens.value = ((ei.data as unknown as (EIRow[] | null)) ?? []).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    quantidade: Number(r.quantidade),
    valor_unitario: r.valor_unitario == null ? null : Number(r.valor_unitario),
    _descricao: r.itens?.descricao ?? "—",
    _unidade: r.itens?.unidade ?? "",
    _catmat: r.itens?.codigo_catmat ?? null,
  }));

  // consumo por item nesta NE (NFs vinculadas) e preço vigente do catálogo
  const ids = empItens.value.map((l) => l.item_id);
  consumoPorItem.value = new Map();
  precoVigente.value = new Map();
  if (ids.length) {
    const [cons, precos] = await Promise.all([
      supabase
        .from("nf_itens")
        .select("item_id, quantidade, valor_unitario")
        .eq("empenho_id", empenhoId.value)
        .in("item_id", ids),
      supabase.from("itens").select("id, preco_unitario").in("id", ids),
    ]);
    for (const x of ((cons.data as { item_id: number; quantidade: number; valor_unitario: number | null }[] | null) ?? [])) {
      const e = consumoPorItem.value.get(x.item_id) ?? { qtd: 0, valor: 0 };
      e.qtd += Number(x.quantidade);
      e.valor += Number(x.quantidade) * Number(x.valor_unitario ?? 0);
      consumoPorItem.value.set(x.item_id, e);
    }
    for (const p of ((precos.data as { id: number; preco_unitario: number }[] | null) ?? [])) {
      precoVigente.value.set(p.id, Number(p.preco_unitario));
    }
  }
  await loadCandidatosUnificacao();
  loading.value = false;
}

function addAlocacao() {
  alocacoes.value.push({
    grupo_id: null,
    valor_alocado: null,
    percentual: null,
    observacoes: null,
  });
}

async function removeAlocacao(idx: number) {
  const l = alocacoes.value[idx];
  if (l.id) {
    if (!auth.isAdmin) {
      error.value = "Apenas o administrador remove alocações já gravadas.";
      return;
    }
    if (!confirm("Remover esta alocação de grupo?")) return;
    const { error: err } = await supabase.from("empenhos_grupos").delete().eq("id", l.id);
    if (err) {
      error.value = err.message;
      return;
    }
  }
  alocacoes.value.splice(idx, 1);
}

async function salvar() {
  error.value = null;
  if (!numero.value.trim() || !dataEmissao.value || valorInicial.value == null) {
    error.value = "Preencha número, data de emissão e valor inicial.";
    return;
  }
  const linhasValidas = alocacoes.value.filter((l) => l.grupo_id != null);
  if (linhasValidas.some((l) => (l.valor_alocado ?? 0) < 0)) {
    error.value = "Valores de alocação não podem ser negativos.";
    return;
  }
  saving.value = true;
  try {
    const payload = {
      numero: numero.value.trim(),
      data_emissao: dataEmissao.value,
      fornecedor_id: fornecedorId.value,
      valor_inicial: valorInicial.value ?? 0,
      reforco: reforco.value || 0,
      cancelamento: cancelamento.value || 0,
      anulacao: anulacao.value || 0,
      status: status.value,
      processo_suap: processoSuap.value.trim() || null,
      observacoes: observacoes.value.trim() || null,
      link_pdf: linkPdf.value,
    };

    let id = empenhoId.value;
    if (editMode.value && id) {
      const { error: err } = await supabase.from("empenhos").update(payload).eq("id", id);
      if (err) throw err;
    } else {
      const { data, error: err } = await supabase
        .from("empenhos")
        .insert({
          ...payload,
          criado_por: auth.user?.id ?? null,
          criado_por_nome: auth.perfil?.nome ?? null,
        })
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Falha ao criar empenho.");
      id = (data as { id: number }).id;
    }

    for (const l of linhasValidas) {
      const linha = {
        empenho_id: id,
        grupo_id: l.grupo_id,
        valor_alocado: l.valor_alocado ?? 0,
        percentual: l.percentual,
        observacoes: l.observacoes,
      };
      if (l.id) {
        const { error: err } = await supabase
          .from("empenhos_grupos")
          .update(linha)
          .eq("id", l.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("empenhos_grupos").insert(linha);
        if (err) throw err;
      }
    }

    for (const l of empItens.value) {
      if (!l.item_id || l.quantidade <= 0) continue;
      const linha = {
        empenho_id: id,
        item_id: l.item_id,
        quantidade: l.quantidade,
        valor_unitario: l.valor_unitario,
      };
      if (l.id) {
        const { error: err } = await supabase
          .from("empenhos_itens")
          .update(linha)
          .eq("id", l.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("empenhos_itens").insert(linha);
        if (err) throw err;
      }
    }

    router.push("/empenhos");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
  } finally {
    saving.value = false;
  }
}

async function carregarNfsPagas() {
  if (!empenhoId.value) return;
  mostrarNfsPagas.value = true;
  carregandoNfs.value = true;
  const { data } = await supabase
    .from("nf_empenhos")
    .select("valor_debitado, notas_fiscais (numero, data_emissao, processo_pagamento, data_abertura_processo)")
    .eq("empenho_id", empenhoId.value)
    .order("id");
  type Row = {
    valor_debitado: number;
    notas_fiscais: {
      numero: string; data_emissao: string | null;
      processo_pagamento: string | null; data_abertura_processo: string | null;
    } | null;
  };
  nfsPagas.value = ((data as unknown as Row[] | null) ?? []).map((r) => ({
    numero: r.notas_fiscais?.numero ?? "—",
    data_emissao: r.notas_fiscais?.data_emissao ?? null,
    valor_debitado: Number(r.valor_debitado),
    processo_pagamento: r.notas_fiscais?.processo_pagamento ?? null,
    data_abertura_processo: r.notas_fiscais?.data_abertura_processo ?? null,
  }));
  carregandoNfs.value = false;
}

const totalNfsPagas = computed(() => nfsPagas.value.reduce((a, n) => a + n.valor_debitado, 0));

async function gerarPdfSaldos() {
  if (!empenhoId.value) return;
  error.value = null;
  gerandoPdf.value = true;
  try {
    const { data, error: err } = await supabase
      .from("vw_empenho_item_saldos")
      .select("*")
      .eq("empenho_id", empenhoId.value)
      .order("descricao");
    if (err) throw err;
    const rows = (data as VwEmpenhoItemSaldo[] | null) ?? [];
    const forn = fornecedores.value.find((f) => f.id === fornecedorId.value);
    const { doc, filename } = montarPdfEmpenhoSaldos({
      fornecedor: {
        codigo: forn?.codigo ?? "—",
        razao_social: forn?.razao_social ?? "—",
        cnpj: forn?.cnpj ?? null,
      },
      blocos: [
        {
          numero: numero.value,
          data_emissao: dataEmissao.value,
          processo_suap: processoSuap.value.trim() || null,
          valor_global: valorLiquido.value,
          grupos: gruposAlocados.value.map((g) => g.nome),
          itens: rows.map((r) => ({
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
        },
      ],
      emitidoPor: auth.perfil?.nome ?? "",
      logoDataUrl: await carregarLogo(),
      cabecalho: await getCabecalho(),
    });
    doc.save(filename);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao gerar o PDF de saldos.";
  } finally {
    gerandoPdf.value = false;
  }
}

onMounted(async () => {
  await loadRefs();
  await loadEmpenho();
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ editMode ? `Empenho ${numero || "…"}` : "Novo empenho" }}
      </h1>
      <p v-if="editMode" class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Cadastrado por <strong>{{ criadoPorNome ?? "—" }}</strong> em {{ dataHora(criadoEm) }}<span v-if="atualizadoEm && atualizadoEm !== criadoEm"> · atualizado em {{ dataHora(atualizadoEm) }}</span>
      </p>
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Identificação</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Nº do empenho (NE)</label>
            <input v-model="numero" type="text" class="input" placeholder="2026NE000123" required />
          </div>
          <div>
            <label class="label">Data de emissão</label>
            <input v-model="dataEmissao" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Fornecedor</label>
            <select v-model="fornecedorId" class="input">
              <option :value="null">—</option>
              <option v-for="f in fornecedores" :key="f.id" :value="f.id">
                {{ f.codigo }} — {{ f.razao_social }}
              </option>
            </select>
          </div>
          <div>
            <label class="label">Status</label>
            <select v-model="status" class="input">
              <option value="ativo">Ativo</option>
              <option value="esgotado">Esgotado</option>
              <option value="cancelado">Cancelado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          <div>
            <label class="label">Processo SUAP</label>
            <input v-model="processoSuap" type="text" class="input" placeholder="23040.000000/2026-00" />
          </div>
          <PdfUpload v-model="linkPdf" bucket="pdfs-empenhos" label="PDF da nota de empenho" />
        </div>
      </div>

      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Valores</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="label">Valor inicial</label>
            <input v-model.number="valorInicial" type="number" step="0.01" min="0" class="input" required />
          </div>
          <div>
            <label class="label">Reforço</label>
            <input v-model.number="reforco" type="number" step="0.01" min="0" class="input" />
          </div>
          <div>
            <label class="label">Cancelamento</label>
            <input v-model.number="cancelamento" type="number" step="0.01" min="0" class="input" />
          </div>
          <div>
            <label class="label">Anulação</label>
            <input v-model.number="anulacao" type="number" step="0.01" min="0" class="input" />
          </div>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          Valor líquido: <strong class="tabular-nums">{{ fmtMoney(valorLiquido) }}</strong>
        </p>
      </div>

      <div class="card p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Alocação por grupo</h2>
          <button type="button" class="btn-secondary" @click="addAlocacao">+ Grupo</button>
        </div>

        <p v-if="!alocacoes.length" class="text-sm text-slate-500 dark:text-slate-400">
          Nenhum grupo alocado. Adicione ao menos um para que o empenho apareça
          na distribuição pela fila das notas fiscais.
        </p>

        <div v-for="(l, idx) in alocacoes" :key="l.id ?? `n${idx}`" class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-6">
            <label class="label">Grupo</label>
            <select v-model="l.grupo_id" class="input">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
            </select>
          </div>
          <div class="sm:col-span-3">
            <label class="label">Valor alocado</label>
            <input v-model.number="l.valor_alocado" type="number" step="0.01" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">%</label>
            <input v-model.number="l.percentual" type="number" step="0.001" min="0" max="100" class="input" />
          </div>
          <div class="sm:col-span-1 pb-1.5">
            <button
              type="button"
              class="text-red-600 dark:text-red-400 text-xs hover:underline"
              @click="removeAlocacao(idx)"
            >remover</button>
          </div>
        </div>

        <p v-if="alocacoes.length" class="text-sm text-slate-600 dark:text-slate-300">
          Soma alocada: <strong class="tabular-nums">{{ fmtMoney(somaAlocada) }}</strong>
          <span
            v-if="Math.abs(somaAlocada - valorLiquido) > 0.01"
            class="text-amber-600 dark:text-amber-400 ml-2"
          >difere do valor líquido ({{ fmtMoney(valorLiquido) }})</span>
        </p>
      </div>

      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Itens empenhados (opcional)</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Selecione o grupo alocado e adicione itens com quantidade — o valor unitário
          é herdado do catálogo (e fica congelado neste empenho).
        </p>

        <div class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-3">
            <label class="label">Grupo</label>
            <select v-model="itemGrupoSel" class="input" @change="loadItensDoGrupoSel">
              <option :value="null" disabled>
                {{ gruposAlocados.length ? "Selecione…" : "Aloque um grupo antes" }}
              </option>
              <option v-for="g in gruposAlocados" :key="g.id" :value="g.id">
                {{ g.numero_romano }} — {{ g.categoria }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-5">
            <label class="label">Item (CatMat — nome)</label>
            <select v-model="novoItemId" class="input" :disabled="!itemGrupoSel">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="i in itensDoGrupoSel" :key="i.id" :value="i.id">
                {{ i.codigo_catmat ? i.codigo_catmat + " — " : "" }}{{ i.descricao }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Qtd ({{ itemSelecionado?.unidade ?? "un" }})</label>
            <input v-model.number="novaQtd" type="number" step="0.001" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <button type="button" class="btn-secondary w-full" @click="addEmpItem">Adicionar</button>
          </div>
        </div>

        <table v-if="empItens.length" class="w-full text-sm">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">CatMat</th>
              <th class="text-left py-1">Item</th>
              <th class="text-right py-1">Qtd</th>
              <th class="text-right py-1" title="Preço da época da NE — editável">Valor unit. (NE)</th>
              <th class="text-right py-1">Subtotal</th>
              <th class="text-right py-1">Consumido</th>
              <th class="text-right py-1" title="Convertido ao preço vigente do catálogo">Saldo (qtd)</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="(l, idx) in empItens" :key="l.id ?? `n${idx}`">
              <td class="py-2 text-slate-600 dark:text-slate-300 w-24">{{ l._catmat ?? "—" }}</td>
              <td class="py-2">{{ l._descricao }}</td>
              <td class="py-2 text-right w-24">
                <input v-model.number="l.quantidade" type="number" step="0.001" min="0" class="input text-right" />
              </td>
              <td class="py-2 text-right w-28">
                <input v-model.number="l.valor_unitario" type="number" step="0.0001" min="0" class="input text-right" />
              </td>
              <td class="py-2 text-right tabular-nums w-24">{{ fmtMoney(l.quantidade * (l.valor_unitario ?? 0)) }}</td>
              <td class="py-2 text-right tabular-nums w-24 text-slate-600 dark:text-slate-300">
                {{ consumoPorItem.get(l.item_id)?.qtd?.toFixed(3) ?? "0" }} {{ l._unidade }}
              </td>
              <td class="py-2 text-right tabular-nums w-24" :class="(saldoLinha(l) ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : ''">
                {{ saldoLinha(l) == null ? "—" : saldoLinha(l)!.toFixed(3) + " " + l._unidade }}
              </td>
              <td class="py-2 text-right w-20">
                <button type="button" class="text-red-600 dark:text-red-400 text-xs hover:underline" @click="removeEmpItem(idx)">
                  remover
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="empItens.length" class="text-sm text-slate-600 dark:text-slate-300">
          Total dos itens: <strong class="tabular-nums">{{ fmtMoney(somaItens) }}</strong>
          <span v-if="Math.abs(somaItens - valorLiquido) > 0.01" class="text-amber-600 dark:text-amber-400 ml-2">
            difere do valor líquido ({{ fmtMoney(valorLiquido) }})
          </span>
        </p>
        <p v-if="empItens.length" class="text-xs text-slate-500 dark:text-slate-400">
          O valor unitário é o da época da NE (sugerido pelo histórico de apostilamentos
          conforme a data de emissão; editável). O saldo em quantidade é convertido ao
          preço vigente do catálogo — após um reajuste, ele se ajusta automaticamente.
        </p>
      </div>

      <div class="card p-5">
        <label class="label">Observações</label>
        <textarea v-model="observacoes" rows="3" class="input"></textarea>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Saldos e conferência</h2>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" :disabled="carregandoNfs" @click="carregarNfsPagas">
              {{ mostrarNfsPagas ? "Atualizar NFs pagas" : "NFs pagas com esta NE" }}
            </button>
            <button type="button" class="btn-primary" :disabled="gerandoPdf" @click="gerarPdfSaldos">
              {{ gerandoPdf ? "Gerando…" : "PDF de saldos" }}
            </button>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          O saldo atual de cada item aparece na tabela “Itens empenhados” acima. O PDF de saldos
          (empresa, CNPJ, grupos, itens, saldo inicial e atual, valor global e saldo em R$) pode ser
          enviado à empresa para conferência — gerado a partir dos dados já salvos.
        </p>

        <div v-if="mostrarNfsPagas">
          <div v-if="carregandoNfs" class="text-sm text-slate-500 dark:text-slate-400">Carregando…</div>
          <div v-else-if="nfsPagas.length" class="overflow-x-auto">
            <table class="w-full text-sm min-w-[40rem]">
              <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th class="text-left py-1">NF</th>
                  <th class="text-left py-1">Emissão</th>
                  <th class="text-right py-1">Valor descontado</th>
                  <th class="text-left py-1">Processo de pagamento</th>
                  <th class="text-left py-1">Abertura</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                <tr v-for="(n, i) in nfsPagas" :key="i">
                  <td class="py-2 font-medium">{{ n.numero }}</td>
                  <td class="py-2 whitespace-nowrap">{{ fmtDate(n.data_emissao) }}</td>
                  <td class="py-2 text-right tabular-nums">{{ fmtMoney(n.valor_debitado) }}</td>
                  <td class="py-2 text-slate-600 dark:text-slate-300">{{ n.processo_pagamento ?? "—" }}</td>
                  <td class="py-2 whitespace-nowrap">{{ fmtDate(n.data_abertura_processo) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="border-t border-slate-300 dark:border-slate-600 font-medium">
                  <td class="py-2" colspan="2">Total descontado ({{ nfsPagas.length }} NF(s))</td>
                  <td class="py-2 text-right tabular-nums">{{ fmtMoney(totalNfsPagas) }}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">
            Nenhuma NF debitou esta NE ainda.
          </p>
        </div>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4 border-red-200 dark:border-red-900">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Manutenção da NE</h2>
        <div class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-7">
            <label class="label">Unificar esta NE em outra (esta será excluída; vínculos e valores transferidos)</label>
            <select v-model="unificarDestinoId" class="input">
              <option :value="null" disabled>Selecione a NE de destino…</option>
              <option v-for="c in candidatosUnificacao" :key="c.id" :value="c.id">{{ c.numero }}</option>
            </select>
          </div>
          <div class="sm:col-span-3">
            <button
              type="button"
              class="btn-secondary w-full"
              :disabled="!unificarDestinoId || unificando"
              @click="unificarEmpenho"
            >{{ unificando ? "Unificando…" : "Unificar" }}</button>
          </div>
          <div class="sm:col-span-2">
            <button
              type="button"
              class="btn w-full bg-red-600 text-white hover:bg-red-700"
              :disabled="excluindo"
              @click="excluirEmpenho"
            >{{ excluindo ? "Excluindo…" : "Excluir NE" }}</button>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          A exclusão é bloqueada se houver débitos de NFs vinculados — nesse caso,
          unifique em outra NE ou remova os débitos primeiro.
        </p>
      </div>

      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
        {{ error }}
      </div>

      <div class="flex justify-end gap-2">
        <button @click="router.back()" type="button" class="btn-ghost">Cancelar</button>
        <button @click="salvar" :disabled="saving" type="button" class="btn-primary">
          {{ saving ? "Salvando…" : editMode ? "Salvar alterações" : "Criar empenho" }}
        </button>
      </div>
    </template>
  </div>
</template>
