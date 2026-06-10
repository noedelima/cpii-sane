import { ref, watchEffect } from "vue";

// Tema claro/escuro: preferência salva em localStorage; default segue o sistema.
const stored = localStorage.getItem("sane-theme");
export const isDark = ref(
  stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches
);

export function toggleTheme() {
  isDark.value = !isDark.value;
}

watchEffect(() => {
  document.documentElement.classList.toggle("dark", isDark.value);
  localStorage.setItem("sane-theme", isDark.value ? "dark" : "light");
});
