// Hero search box. Press "/" anywhere to focus it. Picking a player calls onPick(player, inputEl).
import { useEffect, useMemo, useRef, useState } from "react";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Finder({ data, onPick }) {
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const [focus, setFocus] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const hits = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [];
    const score = (n) => (n === t ? 0 : n.startsWith(t) ? 1 : n.split(/[ .-]/).some((w) => w.startsWith(t)) ? 2 : 3);
    // exact names first, then names starting with the text, then the rest; ties stay in predicted-points order
    return data.players.filter((p) => norm(p.name).includes(t)).map((p, i) => [score(norm(p.name)), i, p])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 6).map((x) => x[2]);
  }, [q, data]);
  const pick = (p) => { setQ(""); input.current?.blur(); onPick(p, input.current); };
  const open = focus && q.trim().length > 0;
  return (
    <div className="finder relative max-w-[460px]" role="combobox" aria-expanded={open} aria-owns="finder-list">
      <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 fill-none stroke-text3 stroke-2">
        <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
      <input ref={input} type="search" value={q} placeholder="Try any player, e.g. Saka" autoComplete="off" aria-label="Find a player"
        aria-autocomplete="list" aria-controls="finder-list"
        onChange={(e) => { setQ(e.target.value); setCur(0); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
          if (e.key === "Enter" && hits[cur]) pick(hits[cur]);
        }}
        className="h-[52px] w-full rounded-2xl border border-line2 bg-surface/80 pl-11 pr-12 text-[16px] outline-none transition-colors placeholder:text-text3 focus:border-mint [&::-webkit-search-cancel-button]:hidden" />
      <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border border-line2 px-2 font-mono text-xs text-text3 max-sm:hidden">/</kbd>
      {open && (
        <ul id="finder-list" role="listbox" className="absolute inset-x-0 top-[58px] z-30 overflow-hidden rounded-2xl border border-line2 bg-surface p-1.5 shadow-2xl">
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === cur} onPointerDown={(e) => { e.preventDefault(); pick(p); }} onPointerMove={() => setCur(i)}
              className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 ${i === cur ? "bg-raised" : ""}`}>
              <span>{p.name} <small className="ml-1 text-text3">{p.short} {p.pos}</small></span>
              <span className="num text-sm text-mint">{p.pred.toFixed(1)}</span>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-3 text-sm text-text3">No player matches "{q}".</li>}
        </ul>
      )}
    </div>
  );
}
