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

// ---------------------------------------------------------------- shared bits for the dashboard charts

export const POS_COLORS = { GK: "rgb(var(--amber))", DEF: "rgb(var(--sky))", MID: "rgb(var(--mint))", FWD: "rgb(var(--rose))" };

function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9))));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v);
}

// Tooltip that follows the pointer inside a chart box. bind(text) goes on any SVG element.
function useTip() {
  const [tip, setTip] = useState(null);
  const bind = (text) => ({
    onPointerMove: (e) => {
      const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
      setTip({ text, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
    },
    onPointerLeave: () => setTip(null),
  });
  const el = tip && (
    <div className="pointer-events-none absolute z-10 max-w-[260px] rounded-xl border border-line2 bg-surface px-3 py-2 text-[13px] shadow-xl"
      style={{ left: Math.min(tip.x + 14, tip.w - 200), top: tip.y + 14 }}>{tip.text}</div>
  );
  return [el, bind];
}

const Grid = ({ ticks, X0, X1, Y, fmt = (v) => v }) => ticks.map((v) => (
  <g key={v}>
    <line x1={X0} x2={X1} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--line))" />
    <text x={X0 - 10} y={Y(v) + 4} textAnchor="end" className="num fill-text3 text-[12px]">{fmt(v)}</text>
  </g>
));

// Points scored each gameweek as bars, the model's prediction before each deadline as a line.
// hist: [[gw, predicted, scored, minutes]]
export function PlayerChart({ hist, next, nextGw }) {
  const [ref, seen] = useInView();
  const [tip, bind] = useTip();
  const W = 900, H = 300, pad = { l: 44, r: 20, t: 14, b: 34 }, n = nextGw;
  const top = Math.max(6, ...hist.map((h) => Math.max(h[1], h[2])), next), step = niceStep(top / 3), ymax = step * Math.ceil(top / step);
  const ticks = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
  const bw = (W - pad.l - pad.r) / n, X = (g) => pad.l + (g - 0.5) * bw, Y = (v) => H - pad.b - (v / ymax) * (H - pad.t - pad.b);
  const trail = useTrail(hist.length, { k: seen ? 1 : 0, config: cfg, immediate: reduced });
  const line = useSpring({ t: seen ? 0 : 1, delay: 200, config: { tension: 50, friction: 20 }, immediate: reduced });
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Points scored and predicted by gameweek">
        <Grid ticks={ticks} X0={pad.l} X1={W - pad.r} Y={Y} />
        {Array.from({ length: n }, (_, i) => <text key={i} x={X(i + 1)} y={H - 10} textAnchor="middle" className="fill-text3 text-[12px]">GW{i + 1}</text>)}
        {hist.map((h, i) => (
          <animated.rect key={h[0]} x={X(h[0]) - bw * 0.3} width={bw * 0.6} rx="4" fill="rgb(var(--line2))" {...bind(`GW${h[0]}: scored ${h[2]}, predicted ${h[1].toFixed(1)}, ${h[3]} min`)}
            y={trail[i].k.to((k) => Y(Math.max(0, h[2]) * k))} height={trail[i].k.to((k) => Math.abs(Y(0) - Y(h[2] * k)))} />
        ))}
        {hist.length > 1 && <animated.path d={hist.map((h, i) => `${i ? "L" : "M"}${X(h[0])},${Y(h[1])}`).join("")} fill="none" stroke="rgb(var(--mint))" strokeWidth="2.5"
          pathLength="1" strokeDasharray="1" strokeDashoffset={line.t} />}
        {hist.map((h) => <circle key={h[0]} cx={X(h[0])} cy={Y(h[1])} r="4" fill="rgb(var(--mint))" {...bind(`GW${h[0]}: predicted ${h[1].toFixed(1)}, scored ${h[2]}`)} />)}
        <circle cx={X(n)} cy={Y(next)} r="8" fill="none" stroke="rgb(var(--mint))" strokeWidth="2.5" {...bind(`GW${n}: predicted ${next.toFixed(1)}`)} />
      </svg>
      {tip}
    </div>
  );
}

// Bars per gameweek, with an optional dashed comparison line. rows: [{ label, value, compare, tip }]
export function BarLine({ rows, height = 280 }) {
  const [ref, seen] = useInView();
  const [tip, bind] = useTip();
  const W = 900, H = height, pad = { l: 44, r: 16, t: 22, b: 34 };
  const top = Math.max(...rows.map((r) => Math.max(r.value, r.compare || 0))) * 1.12;
  const bw = (W - pad.l - pad.r) / rows.length, Y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const step = niceStep(top / 4), ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const trail = useTrail(rows.length, { k: seen ? 1 : 0, config: cfg, immediate: reduced });
  const cmp = rows.map((r, i) => r.compare != null && [pad.l + i * bw + bw / 2, Y(r.compare)]).filter(Boolean);
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={rows.map((r) => `${r.label}: ${r.value}`).join(", ")}>
        <Grid ticks={ticks} X0={pad.l} X1={W - pad.r} Y={Y} />
        {rows.map((r, i) => {
          const x = pad.l + i * bw + bw * 0.2;
          return (
            <g key={r.label} {...bind(r.tip)}>
              <animated.rect x={x} width={bw * 0.6} rx="5" fill="rgb(var(--mint))" y={trail[i].k.to((k) => Y(r.value * k))} height={trail[i].k.to((k) => Y(0) - Y(r.value * k))} />
              <animated.text x={x + bw * 0.3} y={Y(r.value) - 7} textAnchor="middle" opacity={trail[i].k} className="num fill-text text-[13px]">{r.value}</animated.text>
              <text x={x + bw * 0.3} y={H - 12} textAnchor="middle" className="fill-text3 text-[12px]">{r.label}</text>
            </g>
          );
        })}
        {cmp.length > 1 && <path d={cmp.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("")} fill="none" stroke="rgb(var(--sky))" strokeWidth="2" strokeDasharray="5 5" />}
      </svg>
      {tip}
    </div>
  );
}

// Scatter of price vs points with guide lines for points per £m.
export function Scatter({ pts, xLabel, yLabel, guides = [] }) {
  const [ref, seen] = useInView();
  const [tip, bind] = useTip();
  const W = 900, H = 420, pad = { l: 48, r: 20, t: 16, b: 46 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const ystep = niceStep(Math.max(...ys) / 5), y1 = ystep * Math.ceil(Math.max(...ys) / ystep);
  const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r), Y = (v) => H - pad.b - (v / y1) * (H - pad.t - pad.b);
  const s = useSpring({ k: seen ? 1 : 0, config: { tension: 90, friction: 18 }, immediate: reduced });
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} against ${xLabel} for ${pts.length} players`}>
        <Grid ticks={Array.from({ length: Math.round(y1 / ystep) + 1 }, (_, i) => i * ystep)} X0={pad.l} X1={W - pad.r} Y={Y} />
        {Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).map((v) => <text key={v} x={X(v)} y={H - 24} textAnchor="middle" className="fill-text3 text-[12px]">£{v}</text>)}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" className="fill-text3 text-[12px]">{xLabel}</text>
        <text x={pad.l - 10} y={8} textAnchor="end" className="fill-text3 text-[12px]">{yLabel}</text>
        {guides.map((g) => {
          const xe = Math.min(x1, y1 / g.slope);
          return (
            <g key={g.slope}>
              <line x1={X(x0)} y1={Y(g.slope * x0)} x2={X(xe)} y2={Y(g.slope * xe)} stroke="rgb(var(--line2))" strokeDasharray="4 5" />
              <text x={X(xe) - 4} y={Y(g.slope * xe) + 16} textAnchor="end" className="fill-text3 text-[11px]">{g.label}</text>
            </g>
          );
        })}
        {pts.map((p, i) => (
          <animated.circle key={i} cx={X(p.x)} cy={Y(p.y)} fill={p.color} fillOpacity=".8" stroke="rgb(var(--bg))" {...bind(p.tip)}
            r={s.k.to((k) => Math.max(0, Math.min(1, k * 1.6 - (i / pts.length) * 0.6)) * 5)} />
        ))}
      </svg>
      {tip}
    </div>
  );
}

// Lines across categories. series: [{ name, color, values }]
export function CatLines({ cats, series, yLabel, fmt = (v) => v.toFixed(2) }) {
  const [ref, seen] = useInView();
  const [tip, bind] = useTip();
  const W = 900, H = 330, pad = { l: 48, r: 70, t: 16, b: 36 };
  const all = series.flatMap((s) => s.values.filter((v) => v !== null));
  const step = niceStep(Math.max(...all) / 4), top = step * Math.ceil(Math.max(...all) / step);
  const X = (i) => pad.l + (i / (cats.length - 1)) * (W - pad.l - pad.r), Y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const s = useSpring({ t: seen ? 0 : 1, config: { tension: 45, friction: 20 }, immediate: reduced });
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} by ${cats.join(", ")}`}>
        <Grid ticks={Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)} X0={pad.l} X1={W - pad.r} Y={Y} fmt={(v) => +v.toFixed(2)} />
        {cats.map((c, i) => <text key={c} x={X(i)} y={H - 12} textAnchor="middle" className="fill-text3 text-[12px]">{c}</text>)}
        <text x={pad.l - 10} y={8} textAnchor="end" className="fill-text3 text-[12px]">{yLabel}</text>
        {series.map((se) => {
          const pts = se.values.map((v, i) => [i, v]).filter((p) => p[1] !== null), last = pts[pts.length - 1];
          return (
            <g key={se.name}>
              <animated.path d={pts.map((p, k) => `${k ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join("")} fill="none" stroke={se.color} strokeWidth="2.5" pathLength="1" strokeDasharray="1" strokeDashoffset={s.t} />
              {pts.map((p) => <circle key={p[0]} cx={X(p[0])} cy={Y(p[1])} r="4.5" fill={se.color} {...bind(`${se.name}, ${cats[p[0]]}: ${fmt(p[1])}`)} />)}
              <animated.text x={X(last[0]) + 12} y={Y(last[1]) + 5} fill={se.color} opacity={s.t.to((t) => 1 - t)} className="text-[13px]">{se.name}</animated.text>
            </g>
          );
        })}
      </svg>
      {tip}
    </div>
  );
}

// Two bars per group around a zero line. groups: [{ label, sub, a, b }]
export function PairBars({ groups, names, colors }) {
  const [ref, seen] = useInView();
  const [tip, bind] = useTip();
  const W = 900, H = 320, pad = { l: 56, r: 10, t: 20, b: 52 };
  const lim = Math.max(...groups.flatMap((g) => [Math.abs(g.a), Math.abs(g.b)])) * 1.15;
  const Y = (v) => pad.t + (1 - (v + lim) / (2 * lim)) * (H - pad.t - pad.b);
  const gw = (W - pad.l - pad.r) / groups.length, bw = gw * 0.28;
  const trail = useTrail(groups.length, { k: seen ? 1 : 0, config: cfg, immediate: reduced });
  const sg = (v) => (v > 0 ? "+" : "") + v.toFixed(2);
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={groups.map((g) => `${g.label}: ${sg(g.a)} then ${sg(g.b)}`).join(", ")}>
        {[-lim / 1.15, 0, lim / 1.15].map((v) => (
          <g key={v}><line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? "rgb(var(--line2))" : "rgb(var(--line))"} />
            <text x={pad.l - 8} y={Y(v) + 4} textAnchor="end" className="num fill-text3 text-[12px]">{sg(v)}</text></g>
        ))}
        {groups.map((g, i) => {
          const cx = pad.l + gw * i + gw / 2;
          return (
            <g key={g.label}>
              {[[g.a, colors[0], -1, names[0]], [g.b, colors[1], 1, names[1]]].map(([v, c, side, nm]) => {
                const x = cx + (side < 0 ? -bw - 3 : 3);
                return <animated.rect key={side} x={x} width={bw} rx="4" fill={c} {...bind(`${g.label} (${g.sub}): ${nm} ${sg(v)} per 90`)}
                  y={trail[i].k.to((k) => Math.min(Y(0), Y(v * k)))} height={trail[i].k.to((k) => Math.max(2, Math.abs(Y(v * k) - Y(0))))} />;
              })}
              <text x={cx} y={H - 22} textAnchor="middle" className="fill-text2 text-[13px]">{g.label}</text>
              <text x={cx} y={H - 4} textAnchor="middle" className="fill-text3 text-[11px]">{g.sub}</text>
            </g>
          );
        })}
      </svg>
      {tip}
    </div>
  );
}

// Labelled horizontal bars from zero, for ranked lists. rows: [{ label, sub, value, color }]
export function RankBars({ rows, fmt = (v) => v.toFixed(1) }) {
  const [ref, seen] = useInView();
  const lo = Math.min(0, ...rows.map((r) => r.value)), hi = Math.max(0, ...rows.map((r) => r.value));
  const trail = useTrail(rows.length, { k: seen ? 1 : 0, config: cfg, immediate: reduced });
  return (
    <div ref={ref} className="space-y-2.5">
      {rows.map((r, i) => {
        const w = (Math.abs(r.value) / (hi - lo || 1)) * 100, left = ((r.value < 0 ? r.value - lo : -lo) / (hi - lo || 1)) * 100;
        return (
          <div key={r.label + i} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_56px] items-center gap-3 text-[13px]">
            <span className="min-w-0"><span className="block truncate">{r.label}</span>{r.sub && <small className="block truncate text-text3">{r.sub}</small>}</span>
            <div className="relative h-6 rounded bg-raised/50">
              <animated.i className="absolute inset-y-0 block rounded" style={{ background: r.color, left: `${left}%`, width: trail[i].k.to((k) => `${Math.max(0.5, w * k)}%`),
                ...(r.value < 0 ? { left: trail[i].k.to((k) => `${left + w * (1 - k)}%`) } : {}) }} />
            </div>
            <span className="num text-right text-text2">{fmt(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
