<script setup lang="ts">
// Painel de reforcos: projeta quando o saldo de cada ITEM deve acabar e mostra
// ate quando o processo de reforco precisa ser aberto.
//
// A consolidacao e por item, somando todos os empenhos ativos: um item pode
// estar zerado numa NE e ter saldo em outra, e quem compra olha o estoque do
// item, nao a NE. A matematica fica em @/lib/projecao (com testes).
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "@/lib/supabase";
import { buscarTudo } from "@/lib/consulta";
import { getPrazoReforcoDias } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import {
  projetar,
  situacao,
  type ResultadoProjecao,
  type SerieMes,
  type SituacaoReforco,
} from "@/lib/projecao";

interface Linha {
  item_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  grupo: string | null;
  saldo: number;
  /** Quantos empenhos ativos somam esse saldo. */
  empenhos: number;
  proj: ResultadoProjecao;
  sit: SituacaoReforco;
}

const linhas = ref<Linha[]>([]);
const prazoDias = ref(45);
const loading = ref(true);
const error = ref<string | null>(null);
const verTudo = ref(false);

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtQtd = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const ordem: Record<SituacaoReforco, number> = {
  esgotado: 0,
  atrasado: 1,
  abrir: 2,
  monitorar: 3,
  ok: 4,
};

const badge: Record<SituacaoReforco, { label: string; cls: string }> = {
  esgotado: {
    label: "Esgotado",
    cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  },
  atrasado: {
    label: "Prazo vencido",
    cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  },
  abrir: {
    label: "Abrir reforço",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  monitorar: {
    label: "Monitorar",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  ok: {
    label: "OK",
    cls: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  },
};

const seta: Record<string, string> = { alta: "↑", queda: "↓", estavel: "→" };

/**
 * Faixa de esgotamento. Quando as duas projeções discordam demais a faixa
 * deixa de orientar ("26/11/2026 – 10/01/2031" não ajuda ninguém): mostra-se
 * só a ponta curta, com a ressalva.
 */
function faixa(p: ResultadoProjecao): string {
  if (p.motivoSemData === "historico") return "histórico curto";
  if (p.motivoSemData === "irregular") return "consumo irregular";
  if (!p.esgotamentoCedo) return "—";
  const a = fmtDate(iso(p.esgotamentoCedo));
  if (p.instavel) return `a partir de ${a}`;
  const b = fmtDate(iso(p.esgotamentoTarde));
  return a === b ? a : `${a} – ${b}`;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    prazoDias.value = await getPrazoReforcoDias();

    const [saldosData, mensalData] = await Promise.all([
      buscarTudo<Record<string, unknown>>((ini, fim) =>
        supabase
          .from("vw_empenho_item_saldo")
          .select(
            "empenho_id, status, item_id, descricao, codigo_catmat, unidade, grupo, saldo_qtd"
          )
          .eq("status", "ativo")
          .order("item_id")
          .order("empenho_id")
          .range(ini, fim)
      ),
      // Ritmo vem dos RECIBOS, nao das NFs: a NF e evento de faturamento e
      // deixa buracos na serie que nao correspondem a consumo nenhum.
      buscarTudo<Record<string, unknown>>((ini, fim) =>
        supabase
          .from("vw_item_recibo_mensal")
          .select("item_id, mes, quantidade")
          .order("item_id")
          .order("mes")
          .range(ini, fim)
      ),
    ]);

    // Saldo consolidado por item (soma dos empenhos ativos).
    interface Acc {
      item_id: number;
      descricao: string;
      codigo_catmat: string | null;
      unidade: string;
      grupo: string | null;
      saldo: number;
      empenhos: number;
    }
    const porItem = new Map<number, Acc>();
    for (const r of saldosData) {
      const id = num(r.item_id);
      const a = porItem.get(id) ?? {
        item_id: id,
        descricao: String(r.descricao ?? ""),
        codigo_catmat: (r.codigo_catmat as string | null) ?? null,
        unidade: String(r.unidade ?? ""),
        grupo: (r.grupo as string | null) ?? null,
        saldo: 0,
        empenhos: 0,
      };
      a.saldo += num(r.saldo_qtd);
      a.empenhos++;
      porItem.set(id, a);
    }

    // Serie mensal consolidada por item (todos os empenhos juntos).
    const serie = new Map<number, Map<string, number>>();
    for (const r of mensalData) {
      const id = num(r.item_id);
      const mes = String(r.mes ?? "");
      const m = serie.get(id) ?? new Map<string, number>();
      m.set(mes, (m.get(mes) ?? 0) + num(r.quantidade));
      serie.set(id, m);
    }

    const agora = new Date();
    const hoje = new Date(
      Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
    );

    const out: Linha[] = [];
    for (const a of porItem.values()) {
      const m = serie.get(a.item_id);
      const s: SerieMes[] = m
        ? [...m.entries()].map(([mes, quantidade]) => ({ mes, quantidade }))
        : [];
      const proj = projetar({
        saldo: a.saldo,
        serie: s,
        prazoDias: prazoDias.value,
        hoje,
      });
      const sit = situacao(proj, a.saldo, hoje);
      if (sit === "ok") continue; // o painel so mostra o que pede acao
      out.push({ ...a, proj, sit });
    }

    out.sort((x, y) => {
      const o = ordem[x.sit] - ordem[y.sit];
      if (o !== 0) return o;
      const dx = x.proj.dataLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dy = y.proj.dataLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (dx !== dy) return dx - dy;
      return x.descricao.localeCompare(y.descricao);
    });
    linhas.value = out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = /vw_item_recibo_mensal|does not exist|relation|schema cache/i.test(msg)
      ? "A view de série mensal de recibos ainda não existe no banco. Rode a migração 20261020b_recibo_mensal.sql no SQL Editor do Supabase e recarregue."
      : msg;
  } finally {
    loading.value = false;
  }
}

const visiveis = computed(() =>
  verTudo.value ? linhas.value : linhas.value.slice(0, 10)
);

const totais = computed(() => {
  let esgotados = 0;
  let acao = 0;
  let monitorar = 0;
  for (const l of linhas.value) {
    if (l.sit === "esgotado") esgotados++;
    else if (l.sit === "monitorar") monitorar++;
    else acao++;
  }
  return { esgotados, acao, monitorar };
});

function exportarCsv() {
  const l = [
    [
      "Grupo",
      "CatMat",
      "Item",
      "Un.",
      "Saldo total",
      "Empenhos ativos",
      "Consumo mediano/mês",
      "Tendência",
      "Esgota (reta)",
      "Esgota (mediana)",
      "Abrir até",
      "Meses de histórico",
      "Confiança",
      "Situação",
    ],
    ...linhas.value.map((x) => [
      x.grupo ?? "",
      x.codigo_catmat ?? "",
      x.descricao,
      x.unidade,
      String(x.saldo),
      String(x.empenhos),
      String(x.proj.medianaMensal),
      x.proj.tendencia,
      iso(x.proj.esgotamentoLinear) ?? "",
      iso(x.proj.esgotamentoMediana) ?? "",
      iso(x.proj.dataLimite) ?? "",
      String(x.proj.n),
      x.proj.confianca,
      badge[x.sit].label,
    ]),
  ];
  const csv = l
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "reforcos-previstos.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(load);
</script>

<template>
  <div class="card overflow-hidden">
    <div
      class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700"
    >
      <div>
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Reforços previstos</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Saldo somado de todos os empenhos ativos de cada item, com
          {{ prazoDias }} dias de tramitação descontados.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="linhas.length" class="btn-ghost text-sm" @click="exportarCsv">
          Exportar CSV
        </button>
        <RouterLink to="/consumo" class="btn-ghost text-sm">Ver consumo</RouterLink>
      </div>
    </div>

    <div
      v-if="error"
      class="m-4 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300"
    >
      {{ error }}
    </div>

    <div v-else-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">
      Calculando projeções…
    </div>

    <div v-else-if="!linhas.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
      Nenhum item com risco de esgotar no horizonte projetado.
    </div>

    <template v-else>
      <div
        class="px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4"
      >
        <span v-if="totais.esgotados">
          <strong>{{ totais.esgotados }}</strong> sem saldo em nenhum empenho
        </span>
        <span v-if="totais.acao"><strong>{{ totais.acao }}</strong> para abrir reforço</span>
        <span v-if="totais.monitorar">
          <strong>{{ totais.monitorar }}</strong> em monitoramento
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[56rem]">
          <thead
            class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs"
          >
            <tr>
              <th class="px-3 py-2 text-left">Item</th>
              <th class="px-3 py-2 text-right">Saldo total</th>
              <th class="px-3 py-2 text-right">Consumo/mês</th>
              <th class="px-3 py-2 text-left">Esgota entre</th>
              <th class="px-3 py-2 text-left">Abrir até</th>
              <th class="px-3 py-2 text-center">Situação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr
              v-for="l in visiveis"
              :key="l.item_id"
              class="hover:bg-slate-50 dark:hover:bg-slate-700/40 align-top"
            >
              <td class="px-3 py-2 min-w-[14rem]">
                <div class="truncate max-w-[20rem]" :title="l.descricao">{{ l.descricao }}</div>
                <div class="text-xs text-slate-400">
                  {{ l.codigo_catmat ?? "—" }} · {{ l.unidade }}
                  <span v-if="l.grupo"> · {{ l.grupo }}</span>
                  <span> · {{ l.empenhos }} NE{{ l.empenhos > 1 ? "s" : "" }}</span>
                </div>
              </td>
              <td
                class="px-3 py-2 text-right tabular-nums whitespace-nowrap"
                :class="l.saldo <= 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''"
              >
                {{ fmtQtd(l.saldo) }}
              </td>
              <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {{ fmtQtd(l.proj.medianaMensal) }}
                <span
                  class="ml-1"
                  :class="
                    l.proj.tendencia === 'alta'
                      ? 'text-red-600 dark:text-red-400'
                      : l.proj.tendencia === 'queda'
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-slate-400'
                  "
                  :title="
                    l.proj.tendencia === 'alta'
                      ? 'Consumo em alta'
                      : l.proj.tendencia === 'queda'
                        ? 'Consumo em queda'
                        : 'Consumo estável'
                  "
                  >{{ seta[l.proj.tendencia] }}</span
                >
              </td>
              <td class="px-3 py-2 whitespace-nowrap">
                <span :class="l.proj.motivoSemData ? 'text-slate-400 italic' : ''">
                  {{ faixa(l.proj) }}
                </span>
                <div v-if="l.proj.instavel" class="text-xs text-amber-600 dark:text-amber-400">
                  projeções discordam
                </div>
              </td>
              <td class="px-3 py-2 whitespace-nowrap font-medium">
                {{ fmtDate(iso(l.proj.dataLimite)) }}
                <div
                  v-if="l.proj.confianca !== 'alta' && !l.proj.motivoSemData"
                  class="text-xs font-normal text-slate-400"
                  :title="`${l.proj.n} mês(es) de histórico`"
                >
                  confiança {{ l.proj.confianca === "media" ? "média" : "baixa" }}
                </div>
              </td>
              <td class="px-3 py-2 text-center">
                <span
                  class="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                  :class="badge[l.sit].cls"
                >
                  {{ badge[l.sit].label }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="linhas.length > 10"
        class="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-center"
      >
        <button class="btn-ghost text-sm" @click="verTudo = !verTudo">
          {{ verTudo ? "Mostrar menos" : `Ver todos os ${linhas.length}` }}
        </button>
      </div>

      <p
        class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700"
      >
        O saldo é somado entre todos os empenhos ativos do item. O ritmo vem dos
        <strong>recibos</strong> (recebimento nos campi), não das notas fiscais, que saem em
        blocos e distorceriam a série. A faixa vem de duas projeções — regressão e mediana — e
        <strong>Abrir até</strong> usa a ponta mais próxima, menos {{ prazoDias }} dias.
        A projeção não modela férias nem greve. Itens com histórico curto ou consumo
        esporádico aparecem sem data, em vez de ganharem uma data sem lastro.
        É estimativa: confira o item antes de instruir o processo.
      </p>
    </template>
  </div>
</template>
