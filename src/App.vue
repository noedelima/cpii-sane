<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { isDark, toggleTheme } from "@/lib/theme";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

void auth.ensureInit();

const userMenuOpen = ref(false);
const mobileOpen = ref(false);
const pwdModalOpen = ref(false);
const newPwd = ref("");
const newPwd2 = ref("");
const pwdSaving = ref(false);
const pwdError = ref<string | null>(null);
const pwdOk = ref(false);

// Fecha os menus ao navegar para outra rota
watch(
  () => route.fullPath,
  () => {
    userMenuOpen.value = false;
    mobileOpen.value = false;
  }
);

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
    { to: "/grupos", label: "Grupos" },
  ];
  if (auth.isSane) {
    items.push({ to: "/consumo", label: "Consumo" });
    items.push({ to: "/solicitar-nf", label: "Solicitar NF" });
    items.push({ to: "/ateste", label: "Ateste" });
  }
  items.push({ to: "/ajuda", label: "Ajuda" });
  return items;
});

// Classes compartilhadas dos links de navegação (estado normal + ativo)
const navLink =
  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";
const navLinkActive = "!bg-cpii-600 !text-white hover:!bg-cpii-700 shadow-sm";
const navLinkMobile =
  "block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header
      class="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/85"
    >
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between gap-2">
          <!-- Marca -->
          <RouterLink to="/" class="flex items-center gap-2.5 shrink-0">
            <span
              class="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
            >
              <img :src="logoUrl" alt="Colégio Pedro II" class="h-7 w-7 object-contain" />
            </span>
            <span class="leading-tight">
              <span class="block text-lg font-bold tracking-tight text-cpii-700 dark:text-gold-300">SANE</span>
              <span class="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block xl:hidden">
                Controle de Empenhos e NFs · SANE
              </span>
            </span>
          </RouterLink>

          <!-- Navegação (desktop) -->
          <nav v-if="auth.user" class="hidden items-center gap-0.5 xl:flex">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              :class="navLink"
              :active-class="navLinkActive"
            >{{ item.label }}</RouterLink>
            <RouterLink v-if="auth.isAdmin" to="/admin" :class="navLink" :active-class="navLinkActive">
              Administração
            </RouterLink>
          </nav>

          <!-- Ações (direita) -->
          <div class="relative flex items-center gap-1">
            <button
              class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              :title="isDark ? 'Tema claro' : 'Tema escuro'"
              @click="toggleTheme()"
            >
              <svg v-if="isDark" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </button>

            <template v-if="auth.user">
              <button
                class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                @click.stop="userMenuOpen = !userMenuOpen"
              >
                <span class="hidden max-w-[14rem] truncate text-sm sm:inline">
                  {{ auth.perfil?.nome ?? auth.user.email }}
                </span>
                <span
                  v-if="auth.papel"
                  class="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800 dark:bg-gold-400/15 dark:text-gold-200"
                >{{ auth.papel }}</span>
                <svg class="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                v-if="userMenuOpen"
                class="card absolute right-0 top-full mt-2 w-48 py-1 text-slate-700 dark:text-slate-200 z-20"
              >
                <button
                  class="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700/50"
                  @click="openPwdModal"
                >
                  Trocar senha
                </button>
                <button
                  class="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700/50"
                  @click="sair"
                >
                  Sair
                </button>
              </div>

              <!-- Menu compacto (mobile) -->
              <button
                class="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 xl:hidden"
                :aria-expanded="mobileOpen"
                aria-label="Abrir menu de navegação"
                @click.stop="mobileOpen = !mobileOpen"
              >
                <svg v-if="!mobileOpen" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <svg v-else class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <RouterLink
              v-else-if="route.name !== 'login'"
              to="/login"
              class="text-sm font-medium text-cpii-700 hover:underline dark:text-gold-300"
            >
              Entrar
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Navegação (mobile, expansível) -->
      <nav
        v-if="auth.user && mobileOpen"
        class="space-y-1 border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900 xl:hidden"
      >
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="navLinkMobile"
          active-class="!bg-cpii-600 !text-white"
        >{{ item.label }}</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin" :class="navLinkMobile" active-class="!bg-cpii-600 !text-white">
          Administração
        </RouterLink>
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
