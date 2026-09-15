<script setup lang="ts">
import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { msgErro } from "@/lib/erro";
import { useAuthStore } from "@/stores/auth";
import type { Fornecedor } from "@/types/database";

const emit = defineEmits<{ saved: [fornecedor: Fornecedor]; cancel: [] }>();
const auth = useAuthStore();
const codigo = ref("");
const razaoSocial = ref("");
const cnpj = ref("");
const telefone = ref("");
const email = ref("");
const saving = ref(false);
const error = ref("");

async function salvar() {
  if (saving.value) return;
  error.value = "";
  if (!auth.isSane) {
    error.value = "Seu perfil não permite cadastrar fornecedores.";
    return;
  }
  if (!codigo.value.trim() || !razaoSocial.value.trim()) {
    error.value = "Informe o código e a razão social.";
    return;
  }
  saving.value = true;
  try {
    const { data, error: err } = await supabase.from("fornecedores").insert({
      codigo: codigo.value.trim(),
      razao_social: razaoSocial.value.trim(),
      cnpj: cnpj.value.trim() || null,
      telefone: telefone.value.trim() || null,
      email: email.value.trim() || null,
      status: "ativo",
    }).select("*").single();
    if (err) {
      if (err.code === "23505") throw new Error("Já existe um fornecedor com esse código. Use outro código ou selecione o fornecedor existente.");
      throw err;
    }
    emit("saved", data as Fornecedor);
  } catch (err) {
    error.value = msgErro(err, "Não foi possível cadastrar o fornecedor.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="card p-4 space-y-4" @submit.prevent="salvar">
    <h2 class="text-lg font-semibold">Novo fornecedor</h2>
    <p class="text-sm text-slate-500 dark:text-slate-400">O fornecedor será cadastrado como ativo e ficará disponível para os grupos.</p>
    <p v-if="error" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ error }}</p>
    <fieldset :disabled="saving" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="label">Código / nome curto *<input v-model="codigo" required class="input mt-1" placeholder="Nome usado nas listas" /></label>
        <label class="label">Razão social *<input v-model="razaoSocial" required class="input mt-1" /></label>
        <label class="label">CNPJ<input v-model="cnpj" class="input mt-1" /></label>
        <label class="label">Telefone<input v-model="telefone" type="tel" class="input mt-1" /></label>
        <label class="label">E-mail<input v-model="email" type="email" class="input mt-1" /></label>
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn-primary">{{ saving ? "Salvando…" : "Cadastrar fornecedor" }}</button>
        <button type="button" class="btn-ghost" @click="emit('cancel')">Cancelar</button>
      </div>
    </fieldset>
  </form>
</template>
