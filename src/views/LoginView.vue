<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const email = ref("");
const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function submit() {
  error.value = null;
  sending.value = true;
  try {
    await auth.signInWithMagicLink(email.value);
    sent.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao enviar o link.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-12">
    <div class="card p-6">
      <h1 class="text-xl font-semibold mb-1">Entrar</h1>
      <p class="text-sm text-slate-500 mb-5">
        Enviaremos um link de acesso para seu e-mail institucional.
      </p>

      <form v-if="!sent" @submit.prevent="submit" class="space-y-4">
        <div>
          <label for="email" class="label">E-mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="seuemail@cp2.g12.br"
            class="input"
          />
        </div>
        <button type="submit" :disabled="sending || !email" class="btn-primary w-full">
          {{ sending ? "Enviando…" : "Enviar link de acesso" }}
        </button>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </form>

      <div v-else class="text-sm text-slate-700">
        Pronto! Verifique sua caixa de e-mail e clique no link recebido para entrar.
      </div>
    </div>
  </div>
</template>
