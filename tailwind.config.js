/** @type {import('tailwindcss').Config} */
// Paleta institucional CPII — dourado (ouro) + verde-oliva do brasão.
// Espelha o tema do cpii-seng (https://noedelima.github.io/cpii-seng):
//   cpii  = verde-oliva (ação primária)   600 = #4A5834 / hover 700 = #3E4A2E
//   gold  = dourado do brasão (acento)     600 = #A6925A / claro 400 = #C9B98C
//   slate = neutros quentes (pedra-oliva)  50 = #F5F4EE … 900 = #15170F
// Trocar a escala aqui re-tematiza todo o app, que usa apenas estes tokens.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Verde-oliva institucional (ação primária)
        cpii: {
          50: "#f3f6ee",
          100: "#e3ead4",
          200: "#c9d6ad",
          300: "#a8bd7e",
          400: "#88a257",
          500: "#6c8540",
          600: "#4a5834", // --primario (oliva)
          700: "#3e4a2e", // --primario-hover (oliva-escuro)
          800: "#333c27",
          900: "#2a3120",
          950: "#171c11",
        },
        // Dourado do brasão (acento de marca)
        gold: {
          50: "#faf6ec",
          100: "#f2ecd8",
          200: "#e7dcbe",
          300: "#dbcba0",
          400: "#c9b98c", // --ouro-claro
          500: "#b7a572",
          600: "#a6925a", // --ouro
          700: "#8a7747",
          800: "#6d5e39",
          900: "#594d2f",
        },
        // Neutros quentes (pedra-oliva) — substituem o cinza-frio padrão
        slate: {
          50: "#f5f4ee",  // --fundo
          100: "#eceae0", // --fundo-2
          200: "#dedbcc", // --borda
          300: "#c8c4b0", // --borda-forte
          400: "#a4a78f", // --texto-2 (escuro)
          500: "#6b6f5e", // --texto-2 (claro)
          600: "#545746",
          700: "#383d2b", // --borda (escuro)
          800: "#21251a", // --card (escuro)
          900: "#15170f", // --fundo (escuro)
          950: "#0d0e08",
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', "system-ui", "-apple-system", "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
