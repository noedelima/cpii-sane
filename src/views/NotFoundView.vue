<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-20 text-center">
    <p class="text-cpii-600 font-medium">404</p>
    <h1 class="text-3xl font-semibold mt-2">Página não encontrada</h1>
    <p class="text-slate-500 mt-2">O endereço solicitado não existe.</p>
    <RouterLink to="/" class="btn-primary mt-6">Voltar ao início</RouterLink>
  </div>
</template>
