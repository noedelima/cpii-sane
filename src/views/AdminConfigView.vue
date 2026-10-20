<script setup lang="ts">
import { onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { recarregarConfig } from "@/lib/config";
import {
  NOMES_DIAS_CURTOS,
  listarDias,
  parseDiasSemana,
  semRestricao,
  serializarDiasSemana,
} from "@/lib/dias-semana";
import type { Configuracao } from "@/types/database";

/** Chave que ganha editor proprio (caixas de selecao) em vez de texto cru. */
const CHAVE_DIAS = "recibo_dias_semana";

interface Linha extends Configuracao {
  _saving?: boolean;
  _savedAt?: number;
}

const itens = ref<Linha[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  const { data, error: err } = await supabase
    .from("configuracoes")
    .select("*")
    .order("chave");
  if (err) error.value = err.message;
  itens.value = (data as Linha[] | null) ?? [];
  loading.value = false;
}

async function salvar(l: Linha) {
  l._saving = true;
  error.value = null;
  const { error: err } = await supabase
    .from("configuracoes")
    .update({ valor: l.valor })
    .eq("chave", l.chave);
  l._saving = false;
  if (err) {
    error.value = err.message;
    return;
  }
  l._savedAt = Date.now();
  setTimeout(() => (l._savedAt = undefined), 1500);
  recarregarConfig(); // os PDFs passam a usar o novo valor nesta sessão
}

function diasDe(l: Linha): number[] {
  return parseDiasSemana(l.valor);
}

function alternarDia(l: Linha, dia: number) {
  const atuais = new Set(diasDe(l));
  if (atuais.has(dia)) atuais.delete(dia);
  else atuais.add(dia);
  // Deixar nenhum dia marcado travaria o lancamento de recibos para os campi.
  if (!atuais.size) return;
  l.valor = serializarDiasSemana([...atuais]);
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Parâmetros globais do sistema: cabeçalho dos documentos gerados, prazo usado no
      painel de reforços e regras de lançamento. As alterações valem a partir do próximo
      carregamento de cada tela.
    </p>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
    <div v-else class="space-y-3">
      <div v-for="l in itens" :key="l.chave" class="card p-4">
        <label class="label">{{ l.descricao ?? l.chave }}</label>
        <p class="text-xs text-slate-400 dark:text-slate-500 mb-2 font-mono">{{ l.chave }}</p>
        <!-- Dias da semana: caixas de seleção em vez de uma lista de números -->
        <template v-if="l.chave === CHAVE_DIAS">
          <div class="flex flex-wrap gap-2 mb-3">
            <label
              v-for="(nome, dia) in NOMES_DIAS_CURTOS"
              :key="dia"
              class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer select-none"
              :class="diasDe(l).includes(dia)
                ? 'border-cpii-600 bg-cpii-50 dark:bg-cpii-950/40 text-cpii-800 dark:text-cpii-200'
                : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'"
            >
              <input
                type="checkbox"
                class="accent-cpii-600"
                :checked="diasDe(l).includes(dia)"
                @change="alternarDia(l, dia)"
              />
              {{ nome }}
            </label>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
            <template v-if="semRestricao(diasDe(l))">
              Todos os dias liberados — nenhuma restrição em vigor.
            </template>
            <template v-else>
              Os campi só conseguirão lançar recibos com data em
              <strong>{{ listarDias(diasDe(l)) }}</strong>. SANE e admin continuam podendo
              lançar qualquer data, para resolver exceções.
            </template>
          </p>
          <button class="btn-secondary" :disabled="l._saving" @click="salvar(l)">
            {{ l._saving ? "Salvando…" : l._savedAt ? "Salvo ✓" : "Salvar" }}
          </button>
        </template>

        <div v-else class="flex flex-wrap gap-2 items-center">
          <input v-model="l.valor" type="text" class="input grow min-w-[16rem]" />
          <button class="btn-secondary shrink-0" :disabled="l._saving" @click="salvar(l)">
            {{ l._saving ? "Salvando…" : l._savedAt ? "Salvo ✓" : "Salvar" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
