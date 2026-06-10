<script setup lang="ts">
import { ref, watch } from "vue";
import { supabase } from "@/lib/supabase";

const props = defineProps<{
  /** Bucket do Storage (pdfs-empenhos | pdfs-nfs | pdfs-recibos). */
  bucket: string;
  /** Caminho no bucket (ou URL http legada). */
  modelValue: string | null;
  label?: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string | null): void }>();

const uploading = ref(false);
const error = ref<string | null>(null);
const signedUrl = ref<string | null>(null);

const isLegacyUrl = (v: string | null) => !!v && /^https?:\/\//i.test(v);

async function refreshSignedUrl() {
  signedUrl.value = null;
  const v = props.modelValue;
  if (!v) return;
  if (isLegacyUrl(v)) {
    signedUrl.value = v;
    return;
  }
  const { data, error: err } = await supabase.storage
    .from(props.bucket)
    .createSignedUrl(v, 60 * 60);
  if (!err) signedUrl.value = data?.signedUrl ?? null;
}

watch(() => props.modelValue, refreshSignedUrl, { immediate: true });

async function onFile(ev: Event) {
  error.value = null;
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.type !== "application/pdf") {
    error.value = "Envie um arquivo PDF.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    error.value = "Arquivo acima de 10 MB.";
    return;
  }
  uploading.value = true;
  try {
    const safe = file.name
      .normalize("NFD")
      // remove diacríticos combinantes (acentos) antes de sanitizar
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(-80);
    const path = `${Date.now()}-${safe}`;
    const { error: err } = await supabase.storage
      .from(props.bucket)
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (err) throw err;
    emit("update:modelValue", path);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha no upload.";
  } finally {
    uploading.value = false;
  }
}

function remover() {
  // Apenas desvincula do registro; a limpeza física do bucket é tarefa da SANE/admin.
  emit("update:modelValue", null);
}
</script>

<template>
  <div>
    <label class="label">{{ label ?? "PDF" }}</label>

    <div v-if="modelValue" class="flex items-center gap-3 text-sm">
      <a
        v-if="signedUrl"
        :href="signedUrl"
        target="_blank"
        rel="noopener"
        class="text-cpii-600 dark:text-cpii-300 hover:underline inline-flex items-center gap-1"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 10v6m0 0l-2-2m2 2l2-2M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h6l2 2h6a2 2 0 012 2v1a2 2 0 01-2 2" />
        </svg>
        Ver PDF
      </a>
      <span v-else class="text-slate-500 dark:text-slate-400">PDF anexado</span>
      <button type="button" class="text-red-600 dark:text-red-400 text-xs hover:underline" @click="remover">
        remover
      </button>
    </div>

    <label v-else class="btn-secondary cursor-pointer inline-flex">
      {{ uploading ? "Enviando…" : "Anexar PDF" }}
      <input type="file" accept="application/pdf" class="hidden" :disabled="uploading" @change="onFile" />
    </label>

    <p v-if="error" class="text-xs text-red-600 dark:text-red-400 mt-1">{{ error }}</p>
  </div>
</template>
