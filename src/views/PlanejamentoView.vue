<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { buscarTudo } from "@/lib/consulta";
import { msgErro } from "@/lib/erro";
import { fmtQtd } from "@/lib/format";
import {
  arredondar,
  avaliar,
  avisoColagem,
  conferir,
  consolidarSaldo,
  lerColagem,
  type Conferencia,
  type Situacao,
} from "@/lib/planejamento";
import type { Grupo, Item } from "@/types/database";

interface Linha {
  item_id: number;
  descricao: string;
  codigo_catmat: string | null;
  unidade: string;
  saldo: number;
  temEmpenho: boolean;
  transito: number;
  /** Trânsito calculado, guardado para sinalizar quando o fiscal corrige. */
  transitoCalculado: number;
  planejado: number;
}

const grupos = ref<Grupo[]>([]);
const grupoId = ref<number | null>(null);
const linhas = ref<Linha[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// colagem
const textoColado = ref("");
const previa = ref<Conferencia[] | null>(null);
const previaAviso = ref<string | null>(null);
const previaInvalidas = ref<number[]>([]);
const previaColunas = ref(0);

const grupoAtual = computed(() => grupos.value.find((g) => g.id === grupoId.value) ?? null);

const resultados = computed(() =>
  linhas.value.map((l) => avaliar(l.saldo, l.transito, l.planejado, l.temEmpenho))
);

const comPlanejamento = computed(() =>
  linhas.value.reduce((n, l) => n + (l.planejado > 0 ? 1 : 0), 0)
);
const semSaldo = computed(() =>
  resultados.value.reduce((n, r) => n + (r.situacao === "sem-saldo" ? 1 : 0), 0)
);
const semEmpenho = computed(() =>
  resultados.value.reduce((n, r) => n + (r.situacao === "sem-empenho" ? 1 : 0), 0)
);
const totalTransito = computed(() =>
  arredondar(linhas.value.reduce((s, l) => s + l.transito, 0))
);

async function loadGrupos() {
  const { data, error: err } = await supabase
    .from("grupos")
    .select("*")
    .eq("status", "vigente")
    .order("numero_arabico");
  if (err) error.value = err.message;
  grupos.value = (data as Grupo[] | null) ?? [];
}

async function loadGrupo() {
  linhas.value = [];
  limparPrevia();
  if (!grupoId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const gid = grupoId.value;

    // A ordem dos itens e a mesma da planilha de pedidos dos campi (descricao),
    // e e dela que a colagem posicional depende.
    const itens = await buscarTudo<Item>((de, ate) =>
      supabase
        .from("itens")
        .select("*")
        .eq("grupo_id", gid)
        .eq("status", "ativo")
        .order("descricao")
        .order("id")
        .range(de, ate)
    );

    type SaldoRow = { item_id: number; saldo_qtd: number | string | null; status: string | null };
    const saldos = await buscarTudo<SaldoRow>((de, ate) =>
      supabase
        .from("vw_empenho_item_saldo")
        .select("item_id, saldo_qtd, status")
        .eq("grupo_id", gid)
        .eq("status", "ativo")
        .order("item_id")
        .order("empenho_id")
        .range(de, ate)
    );

    type TransitoRow = { item_id: number; qtd_transito: number | string | null };
    const { data: transitoData, error: errT } = await supabase
      .from("vw_item_transito")
      .select("item_id, qtd_transito")
      .eq("grupo_id", gid);
    if (errT) throw errT;

    const porItem = consolidarSaldo(saldos);
    const transito = new Map<number, number>(
      ((transitoData as TransitoRow[] | null) ?? []).map((t) => [
        t.item_id,
        Number(t.qtd_transito ?? 0),
      ])
    );

    linhas.value = itens.map((i) => {
      const t = arredondar(transito.get(i.id) ?? 0);
      return {
        item_id: i.id,
        descricao: i.descricao,
        codigo_catmat: i.codigo_catmat,
        unidade: i.unidade,
        saldo: arredondar(porItem.get(i.id) ?? 0),
        temEmpenho: porItem.has(i.id),
        transito: t,
        transitoCalculado: t,
        planejado: 0,
      };
    });
  } catch (e) {
    error.value = msgErro(e, "Falha ao carregar o grupo.");
  } finally {
    loading.value = false;
  }
}

watch(grupoId, loadGrupo);

// --- colagem da planilha ---
function limparPrevia() {
  textoColado.value = "";
  previa.value = null;
  previaAviso.value = null;
  previaInvalidas.value = [];
  previaColunas.value = 0;
}

function prepararColagem() {
  const r = lerColagem(textoColado.value);
  if (!r.quantidades.length) {
    previa.value = null;
    previaAviso.value = null;
    return;
  }
  previa.value = conferir(
    linhas.value.map((l) => l.descricao),
    r.quantidades
  );
  previaAviso.value = avisoColagem(linhas.value.length, r.quantidades.length);
  previaInvalidas.value = r.invalidas;
  previaColunas.value = r.colunas;
}

watch(textoColado, prepararColagem);

function aplicarColagem() {
  if (!previa.value) return;
  previa.value.forEach((c, i) => {
    if (linhas.value[i]) linhas.value[i].planejado = c.quantidade;
  });
  limparPrevia();
}

function limparPlanejado() {
  for (const l of linhas.value) l.planejado = 0;
  limparPrevia();
}

function restaurarTransito() {
  for (const l of linhas.value) l.transito = l.transitoCalculado;
}

const transitoAjustado = computed(() =>
  linhas.value.some((l) => l.transito !== l.transitoCalculado)
);

function corDaSituacao(s: Situacao): string {
  if (s === "sem-saldo") return "text-red-700 dark:text-red-300 font-medium";
  if (s === "sem-empenho") return "text-slate-400 dark:text-slate-500";
  return "text-green-700 dark:text-green-300";
}

function fundoDaLinha(s: Situacao, planejado: number): string {
  if (s === "sem-saldo") return "bg-red-50 dark:bg-red-950/30";
  if (planejado > 0) return "bg-green-50/60 dark:bg-green-950/20";
  return "";
}

onMounted(loadGrupos);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Planejamento de pedidos</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Confira o saldo antes de enviar o pedido à contratada. Esta área é
        <strong>somente consultiva</strong>: nada aqui desconta saldo de empenho, e nenhuma
        quantidade informada é gravada.
      </p>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <div class="card p-5 space-y-4">
      <div class="grid sm:grid-cols-12 gap-3 items-end">
        <div class="sm:col-span-6">
          <label class="label">Grupo</label>
          <select v-model="grupoId" class="input">
            <option :value="null" disabled>Selecione o grupo do pedido…</option>
            <option v-for="g in grupos" :key="g.id" :value="g.id">
              {{ g.numero_romano }} — {{ g.nome }}
            </option>
          </select>
        </div>
        <div v-if="linhas.length" class="sm:col-span-6 flex gap-2">
          <button type="button" class="btn-secondary" @click="limparPlanejado">
            Limpar quantidades
          </button>
          <button
            v-if="transitoAjustado"
            type="button"
            class="btn-secondary"
            @click="restaurarTransito"
          >
            Restaurar trânsito calculado
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">
      Carregando…
    </div>

    <template v-else-if="linhas.length">
      <!-- Colagem da planilha -->
      <div class="card p-5 space-y-3">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Colar da planilha de pedidos</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Copie no Excel a coluna de <strong>quantidade total</strong> ou o bloco inteiro das
          colunas dos campi — neste caso o sistema soma cada linha — e cole abaixo. A planilha
          não traz o CatMat, então o encaixe é <strong>pela ordem</strong>: confira a
          pré-visualização antes de aplicar.
        </p>
        <textarea
          v-model="textoColado"
          rows="3"
          class="input font-mono text-xs"
          placeholder="Cole aqui (Ctrl+V)…"
        ></textarea>

        <div v-if="previa" class="space-y-3">
          <p v-if="previaAviso" class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md p-2">
            {{ previaAviso }}
          </p>
          <p v-if="previaInvalidas.length" class="text-xs text-amber-700 dark:text-amber-300">
            Linha(s) com texto no lugar de número, contadas como zero:
            {{ previaInvalidas.join(", ") }}.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ previa.length }} linha(s), {{ previaColunas }} coluna(s)
            <template v-if="previaColunas > 1">— somadas por linha</template>.
            Confira o encaixe:
          </p>
          <div class="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                <tr v-for="(c, i) in previa" :key="i">
                  <td class="py-1.5 px-3 text-slate-400 dark:text-slate-500 w-10 tabular-nums">
                    {{ i + 1 }}
                  </td>
                  <td class="py-1.5 px-3">{{ c.descricao }}</td>
                  <td class="py-1.5 px-3 text-right tabular-nums font-medium">
                    {{ fmtQtd(c.quantidade) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn" @click="aplicarColagem">
              Conferi — aplicar quantidades
            </button>
            <button type="button" class="btn-secondary" @click="limparPrevia">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- Resumo -->
      <div class="grid sm:grid-cols-4 gap-3">
        <div class="card p-4">
          <p class="text-xs text-slate-500 dark:text-slate-400">Itens do grupo</p>
          <p class="text-2xl font-semibold">{{ linhas.length }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-slate-500 dark:text-slate-400">Com quantidade informada</p>
          <p class="text-2xl font-semibold">{{ comPlanejamento }}</p>
        </div>
        <div class="card p-4" :class="semSaldo ? 'border-red-300 dark:border-red-900' : ''">
          <p class="text-xs text-slate-500 dark:text-slate-400">Sem saldo suficiente</p>
          <p class="text-2xl font-semibold" :class="semSaldo ? 'text-red-700 dark:text-red-300' : ''">
            {{ semSaldo }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-slate-500 dark:text-slate-400">Sem empenho ativo</p>
          <p class="text-2xl font-semibold">{{ semEmpenho }}</p>
        </div>
      </div>

      <!-- Tabela -->
      <div class="card p-5 space-y-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">
            {{ grupoAtual?.numero_romano }} — {{ grupoAtual?.nome }}
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Em trânsito no grupo: <strong>{{ fmtQtd(totalTransito) }}</strong>
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
              <tr>
                <th class="text-left py-2">Item</th>
                <th class="text-left py-2 pl-2">Un.</th>
                <th class="text-right py-2">Saldo (NE)</th>
                <th class="text-right py-2">Em trânsito</th>
                <th class="text-right py-2">Disponível</th>
                <th class="text-right py-2">Quero pedir</th>
                <th class="text-right py-2">Saldo final</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr
                v-for="(l, idx) in linhas"
                :key="l.item_id"
                :class="fundoDaLinha(resultados[idx].situacao, l.planejado)"
              >
                <td class="py-2 pr-2">
                  {{ l.descricao }}
                  <span v-if="l.codigo_catmat" class="text-xs text-slate-400 dark:text-slate-500">
                    · {{ l.codigo_catmat }}
                  </span>
                </td>
                <td class="py-2 pl-2 text-slate-500 dark:text-slate-400">{{ l.unidade }}</td>
                <td class="py-2 text-right tabular-nums">
                  <span v-if="l.temEmpenho">{{ fmtQtd(l.saldo) }}</span>
                  <span v-else class="text-slate-400 dark:text-slate-500">sem NE</span>
                </td>
                <td class="py-2 text-right w-28">
                  <input
                    v-model.number="l.transito"
                    type="number"
                    step="0.001"
                    min="0"
                    class="input py-1 text-right tabular-nums"
                    :class="l.transito !== l.transitoCalculado
                      ? 'border-amber-400 dark:border-amber-600'
                      : ''"
                  />
                </td>
                <td class="py-2 text-right tabular-nums">
                  {{ fmtQtd(resultados[idx].disponivel) }}
                </td>
                <td class="py-2 text-right w-28">
                  <input
                    v-model.number="l.planejado"
                    type="number"
                    step="0.001"
                    min="0"
                    class="input py-1 text-right tabular-nums"
                  />
                </td>
                <td class="py-2 text-right tabular-nums" :class="corDaSituacao(resultados[idx].situacao)">
                  {{ fmtQtd(resultados[idx].saldoFinal) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="text-xs text-slate-500 dark:text-slate-400 space-y-1 border-t border-slate-200 dark:border-slate-700 pt-3">
          <p>
            <strong>Saldo (NE)</strong> é o empenhado menos o <em>faturado</em>, somando todos os
            empenhos ativos do item.
            <strong>Em trânsito</strong> é o que já foi entregue e ainda não virou nota fiscal —
            o sistema preenche com os recibos sem NF do período configurado e você pode corrigir
            o número quando souber que está errado.
            <strong>Disponível</strong> = saldo − trânsito.
          </p>
          <p v-if="transitoAjustado" class="text-amber-700 dark:text-amber-300">
            Você ajustou o trânsito de algum item. Vale conferir se o recibo correspondente foi
            lançado corretamente pelo campus.
          </p>
        </div>
      </div>
    </template>

    <div v-else-if="grupoId" class="card p-6 text-center text-slate-500 dark:text-slate-400">
      Este grupo não tem itens ativos.
    </div>
  </div>
</template>
