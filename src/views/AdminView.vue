<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminUsuariosView from "@/views/AdminUsuariosView.vue";
import AdminLogView from "@/views/AdminLogView.vue";
import AdminConfigView from "@/views/AdminConfigView.vue";

const route = useRoute();
const router = useRouter();

const abas = [
  { id: "usuarios", label: "Usuários" },
  { id: "log", label: "Log de auditoria" },
  { id: "config", label: "Configurações" },
] as const;
type AbaId = (typeof abas)[number]["id"];

const aba = computed<AbaId>(() => {
  const q = route.query.aba;
  return (abas.some((a) => a.id === q) ? q : "usuarios") as AbaId;
});

function irPara(id: AbaId) {
  router.replace({ query: { ...route.query, aba: id } });
}
</script>

<template>
  <div>
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8">
      <h1 class="text-2xl font-semibold mb-4">Administração</h1>
      <div class="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
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

    <AdminUsuariosView v-if="aba === 'usuarios'" />
    <AdminLogView v-else-if="aba === 'log'" />
    <AdminConfigView v-else />
  </div>
</template>
