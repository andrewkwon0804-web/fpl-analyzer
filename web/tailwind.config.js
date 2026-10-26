// Colours come from CSS variables in src/styles.css, so a theme is one block of tokens.
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"), surface: c("surface"), raised: c("raised"), line: c("line"), line2: c("line2"),
        text: c("text"), text2: c("text2"), text3: c("text3"),
        mint: c("mint"), sky: c("sky"), amber: c("amber"), rose: c("rose"),
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Helvetica Neue", "Arial", "sans-serif"],
        body: ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: { page: "1560px" },
    },
  },
  plugins: [],
};
