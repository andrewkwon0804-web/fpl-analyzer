import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The site builds into docs/, which GitHub Pages serves. Scripts and styles go in docs/app/;
// docs/data/, the icons and the SEO files there are written by the pipeline and left alone.
// In development the pipeline's docs/ folder is served as public files, so /data/site.json works.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: "./",
  publicDir: command === "serve" ? "../docs" : false,
  build: {
    outDir: "../docs", emptyOutDir: false, assetsDir: "app", sourcemap: false,
    rollupOptions: { input: { index: resolve(__dirname, "index.html"), dashboard: resolve(__dirname, "dashboard.html") } },
  },
}));
