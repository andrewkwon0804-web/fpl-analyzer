// SQL lab: the project's SQLite database, trimmed, running in the browser. Pick one of the
// project's analysis queries or write your own, then see the result as a table or a chart.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { Compartment, Prec } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { useInView } from "../../lib/motion.js";
import { C, CAT, Plot, download, usePlot } from "../../lib/plot.js";
import { DataTable, Seg } from "./kit.jsx";

const DB_URL = "./data/fpl-lite.db.gz";
const NAMES = {
  "01_value_by_price_band.sql": "Value by price band", "02_top_differentials.sql": "Low-owned hauls",
  "03_does_form_persist.sql": "Does form last?", "04_home_away_and_difficulty.sql": "Home, away and FDR",
  "05_xg_over_under_performers.sql": "Beating xG", "06_defcon_rule_change.sql": "Defcon rule change",
};
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

const theme = EditorView.theme({
  "&": { color: "rgb(var(--text))", backgroundColor: "transparent", fontSize: "12.5px", height: "100%" },
  ".cm-scroller": { fontFamily: '"Geist Mono", ui-monospace, monospace', lineHeight: "1.65" },
  ".cm-content": { caretColor: "rgb(var(--mint))", padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "transparent", color: "rgb(var(--text3) / .6)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgb(var(--raised) / .45)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgb(var(--sky) / .28) !important" },
  ".cm-cursor": { borderLeftColor: "rgb(var(--mint))" },
  ".cm-tooltip": { backgroundColor: "rgb(var(--surface))", border: "1px solid rgb(var(--line2))", borderRadius: "4px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "rgb(var(--raised))", color: "rgb(var(--text))" },
  ".cm-matchingBracket": { backgroundColor: "rgb(var(--mint) / .18)", outline: "none" },
  ".cm-placeholder": { color: "rgb(var(--text3))" },
}, { dark: true });
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "#38E1A8" },
  { tag: [t.string, t.special(t.string)], color: "#F5C451" },
  { tag: [t.number, t.bool, t.null], color: "#8EA9FF" },
  { tag: t.comment, color: "rgb(120 125 132)", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation], color: "rgb(168 172 178)" },
  { tag: [t.typeName, t.standard(t.name)], color: "#C99BF0" },
]);

// The worker, its pending requests, and a way to kill it if a query never ends.
function useDb() {
  const worker = useRef(null), pending = useRef(new Map()), seq = useRef(0);
  const [state, setState] = useState({ status: "idle", got: 0, total: 0 });
  const start = useCallback(() => {
    const w = new Worker(new URL("../../lib/sqlWorker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "progress") { setState((s) => ({ ...s, got: d.got, total: d.total })); return; }
      const p = pending.current.get(d.id);
      if (p) { pending.current.delete(d.id); p(d); }
    };
    worker.current = w;
    return w;
  }, []);
  const call = useCallback((msg) => new Promise((resolve) => {
    const id = ++seq.current;
    pending.current.set(id, resolve);
    worker.current.postMessage({ id, ...msg });
  }), []);
  const open = useCallback(async () => {
    setState({ status: "loading", got: 0, total: 0 });
    start();
    const t0 = performance.now();
    const r = await call({ type: "open", wasm: new URL(wasmUrl, location.href).href, url: new URL(DB_URL, location.href).href });
    if (!r.ok) { setState({ status: "error", error: r.error }); return; }
    setState({ status: "ready", schema: r.schema, size: r.size, download: r.download, ms: performance.now() - t0 });
  }, [start, call]);
  const stop = useCallback(() => {
    worker.current?.terminate();
    pending.current.forEach((p) => p({ ok: false, error: "Stopped. The database was reloaded." }));
    pending.current.clear();
    open();
  }, [open]);
  useEffect(() => () => worker.current?.terminate(), []);
  return { state, open, call, stop };
}

function Editor({ value, onChange, onRun, schema }) {
  const host = useRef(null), view = useRef(null), lang = useRef(new Compartment());
  const runRef = useRef(onRun); runRef.current = onRun;
  const changeRef = useRef(onChange); changeRef.current = onChange;
  useEffect(() => {
    view.current = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        basicSetup, theme, syntaxHighlighting(highlight), placeholder("SELECT ..."), EditorView.lineWrapping,
        lang.current.of(sql({ dialect: SQLite, upperCaseKeywords: true })),
        Prec.highest(keymap.of([{ key: "Mod-Enter", run: (v) => { runRef.current(v.state.doc.toString()); return true; } }])),
        EditorView.updateListener.of((u) => { if (u.docChanged) changeRef.current(u.state.doc.toString()); }),
      ],
    });
    return () => view.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // a preset swapped in from outside
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  // table and column names for autocomplete once the database is open
  useEffect(() => {
    if (!schema || !view.current) return;
    const s = Object.fromEntries(schema.map((tb) => [tb.name, tb.cols.map((c) => c.name)]));
    view.current.dispatch({ effects: lang.current.reconfigure(sql({ dialect: SQLite, upperCaseKeywords: true, schema: s })) });
  }, [schema]);
  return <div ref={host} className="h-full min-h-[260px] overflow-hidden" data-lenis-prevent />;
}

// Picks sensible axes from a result: a text column for categories, the last numeric column for values.
function guess(columns, rows) {
  const isNum = columns.map((_, i) => rows.length > 0 && rows.slice(0, 50).every((r) => r[i] === null || typeof r[i] === "number"));
  const nums = columns.filter((_, i) => isNum[i]), cats = columns.filter((_, i) => !isNum[i]);
  return { isNum: Object.fromEntries(columns.map((c, i) => [c, isNum[i]])), x: cats[0] ?? nums[0], y: nums.at(-1) ?? null, color: cats.length > 1 ? cats[1] : "" };
}

function ResultChart({ result, axes, setAxes }) {
  const rows = useMemo(() => result.rows.slice(0, 400).map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]]))), [result]);
  const { x, y, color } = axes;
  const numX = axes.isNum[x];
  const cats = useMemo(() => {
    if (!color) return [];
    const seen = [...new Set(rows.map((r) => String(r[color])))];
    return seen.length > CAT.length ? [...seen.slice(0, CAT.length - 1), "Other"] : seen;
  }, [rows, color]);
  const colorOf = (r) => { const v = String(r[color]); return cats.includes(v) ? v : "Other"; };
  const ref = usePlot((w) => {
    if (!y) return { height: 60, marks: [Plot.text(["No numeric column to plot"], { frameAnchor: "middle", fill: C.muted })] };
    const colorScale = color ? { domain: cats, range: cats.map((c, i) => (c === "Other" ? C.muted : CAT[i])), legend: true, style: { color: C.text } } : undefined;
    const fill = color ? colorOf : C.model;
    if (numX) {
      return {
        height: Math.min(420, Math.max(260, w * 0.55)), x: { label: x, grid: true }, y: { label: y, grid: true }, color: colorScale,
        marks: [Plot.dot(rows, { x, y, fill, r: 4, fillOpacity: 0.85 }), Plot.tip(rows, Plot.pointer({ x, y, title: (d) => result.columns.map((c) => `${c}: ${d[c]}`).join("\n") }))],
      };
    }
    const labels = rows.map((r) => (color ? `${r[x]}` : String(r[x])));
    const uniq = [...new Set(labels)];
    return {
      height: Math.min(900, 50 + uniq.length * (color ? 24 : 22)), marginLeft: Math.min(200, 12 + Math.max(...uniq.map((u) => u.length)) * 6.6),
      x: { label: y, grid: true }, y: { label: null, domain: uniq }, color: colorScale,
      marks: color
        ? [Plot.ruleY(uniq, { stroke: C.muted, strokeOpacity: 0.15 }), Plot.dot(rows, { y: (d) => String(d[x]), x: y, fill, r: 5, stroke: "rgb(3 4 5)", strokeWidth: 1.5 }),
           Plot.tip(rows, Plot.pointer({ y: (d) => String(d[x]), x: y, title: (d) => result.columns.map((c) => `${c}: ${d[c]}`).join("\n") }))]
        : [Plot.barX(rows, { y: (d) => String(d[x]), x: y, fill, rx: 2, insetTop: 3, insetBottom: 3 }), Plot.ruleX([0], { stroke: C.ink, strokeOpacity: 0.4 }),
           Plot.tip(rows, Plot.pointerY({ y: (d) => String(d[x]), x: y, title: (d) => result.columns.map((c) => `${c}: ${d[c]}`).join("\n") }))],
    };
  }, [rows, x, y, color, cats]);
  const sel = (key, opts, allowNone) => (
    <label className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-text3">
      {key}
      <select value={axes[key] || ""} onChange={(e) => setAxes({ ...axes, [key]: e.target.value })}
        className="h-7 max-w-[160px] rounded-[3px] border border-line bg-bg px-1.5 font-mono text-[11px] normal-case tracking-normal text-text2">
        {allowNone && <option value="">none</option>}
        {opts.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
  const numeric = result.columns.filter((c) => axes.isNum[c]), text = result.columns.filter((c) => !axes.isNum[c]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">{sel("x", result.columns)}{sel("y", numeric)}{sel("color", text, true)}</div>
      {result.rows.length > 400 && <p className="mb-2 text-[12px] text-text3">Charting the first 400 of {result.total.toLocaleString()} rows.</p>}
      <div ref={ref} />
    </div>
  );
}

export default function SqlLab({ queries }) {
  const { state, open, call, stop } = useDb();
  const [ref, near] = useInView(1.6);
  const [preset, setPreset] = useState(0);
  const [text, setText] = useState(queries[0]?.sql || "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState("table");
  const [axes, setAxes] = useState(null);
  const [openTable, setOpenTable] = useState(null);
  const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData;

  useEffect(() => { if (near && state.status === "idle" && !saveData) open(); }, [near, state.status, open, saveData]);

  const run = useCallback(async (q) => {
    if (state.status !== "ready" || running) return;
    setRunning(true); setError(null);
    const r = await call({ type: "exec", sql: q });
    setRunning(false);
    if (!r.ok) { setError(r.error); return; }
    setResult(r);
    setAxes(guess(r.columns, r.rows));
  }, [state.status, running, call]);

  // run the first preset as soon as the database is ready
  const first = useRef(true);
  useEffect(() => { if (state.status === "ready" && first.current) { first.current = false; run(text); } }, [state.status, run, text]);

  const pick = (i) => { setPreset(i); setText(queries[i].sql); if (state.status === "ready") run(queries[i].sql); };
  const tableRows = useMemo(() => result && result.rows.map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]]))), [result]);
  const tableCols = useMemo(() => result && result.columns.map((c, i) => ({ key: c, label: c, num: result.rows.slice(0, 50).every((r) => r[i] === null || typeof r[i] === "number") })), [result]);
  const csv = () => download("query-result.csv", [result.columns.join(","), ...result.rows.map((r) => r.map((v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(","))].join("\n"));
  const isPreset = text === queries[preset]?.sql;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div ref={ref} className="corners overflow-hidden">
      {/* status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2.5 font-mono text-[11px] text-text3">
          <i className={`h-1.5 w-1.5 rounded-full ${state.status === "ready" ? "bg-mint" : state.status === "error" ? "bg-rose" : "animate-pulse bg-amber"}`} />
          <span className="text-text2">fpl-lite.db</span>
          {state.status === "ready" && <span>SQLite · {state.schema.length} tables · {mb(state.size)} · opened in {(state.ms / 1000).toFixed(1)}s</span>}
          {state.status === "loading" && <span>Downloading {state.got ? mb(state.got) : ""}{state.total ? ` of ${mb(state.total)}` : ""}…</span>}
          {state.status === "idle" && <span>Not loaded</span>}
          {state.status === "error" && <span className="text-rose">{state.error}</span>}
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text3">Runs in your browser · nothing is sent anywhere</span>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr]">
        {/* schema */}
        <aside className="hidden border-r border-line lg:block">
          <div className="mono-label px-4 pb-2 pt-4 text-[10px] text-text3">Tables</div>
          <div className="max-h-[560px] overflow-auto pb-3" data-lenis-prevent>
            {(state.schema || []).map((tb) => (
              <div key={tb.name}>
                <button onClick={() => setOpenTable(openTable === tb.name ? null : tb.name)}
                  className="flex w-full items-center justify-between px-4 py-1.5 text-left font-mono text-[12px] text-text2 hover:bg-raised/50 hover:text-text">
                  <span>{openTable === tb.name ? "▾" : "▸"} {tb.name}</span><span className="text-[10.5px] text-text3">{tb.rows.toLocaleString()}</span>
                </button>
                {openTable === tb.name && (
                  <div className="pb-2">
                    {tb.cols.map((c) => <div key={c.name} className="flex justify-between py-0.5 pl-8 pr-4 font-mono text-[11px] text-text3"><span className="text-text2">{c.name}</span><span>{c.type.toLowerCase()}</span></div>)}
                    <button onClick={() => { const q = `SELECT *\nFROM ${tb.name}\nLIMIT 100;`; setText(q); run(q); }} className="ml-8 mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-mint hover:underline">Preview rows</button>
                  </div>
                )}
              </div>
            ))}
            {!state.schema && <div className="space-y-2 px-4">{[...Array(6)].map((_, i) => <div key={i} className="skel h-4 rounded-[3px]" />)}</div>}
          </div>
        </aside>

        <div className="min-w-0">
          {/* presets */}
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
            {queries.map((q, i) => (
              <button key={q.file} onClick={() => pick(i)}
                className={`h-8 shrink-0 rounded-[4px] px-3 text-[12.5px] transition-colors ${i === preset && isPreset ? "bg-raised text-text" : "text-text3 hover:text-text2"}`}>
                {NAMES[q.file] || q.file}
              </button>
            ))}
          </div>
          {isPreset && <p className="border-b border-line px-4 py-3 text-[13px] leading-relaxed text-text2">{queries[preset].title}</p>}

          {/* editor */}
          <div className="relative h-[300px] border-b border-line bg-bg/40">
            <Editor value={text} onChange={setText} onRun={run} schema={state.schema} />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {running && <button onClick={stop} className="h-8 rounded-[4px] border border-rose/60 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-rose">Stop</button>}
              {state.status === "idle" && <button onClick={open} className="h-8 rounded-[4px] border border-line2 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-text2">Load database (5.6 MB)</button>}
              <button onClick={() => run(text)} disabled={state.status !== "ready" || running}
                className="flex h-8 items-center gap-2 rounded-[4px] bg-text px-3.5 font-mono text-[11px] uppercase tracking-[0.1em] text-bg transition-colors hover:bg-mint disabled:opacity-40">
                {running ? "Running…" : "Run"} <kbd className="hidden opacity-60 sm:inline">{mac ? "⌘" : "Ctrl"}↵</kbd>
              </button>
            </div>
          </div>

          {/* results */}
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-[11px] text-text3">
                {result && !error && <>{result.total.toLocaleString()} row{result.total === 1 ? "" : "s"} · {result.ms < 1 ? "<1" : result.ms.toFixed(0)} ms{result.total > result.rows.length ? ` · showing ${result.rows.length.toLocaleString()}` : ""}</>}
                {!result && !error && (state.status === "ready" ? "Run a query to see results." : "Results appear here once the database loads.")}
              </div>
              {result && result.columns.length > 0 && (
                <div className="flex items-center gap-2">
                  <Seg label="Result view" options={[["table", "Table"], ["chart", "Chart"]]} value={view} onChange={setView} />
                  <button onClick={csv} className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text3 hover:text-mint">CSV ↓</button>
                </div>
              )}
            </div>
            {error && <pre className="whitespace-pre-wrap rounded-[4px] border border-rose/40 bg-rose/[.06] p-3 font-mono text-[12px] text-rose">{error}</pre>}
            {result && !error && result.columns.length > 0 && (view === "table"
              ? <DataTable columns={tableCols} rows={tableRows.slice(0, 1000)} maxHeight={420} />
              : <ResultChart result={result} axes={axes} setAxes={setAxes} />)}
            {result && !error && result.columns.length === 0 && <p className="text-[13px] text-text3">Done. The statement returned no rows (changes only affect your copy, in this tab).</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
