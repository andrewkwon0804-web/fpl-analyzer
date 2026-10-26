// Text box that suggests players as you type. Calls onPick(player); onClear() when emptied.
import { useMemo, useState } from "react";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function PlayerSelect({ players, value, onPick, onClear, placeholder, label, className = "", bad = false }) {
  const [q, setQ] = useState(null);  // null = showing the picked player's name
  const [cur, setCur] = useState(0);
  const text = q ?? (value ? value.name : "");
  const hits = useMemo(() => {
    if (q === null || !q.trim()) return [];
    const t = norm(q.trim());
    const score = (n) => (n.startsWith(t) ? 0 : n.split(/[ .-]/).some((w) => w.startsWith(t)) ? 1 : 2);
    return players.filter((p) => norm(p.name).includes(t) || norm(p.team).startsWith(t))
      .map((p, i) => [score(norm(p.name)), i, p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 7).map((x) => x[2]);
  }, [q, players]);
  const pick = (p) => { setQ(null); onPick(p); };
  return (
    <div className={`relative ${className}`}>
      <input value={text} placeholder={placeholder} aria-label={label} autoComplete="off" role="combobox" aria-expanded={hits.length > 0}
        onChange={(e) => { setQ(e.target.value); setCur(0); if (!e.target.value && onClear) onClear(); }}
        onFocus={(e) => e.target.select()}
        onBlur={() => setTimeout(() => setQ(null), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
          if (e.key === "Enter" && hits[cur]) { e.preventDefault(); pick(hits[cur]); e.currentTarget.blur(); }
          if (e.key === "Escape") { setQ(null); e.currentTarget.blur(); }
        }}
        className={`h-11 w-full rounded-[4px] border bg-bg/60 px-3.5 text-[15px] outline-none transition-colors placeholder:text-text3 focus:border-mint ${bad ? "border-rose" : "border-line2"}`} />
      {hits.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-12 z-40 overflow-hidden rounded-[4px] border border-line2 bg-surface p-1 shadow-2xl">
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === cur} onPointerDown={(e) => { e.preventDefault(); pick(p); }} onPointerMove={() => setCur(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === cur ? "bg-raised" : ""}`}>
              <span className="truncate">{p.name} <small className="text-text3">{p.short} {p.pos}</small></span>
              <span className="num shrink-0 text-text2">£{p.price.toFixed(1)}m</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
