<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { msgErro } from "@/lib/erro";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import PdfUpload from "@/components/PdfUpload.vue";
import { carregarLogo } from "@/lib/pdf-ateste";
import { montarPdfNFLancamento } from "@/lib/pdf-nf-lancamento";
import { getCabecalho } from "@/lib/config";
import type {
  Fornecedor,
  Grupo,
  Item,
  ItemPreco,
  NFEmpenho,
  NotaFiscal,
  Recibo,
  VwEmpenhoSaldo,
} from "@/types/database";

type RateioRow = NFEmpenho & { empenhos?: { numero: string } | null };

interface LinhaNFItem {
  id?: number;
  item_id: number;
  quantidade: number;
  valor_unitario: number | null;
  empenho_id: number | null;
  _descricao: string;
  _unidade: string;
  _catmat: string | null;
  _grupoId: number;
  _empenhoNumero?: string | null;
}

type ReciboRow = Recibo & { campi?: { nome: string } | null };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const nfId = computed(() => (route.params.id ? Number(route.params.id) : null));
const editMode = computed(() => nfId.value != null);

const grupos = ref<Grupo[]>([]);
const fornecedores = ref<Fornecedor[]>([]);
const empenhosDoGrupo = ref<VwEmpenhoSaldo[]>([]);
// empenhos por grupo, para o menu suspenso de NE por item (lançamento manual)
const empenhosPorGrupo = ref<Map<number, VwEmpenhoSaldo[]>>(new Map());

const numero = ref("");
// multi-grupo: gruposSel[0] é o grupo "principal" (cabeçalho/fornecedor)
const gruposSel = ref<number[]>([]);
const dataEmissao = ref<string>("");
const dataEntrega = ref(new Date().toISOString().slice(0, 10));
const valorTotal = ref<number | null>(null);
const processoPagamento = ref("");
const dataAberturaProcesso = ref<string>("");
const status = ref<NotaFiscal["status"]>("pendente");
const ocorrencias = ref("");
const observacoes = ref("");
const linkPdf = ref<string | null>(null);
const linkCobranca = ref<string | null>(null);
const criadoPorNome = ref<string | null>(null);
const criadoEm = ref<string | null>(null);
const atualizadoEm = ref<string | null>(null);
const dataHora = (ts: string | null) => (ts ? new Date(ts).toLocaleString("pt-BR") : "—");

const rateios = ref<RateioRow[]>([]);
const rateioEmpenhoId = ref<number | null>(null);
const rateioValor = ref<number | null>(null);

// itens da NF (seleção a partir do catálogo dos grupos selecionados)
const nfItens = ref<LinhaNFItem[]>([]);
const itensDosGrupos = ref<Item[]>([]);
const precosPorItem = ref<Map<number, ItemPreco[]>>(new Map());
const novoItemId = ref<number | null>(null);
const novaQtd = ref<number | null>(null);

// recibos vinculados (nf_recibos) e busca de candidatos do(s) grupo(s)
const recibosVinculados = ref<ReciboRow[]>([]);
const recibosCandidatos = ref<ReciboRow[]>([]);
const buscaRecibo = ref("");
const buscandoRecibos = ref(false);
const mesclando = ref(false);
let buscaTimer: ReturnType<typeof setTimeout> | null = null;

const loading = ref(false);
const saving = ref(false);
const distribuindo = ref(false);
const recalculando = ref(false);
const excluindo = ref(false);
const gerandoPdf = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

const gruposSelObjs = computed(() =>
  gruposSel.value.map((id) => grupos.value.find((g) => g.id === id)).filter(Boolean) as Grupo[]
);
const grupoPrincipal = computed(() => gruposSelObjs.value[0] ?? null);
const fornecedorAtual = computed(
  () => fornecedores.value.find((f) => f.id === grupoPrincipal.value?.fornecedor_id) ?? null
);
const somaRateada = computed(() =>
  rateios.value.reduce((a, r) => a + Number(r.valor_debitado), 0)
);
const faltaRatear = computed(() => (valorTotal.value ?? 0) - somaRateada.value);
const somaItensNF = computed(() =>
  nfItens.value.reduce((a, l) => a + l.quantidade * (l.valor_unitario ?? 0), 0)
);
const itemSelecionadoNF = computed(
  () => itensDosGrupos.value.find((i) => i.id === novoItemId.value) ?? null
);
const recibosVinculadosIds = computed(() => new Set(recibosVinculados.value.map((r) => r.id)));

async function loadRefs() {
  const [g, f] = await Promise.all([
    supabase.from("grupos").select("*").order("numero_arabico"),
    supabase.from("fornecedores").select("*").order("codigo"),
  ]);
  grupos.value = (g.data as Grupo[] | null) ?? [];
  fornecedores.value = (f.data as Fornecedor[] | null) ?? [];
}

function toggleGrupo(id: number) {
  const i = gruposSel.value.indexOf(id);
  if (i >= 0) gruposSel.value.splice(i, 1);
  else gruposSel.value.push(id);
}

async function loadItensDosGrupos() {
  itensDosGrupos.value = [];
  novoItemId.value = null;
  if (!gruposSel.value.length) return;
  const { data } = await supabase
    .from("itens")
    .select("*")
    .in("grupo_id", gruposSel.value)
    .eq("status", "ativo")
    .order("descricao");
  itensDosGrupos.value = (data as Item[] | null) ?? [];
  await loadPrecosHistorico();
}

/** Histórico de preços (apostilamentos) dos itens em jogo, para escolha por linha. */
async function loadPrecosHistorico() {
  const ids = Array.from(
    new Set([...itensDosGrupos.value.map((i) => i.id), ...nfItens.value.map((l) => l.item_id)])
  );
  precosPorItem.value = new Map();
  if (!ids.length) return;
  const { data } = await supabase
    .from("itens_precos")
    .select("*")
    .in("item_id", ids)
    .order("vigencia_inicio", { ascending: true });
  for (const p of (data as ItemPreco[] | null) ?? []) {
    const arr = precosPorItem.value.get(p.item_id) ?? [];
    arr.push(p);
    precosPorItem.value.set(p.item_id, arr);
  }
}

function aplicarPrecoHistorico(l: LinhaNFItem, v: string) {
  if (v) l.valor_unitario = Number(v);
}

function labelGrupoDoItem(item: Item): string {
  const g = grupos.value.find((x) => x.id === item.grupo_id);
  return gruposSel.value.length > 1 && g ? `[${g.numero_romano}] ` : "";
}

function addNFItem() {
  const item = itemSelecionadoNF.value;
  if (!item || !novaQtd.value || novaQtd.value <= 0) return;
  // o mesmo item pode entrar em mais de uma linha (split por NE no lançamento manual)
  nfItens.value.push({
    item_id: item.id,
    quantidade: novaQtd.value,
    valor_unitario: Number(item.preco_unitario),
    empenho_id: null,
    _descricao: item.descricao,
    _unidade: item.unidade,
    _catmat: item.codigo_catmat,
    _grupoId: item.grupo_id,
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
    .select("*, itens (descricao, unidade, codigo_catmat, grupo_id), empenhos (numero)")
    .eq("nf_id", nfId.value)
    .order("id");
  type NIRow = {
    id: number; item_id: number; quantidade: number; valor_unitario: number | null;
    empenho_id: number | null;
    itens: { descricao: string; unidade: string; codigo_catmat: string | null; grupo_id: number } | null;
    empenhos: { numero: string } | null;
  };
  nfItens.value = ((data as unknown as (NIRow[] | null)) ?? []).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    quantidade: Number(r.quantidade),
    valor_unitario: r.valor_unitario == null ? null : Number(r.valor_unitario),
    empenho_id: r.empenho_id ?? null,
    _descricao: r.itens?.descricao ?? "—",
    _unidade: r.itens?.unidade ?? "",
    _catmat: r.itens?.codigo_catmat ?? null,
    _grupoId: r.itens?.grupo_id ?? 0,
    _empenhoNumero: r.empenhos?.numero ?? null,
  }));
}

async function loadRecibosVinculados() {
  if (!nfId.value) return;
  const { data } = await supabase
    .from("nf_recibos")
    .select("recibo_id, recibos (*, campi (nome))")
    .eq("nf_id", nfId.value);
  type Row = { recibos: ReciboRow | null };
  recibosVinculados.value = ((data as unknown as Row[] | null) ?? [])
    .map((x) => x.recibos)
    .filter(Boolean)
    .sort((a, b) => (a!.data_recebimento < b!.data_recebimento ? -1 : 1)) as ReciboRow[];
}

async function buscarRecibosCandidatos() {
  recibosCandidatos.value = [];
  if (!nfId.value || !gruposSel.value.length) return;
  buscandoRecibos.value = true;
  let q = supabase
    .from("recibos")
    .select("*, campi (nome)")
    .in("grupo_id", gruposSel.value)
    .order("data_recebimento", { ascending: false })
    .limit(50);
  if (buscaRecibo.value.trim()) q = q.ilike("numero", `%${buscaRecibo.value.trim()}%`);
  const { data } = await q;
  recibosCandidatos.value = ((data as ReciboRow[] | null) ?? []).filter(
    (r) => !recibosVinculadosIds.value.has(r.id)
  );
  buscandoRecibos.value = false;
}

async function vincularRecibo(r: ReciboRow) {
  if (!nfId.value) return;
  error.value = null;
  const { error: err } = await supabase
    .from("nf_recibos")
    .insert({ nf_id: nfId.value, recibo_id: r.id });
  if (err) {
    error.value = err.message.includes("duplicate")
      ? "Este recibo já está vinculado a esta NF."
      : err.message;
    return;
  }
  await loadRecibosVinculados();
  await buscarRecibosCandidatos();
}

async function desvincularRecibo(r: ReciboRow) {
  if (!nfId.value) return;
  const { error: err } = await supabase
    .from("nf_recibos")
    .delete()
    .eq("nf_id", nfId.value)
    .eq("recibo_id", r.id);
  if (err) {
    error.value = err.message;
    return;
  }
  await loadRecibosVinculados();
  await buscarRecibosCandidatos();
}

watch(buscaRecibo, () => {
  if (buscaTimer) clearTimeout(buscaTimer);
  buscaTimer = setTimeout(buscarRecibosCandidatos, 350);
});

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
        const docPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await final.copyPages(docPdf, docPdf.getPageIndices());
        for (const pg of pages) final.addPage(pg);
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
    error.value = msgErro(e, "Falha ao unificar os PDFs.");
  } finally {
    mesclando.value = false;
  }
}

async function loadEmpenhosDoGrupo() {
  empenhosDoGrupo.value = [];
  empenhosPorGrupo.value = new Map();
  rateioEmpenhoId.value = null;
  if (!gruposSel.value.length) return;
  // empenhos alocados a QUALQUER grupo selecionado, com saldo calculado pela view
  const { data: pares } = await supabase
    .from("empenhos_grupos")
    .select("empenho_id, grupo_id")
    .in("grupo_id", gruposSel.value);
  const paresArr = (pares as { empenho_id: number; grupo_id: number }[] | null) ?? [];
  const lista = Array.from(new Set(paresArr.map((x) => x.empenho_id)));
  if (!lista.length) return;
  const { data } = await supabase
    .from("vw_empenho_saldos")
    .select("*")
    .in("id", lista)
    .order("data_emissao");
  const saldos = (data as VwEmpenhoSaldo[] | null) ?? [];
  empenhosDoGrupo.value = saldos;
  const byId = new Map(saldos.map((s) => [s.id, s]));
  for (const p of paresArr) {
    const arr = empenhosPorGrupo.value.get(p.grupo_id) ?? [];
    const s = byId.get(p.empenho_id);
    if (s && !arr.some((x) => x.id === s.id)) arr.push(s);
    empenhosPorGrupo.value.set(p.grupo_id, arr);
  }
}

/** NEs disponíveis para o menu suspenso de um item (empenhos do grupo do item). */
function empenhosDoItem(l: LinhaNFItem): VwEmpenhoSaldo[] {
  return empenhosPorGrupo.value.get(l._grupoId) ?? empenhosDoGrupo.value;
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
  if (!nfId.value) {
    loading.value = false;
    return;
  }
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
  dataEmissao.value = nf.data_emissao ?? "";
  dataEntrega.value = nf.data_entrega;
  valorTotal.value = nf.valor_total == null ? null : Number(nf.valor_total);
  processoPagamento.value = nf.processo_pagamento ?? "";
  dataAberturaProcesso.value = nf.data_abertura_processo ?? "";
  status.value = nf.status;
  ocorrencias.value = nf.ocorrencias ?? "";
  observacoes.value = nf.observacoes ?? "";
  linkPdf.value = nf.link_pdf;
  linkCobranca.value = nf.link_instrumento_cobranca;
  criadoPorNome.value = nf.criado_por_nome;
  criadoEm.value = nf.created_at;
  atualizadoEm.value = nf.updated_at;

  // grupos da NF (nf_grupos; fallback ao grupo principal)
  const { data: gs } = await supabase
    .from("nf_grupos")
    .select("grupo_id")
    .eq("nf_id", nfId.value);
  const ids = ((gs as { grupo_id: number }[] | null) ?? []).map((x) => x.grupo_id);
  gruposSel.value = ids.length ? ids : [nf.grupo_id];
  // mantém o grupo principal como primeiro
  gruposSel.value.sort((a, b) => (a === nf.grupo_id ? -1 : b === nf.grupo_id ? 1 : 0));

  await Promise.all([
    loadEmpenhosDoGrupo(),
    loadItensDosGrupos(),
    loadRateios(),
    loadNFItens(),
    loadRecibosVinculados(),
  ]);
  await Promise.all([loadPrecosHistorico(), buscarRecibosCandidatos()]);
  loading.value = false;
}

async function salvar(voltar = true) {
  error.value = null;
  if (!numero.value.trim() || !gruposSel.value.length || !dataEntrega.value) {
    error.value = "Preencha número, ao menos um grupo e a data de entrega.";
    return false;
  }
  saving.value = true;
  try {
    const payload = {
      numero: numero.value.trim(),
      grupo_id: gruposSel.value[0], // grupo principal
      fornecedor_id: grupoPrincipal.value?.fornecedor_id ?? null,
      data_emissao: dataEmissao.value || null,
      data_entrega: dataEntrega.value,
      valor_total: valorTotal.value,
      processo_pagamento: processoPagamento.value.trim() || null,
      data_abertura_processo: dataAberturaProcesso.value || null,
      status: status.value,
      ocorrencias: ocorrencias.value.trim() || null,
      observacoes: observacoes.value.trim() || null,
      link_pdf: linkPdf.value,
      link_instrumento_cobranca: linkCobranca.value,
    };
    let id = nfId.value;
    if (editMode.value && id) {
      const { error: err } = await supabase.from("notas_fiscais").update(payload).eq("id", id);
      if (err) throw err;
    } else {
      const { data, error: err } = await supabase
        .from("notas_fiscais")
        .insert({
          ...payload,
          criado_por: auth.user?.id ?? null,
          criado_por_nome: auth.perfil?.nome ?? null,
        })
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Falha ao criar NF.");
      id = (data as { id: number }).id;
    }

    // sincroniza nf_grupos (apaga e reinsere o conjunto selecionado)
    await supabase.from("nf_grupos").delete().eq("nf_id", id);
    const { error: egErr } = await supabase
      .from("nf_grupos")
      .insert(gruposSel.value.map((g) => ({ nf_id: id, grupo_id: g })));
    if (egErr) throw egErr;

    // persiste itens da NF (update/insert)
    if (editMode.value) {
      for (const l of nfItens.value) {
        if (!l.item_id) continue;
        const q = Number(l.quantidade);
        if (!Number.isFinite(q) || q < 0) continue;
        if (!l.id && q <= 0) continue; // não cria item novo zerado (mas permite zerar um existente)
        const linha = {
          nf_id: id,
          item_id: l.item_id,
          quantidade: q,
          valor_unitario: l.valor_unitario,
          empenho_id: l.empenho_id ?? null,
        };
        if (l.id) {
          const { error: e2 } = await supabase.from("nf_itens").update(linha).eq("id", l.id);
          if (e2) throw e2;
        } else {
          const { error: e2 } = await supabase.from("nf_itens").insert(linha);
          if (e2) throw e2;
        }
      }
    }

    if (!editMode.value) {
      // segue para o modo edição para liberar itens, recibos e rateio
      router.replace(`/nfs/${id}`);
      return true;
    }
    if (voltar) router.push("/nfs");
    return true;
  } catch (e) {
    const err = e as { message?: string; code?: string; details?: string };
    const txt = `${err?.message ?? ""} ${err?.details ?? ""}`;
    if (err?.code === "23505" || /duplicate key|already exists|unique/i.test(txt)) {
      error.value =
        `Já existe uma NF com o número ${numero.value} neste grupo. ` +
        `Abra a NF existente na lista de Notas Fiscais para editá-la — não é preciso criar de novo.`;
    } else {
      error.value = msgErro(err, "Erro ao salvar.");
    }
    return false;
  } finally {
    saving.value = false;
  }
}

async function distribuirFifo() {
  if (!nfId.value) return;
  error.value = null;
  aviso.value = null;
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
    const rel = (data as unknown as Rel[]) ?? [];
    const vinc = rel.filter((r) => r.resultado === "vinculado").length;
    const sem = rel.filter((r) => r.resultado === "sem_cobertura");
    const fin = rel.filter((r) => r.resultado === "financeiro").length;
    if (fin) {
      aviso.value = `Distribuição pela fila concluída (${fin} empenho(s) debitados, do mais antigo para o mais novo).`;
    } else {
      aviso.value =
        `Distribuição pela fila concluída: ${vinc} item(ns) vinculado(s) ao(s) empenho(s) mais antigo(s) com saldo.` +
        (sem.length
          ? ` Sem cobertura em empenho: ${sem.map((s) => s.item_ref).join("; ")} — ` +
            `empenhe o item (ou vincule manualmente) e redistribua.`
          : "");
    }
  } catch (e) {
    error.value = msgErro(e, "Falha na distribuição pela fila.");
  } finally {
    distribuindo.value = false;
  }
}

async function recalcularDebitoPelosItens() {
  if (!nfId.value) return;
  error.value = null;
  aviso.value = null;
  const ok = await salvar(false);
  if (!ok) return;
  recalculando.value = true;
  try {
    const { data } = await supabase
      .from("nf_itens")
      .select("empenho_id, quantidade, valor_unitario")
      .eq("nf_id", nfId.value);
    type Row = { empenho_id: number | null; quantidade: number; valor_unitario: number | null };
    const rows = (data as Row[] | null) ?? [];
    const agg = new Map<number, number>();
    let semNe = 0;
    for (const r of rows) {
      if (r.empenho_id == null) {
        semNe++;
        continue;
      }
      const v = Number(r.quantidade) * Number(r.valor_unitario ?? 0);
      agg.set(r.empenho_id, (agg.get(r.empenho_id) ?? 0) + v);
    }
    await supabase.from("nf_empenhos").delete().eq("nf_id", nfId.value);
    const inserts = [...agg.entries()].map(([empenho_id, valor]) => ({
      nf_id: nfId.value,
      empenho_id,
      valor_debitado: Math.round(valor * 100) / 100,
      observacoes: "Lançamento manual por item",
    }));
    if (inserts.length) {
      const { error: err } = await supabase.from("nf_empenhos").insert(inserts);
      if (err) throw err;
    }
    await Promise.all([loadRateios(), loadEmpenhosDoGrupo(), loadNFItens()]);
    aviso.value =
      `Débito recalculado pelas atribuições manuais (${agg.size} empenho(s)).` +
      (semNe
        ? ` ${semNe} item(ns) sem NE selecionada ficaram de fora — selecione a NE na coluna “Empenho”.`
        : "");
  } catch (e) {
    error.value = msgErro(e, "Falha ao recalcular o débito pelos itens.");
  } finally {
    recalculando.value = false;
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

async function excluirNF() {
  if (!nfId.value) return;
  if (!confirm(`Excluir a NF ${numero.value}?\n\nItens e débitos em empenhos serão removidos junto. Esta ação não pode ser desfeita.`)) return;
  excluindo.value = true;
  error.value = null;
  const { error: err } = await supabase.from("notas_fiscais").delete().eq("id", nfId.value);
  excluindo.value = false;
  if (err) {
    error.value = err.message.includes("atestes_nfs")
      ? "Esta NF já entrou em um ateste. Exclua o ateste correspondente (tela Ateste → Atestes emitidos) antes de excluir a NF."
      : err.message;
    return;
  }
  router.push("/nfs");
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

async function gerarPdfLancamento() {
  if (!nfId.value) return;
  error.value = null;
  const ok = await salvar(false);
  if (!ok) return;
  gerandoPdf.value = true;
  try {
    const [{ data: itensData }, { data: empData }] = await Promise.all([
      supabase
        .from("nf_itens")
        .select("*, itens (descricao, unidade, codigo_catmat), empenhos (numero)")
        .eq("nf_id", nfId.value)
        .order("id"),
      supabase
        .from("nf_empenhos")
        .select("valor_debitado, empenhos (numero)")
        .eq("nf_id", nfId.value)
        .order("id"),
    ]);
    type NIRow = {
      quantidade: number; valor_unitario: number | null;
      itens: { descricao: string; unidade: string; codigo_catmat: string | null } | null;
      empenhos: { numero: string } | null;
    };
    type NERow = { valor_debitado: number; empenhos: { numero: string } | null };
    const itens = ((itensData as unknown as NIRow[] | null) ?? []).map((r) => ({
      codigo_catmat: r.itens?.codigo_catmat ?? null,
      descricao: r.itens?.descricao ?? "—",
      unidade: r.itens?.unidade ?? "",
      quantidade: Number(r.quantidade),
      valor_unitario: r.valor_unitario == null ? null : Number(r.valor_unitario),
      empenho_numero: r.empenhos?.numero ?? null,
    }));
    const empenhos = ((empData as unknown as NERow[] | null) ?? []).map((r) => ({
      numero: r.empenhos?.numero ?? "—",
      valor_debitado: Number(r.valor_debitado),
    }));
    const forn = fornecedorAtual.value;
    const { doc, filename } = montarPdfNFLancamento({
      numero: numero.value,
      dataEmissao: dataEmissao.value || null,
      dataEntrega: dataEntrega.value,
      fornecedor: {
        codigo: forn?.codigo ?? "—",
        razao_social: forn?.razao_social ?? "—",
        cnpj: forn?.cnpj ?? null,
      },
      grupos: gruposSelObjs.value.map((g) => g.nome),
      valorTotal: valorTotal.value,
      processoPagamento: processoPagamento.value.trim() || null,
      itens,
      empenhos,
      emitidoPor: auth.perfil?.nome ?? "",
      logoDataUrl: await carregarLogo(),
      cabecalho: await getCabecalho(),
    });
    doc.save(filename);
  } catch (e) {
    error.value = msgErro(e, "Falha ao gerar o PDF de lançamento.");
  } finally {
    gerandoPdf.value = false;
  }
}

// reatividade: recarrega tudo ao trocar de NF (inclui o replace após criar)
watch(nfId, () => {
  loadNF();
});

// ao alterar os grupos selecionados, recarrega itens e empenhos disponíveis
watch(
  gruposSel,
  () => {
    loadItensDosGrupos();
    loadEmpenhosDoGrupo();
    if (nfId.value) buscarRecibosCandidatos();
  },
  { deep: true }
);

onMounted(async () => {
  await loadRefs();
  await loadNF();
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ editMode ? `NF ${numero || "…"}` : "Nova nota fiscal" }}
      </h1>
      <p v-if="editMode" class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Cadastrada por <strong>{{ criadoPorNome ?? "—" }}</strong> em {{ dataHora(criadoEm) }}<span v-if="atualizadoEm && atualizadoEm !== criadoEm"> · atualizada em {{ dataHora(atualizadoEm) }}</span>
      </p>
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Cabeçalho</h2>

        <div>
          <span class="label">Grupo(s) / contrato(s)</span>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Selecione um ou mais grupos. Com dois ou mais, a NF reúne itens de cada grupo e a
            distribuição pela fila debita cada item no empenho do seu próprio grupo.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="g in grupos"
              :key="g.id"
              type="button"
              class="rounded-full border px-3 py-1 text-sm transition-colors"
              :class="gruposSel.includes(g.id)
                ? 'bg-cpii-600 text-white border-cpii-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-cpii-500'"
              @click="toggleGrupo(g.id)"
            >{{ g.nome }}</button>
          </div>
          <p v-if="grupoPrincipal" class="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Grupo principal: <strong>{{ grupoPrincipal.nome }}</strong>
            <span v-if="gruposSel.length > 1"> · +{{ gruposSel.length - 1 }} grupo(s)</span>
            <span v-if="fornecedorAtual"> · Fornecedor: <strong>{{ fornecedorAtual.razao_social }}</strong></span>
          </p>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Nº da NF</label>
            <input v-model="numero" type="text" class="input" required />
          </div>
          <div>
            <label class="label">Valor total (R$)</label>
            <input v-model.number="valorTotal" type="number" step="0.01" min="0" class="input" />
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
            <label class="label">Status</label>
            <select v-model="status" class="input">
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
              <option value="pago">Pago</option>
              <option value="glosado">Glosado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <p v-if="status === 'pago'" class="text-xs text-green-700 dark:text-green-300 mt-1">
              Ao salvar, os recibos vinculados a esta NF passam a “pago” automaticamente.
            </p>
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
          <PdfUpload v-model="linkCobranca" bucket="pdfs-cobranca" label="Instrumento de Cobrança (Contratos.gov)" />
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
            <label class="label">Item do(s) grupo(s) (CatMat — nome)</label>
            <select v-model="novoItemId" class="input" :disabled="!gruposSel.length">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="i in itensDosGrupos" :key="i.id" :value="i.id">
                {{ labelGrupoDoItem(i) }}{{ i.codigo_catmat ? i.codigo_catmat + " — " : "" }}{{ i.descricao }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Qtd ({{ itemSelecionadoNF?.unidade ?? "un" }})</label>
            <input v-model.number="novaQtd" type="number" step="0.0001" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Valor unit.</label>
            <input :value="itemSelecionadoNF ? fmtMoney(itemSelecionadoNF.preco_unitario) : ''" type="text" class="input bg-slate-50 dark:bg-slate-700/50" disabled />
          </div>
          <div class="sm:col-span-2">
            <button type="button" class="btn-secondary w-full" @click="addNFItem">Adicionar</button>
          </div>
        </div>

        <div v-if="nfItens.length" class="overflow-x-auto">
          <table class="w-full text-sm min-w-[42rem]">
            <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
              <tr>
                <th class="text-left py-1">CatMat</th>
                <th class="text-left py-1">Item</th>
                <th class="text-left py-1">Empenho</th>
                <th class="text-right py-1">Qtd</th>
                <th class="text-right py-1">Valor unit. (faturado)</th>
                <th class="text-right py-1">Subtotal</th>
                <th class="py-1"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr v-for="(l, idx) in nfItens" :key="l.id ?? `n${idx}`">
                <td class="py-2 text-slate-600 dark:text-slate-300 w-24">{{ l._catmat ?? "—" }}</td>
                <td class="py-2">{{ l._descricao }}</td>
                <td class="py-2 w-44">
                  <select v-model="l.empenho_id" class="input py-1 text-xs" title="NE do grupo deste item (lançamento manual)">
                    <option :value="null">— sem NE —</option>
                    <option v-for="e in empenhosDoItem(l)" :key="e.id" :value="e.id">
                      {{ e.numero }} (saldo {{ fmtMoney(e.saldo) }})
                    </option>
                  </select>
                </td>
                <td class="py-2 text-right w-24">
                  <input v-model.number="l.quantidade" type="number" step="0.0001" min="0" class="input text-right" />
                </td>
                <td class="py-2 text-right w-40">
                  <input v-model.number="l.valor_unitario" type="number" step="0.0001" min="0" class="input text-right" />
                  <select
                    v-if="(precosPorItem.get(l.item_id) ?? []).length"
                    class="input text-xs mt-1 py-1"
                    @change="aplicarPrecoHistorico(l, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">usar preço do histórico…</option>
                    <option
                      v-for="pr in (precosPorItem.get(l.item_id) ?? [])"
                      :key="pr.id"
                      :value="pr.preco_unitario"
                    >{{ pr.referencia ?? fmtDate(pr.vigencia_inicio) }} — {{ fmtMoney(pr.preco_unitario) }}</option>
                  </select>
                </td>
                <td class="py-2 text-right tabular-nums w-28">{{ fmtMoney(l.quantidade * (l.valor_unitario ?? 0)) }}</td>
                <td class="py-2 text-right w-20">
                  <button type="button" class="text-red-600 dark:text-red-400 text-xs hover:underline" @click="removeNFItem(idx)">
                    remover
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          Nenhum item lançado — selecione acima. (Os itens são gravados ao salvar a NF.)
        </p>
        <p v-if="nfItens.length" class="text-xs text-slate-500 dark:text-slate-400">
          Valor unitário editável (use o preço faturado) e seletor do histórico (preço original e
          reajustes). A coluna <strong>Empenho</strong> permite escolher manualmente a NE de cada item —
          para catalogar NFs antigas, adicione o mesmo item em mais de uma linha e divida a quantidade
          por NE (ex.: 290 kg na NE1 e 210 kg na NE2). Use “Débito pelos itens” para gerar o rateio a
          partir dessas escolhas, ou “Distribuir pela fila” para o automático (mais antigo primeiro).
        </p>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Recibos vinculados ({{ recibosVinculados.length }})</h2>
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
              <th class="py-1"></th>
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
              <td class="py-2 whitespace-nowrap">{{ fmtDate(r.data_recebimento) }}</td>
              <td class="py-2 capitalize">{{ r.status }}</td>
              <td class="py-2">{{ r.link_pdf ? "anexado" : "—" }}</td>
              <td class="py-2 text-right">
                <button type="button" class="text-red-600 dark:text-red-400 text-xs hover:underline" @click="desvincularRecibo(r)">
                  desvincular
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          Nenhum recibo associado a esta NF ainda — associe abaixo (recibos do mesmo grupo).
        </p>

        <div class="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
          <label class="label">Associar recibos do(s) grupo(s)</label>
          <input v-model="buscaRecibo" type="search" class="input max-w-xs" placeholder="Buscar nº do recibo…" />
          <div v-if="buscandoRecibos" class="text-sm text-slate-500 dark:text-slate-400">Buscando…</div>
          <div v-else-if="recibosCandidatos.length" class="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-md">
            <div
              v-for="r in recibosCandidatos"
              :key="r.id"
              class="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>
                <strong>{{ r.numero }}</strong>
                · {{ r.campi?.nome ?? "—" }}
                · {{ fmtDate(r.data_recebimento) }}
                <span class="capitalize text-slate-500 dark:text-slate-400">({{ r.status }})</span>
              </span>
              <button type="button" class="btn-ghost text-xs" @click="vincularRecibo(r)">vincular</button>
            </div>
          </div>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">
            Nenhum recibo disponível para os filtros atuais.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            O vínculo é livre dentro do grupo: um mesmo recibo pode ser referenciado por mais de uma NF do grupo.
          </p>
        </div>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Débito em empenhos</h2>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-secondary"
              :disabled="gerandoPdf"
              @click="gerarPdfLancamento"
            >{{ gerandoPdf ? "Gerando…" : "PDF de lançamento" }}</button>
            <button
              type="button"
              class="btn-secondary"
              :disabled="recalculando"
              title="Gera o débito a partir das NEs escolhidas em cada item (lançamento manual)"
              @click="recalcularDebitoPelosItens"
            >{{ recalculando ? "Atualizando…" : "Débito pelos itens" }}</button>
            <button
              type="button"
              class="btn-primary"
              :disabled="distribuindo || !valorTotal"
              title="Automático: vincula ao empenho mais antigo com saldo e SOBRESCREVE as escolhas manuais"
              @click="distribuirFifo"
            >
              {{ distribuindo ? "Distribuindo…" : "Distribuir pela fila" }}
            </button>
          </div>
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
          Nenhum débito lançado. Use “Distribuir pela fila” ou adicione manualmente.
        </p>

        <div class="grid sm:grid-cols-12 gap-3 items-end border-t border-slate-200 dark:border-slate-700 pt-4">
          <div class="sm:col-span-7">
            <label class="label">Empenho do(s) grupo(s) (saldo)</label>
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
        Salve a NF para liberar itens, recibos vinculados e o débito em empenhos (pela fila ou manual).
      </p>

      <div v-if="aviso" class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-700 dark:text-green-300">
        {{ aviso }}
      </div>
      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
        {{ error }}
      </div>

      <div class="flex justify-between gap-2">
        <button
          v-if="editMode"
          type="button"
          class="btn bg-red-600 text-white hover:bg-red-700"
          :disabled="excluindo"
          @click="excluirNF"
        >{{ excluindo ? "Excluindo…" : "Excluir NF" }}</button>
        <span v-else></span>
        <div class="flex gap-2">
          <button @click="router.push('/nfs')" type="button" class="btn-ghost">Voltar</button>
          <button @click="salvar()" :disabled="saving" type="button" class="btn-primary">
            {{ saving ? "Salvando…" : editMode ? "Salvar alterações" : "Criar NF" }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
