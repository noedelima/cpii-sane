<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import ManualCampus from "@/views/ajuda/ManualCampus.vue";
import ManualSane from "@/views/ajuda/ManualSane.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const abas = [
  { id: "campus", label: "Manual do Campus" },
  { id: "sane", label: "Manual da SANE" },
] as const;
type AbaId = (typeof abas)[number]["id"];

const aba = computed<AbaId>(() => {
  const q = route.query.aba;
  return (abas.some((a) => a.id === q) ? q : padrao()) as AbaId;
});

function padrao(): AbaId {
  // sane/admin começam no manual da SANE; campus e demais, no do Campus
  return auth.papel === "sane" || auth.papel === "admin" ? "sane" : "campus";
}
function irPara(id: AbaId) {
  router.replace({ query: { ...route.query, aba: id } });
}

onMounted(() => {
  // fixa a aba padrão no endereço (deep-link estável)
  if (!route.query.aba) router.replace({ query: { ...route.query, aba: padrao() } });
});
</script>

<template>
  <div>
    <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-8">
      <h1 class="text-2xl font-semibold">Ajuda</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Manuais de uso do sistema, passo a passo, por perfil. Cada seção é autocontida e
        pode ser lida de forma independente — pensada para que um novo servidor aprenda a
        usar o sistema sozinho.
      </p>
      <div class="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        <button
          v-for="a in abas"
          :key="a.id"
          type="button"
          class="px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
          :class="aba === a.id
            ? 'border-cpii-600 text-cpii-700 dark:text-cpii-300'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
          @click="irPara(a.id)"
        >{{ a.label }}</button>
      </div>
    </div>

    <ManualCampus v-if="aba === 'campus'" />
    <ManualSane v-else />
  </div>
</template>
