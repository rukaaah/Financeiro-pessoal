import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// O service worker (src/sw.ts) sai como /sw.js na raiz, sem hash: o navegador
// precisa do mesmo endereço para atualizá-lo.
export default defineConfig({
  plugins: [preact()],
  build: {
    target: "es2022",
    rollupOptions: {
      input: { index: "index.html", sw: "src/sw.ts" },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js") },
    },
  },
});
