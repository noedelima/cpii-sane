<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
    <div v-if="!auth.user" class="card p-8 text-center">
      <h1 class="text-2xl font-semibold mb-3">Bem-vindo ao Controle de Empenhos da SANE</h1>
      <p class="text-slate-600 mb-6">
        Sistema interno do Colégio Pedro II para registro e acompanhamento de empenhos, notas
        fiscais e recibos de gêneros alimentícios.
      </p>
      <RouterLink to="/login" class="btn-primary">Entrar com e-mail @cp2.g12.br</RouterLink>
    </div>

    <div v-else class="space-y-6">
      <h1 class="text-2xl font-semibold">Painel</h1>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <RouterLink to="/recibos" class="card p-5 hover:border-cpii-500 transition-colors block">
          <div class="text-cpii-600 text-sm font-medium mb-1">Recibos</div>
          <div class="text-lg font-semibold">Cadastrar / Consultar</div>
          <p class="text-sm text-slate-500 mt-1">
            Registro dos recibos de entrega assinados pelos campi.
          </p>
        </RouterLink>
        <div class="card p-5 opacity-50">
          <div class="text-slate-500 text-sm font-medium mb-1">Notas Fiscais</div>
          <div class="text-lg font-semibold">Em breve</div>
        </div>
        <div class="card p-5 opacity-50">
          <div class="text-slate-500 text-sm font-medium mb-1">Empenhos</div>
          <div class="text-lg font-semibold">Em breve</div>
        </div>
      </div>
    </div>
  </div>
</template>
