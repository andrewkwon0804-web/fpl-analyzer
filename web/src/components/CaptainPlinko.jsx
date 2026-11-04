// What could the captain actually score? A Galton board: each ball is one possible
// gameweek, drawn from what really happened to regular starters with the same predicted
// points in 2025-26 (the model report's "range behind a prediction"). Balls bounce through
// the pegs and pile up into the shape of the outcomes. Captain points are doubled.
import { useEffect, useMemo, useRef, useState } from "react";
import { reduced, useInView } from "../lib/motion.js";

const POS_HEX = { GK: "#F5C451", DEF: "#6F95FF", MID: "#38E1A8", FWD: "#FF7A8A" };
const BINS = 17, ROWS = BINS - 1, STEP = 2; // captain points 0, 2, ... 32+

// inverse CDF through the known quantiles of the real outcomes
function sampler(q) {
  const knots = [[0, 0], [0.1, q.p10], [0.25, q.p25], [0.5, q.p50], [0.75, q.p75], [0.9, q.p90], [1, Math.max(q.p90 * 2.2, 15)]];
  return () => {
    const u = Math.random();
    for (let i = 1; i < knots.length; i++) {
      const [u0, v0] = knots[i - 1], [u1, v1] = knots[i];
      if (u <= u1) return Math.round(v0 + ((u - u0) / (u1 - u0)) * (v1 - v0));
    }
    return knots.at(-1)[1];
  };
}

export default function CaptainPlinko({ data }) {
  const [R, setR] = useState(null);
  const options = data.players.slice(0, 3);
  const [pick, setPick] = useState(() => options.find((p) => p.id === data.captain) || options[0]);
  const canvas = useRef(null), state = useRef(null);
  const [stats, setStats] = useState(null);
  const [ref, seen] = useInView(0.85);
  useEffect(() => { fetch("./data/research.json").then((r) => r.json()).then(setR).catch(() => {}); }, []);

  const row = useMemo(() => {
    if (!R) return null;
    return R.intervals.reduce((a, b) => (Math.abs(b.pbin - pick.pred) < Math.abs(a.pbin - pick.pred) ? b : a));
  }, [R, pick]);

  useEffect(() => {
    if (!row || !seen) return;
    const c = canvas.current, ctx = c.getContext("2d"), draw = sampler(row);
    const S = { balls: [], bins: new Array(BINS).fill(0), dropped: 0, target: 600, spawn: 0, samples: [] };
    state.current = S;
    let raf = 0, last = 0, W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(devicePixelRatio, 2); W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; };
    size(); addEventListener("resize", size);
    const color = POS_HEX[pick.pos];
    const frame = (now) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const top = 30, pegH = Math.min(18, (H * 0.5) / ROWS), gap = Math.min(W / (BINS + 1), 46), cx = W / 2;
      const binTop = top + ROWS * pegH + 16, binH = H - binTop - 28;
      // new balls: one possible gameweek each
      S.spawn += dt * (reduced ? 1e6 : 70);
      while (S.spawn >= 1 && S.dropped < S.target) {
        S.spawn--; S.dropped++;
        const pts = draw() * 2, bin = Math.min(BINS - 1, Math.max(0, Math.round(pts / STEP)));
        S.samples.push(pts);
        // a path with exactly `bin` rights, in random order, so it lands where the draw says
        const turns = Array.from({ length: ROWS }, (_, i) => (i < bin ? 1 : 0)).sort(() => Math.random() - 0.5);
        S.balls.push({ turns, bin, row: 0, f: 0, x: 0 });
      }
      if (reduced) { S.balls.forEach((b) => S.bins[b.bin]++); S.balls = []; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      // pegs
      ctx.fillStyle = "rgba(168,172,178,.35)";
      for (let r = 0; r < ROWS; r++) for (let k = 0; k <= r; k++) {
        ctx.beginPath(); ctx.arc(cx + (k - r / 2) * gap, top + r * pegH, 1.6, 0, 7); ctx.fill();
      }
      // bins
      const maxBin = Math.max(8, ...S.bins);
      for (let k = 0; k < BINS; k++) {
        const x = cx + (k - ROWS / 2) * gap, h = (S.bins[k] / maxBin) * binH;
        const g = ctx.createLinearGradient(0, binTop + binH - h, 0, binTop + binH);
        g.addColorStop(0, color); g.addColorStop(1, color + "33");
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - gap * 0.38, binTop + binH - h, gap * 0.76, h, [3, 3, 0, 0]); ctx.fill();
        ctx.fillStyle = "rgba(120,125,132,1)"; ctx.font = '11px "Geist Mono", monospace'; ctx.textAlign = "center";
        if (k % 2 === 0 || gap > 30) ctx.fillText(k === BINS - 1 ? `${k * STEP}+` : String(k * STEP), x, binTop + binH + 16);
      }
      // balls in flight
      ctx.fillStyle = color;
      for (let i = S.balls.length - 1; i >= 0; i--) {
        const b = S.balls[i];
        b.f += dt * 9;
        while (b.f >= 1) { b.f -= 1; b.x += b.turns[b.row] ? 0.5 : -0.5; b.row++; if (b.row >= ROWS) break; }
        if (b.row >= ROWS) { S.bins[b.bin]++; S.balls.splice(i, 1); continue; }
        const dir = b.turns[b.row] ? 0.5 : -0.5, e = b.f;
        const x = cx + (b.x + dir * e) * gap, y = top + (b.row + e) * pegH - Math.sin(e * Math.PI) * pegH * 0.45;
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (S.dropped !== S.shown && (S.dropped % 30 === 0 || S.dropped === S.target)) {
        S.shown = S.dropped;
        const s = [...S.samples].sort((a, b) => a - b), n = s.length;
        if (n) setStats({ n, median: s[Math.floor(n / 2)], blank: s.filter((v) => v <= 4).length / n, haul: s.filter((v) => v >= 20).length / n, p90: s[Math.floor(n * 0.9)] });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); };
  }, [row, seen, pick]);

  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <section ref={ref} id="plinko" className="page relative grid items-center gap-10 pb-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:pb-36" data-tint="245 196 81" data-tint2="70 120 255" data-tx="25%">
      <div>
        <h2 className="font-display text-[clamp(32px,4vw,60px)] font-medium leading-[1.02] tracking-[-0.04em]">
          {(pick.pred * 2).toFixed(1)} is an average. <span className="text-text3">Here's what it could actually be.</span>
        </h2>
        <p className="mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-text2">
          Each ball is one possible gameweek for {pick.name} as captain, drawn from what really happened to regular starters given a similar prediction last season. They pile up into the shape of the outcomes.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {options.map((p) => (
            <button key={p.id} onClick={() => setPick(p)} className={`h-9 rounded-full border px-4 text-[13px] transition-colors ${p.id === pick.id ? "border-text bg-text text-bg" : "border-line2 text-text2 hover:text-text"}`}>{p.name}</button>
          ))}
        </div>
        {stats && (
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-4">
            {[["Typical", stats.median], ["1 in 10 gets", `${stats.p90}+`], ["Blanks (4 or less)", pct(stats.blank)], ["20 or more", pct(stats.haul)]].map(([k, v]) => (
              <div key={k} className="bg-bg/85 px-3 py-3"><dt className="text-[11px] text-text3">{k}</dt><dd className="num mt-1 text-[22px] font-medium">{v}</dd></div>
            ))}
          </dl>
        )}
        {stats && <p className="mt-3 text-[12px] text-text3">{stats.n} simulated gameweeks. Captain points, doubled.</p>}
      </div>
      <div className="relative h-[460px] rounded-[6px] border border-line bg-bg/60 backdrop-blur max-sm:h-[380px]">
        <canvas ref={canvas} className="h-full w-full" role="img" aria-label={stats ? `Simulated captain scores for ${pick.name}: typical ${stats.median}, ${pct(stats.blank)} blanks, ${pct(stats.haul)} score 20 or more.` : "Simulated captain scores"} />
      </div>
    </section>
  );
}
