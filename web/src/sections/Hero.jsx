// First screen. Plain statement, two actions, the sources. As you scroll it sinks back into
// the page while the pipeline stack below takes over.
import { useEffect, useRef, useState } from "react";
import Finder from "../components/Finder.jsx";
import { usePop } from "../components/Popover.jsx";
import { reduced } from "../lib/motion.js";

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }}
      className="flex h-9 items-center gap-3 border border-line2 bg-raised/70 px-3 font-mono text-[13px] text-text2 hover:text-text" aria-label={`Copy ${text}`}>
      {text}<span className="text-text3">{done ? "copied" : "⧉"}</span>
    </button>
  );
}

export default function Hero({ data }) {
  const { open } = usePop();
  const box = useRef(null);
  const m = data.meta;
  const [in_, setIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIn(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const k = Math.min(1, scrollY / innerHeight), el = box.current;
        if (!el) return;
        el.style.transform = `translate3d(0, ${k * 120}px, 0) scale(${1 - k * 0.14})`;
        el.style.opacity = String(1 - k * 1.25);
        el.style.filter = `blur(${k * 6}px)`;
      });
    };
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const onPick = (p, input) => open(p, input, `Ranked #${data.rank[p.id]} of ${data.players.length} by predicted points.${p.xi ? " In this week's best XI." : ""}`);
  const rise = (d) => ({ transition: `opacity 1s ${d}s, transform 1.2s cubic-bezier(.2,.7,.1,1) ${d}s, filter 1s ${d}s`,
    opacity: in_ ? 1 : 0, transform: in_ ? "none" : "translateY(24px)", filter: in_ ? "none" : "blur(8px)" });
  return (
    <section id="top" data-tint="56 225 168" data-tint2="70 120 255" data-tx="78%" data-glow="1" className="relative flex min-h-[100svh] items-center">
      <div ref={box} className="page origin-top-left will-change-transform">
        <div style={rise(0)} className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] uppercase tracking-[0.12em] text-text3">
          Season {m.season} <span className="text-text2">·</span> Gameweek {m.gw}{data.stale && <span className="text-amber">· data through GW{m.played}</span>}
        </div>
        <h1 style={rise(0.08)} className="mt-6 max-w-[1100px] font-display text-[clamp(42px,6vw,92px)] font-medium leading-[1] tracking-[-0.04em]">
          Predicted FPL Points For<br />All {data.players.length} Players.
        </h1>
        <div style={rise(0.2)} className="mt-9 flex flex-wrap items-center gap-3">
          <a href="./dashboard.html" className="flex h-9 items-center gap-2 bg-text px-4 font-mono text-[12px] uppercase tracking-[0.1em] text-bg hover:bg-mint">Dashboard <span>›</span></a>
          <Copy text="python run_pipeline.py" />
        </div>
        <div style={rise(0.3)} className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.1em]">
          <span className="text-text3">Data from</span><span className="text-text2">Official FPL API</span><span className="text-text2">Vaastav archive</span><span className="text-text2">{data.analysis.rows.toLocaleString("en-US")} rows</span>
        </div>
        <div style={rise(0.4)} className="mt-14 max-w-[420px]"><Finder data={data} onPick={onPick} /></div>
      </div>
      <div className="mono-label absolute inset-x-0 bottom-8 text-center text-[10px] text-text3">Scroll</div>
    </section>
  );
}
