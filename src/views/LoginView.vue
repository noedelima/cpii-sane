<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();

const mode = ref<"senha" | "link">("senha");
const email = ref("");
const password = ref("");
const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function submitSenha() {
  error.value = null;
  sending.value = true;
  try {
    await auth.signInWithPassword(email.value, password.value);
    router.push("/dashboard");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no login.";
    error.value = msg.includes("Invalid login credentials")
      ? "E-mail ou senha incorretos."
      : msg;
  } finally {
    sending.value = false;
  }
}

async function submitLink() {
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
      <p class="text-sm text-slate-500 mb-4">
        Use seu e-mail institucional para acessar o sistema.
      </p>

      <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 mb-5 text-sm">
        <button
          type="button"
          class="rounded-md py-1.5 font-medium transition-colors"
          :class="mode === 'senha' ? 'bg-white shadow text-cpii-700' : 'text-slate-600 hover:text-slate-900'"
          @click="mode = 'senha'; error = null"
        >Senha</button>
        <button
          type="button"
          class="rounded-md py-1.5 font-medium transition-colors"
          :class="mode === 'link' ? 'bg-white shadow text-cpii-700' : 'text-slate-600 hover:text-slate-900'"
          @click="mode = 'link'; error = null"
        >Link por e-mail</button>
      </div>

      <form v-if="mode === 'senha'" @submit.prevent="submitSenha" class="space-y-4">
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
        <div>
          <label for="password" class="label">Senha</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="input"
          />
        </div>
        <button type="submit" :disabled="sending || !email || !password" class="btn-primary w-full">
          {{ sending ? "Entrando…" : "Entrar" }}
        </button>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </form>

      <template v-else>
        <form v-if="!sent" @submit.prevent="submitLink" class="space-y-4">
          <div>
            <label for="email-link" class="label">E-mail</label>
            <input
              id="email-link"
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
          <p class="text-xs text-slate-500">
            Obs.: o envio depende do serviço de e-mail configurado; se o link não
            chegar, use o acesso por senha.
          </p>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </form>
        <div v-else class="text-sm text-slate-700">
          Pronto! Verifique sua caixa de e-mail e clique no link recebido para entrar.
        </div>
      </template>
    </div>
  </div>
</template>
