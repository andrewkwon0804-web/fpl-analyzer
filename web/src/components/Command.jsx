// ⌘K / Ctrl K: jump to any player, section or page.
import { useEffect, useMemo, useRef, useState } from "react";
import { animated, useTransition } from "@react-spring/web";
import { goTo } from "./Nav.jsx";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Command({ data, open, setOpen, onPlayer, places }) {
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const input = useRef(null);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [setOpen]);
  useEffect(() => { if (open) { setQ(""); setCur(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  const items = useMemo(() => {
    const pages = (places || [
      ["Last gameweek's result", "Section", () => goTo("#last")], ["How the predictions are made", "Section", () => goTo("#how")],
      ["Model vs a simple rule", "Section", () => goTo("#record")], ["Findings", "Section", () => goTo("#findings")],
      ["Dashboard", "Page", () => { location.href = "./dashboard.html"; }],
      ["Transfer planner", "Page", () => { location.href = "./dashboard.html#planner"; }],
      ["Model team", "Page", () => { location.href = "./dashboard.html#team"; }],
      ["Analysis", "Page", () => { location.href = "./dashboard.html#analysis-value"; }],
    ]).map(([label, kind, run]) => ({ label, kind, run }));
    if (!data) return pages;
    const t = norm(q.trim());
    const players = data.players.filter((p) => !t || norm(p.name).includes(t) || norm(p.team).includes(t))
      .slice(0, t ? 8 : 4).map((p) => ({ label: p.name, kind: `${p.short} ${p.pos}`, value: p.pred.toFixed(1), run: () => onPlayer(p) }));
    return [...players, ...pages.filter((x) => !t || norm(x.label).includes(t))];
  }, [q, data, onPlayer, places]);
  const run = (it) => { setOpen(false); setTimeout(it.run, 60); };
  const tr = useTransition(open, { from: { o: 0, s: 0.97 }, enter: { o: 1, s: 1 }, leave: { o: 0, s: 0.98 }, config: { tension: 380, friction: 30 } });
  return tr((st, show) => show && (
    <animated.div style={{ opacity: st.o }} className="fixed inset-0 z-[150] grid place-items-start bg-bg/60 px-4 pt-[14vh] backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <animated.div style={{ transform: st.s.to((s) => `scale(${s})`) }} role="dialog" aria-label="Search"
        className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-line2 bg-surface shadow-2xl">
        <input ref={input} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCur(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(items.length - 1, c + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
            if (e.key === "Enter" && items[cur]) run(items[cur]);
          }}
          placeholder="Search players, sections and pages" className="h-14 w-full border-b border-line bg-transparent px-5 text-[16px] outline-none placeholder:text-text3" />
        <ul className="max-h-[50vh] overflow-auto p-2" role="listbox">
          {items.map((it, i) => (
            <li key={it.label + it.kind} role="option" aria-selected={i === cur} onPointerMove={() => setCur(i)} onClick={() => run(it)}
              className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 ${i === cur ? "bg-raised" : ""}`}>
              <span>{it.label} <small className="ml-1.5 text-text3">{it.kind}</small></span>
              {it.value && <span className="num font-display text-mint">{it.value}</span>}
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-text3">Nothing matches "{q}". Try a player's surname.</li>}
        </ul>
        <div className="flex gap-4 border-t border-line px-4 py-2.5 text-xs text-text3">
          <span><kbd className="font-mono">↑↓</kbd> move</span><span><kbd className="font-mono">Enter</kbd> open</span><span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </animated.div>
    </animated.div>
  ));
}
