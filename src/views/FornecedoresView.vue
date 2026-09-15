<script setup lang="ts">
import { onMounted, ref } from "vue";
import FornecedorForm from "@/components/FornecedorForm.vue";
import { supabase } from "@/lib/supabase";
import { msgErro } from "@/lib/erro";
import type { Fornecedor } from "@/types/database";

const fornecedores = ref<Fornecedor[]>([]);
const loading = ref(true);
const error = ref("");
const criando = ref(false);
const success = ref("");
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { data, error: err } = await supabase.from("fornecedores").select("*").order("codigo");
    if (err) throw err;
    fornecedores.value = (data as Fornecedor[]) ?? [];
  } catch (err) {
    error.value = msgErro(err, "Falha ao carregar fornecedores.");
  } finally {
    loading.value = false;
  }
}
function cadastrado(fornecedor: Fornecedor) {
  criando.value = false;
  success.value = `Fornecedor ${fornecedor.codigo} cadastrado com sucesso.`;
  void load();
}
onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">Fornecedores</h1>
      <button v-if="!criando" class="btn-primary" @click="criando = true; success = ''">+ Novo fornecedor</button>
    </div>
    <FornecedorForm v-if="criando" @saved="cadastrado" @cancel="criando = false" />
    <p v-if="success" role="status" class="text-green-700 dark:text-green-300">{{ success }}</p>
    <div v-if="error" role="alert" class="text-red-700 dark:text-red-300">
      {{ error }} <button class="btn-ghost" @click="load">Tentar novamente</button>
    </div>
    <div class="card overflow-x-auto">
      <p v-if="loading" class="p-6">Carregando…</p>
      <p v-else-if="!error && !fornecedores.length" class="p-6">Nenhum fornecedor cadastrado.</p>
      <table v-else-if="!error" class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-700/50"><tr>
          <th class="p-3 text-left">Código</th><th class="p-3 text-left">Razão social</th>
          <th class="p-3 text-left">CNPJ</th><th class="p-3 text-left">Status</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="f in fornecedores" :key="f.id">
            <td class="p-3">{{ f.codigo }}</td><td class="p-3">{{ f.razao_social }}</td>
            <td class="p-3">{{ f.cnpj || "—" }}</td><td class="p-3 capitalize">{{ f.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
