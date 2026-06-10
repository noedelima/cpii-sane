/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cpii: {
          50: "#eff5ff",
          100: "#dbe7fe",
          200: "#bfd4fe",
          300: "#93b7fd",
          400: "#608ffa",
          500: "#3b67f5",
          600: "#1e3a8a", // azul institucional CPII
          700: "#1d3473",
          800: "#1e2e5c",
          900: "#1d2a4b",
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
