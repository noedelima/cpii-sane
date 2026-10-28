<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { getLimiteUploadMb } from "@/lib/config";
import {
  accept,
  contentTypeDe,
  ehImagem,
  formatoDoCaminho,
  LIMITE_PADRAO_MB,
  sanitizarNome,
  validarArquivo,
} from "@/lib/arquivos";

const props = defineProps<{
  /** Bucket do Storage (pdfs-empenhos | pdfs-nfs | pdfs-recibos | pdfs-cobranca). */
  bucket: string;
  /** Caminho no bucket (ou URL http legada). */
  modelValue: string | null;
  label?: string;
  /** Somente leitura: mostra o link, sem anexar/remover. */
  disabled?: boolean;
  /**
   * Aceitar imagens (JPG/PNG) alem de PDF. Usado nos recibos, onde os campi
   * registram fotos das impropriedades. Documentos oficiais (NE, NF,
   * instrumento de cobranca) seguem so em PDF.
   */
  imagens?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string | null): void }>();

const uploading = ref(false);
const error = ref<string | null>(null);
const signedUrl = ref<string | null>(null);
/** Limite global definido pelo admin; o cache do config evita ida ao banco. */
const limiteMb = ref(LIMITE_PADRAO_MB);

onMounted(async () => {
  limiteMb.value = await getLimiteUploadMb();
});

const isLegacyUrl = (v: string | null) => !!v && /^https?:\/\//i.test(v);

/** Palpite pela extensao: decide so a aparencia (miniatura e rotulo). */
const pareceImagem = computed(() => ehImagem(formatoDoCaminho(props.modelValue)));
const substantivo = computed(() => (props.imagens ? "arquivo" : "PDF"));

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
  const invalido = validarArquivo(file, !!props.imagens, limiteMb.value);
  if (invalido) {
    error.value = invalido;
    return;
  }
  uploading.value = true;
  try {
    const path = `${Date.now()}-${sanitizarNome(file.name)}`;
    const { error: err } = await supabase.storage
      .from(props.bucket)
      .upload(path, file, { contentType: contentTypeDe(file), upsert: false });
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
    <label class="label">{{ label ?? (imagens ? "Arquivo" : "PDF") }}</label>

    <div v-if="modelValue" class="flex items-center gap-3 text-sm">
      <a
        v-if="signedUrl && pareceImagem"
        :href="signedUrl"
        target="_blank"
        rel="noopener"
        class="shrink-0"
      >
        <img
          :src="signedUrl"
          alt=""
          class="h-12 w-12 rounded border border-slate-200 dark:border-slate-700 object-cover"
        />
      </a>
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
        {{ pareceImagem ? "Ver imagem" : `Ver ${substantivo}` }}
      </a>
      <span v-else class="text-slate-500 dark:text-slate-400">
        {{ pareceImagem ? "Imagem anexada" : "PDF anexado" }}
      </span>
      <button
        v-if="!disabled"
        type="button"
        class="text-red-600 dark:text-red-400 text-xs hover:underline"
        @click="remover"
      >
        remover
      </button>
    </div>

    <p v-else-if="disabled" class="text-sm text-slate-500 dark:text-slate-400">
      Nenhum {{ substantivo }} anexado.
    </p>

    <label v-else class="btn-secondary cursor-pointer inline-flex">
      {{ uploading ? "Enviando…" : `Anexar ${substantivo}` }}
      <input
        type="file"
        :accept="accept(!!imagens)"
        class="hidden"
        :disabled="uploading"
        @change="onFile"
      />
    </label>
    <p v-if="!modelValue && !disabled && imagens" class="text-xs text-slate-500 dark:text-slate-400 mt-1">
      PDF, JPG ou PNG (até {{ limiteMb }} MB).
    </p>

    <p v-if="error" class="text-xs text-red-600 dark:text-red-400 mt-1">{{ error }}</p>
  </div>
</template>
