// First screen. Plain statement, two actions, the sources. As you scroll it sinks back into
// the page while the pipeline stack below takes over.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Finder from "../components/Finder.jsx";
import { usePop } from "../components/Popover.jsx";
// three.js loads after the text is up
const LeagueBall = lazy(() => import("../components/LeagueBall.jsx"));

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
  const box = useRef(null), track = useRef(null);
  const m = data.meta;
  const [in_, setIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIn(true), 60); return () => clearTimeout(t); }, []);
  const onPick = (p, input) => open(p, input, `Ranked #${data.rank[p.id]} of ${data.players.length} by predicted points.${p.xi ? " In this week's best XI." : ""}`);
  const rise = (d) => ({ transition: `opacity 1s ${d}s, transform 1.2s cubic-bezier(.2,.7,.1,1) ${d}s, filter 1s ${d}s`,
    opacity: in_ ? 1 : 0, transform: in_ ? "none" : "translateY(24px)", filter: in_ ? "none" : "blur(8px)" });
  return (
    <section ref={track} id="top" data-tint="56 225 168" data-tint2="70 120 255" data-tx="78%" data-glow="1" className="relative h-[270vh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <Suspense fallback={null}><LeagueBall data={data} track={track} heroText={box} /></Suspense>
        <div className="pointer-events-none relative flex h-full flex-col justify-center max-lg:justify-start max-lg:pt-28">
          <div ref={box} className="page pointer-events-auto origin-top-left will-change-transform lg:pointer-events-none">
            <div style={rise(0)} className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] uppercase tracking-[0.12em] text-text3">
              Season {m.season} <span className="text-text2">·</span> Gameweek {m.gw}{data.stale && <span className="text-amber">· data through GW{m.played}</span>}
            </div>
            <h1 style={rise(0.08)} className="mt-6 max-w-[min(1180px,50vw)] font-display text-[clamp(36px,4.3vw,72px)] font-medium leading-[1] tracking-[-0.04em] max-lg:max-w-none">
              Predicted FPL points for all {data.players.length} players.{" "}
              <span className="text-text3">Refreshed every six hours, tested on a season it never saw.</span>
            </h1>
            <div style={rise(0.2)} className="pointer-events-auto mt-9 flex flex-wrap items-center gap-3">
              <a href="./dashboard.html" className="flex h-9 items-center gap-2 bg-text px-4 font-mono text-[12px] uppercase tracking-[0.1em] text-bg hover:bg-mint">Dashboard <span>›</span></a>
              <a href="./research.html" className="flex h-9 items-center border border-line2 px-4 font-mono text-[12px] uppercase tracking-[0.1em] text-text2 hover:text-text">Model report</a>
              <Copy text="python run_pipeline.py" />
            </div>
            <div style={rise(0.3)} className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.1em] max-sm:hidden">
              <span className="text-text3">Data from</span><span className="text-text2">Official FPL API</span><span className="text-text2">Vaastav archive</span><span className="text-text2">{data.analysis.rows.toLocaleString("en-US")} rows</span>
            </div>
            <div style={rise(0.4)} className="pointer-events-auto mt-10 max-w-[420px] max-lg:hidden"><Finder data={data} onPick={onPick} /></div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-7 text-center text-[12px] text-text3">Drag the ball to spin it. Scroll to break it into the ranking.</div>
      </div>
    </section>
  );
}
