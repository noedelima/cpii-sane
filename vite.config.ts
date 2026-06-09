import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// GitHub Pages serve o site em https://<user>.github.io/<repo>/
// Por isso o base precisa bater com o nome do repositório.
const BASE = "/cpii-sane/";

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
