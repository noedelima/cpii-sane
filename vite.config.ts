import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// Base do site: GitHub Pages serve em "/<repo>/"; o Azure Static Web Apps serve
// na raiz "/". O workflow define VITE_BASE_PATH conforme o destino (default = Pages).
const BASE = process.env.VITE_BASE_PATH ?? "/cpii-sane/";

export default defineConfig({
  base: BASE,
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
