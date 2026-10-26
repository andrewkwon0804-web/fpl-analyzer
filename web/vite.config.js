import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React site builds into docs/v2/ so GitHub Pages serves it next to the current site.
// In development the pipeline's docs/ folder is served as public files, so /data/site.json works.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: "./",
  publicDir: command === "serve" ? "../docs" : false,
  build: { outDir: "../docs/v2", emptyOutDir: true, assetsDir: "assets" },
}));
