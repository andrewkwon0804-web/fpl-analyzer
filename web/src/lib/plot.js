// Observable Plot, themed for this site. Every chart on the model report goes through usePlot,
// so fonts, colours, tooltips and resizing are set in one place.
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

export { Plot };

// Series colours, checked with a colour-blindness validator against the dark surface
// (lightness band, chroma, deutan/protan/tritan separation, contrast). Brand mint is too
// light for chart marks on near-black, so charts use a deeper step of the same hue.
export const C = {
  model: "#20AD7D", season: "#5A82FF", form: "#BB8B25",
  ceiling: "rgb(120 125 132)", muted: "rgb(120 125 132)", text: "rgb(168 172 178)", ink: "rgb(240 241 242)",
  bad: "#E0566A",
};
// Five categorical slots for charts built on the fly (the SQL lab), in this fixed order;
// a sixth category and beyond fold into "Other" in grey.
export const CAT = ["#20AD7D", "#5A82FF", "#BB8B25", "#B26BE0", "#E0566A"];
export const METHOD = { Model: C.model, "Season average": C.season, "Form (last 5 GW avg)": C.form, "Perfect hindsight": C.ceiling };
export const SHORT = { Model: "Model", "Season average": "Season avg", "Form (last 5 GW avg)": "Form", "Perfect hindsight": "Hindsight" };

// Renders Plot.plot(build(width)) into a div and redraws when the div changes width.
export function usePlot(build, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w = 0;
    const draw = () => {
      const width = Math.round(el.clientWidth);
      if (!width || width === w) return;
      w = width;
      const spec = build(width);
      const chart = Plot.plot({
        width, marginLeft: 44, marginRight: 16, marginBottom: 34, insetTop: 6,
        style: { background: "transparent", color: C.text, fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: "11px", overflow: "visible" },
        ...spec,
      });
      el.replaceChildren(chart);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export const fmt = (d = 2) => (v) => (v == null || Number.isNaN(v) ? "–" : (+v).toFixed(d));
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

// Rows → CSV text, for every figure's download button.
export function toCsv(columns, rows) {
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c) => q(c.label)).join(","), ...rows.map((r) => columns.map((c) => q(r[c.key])).join(","))].join("\n");
}
export function download(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
