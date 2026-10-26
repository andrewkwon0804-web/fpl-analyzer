// Small SVG charts that grow in with a spring when they scroll into view.
import { useState } from "react";
import { animated, useSpring, useTrail } from "@react-spring/web";
import { useInView, reduced } from "../lib/motion.js";

const cfg = { tension: 120, friction: 20 };

// rows: [{ label, value, color }]
export function Bars({ rows, height = 170, fmt = (v) => v.toFixed(1) }) {
  const [ref, seen] = useInView();
  const top = Math.max(...rows.map((r) => r.value), 0.01);
  const trail = useTrail(rows.length, { h: seen ? 1 : 0, config: cfg, immediate: reduced });
  return (
    <div ref={ref} className="flex items-end gap-2.5" style={{ height }}>
      {rows.map((r, i) => (
        <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <animated.span className="num text-xs text-text2" style={{ opacity: trail[i].h }}>{fmt(r.value)}</animated.span>
          <animated.i className="block w-full max-w-[64px] rounded-t-md" style={{ background: r.color, height: trail[i].h.to((h) => `${h * (r.value / top) * (height - 44)}px`) }} />
          <span className="min-h-[2.6em] text-center text-[11px] leading-tight text-text3">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// Horizontal bars around a zero line, for signed values.
export function HBars({ rows, fmt = (v) => v.toFixed(2) }) {
  const [ref, seen] = useInView();
  const top = Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);
  const trail = useTrail(rows.length, { w: seen ? 1 : 0, config: cfg, immediate: reduced });
  return (
    <div ref={ref} className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[104px_1fr_48px] items-center gap-2 text-[12px]">
          <span className="text-text3">{r.label}</span>
          <div className="relative h-5 border-l border-line2">
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-line2" />
            <animated.i className="absolute inset-y-0.5 block rounded" style={{
              background: r.color,
              left: r.value >= 0 ? "50%" : trail[i].w.to((w) => `${50 - w * (Math.abs(r.value) / top) * 50}%`),
              width: trail[i].w.to((w) => `${Math.max(0.6, w * (Math.abs(r.value) / top) * 50)}%`),
            }} />
          </div>
          <span className="num text-right text-text2">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Running totals. series: [{ name, color, points: [[gw, total], ...] }]
export function LineChart({ series, height = 320, yTitle = "Points" }) {
  const [ref, seen] = useInView();
  const [hover, setHover] = useState(null);
  const W = 900, H = height, pad = { l: 52, r: 20, t: 18, b: 34 };
  const xs = series[0].points.map(([g]) => g);
  const maxY = Math.max(...series.flatMap((s) => s.points.map(([, v]) => v))) * 1.08;
  const X = (g) => pad.l + ((g - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0])) * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
  const draw = useSpring({ t: seen ? 0 : 1, config: { tension: 40, friction: 20 }, immediate: reduced });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxY * f) / 10) * 10);
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), gx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xs.forEach((g, i) => { if (Math.abs(X(g) - gx) < Math.abs(X(xs[best]) - gx)) best = i; });
    setHover(best);
  };
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" role="img" aria-label="Running points total, model vs simple rule"
        onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--line))" />
            <text x={pad.l - 10} y={Y(v) + 4} textAnchor="end" className="num fill-text3 text-[12px]">{v}</text>
          </g>
        ))}
        {xs.map((g) => <text key={g} x={X(g)} y={H - 10} textAnchor="middle" className="fill-text3 text-[12px]">GW{g}</text>)}
        <text x={14} y={pad.t + 4} className="fill-text3 text-[12px]" transform={`rotate(-90 14 ${pad.t + 4})`} textAnchor="end">{yTitle}</text>
        {series.map((s) => {
          const d = s.points.map(([g, v], i) => `${i ? "L" : "M"}${X(g).toFixed(1)},${Y(v).toFixed(1)}`).join("");
          return (
            <g key={s.name}>
              <animated.path d={d} fill="none" stroke={s.color} strokeWidth={s.name === "Model" ? 3 : 2} strokeLinejoin="round" pathLength="1"
                strokeDasharray="1" strokeDashoffset={draw.t} />
              {s.points.map(([g, v], i) => (
                <animated.circle key={g} cx={X(g)} cy={Y(v)} r={hover === i ? 5 : 3} fill={s.color}
                  opacity={draw.t.to((t) => (1 - t >= i / Math.max(1, s.points.length - 1) - 0.01 ? 1 : 0))} />
              ))}
            </g>
          );
        })}
        {hover !== null && <line x1={X(xs[hover])} x2={X(xs[hover])} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--line2))" strokeDasharray="3 4" />}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-2 rounded-xl border border-line2 bg-surface px-3 py-2 text-[13px] shadow-xl"
          style={{ left: `clamp(0px, calc(${(X(xs[hover]) / W) * 100}% - 70px), calc(100% - 160px))` }}>
          <b className="font-display">Gameweek {xs[hover]}</b>
          {series.map((s) => <div key={s.name} className="flex justify-between gap-4"><span style={{ color: s.color }}>{s.name}</span><span className="num">{s.points[hover][1]}</span></div>)}
        </div>
      )}
      <div className="mt-3 flex gap-5 text-[13px] text-text2">
        {series.map((s) => <span key={s.name} className="flex items-center gap-2"><i className="h-[3px] w-4 rounded" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}

export const cumulative = (rows) => { let t = 0; return rows.map(([g, v]) => [g, (t += v)]); };
