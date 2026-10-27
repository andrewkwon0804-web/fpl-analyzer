import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Content Security Policy for the built pages. Everything is served from this site: no
// third-party scripts, styles, fonts or requests. Added at build time only, because the dev
// server needs inline scripts for hot reloading.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "worker-src 'self' blob:", "object-src 'none'",
  "base-uri 'self'", "form-action 'none'", "upgrade-insecure-requests",
].join("; ");
const csp = { name: "csp", apply: "build", transformIndexHtml: (html) => html.replace("<head>", `<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`) };

// The site builds into docs/, which GitHub Pages serves. Scripts and styles go in docs/app/;
// docs/data/, the icons and the SEO files there are written by the pipeline and left alone.
// In development the pipeline's docs/ folder is served as public files, so /data/site.json works.
export default defineConfig(({ command }) => ({
  plugins: [react(), csp],
  base: "./",
  publicDir: command === "serve" ? "../docs" : false,
  build: {
    outDir: "../docs", emptyOutDir: false, assetsDir: "app", sourcemap: false,
    rollupOptions: { input: { index: resolve(__dirname, "index.html"), dashboard: resolve(__dirname, "dashboard.html") } },
  },
}));
