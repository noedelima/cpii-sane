<script setup lang="ts">
// Painel de reforcos: projeta quando o saldo de cada item de empenho acaba e
// mostra ate quando o processo de reforco precisa ser aberto. A matematica
// fica em @/lib/projecao (com testes); aqui so se monta a serie e a tela.
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

interface SaldoRow {
  empenho_id: number;
  empenho: string;
  status: string;
  item_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  grupo_id: number | null;
  grupo: string | null;
  saldo_qtd: number;
}

interface MensalRow {
  empenho_id: number;
  item_id: number;
  grupo_id: number | null;
  mes: string;
  quantidade: number;
}

interface Linha {
  chave: string;
  empenho_id: number;
  empenho: string;
  item_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  grupo: string | null;
  saldo: number;
  proj: ResultadoProjecao;
  sit: SituacaoReforco;
}

const linhas = ref<Linha[]>([]);
const prazoDias = ref(45);
const loading = ref(true);
const error = ref<string | null>(null);
const verTudo = ref(false);

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** So entram no painel os itens que exigem alguma acao. */
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
  ok: { label: "OK", cls: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
};

const setaTendencia: Record<string, string> = {
  alta: "↑",
  queda: "↓",
  estavel: "→",
};

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
            "empenho_id, empenho, status, item_id, descricao, codigo_catmat, unidade, grupo_id, grupo, saldo_qtd"
          )
          .eq("status", "ativo")
          .order("empenho_id")
          .order("item_id")
          .range(ini, fim)
      ),
      buscarTudo<Record<string, unknown>>((ini, fim) =>
        supabase
          .from("vw_item_consumo_mensal")
          .select("empenho_id, item_id, grupo_id, mes, quantidade")
          .order("empenho_id")
          .order("item_id")
          .order("mes")
          .range(ini, fim)
      ),
    ]);

    const saldos: SaldoRow[] = saldosData.map((r) => ({
      empenho_id: num(r.empenho_id),
      empenho: String(r.empenho ?? ""),
      status: String(r.status ?? ""),
      item_id: num(r.item_id),
      descricao: String(r.descricao ?? ""),
      codigo_catmat: (r.codigo_catmat as string | null) ?? null,
      unidade: String(r.unidade ?? ""),
      grupo_id: r.grupo_id == null ? null : num(r.grupo_id),
      grupo: (r.grupo as string | null) ?? null,
      saldo_qtd: num(r.saldo_qtd),
    }));

    const mensal: MensalRow[] = mensalData.map((r) => ({
      empenho_id: num(r.empenho_id),
      item_id: num(r.item_id),
      grupo_id: r.grupo_id == null ? null : num(r.grupo_id),
      mes: String(r.mes ?? ""),
      quantidade: num(r.quantidade),
    }));

    // Serie por empenho+item e calendario letivo por grupo (meses em que
    // QUALQUER item do grupo teve consumo).
    const serie = new Map<string, SerieMes[]>();
    const mesesPorGrupo = new Map<number, Set<string>>();
    for (const m of mensal) {
      const k = m.empenho_id + "|" + m.item_id;
      const arr = serie.get(k) ?? [];
      arr.push({ mes: m.mes, quantidade: m.quantidade });
      serie.set(k, arr);
      if (m.grupo_id != null && m.quantidade > 0) {
        const s = mesesPorGrupo.get(m.grupo_id) ?? new Set<string>();
        s.add(m.mes);
        mesesPorGrupo.set(m.grupo_id, s);
      }
    }

    const hoje = new Date();
    const hojeUtc = new Date(
      Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    );

    const out: Linha[] = [];
    for (const s of saldos) {
      const chave = s.empenho_id + "|" + s.item_id;
      const mesesGrupo = s.grupo_id != null ? mesesPorGrupo.get(s.grupo_id) : null;
      const proj = projetar({
        saldo: s.saldo_qtd,
        serie: serie.get(chave) ?? [],
        mesesAtivosDoGrupo: mesesGrupo ? [...mesesGrupo] : [],
        prazoDias: prazoDias.value,
        hoje: hojeUtc,
      });
      const sit = situacao(proj, s.saldo_qtd, hojeUtc);
      if (sit === "ok") continue; // o painel so mostra o que pede acao
      out.push({
        chave,
        empenho_id: s.empenho_id,
        empenho: s.empenho,
        item_id: s.item_id,
        descricao: s.descricao,
        codigo_catmat: s.codigo_catmat,
        unidade: s.unidade,
        grupo: s.grupo,
        saldo: s.saldo_qtd,
        proj,
        sit,
      });
    }

    out.sort((a, b) => {
      const o = ordem[a.sit] - ordem[b.sit];
      if (o !== 0) return o;
      const da = a.proj.dataLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = b.proj.dataLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
    linhas.value = out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = /vw_item_consumo_mensal|does not exist|relation|schema cache/i.test(msg)
      ? "A view de série mensal ainda não existe no banco. Rode a seção 34 do schema.sql (ou a migração 20261020_projecao_reforco.sql) no SQL Editor do Supabase e recarregue."
      : msg;
  } finally {
    loading.value = false;
  }
}

const visiveis = computed(() => (verTudo.value ? linhas.value : linhas.value.slice(0, 10)));

const totais = computed(() => {
  let acao = 0;
  let monitorar = 0;
  for (const l of linhas.value) {
    if (l.sit === "monitorar") monitorar++;
    else acao++;
  }
  return { acao, monitorar };
});

function exportarCsv() {
  const l = [
    [
      "Grupo",
      "Empenho",
      "CatMat",
      "Item",
      "Un.",
      "Saldo",
      "Consumo mediano/mês",
      "Tendência",
      "Esgota (reta)",
      "Esgota (mediana)",
      "Abrir até",
      "Confiança",
      "Situação",
    ],
    ...linhas.value.map((x) => [
      x.grupo ?? "",
      x.empenho,
      x.codigo_catmat ?? "",
      x.descricao,
      x.unidade,
      String(x.saldo),
      String(x.proj.medianaMensal),
      x.proj.tendencia,
      iso(x.proj.esgotamentoLinear) ?? "",
      iso(x.proj.esgotamentoMediana) ?? "",
      iso(x.proj.dataLimite) ?? "",
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
          Itens cujo saldo deve acabar a tempo de exigir reforço, considerando
          {{ prazoDias }} dias de tramitação.
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
        class="px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300"
      >
        <strong>{{ totais.acao }}</strong> item(ns) exigindo abertura de reforço
        <span v-if="totais.monitorar">
          · <strong>{{ totais.monitorar }}</strong> em monitoramento</span
        >
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[58rem]">
          <thead
            class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs"
          >
            <tr>
              <th class="px-3 py-2 text-left">Item</th>
              <th class="px-3 py-2 text-left">Empenho</th>
              <th class="px-3 py-2 text-right">Saldo</th>
              <th class="px-3 py-2 text-right">Consumo/mês</th>
              <th class="px-3 py-2 text-left" title="Projeção por regressão linear">
                Esgota (reta)
              </th>
              <th class="px-3 py-2 text-left" title="Projeção pela mediana dos meses letivos">
                Esgota (mediana)
              </th>
              <th class="px-3 py-2 text-left">Abrir até</th>
              <th class="px-3 py-2 text-center">Situação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr
              v-for="l in visiveis"
              :key="l.chave"
              class="hover:bg-slate-50 dark:hover:bg-slate-700/40 align-top"
            >
              <td class="px-3 py-2 min-w-[13rem]">
                <div class="truncate max-w-[17rem]" :title="l.descricao">{{ l.descricao }}</div>
                <div class="text-xs text-slate-400">
                  {{ l.codigo_catmat ?? "—" }} · {{ l.unidade }}
                  <span v-if="l.grupo"> · {{ l.grupo }}</span>
                </div>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">
                <RouterLink
                  :to="`/empenhos/${l.empenho_id}`"
                  class="text-cpii-600 dark:text-cpii-300 hover:underline"
                >
                  {{ l.empenho }}
                </RouterLink>
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
                  >{{ setaTendencia[l.proj.tendencia] }}</span
                >
              </td>
              <td
                class="px-3 py-2 whitespace-nowrap"
                :class="l.proj.metodo === 'linear' ? 'font-medium' : 'text-slate-500 dark:text-slate-400'"
              >
                {{ fmtDate(iso(l.proj.esgotamentoLinear)) }}
              </td>
              <td
                class="px-3 py-2 whitespace-nowrap"
                :class="l.proj.metodo === 'mediana' ? 'font-medium' : 'text-slate-500 dark:text-slate-400'"
              >
                {{ fmtDate(iso(l.proj.esgotamentoMediana)) }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap font-medium">
                {{ fmtDate(iso(l.proj.dataLimite)) }}
                <div class="text-xs font-normal text-slate-400">
                  <span v-if="l.proj.confianca !== 'alta'" :title="`${l.proj.n} mês(es) de histórico`"
                    >confiança {{ l.proj.confianca === "media" ? "média" : "baixa" }}</span
                  >
                  <span v-if="l.proj.divergente" class="text-amber-600 dark:text-amber-400">
                    · métodos divergem
                  </span>
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

      <p class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
        Duas projeções são calculadas e vale a que esgota primeiro: a
        <strong>reta</strong> (regressão sobre os meses letivos, enxerga consumo em alta) e a
        <strong>mediana</strong> (resistente a uma NF atípica). Meses de recesso — inferidos dos
        meses sem consumo em todo o grupo — ficam de fora da média e são pulados na projeção.
        <strong>Abrir até</strong> = data prevista de esgotamento menos {{ prazoDias }} dias.
        Projeção é estimativa: confira o item antes de instruir o processo.
      </p>
    </template>
  </div>
</template>
