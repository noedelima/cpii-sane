<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();

onMounted(async () => {
  await auth.init();
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-cpii-600 text-white shadow">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <RouterLink to="/" class="font-semibold text-lg tracking-tight">
          SANE — Controle de Empenhos
        </RouterLink>
        <nav class="hidden sm:flex items-center gap-1">
          <RouterLink
            to="/recibos"
            class="px-3 py-1.5 rounded-md text-sm hover:bg-cpii-700 transition-colors"
            active-class="bg-cpii-700"
          >Recibos</RouterLink>
        </nav>
        <div class="text-sm">
          <template v-if="auth.user">
            <span class="hidden sm:inline mr-3 opacity-90">{{ auth.user.email }}</span>
            <button class="opacity-90 hover:opacity-100" @click="auth.signOut()">Sair</button>
          </template>
          <RouterLink v-else-if="route.name !== 'login'" to="/login" class="hover:underline">Entrar</RouterLink>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <div v-if="auth.loading" class="flex items-center justify-center py-20 text-slate-500">
        Carregando…
      </div>
      <RouterView v-else />
    </main>
    <footer class="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
      SANE — Colégio Pedro II · v0.1.0
    </footer>
  </div>
</template>
