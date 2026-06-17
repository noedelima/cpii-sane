<script setup lang="ts">
// "Print didático": moldura tipo janela + reprodução fiel da tela (slot, usando
// os mesmos componentes/cores do sistema) + marcadores numerados sobre os campos.
defineProps<{
  titulo?: string;
  legenda?: string;
  marcadores?: { n: number; top: string; left: string }[];
}>();
</script>

<template>
  <figure class="my-5">
    <div class="relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden shadow-sm bg-slate-50 dark:bg-slate-900">
      <div class="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span class="h-2.5 w-2.5 rounded-full bg-red-400"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-green-400"></span>
        <span v-if="titulo" class="ml-2 text-xs text-slate-500 dark:text-slate-400 truncate">{{ titulo }}</span>
      </div>
      <!-- a reprodução não é interativa -->
      <div class="relative p-4 select-none pointer-events-none">
        <slot />
        <span
          v-for="m in (marcadores ?? [])"
          :key="m.n"
          class="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold ring-2 ring-white dark:ring-slate-900 shadow"
          :style="{ top: m.top, left: m.left }"
        >{{ m.n }}</span>
      </div>
    </div>
    <figcaption v-if="legenda" class="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center italic">
      {{ legenda }}
    </figcaption>
  </figure>
</template>
