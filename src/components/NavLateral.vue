<script setup lang="ts">
// Barra de navegacao lateral. Serve tanto a coluna fixa do desktop quanto a
// gaveta do celular — a diferenca e so o estado "recolhida", que a gaveta
// nunca usa.
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { navegacaoPara, type Papel } from "@/lib/navegacao";

const props = withDefaults(
  defineProps<{
    /** So icones, sem rotulos (coluna estreita do desktop). */
    recolhida?: boolean;
  }>(),
  { recolhida: false }
);

const emit = defineEmits<{ (e: "navegar"): void }>();

const auth = useAuthStore();
const grupos = computed(() => navegacaoPara(auth.papel as Papel));

const base =
  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium " +
  "text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 " +
  "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";
const ativo = "!bg-cpii-600 !text-white hover:!bg-cpii-700 shadow-sm";
</script>

<template>
  <nav class="flex h-full flex-col gap-0.5 p-2" aria-label="Navegação principal">
    <template v-for="(g, gi) in grupos" :key="gi">
      <div
        v-if="g.rodape"
        class="mt-auto mb-1 border-t border-slate-200 pt-2 dark:border-slate-700"
      ></div>

      <!-- Rotulo do grupo. Recolhida, vira um tracinho: mantem o ritmo visual
           sem texto cortado. -->
      <p
        v-if="g.titulo && !props.recolhida"
        class="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
      >
        {{ g.titulo }}
      </p>
      <div
        v-else-if="g.titulo"
        class="mx-auto my-2 h-px w-5 bg-slate-200 dark:bg-slate-700"
        :title="g.titulo"
      ></div>

      <RouterLink
        v-for="i in g.itens"
        :key="i.to"
        :to="i.to"
        :class="[base, props.recolhida ? 'justify-center px-0' : '']"
        :active-class="ativo"
        :title="props.recolhida ? i.label : undefined"
        @click="emit('navegar')"
      >
        <svg
          class="h-5 w-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" :d="i.d" />
          <path v-if="i.d2" stroke-linecap="round" stroke-linejoin="round" :d="i.d2" />
        </svg>
        <span v-if="!props.recolhida" class="truncate">{{ i.label }}</span>

        <!-- Recolhida, o nome aparece ao passar o mouse: o title nativo demora
             demais para quem esta procurando a tela. -->
        <span
          v-if="props.recolhida"
          class="pointer-events-none absolute left-full z-40 ml-2 hidden whitespace-nowrap rounded-md
                 border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-md
                 group-hover:block dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {{ i.label }}
        </span>
      </RouterLink>
    </template>
  </nav>
</template>
