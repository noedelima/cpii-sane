<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { isDark, toggleTheme } from "@/lib/theme";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

void auth.ensureInit();

const userMenuOpen = ref(false);
const pwdModalOpen = ref(false);
const newPwd = ref("");
const newPwd2 = ref("");
const pwdSaving = ref(false);
const pwdError = ref<string | null>(null);
const pwdOk = ref(false);

function openPwdModal() {
  userMenuOpen.value = false;
  pwdModalOpen.value = true;
  newPwd.value = "";
  newPwd2.value = "";
  pwdError.value = null;
  pwdOk.value = false;
}

async function savePwd() {
  pwdError.value = null;
  if (newPwd.value.length < 10) {
    pwdError.value = "Use ao menos 10 caracteres.";
    return;
  }
  if (newPwd.value !== newPwd2.value) {
    pwdError.value = "As senhas não conferem.";
    return;
  }
  pwdSaving.value = true;
  try {
    await auth.updatePassword(newPwd.value);
    pwdOk.value = true;
    setTimeout(() => (pwdModalOpen.value = false), 1200);
  } catch (e) {
    pwdError.value = e instanceof Error ? e.message : "Falha ao trocar a senha.";
  } finally {
    pwdSaving.value = false;
  }
}

async function sair() {
  userMenuOpen.value = false;
  await auth.signOut();
  router.push("/login");
}

const logoUrl = import.meta.env.BASE_URL + "cpii-logo.png";

const navItems = computed(() => {
  const items = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/recibos", label: "Recibos" },
    { to: "/nfs", label: "Notas Fiscais" },
    { to: "/empenhos", label: "Empenhos" },
  ];
  if (auth.isSane) items.push({ to: "/ateste", label: "Ateste" });
  return items;
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-cpii-600 dark:bg-cpii-900 text-white shadow">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <RouterLink to="/" class="flex items-center gap-2.5 font-semibold text-lg tracking-tight shrink-0">
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm">
            <img :src="logoUrl" alt="Colégio Pedro II" class="h-7 w-7 object-contain" />
          </span>
          <span>SANE — Controle de Empenhos</span>
        </RouterLink>

        <nav v-if="auth.user" class="hidden md:flex items-center gap-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="px-3 py-1.5 rounded-md text-sm hover:bg-cpii-700 transition-colors"
            active-class="bg-cpii-700"
          >{{ item.label }}</RouterLink>
          <RouterLink
            v-if="auth.isAdmin"
            to="/admin/usuarios"
            class="px-3 py-1.5 rounded-md text-sm hover:bg-cpii-700 transition-colors"
            active-class="bg-cpii-700"
          >Usuários</RouterLink>
        </nav>

        <div class="text-sm relative flex items-center gap-1">
          <button
            class="rounded-md p-1.5 hover:bg-cpii-700 transition-colors"
            :title="isDark ? 'Tema claro' : 'Tema escuro'"
            @click="toggleTheme()"
          >
            <svg v-if="isDark" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>
          <template v-if="auth.user">
            <button
              class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-cpii-700 transition-colors"
              @click="userMenuOpen = !userMenuOpen"
            >
              <span class="hidden sm:inline opacity-90 max-w-[16rem] truncate">
                {{ auth.perfil?.nome ?? auth.user.email }}
              </span>
              <span
                v-if="auth.papel"
                class="text-[10px] uppercase tracking-wide bg-cpii-700/80 rounded px-1.5 py-0.5"
              >{{ auth.papel }}</span>
              <svg class="w-4 h-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              v-if="userMenuOpen"
              class="absolute right-0 mt-2 w-48 card py-1 text-slate-700 dark:text-slate-200 z-20"
            >
              <button class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40" @click="openPwdModal">
                Trocar senha
              </button>
              <button class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40" @click="sair">
                Sair
              </button>
            </div>
          </template>
          <RouterLink v-else-if="route.name !== 'login'" to="/login" class="hover:underline">
            Entrar
          </RouterLink>
        </div>
      </div>

      <nav v-if="auth.user" class="md:hidden border-t border-cpii-700 px-2 py-1.5 flex gap-1 overflow-x-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="px-3 py-1 rounded-md text-xs whitespace-nowrap hover:bg-cpii-700"
          active-class="bg-cpii-700"
        >{{ item.label }}</RouterLink>
        <RouterLink
          v-if="auth.isAdmin"
          to="/admin/usuarios"
          class="px-3 py-1 rounded-md text-xs whitespace-nowrap hover:bg-cpii-700"
          active-class="bg-cpii-700"
        >Usuários</RouterLink>
      </nav>
    </header>

    <main class="flex-1" @click="userMenuOpen = false">
      <div v-if="auth.loading" class="flex items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
      <RouterView v-else />
    </main>

    <footer class="border-t border-slate-200 dark:border-slate-700 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
      SANE — Colégio Pedro II · v0.2.0
    </footer>

    <!-- Modal: trocar senha -->
    <div
      v-if="pwdModalOpen"
      class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 px-4"
      @click.self="pwdModalOpen = false"
    >
      <div class="card w-full max-w-sm p-5 space-y-4">
        <h2 class="font-semibold text-slate-800 dark:text-slate-100">Trocar senha</h2>
        <div>
          <label class="label">Nova senha</label>
          <input v-model="newPwd" type="password" class="input" autocomplete="new-password" />
        </div>
        <div>
          <label class="label">Repetir nova senha</label>
          <input v-model="newPwd2" type="password" class="input" autocomplete="new-password" />
        </div>
        <p v-if="pwdError" class="text-sm text-red-600 dark:text-red-400">{{ pwdError }}</p>
        <p v-if="pwdOk" class="text-sm text-green-700 dark:text-green-300">Senha alterada com sucesso.</p>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="pwdModalOpen = false">Cancelar</button>
          <button class="btn-primary" :disabled="pwdSaving" @click="savePwd">
            {{ pwdSaving ? "Salvando…" : "Salvar" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
