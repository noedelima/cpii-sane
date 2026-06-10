<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Fornecedor, Grupo, NotaFiscal } from "@/types/database";

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

const loading = ref(false);
const gerando = ref(false);
const error = ref<string | null>(null);
const sucesso = ref<string | null>(null);

const fornecedorAtual = computed(() =>
  fornecedores.value.find((f) => f.id === fornecedorId.value) ?? null
);
const grupoPorId = computed(() => new Map(gruposDoFornecedor.value.map((g) => [g.id, g])));

async function loadFornecedores() {
  const { data } = await supabase
    .from("fornecedores")
    .select("*")
    .eq("status", "ativo")
    .order("codigo");
  fornecedores.value = (data as Fornecedor[] | null) ?? [];
}
void loadFornecedores();

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

  // NFs que já entraram em algum ateste
  const ids = lista.map((n) => n.id);
  atestadas.value = new Set();
  if (ids.length) {
    const { data: ja } = await supabase
      .from("atestes_nfs")
      .select("nf_id")
      .in("nf_id", ids);
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
  if (selecionadas.value.size === nfs.value.length) selecionadas.value = new Set();
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

// ---------- PDF ----------
let logoDataUrl: string | null = null;
async function getLogo(): Promise<string | null> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const resp = await fetch(import.meta.env.BASE_URL + "cpii-logo.png");
    const blob = await resp.blob();
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return logoDataUrl;
  } catch {
    return null;
  }
}

function dataPorExtenso(d: Date): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

async function gerarAteste() {
  error.value = null;
  sucesso.value = null;
  if (!fornecedorAtual.value || nfsSelecionadas.value.length === 0) {
    error.value = "Selecione o fornecedor e ao menos uma nota fiscal.";
    return;
  }
  gerando.value = true;
  try {
    // 1) registra o ateste (numeração oficial vem do banco)
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

    // 2) monta o PDF
    const ano = new Date().getFullYear();
    const numeroDoc = `${String(atesteId).padStart(3, "0")}/${ano}`;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 18;

    const logo = await getLogo();
    if (logo) doc.addImage(logo, "PNG", M, 12, 24, 19.5);
    doc.setFont("helvetica", "bold").setFontSize(13);
    doc.text("COLÉGIO PEDRO II", W / 2, 17, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text("Pró-Reitoria de Administração — PROAD", W / 2, 22.5, { align: "center" });
    doc.text("Seção de Alimentação e Nutrição — SANE", W / 2, 27, { align: "center" });
    doc.setDrawColor(30, 58, 138).setLineWidth(0.6);
    doc.line(M, 34, W - M, 34);

    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(`ATESTE DE RECEBIMENTO Nº ${numeroDoc}`, W / 2, 43, { align: "center" });
    doc.setFontSize(10);
    doc.text("Gêneros alimentícios — fornecimento contratado", W / 2, 48.5, { align: "center" });

    // identificação
    const grupos = resumoPorGrupo.value
      .map((r) => {
        const g = r.grupo;
        if (!g) return "";
        const partes = [g.nome];
        const refs: string[] = [];
        if (g.numero_ata) refs.push(`Ata ${g.numero_ata}`);
        if (g.numero_tc) refs.push(`TC ${g.numero_tc}`);
        if (g.numero_pregao) refs.push(`Pregão ${g.numero_pregao}`);
        if (refs.length) partes.push(`(${refs.join(" · ")})`);
        return partes.join(" ");
      })
      .filter(Boolean);

    const entregas = nfsSelecionadas.value.map((n) => n.data_entrega).sort();
    const periodo =
      entregas.length > 1
        ? `${fmtDate(entregas[0])} a ${fmtDate(entregas[entregas.length - 1])}`
        : fmtDate(entregas[0]);

    autoTable(doc, {
      startY: 54,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.2 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } },
      margin: { left: M, right: M },
      body: [
        ["Fornecedor:", `${fornecedorAtual.value.razao_social} (${fornecedorAtual.value.codigo})`],
        ["CNPJ:", fornecedorAtual.value.cnpj ?? "—"],
        ["Grupo(s)/Contrato(s):", grupos.join("\n")],
        ["Período das entregas:", periodo],
        ["Processo SUAP:", processoSuap.value.trim() || "—"],
      ],
    });

    // tabela de NFs com subtotais por grupo
    type Row = (string | number)[] & { _sub?: boolean };
    const body: Row[] = [];
    for (const r of resumoPorGrupo.value) {
      const gid = r.grupo?.id;
      for (const n of nfsSelecionadas.value.filter((x) => x.grupo_id === gid)) {
        body.push([
          r.grupo?.numero_romano ?? "—",
          n.numero,
          fmtDate(n.data_entrega),
          n.processo_pagamento ?? "—",
          fmtMoney(n.valor_total),
        ] as Row);
      }
      const sub = [
        "",
        "",
        "",
        `Subtotal Grupo ${r.grupo?.numero_romano ?? "—"} (${r.qtd} NF${r.qtd > 1 ? "s" : ""})`,
        fmtMoney(r.total),
      ] as Row;
      sub._sub = true;
      body.push(sub);
    }

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4,
      head: [["Grupo", "Nota Fiscal", "Entrega", "Processo de pagamento", "Valor (R$)"]],
      body: body as unknown as (string | number)[][],
      foot: [["", "", "", `TOTAL GERAL (${nfsSelecionadas.value.length} NFs)`, fmtMoney(totalGeral.value)]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8.5 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 30 },
        2: { cellWidth: 22 },
        4: { cellWidth: 28, halign: "right" },
      },
      margin: { left: M, right: M },
      didParseCell: (hook) => {
        const raw = hook.row.raw as Row;
        if (hook.section === "body" && raw?._sub) {
          hook.cell.styles.fontStyle = "bold";
          hook.cell.styles.fillColor = [241, 245, 249];
        }
        if (hook.section === "body" && hook.column.index === 4) {
          hook.cell.styles.halign = "right";
        }
        if (hook.section === "foot" && hook.column.index === 4) {
          hook.cell.styles.halign = "right";
        }
      },
    });

    let y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    const texto =
      `Atestamos, para fins de liquidação e pagamento, nos termos dos arts. 140 e 141 da ` +
      `Lei nº 14.133/2021, que os gêneros alimentícios relativos às notas fiscais acima ` +
      `relacionadas, fornecidos por ${fornecedorAtual.value.razao_social}` +
      `${fornecedorAtual.value.cnpj ? ", CNPJ " + fornecedorAtual.value.cnpj : ""}, foram ` +
      `entregues nos campi do Colégio Pedro II e conferidos quanto à quantidade e à ` +
      `qualidade, em conformidade com as condições pactuadas no(s) instrumento(s) acima ` +
      `identificado(s).` +
      (processoSuap.value.trim()
        ? ` O presente ateste integra o Processo SUAP nº ${processoSuap.value.trim()}.`
        : "");

    doc.setFont("helvetica", "normal").setFontSize(10);
    const linhas = doc.splitTextToSize(texto, W - 2 * M) as string[];
    const hTexto = linhas.length * 4.6;
    const hBlocoFinal = hTexto + (observacoes.value.trim() ? 18 : 0) + 46;
    if (y + hBlocoFinal > doc.internal.pageSize.getHeight() - 14) {
      doc.addPage();
      y = 24;
    }
    doc.text(linhas, M, y);
    y += hTexto + 4;

    if (observacoes.value.trim()) {
      doc.setFont("helvetica", "bold").setFontSize(9.5);
      doc.text("Observações:", M, y);
      doc.setFont("helvetica", "normal");
      const obs = doc.splitTextToSize(observacoes.value.trim(), W - 2 * M) as string[];
      doc.text(obs, M, y + 4.6);
      y += 4.6 + obs.length * 4.4 + 4;
    }

    y += 6;
    doc.setFontSize(10);
    doc.text(
      `${localEmissao.value.trim() || "Rio de Janeiro"}, ${dataPorExtenso(new Date())}.`,
      M,
      y
    );

    y += 22;
    doc.setDrawColor(60).setLineWidth(0.3);
    doc.line(W / 2 - 45, y, W / 2 + 45, y);
    doc.setFontSize(10);
    doc.text(auth.perfil?.nome ?? "", W / 2, y + 5, { align: "center" });
    doc.setFontSize(8.5).setTextColor(90);
    doc.text("Seção de Alimentação e Nutrição — SANE / Colégio Pedro II", W / 2, y + 9.6, {
      align: "center",
    });
    doc.text("Matrícula SIAPE: ____________________", W / 2, y + 14, { align: "center" });

    // rodapé com paginação
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5).setTextColor(130);
      doc.text(
        `Ateste nº ${numeroDoc} · gerado no CPII SANE Controle em ${new Date().toLocaleString("pt-BR")} por ${auth.perfil?.nome ?? "—"}`,
        M,
        doc.internal.pageSize.getHeight() - 8
      );
      doc.text(
        `Página ${i} de ${pages}`,
        W - M,
        doc.internal.pageSize.getHeight() - 8,
        { align: "right" }
      );
      doc.setTextColor(0);
    }

    doc.save(`ateste-${String(atesteId).padStart(3, "0")}-${ano}-${fornecedorAtual.value.codigo.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`);

    sucesso.value = `Ateste nº ${numeroDoc} gerado com ${nfsSelecionadas.value.length} NF(s), total ${fmtMoney(totalGeral.value)}. O PDF foi baixado — anexe ao processo no SUAP.`;
    await carregarNFs();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao gerar o ateste.";
  } finally {
    gerando.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Ateste de recebimento</h1>
      <p class="text-sm text-slate-500 mt-1">
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
        <div v-if="fornecedorAtual" class="self-end pb-2 text-sm text-slate-600">
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
              : 'bg-white text-slate-600 border-slate-300 hover:border-cpii-500'"
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
                : 'bg-white text-slate-600 border-slate-300'"
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
        <label class="flex items-center gap-2 text-sm text-slate-700 pb-2.5 cursor-pointer">
          <input v-model="ocultarAtestadas" type="checkbox" class="rounded border-slate-300" />
          Ocultar NFs já atestadas
        </label>
      </div>
    </div>

    <div v-if="fornecedorId" class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
        <h2 class="font-medium text-slate-700">
          Notas fiscais ({{ selecionadas.size }} de {{ nfs.length }} selecionadas)
        </h2>
        <button class="btn-ghost text-sm" @click="toggleTodas">
          {{ selecionadas.size === nfs.length ? "Desmarcar todas" : "Marcar todas" }}
        </button>
      </div>
      <p v-if="limiteAtingido" class="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200">
        Mostrando as primeiras 500 NFs — refine pelo período para ver todas.
      </p>

      <div v-if="loading" class="p-6 text-center text-slate-500">Carregando…</div>
      <div v-else-if="!nfs.length" class="p-6 text-center text-slate-500">
        Nenhuma NF encontrada com os filtros atuais.
      </div>
      <div v-else class="max-h-[26rem] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600 uppercase text-xs sticky top-0">
            <tr>
              <th class="px-3 py-2 w-10"></th>
              <th class="px-3 py-2 text-left">NF</th>
              <th class="px-3 py-2 text-left">Entrega</th>
              <th class="px-3 py-2 text-left">Grupo</th>
              <th class="px-3 py-2 text-left">Processo pgto.</th>
              <th class="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            <tr
              v-for="n in nfs"
              :key="n.id"
              class="hover:bg-slate-50 cursor-pointer"
              :class="{ 'opacity-60': atestadas.has(n.id) }"
              @click="toggleNF(n.id)"
            >
              <td class="px-3 py-2">
                <input
                  type="checkbox"
                  class="rounded border-slate-300 pointer-events-none"
                  :checked="selecionadas.has(n.id)"
                />
              </td>
              <td class="px-3 py-2 font-medium">
                {{ n.numero }}
                <span
                  v-if="atestadas.has(n.id)"
                  class="ml-1.5 text-[10px] uppercase bg-slate-200 text-slate-600 rounded px-1 py-0.5"
                >já atestada</span>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">{{ fmtDate(n.data_entrega) }}</td>
              <td class="px-3 py-2">{{ grupoPorId.get(n.grupo_id)?.numero_romano ?? "—" }}</td>
              <td class="px-3 py-2 text-slate-600 max-w-[14rem] truncate" :title="n.processo_pagamento ?? ''">
                {{ n.processo_pagamento ?? "—" }}
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ fmtMoney(n.valor_total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="nfsSelecionadas.length" class="card p-5 space-y-4">
      <h2 class="font-medium text-slate-700">Resumo e emissão</h2>

      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          v-for="r in resumoPorGrupo"
          :key="r.grupo?.id ?? 0"
          class="rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          <div class="font-medium">Grupo {{ r.grupo?.numero_romano ?? "—" }}</div>
          <div class="text-slate-500">{{ r.qtd }} NF(s) · {{ fmtMoney(r.total) }}</div>
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

    <div v-if="sucesso" class="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
      {{ sucesso }}
    </div>
    <div v-if="error" class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
      {{ error }}
    </div>
  </div>
</template>
