<script setup lang="ts">
import { onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { recarregarConfig } from "@/lib/config";
import type { Configuracao } from "@/types/database";

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

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Parâmetros globais usados nos documentos gerados pelo sistema. As alterações valem
      para os próximos PDFs (ateste, solicitação de NF, saldos e lançamento).
    </p>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
    <div v-else class="space-y-3">
      <div v-for="l in itens" :key="l.chave" class="card p-4">
        <label class="label">{{ l.descricao ?? l.chave }}</label>
        <p class="text-xs text-slate-400 dark:text-slate-500 mb-2 font-mono">{{ l.chave }}</p>
        <div class="flex flex-wrap gap-2 items-center">
          <input v-model="l.valor" type="text" class="input grow min-w-[16rem]" />
          <button class="btn-secondary shrink-0" :disabled="l._saving" @click="salvar(l)">
            {{ l._saving ? "Salvando…" : l._savedAt ? "Salvo ✓" : "Salvar" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
