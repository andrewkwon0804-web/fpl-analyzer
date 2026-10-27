// Building blocks for a data report: numbered figures with a chart/table switch and a CSV
// download, segmented controls, stat tiles, legends and sortable tables. Nothing here knows
// about FPL, so the kit can be lifted into another project as is.
import { useMemo, useState } from "react";
import { useInView } from "../../lib/motion.js";
import { download, toCsv } from "../../lib/plot.js";

export function Seg({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[5px] border border-line bg-bg/60 p-0.5">
      {options.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        const on = v === value;
        return (
          <button key={v} role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={`h-7 rounded-[3px] px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${on ? "bg-raised text-text" : "text-text3 hover:text-text2"}`}>{t}</button>
        );
      })}
    </div>
  );
}

// Identity is never colour alone: every legend entry is a swatch plus a name.
export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(([name, color, dashed]) => (
        <li key={name} className="flex items-center gap-2 text-[12px] text-text2">
          <i className="inline-block h-[2px] w-4" style={dashed ? { backgroundImage: `linear-gradient(90deg, ${color} 50%, transparent 50%)`, backgroundSize: "6px 2px" } : { background: color }} />
          {name}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ columns, rows, maxHeight = 360, highlight }) {
  const [sort, setSort] = useState(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort]);
  return (
    <div className="overflow-auto rounded-[4px] border border-line" style={{ maxHeight }} data-lenis-prevent>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap border-b border-line px-3 py-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.08em] text-text3 ${c.num ? "text-right" : "text-left"}`}>
                <button className="hover:text-text" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? -s.dir : c.num ? -1 : 1 }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className={`border-b border-line/60 last:border-0 hover:bg-raised/50 ${highlight?.(r) ? "bg-mint/[.05]" : ""}`}>
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 ${c.num ? "num text-right font-mono text-[12px]" : ""} ${c.className?.(r) || "text-text2"}`}>
                  {c.render ? c.render(r[c.key], r) : c.fmt ? c.fmt(r[c.key]) : r[c.key] ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A numbered figure. `table` is { columns, rows } and powers both the table view and the CSV.
export function Figure({ n, title, children, caption, takeaway, table, file, controls, legend, toggle = true, className = "" }) {
  const [view, setView] = useState("chart");
  const [ref, seen] = useInView(0.95);
  return (
    <figure ref={ref} className={`corners flex min-w-0 flex-col p-4 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.7,.1,1)] sm:p-5 ${seen ? "" : "translate-y-4 opacity-0"} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mono-label text-[10px] text-text3">Fig. {n}</div>
          <h3 className="mt-1 text-[15px] font-medium leading-snug tracking-[-0.01em] text-text">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          {table && toggle && <Seg label="View" options={[["chart", "Chart"], ["table", "Table"]]} value={view} onChange={setView} />}
        </div>
      </div>
      {legend && view === "chart" && <div className="mt-3">{legend}</div>}
      <div className="mt-3 min-w-0 flex-1">
        {view === "chart" || !table ? children : <DataTable columns={table.columns} rows={table.rows} />}
      </div>
      {(caption || table) && (
        <figcaption className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-line/70 pt-3 text-[12.5px] leading-relaxed text-text3">
          <span className="max-w-[68ch]">{caption}</span>
          {table && (
            <button onClick={() => download(`${file || `figure-${n}`}.csv`, toCsv(table.columns, table.rows))}
              className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text3 hover:text-mint">Download CSV ↓</button>
          )}
        </figcaption>
      )}
      {takeaway && <p className="mt-3 border-l-2 border-mint/70 pl-3 text-[13.5px] leading-relaxed text-text">{takeaway}</p>}
    </figure>
  );
}

// A headline number with its comparison underneath.
export function Stat({ label, value, unit, sub, good }) {
  return (
    <div className="bg-bg/85 px-4 py-4 sm:px-5">
      <div className="mono-label text-[10px] text-text3">{label}</div>
      <div className="num mt-2 flex items-baseline gap-1.5 font-display text-[clamp(30px,3.2vw,44px)] font-medium leading-none tracking-[-0.03em]">
        {value}{unit && <span className="text-[13px] font-normal tracking-normal text-text3">{unit}</span>}
      </div>
      {sub && <div className={`mt-2 text-[12px] leading-snug ${good ? "text-mint" : "text-text3"}`}>{sub}</div>}
    </div>
  );
}
