// The best XI on a pitch whose lines are drawn by dots that settle into place.
// Players spring on one after another; clicking one opens his pop-up. A searched player who
// isn't in the XI arrives as a dashed "ghost" card that springs in from the search box.
import { useEffect, useRef } from "react";
import { animated, to, useSpring, useTrail } from "@react-spring/web";
import { usePop } from "./Popover.jsx";
import { useInView, reduced } from "../lib/motion.js";

const ROWS = ["FWD", "MID", "DEF", "GK"];
export const ROW_Y = { FWD: 0.16, MID: 0.4, DEF: 0.63, GK: 0.86 };

function linePoints(w, h, n) {
  const segs = [];
  const m = 10, x0 = m, y0 = m, pw = w - 2 * m, ph = h - 2 * m;
  const rect = (x, y, a, b) => segs.push([x, y, x + a, y], [x + a, y, x + a, y + b], [x + a, y + b, x, y + b], [x, y + b, x, y]);
  rect(x0, y0, pw, ph);
  segs.push([x0, y0 + ph / 2, x0 + pw, y0 + ph / 2]);
  rect(x0 + pw * 0.22, y0, pw * 0.56, ph * 0.16);
  rect(x0 + pw * 0.36, y0, pw * 0.28, ph * 0.06);
  rect(x0 + pw * 0.22, y0 + ph * 0.84, pw * 0.56, ph * 0.16);
  rect(x0 + pw * 0.36, y0 + ph * 0.94, pw * 0.28, ph * 0.06);
  const r = pw * 0.12, lens = segs.map(([a, b, c, d]) => Math.hypot(c - a, d - b));
  const circ = 2 * Math.PI * r, total = lens.reduce((s, v) => s + v, 0) + circ;
  return Array.from({ length: n }, (_, i) => {
    let d = (i / n) * total;
    if (d > total - circ) { const a = ((d - total + circ) / circ) * 2 * Math.PI; return [x0 + pw / 2 + Math.cos(a) * r, y0 + ph / 2 + Math.sin(a) * r]; }
    let k = 0;
    while (d > lens[k]) { d -= lens[k]; k++; }
    const [a, b, c, e] = segs[k], f = d / lens[k];
    return [a + (c - a) * f, b + (e - b) * f];
  });
}

function DotLines({ go }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d");
    const read = () => getComputedStyle(document.documentElement).getPropertyValue("--mint").trim().split(/\s+/).join(",");
    let col = read();
    const theme = new MutationObserver(() => { col = read(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    let w, h, dots = [], raf = 0, mouse = { x: -999, y: -999 };
    const size = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pts = linePoints(w, h, Math.round((w + h) * 1.1));
      dots = pts.map(([tx, ty], i) => ({ tx, ty, x: dots[i]?.x ?? Math.random() * w, y: dots[i]?.y ?? Math.random() * h, vx: 0, vy: 0, s: Math.random() }));
    };
    const move = (e) => { const r = c.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    size();
    addEventListener("resize", size); addEventListener("pointermove", move, { passive: true });
    const frame = (now) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        if (go) { d.vx += (d.tx - d.x) * (0.02 + d.s * 0.02); d.vy += (d.ty - d.y) * (0.02 + d.s * 0.02); }
        const dx = d.x - mouse.x, dy = d.y - mouse.y, dd = Math.hypot(dx, dy);
        if (dd < 70) { d.vx += (dx / dd) * 2; d.vy += (dy / dd) * 2; }
        d.vx *= 0.82; d.vy *= 0.82; d.x += d.vx; d.y += d.vy;
        const twinkle = 0.45 + 0.35 * Math.sin(t * 2 + d.s * 12);
        ctx.fillStyle = `rgba(${col},${twinkle.toFixed(2)})`;
        ctx.fillRect(d.x - 0.9, d.y - 0.9, 1.8, 1.8);
      }
      raf = requestAnimationFrame(frame);
    };
    if (reduced) { dots.forEach((d) => { d.x = d.tx; d.y = d.ty; }); }
    raf = requestAnimationFrame(frame);
    return () => { theme.disconnect(); cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); };
  }, [go]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}

function PlayerChip({ p, captain, style, onOpen, ghost = false }) {
  const flag = p.chance !== null && p.chance < 100;
  return (
    <animated.button type="button" data-pid={p.id} onClick={(e) => onOpen(p, e.currentTarget)} style={style}
      className="group absolute w-[19%] max-w-[112px] -translate-x-1/2 -translate-y-1/2 text-center focus-visible:outline-none">
      <div className={`relative mx-auto mb-1.5 grid h-11 w-11 place-items-center rounded-full border font-display text-[13px] font-medium transition-colors max-sm:h-9 max-sm:w-9 max-sm:text-[11px]
        ${ghost ? "border-dashed border-amber text-amber shadow-[0_0_24px_rgb(var(--amber)/.35)]" : captain ? "border-mint bg-raised text-mint shadow-[0_0_0_4px_rgb(var(--mint)/.08),0_0_24px_rgb(var(--mint)/.35)]" : "border-line2 bg-raised group-hover:border-mint group-focus-visible:border-mint"}`}>
        {p.short}
        {captain && <span className="absolute -right-1.5 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-mint text-[10px] font-bold text-bg">C</span>}
        {flag && !ghost && <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-amber text-[10px] font-bold text-bg">!</span>}
      </div>
      <div className="truncate text-[13px] leading-tight max-sm:text-[11px]">{p.name}</div>
      <div className="text-[11px] text-text3 max-sm:text-[10px]">
        <span className={`num ${ghost ? "text-amber" : "text-mint"}`}>{p.pred.toFixed(1)}</span> pts<span className="max-sm:hidden"> · £{p.price.toFixed(1)}m</span>
      </div>
    </animated.button>
  );
}

export default function Pitch({ data, ghost }) {
  const [ref, seen] = useInView(1);
  const { open } = usePop();
  const xi = data.players.filter((p) => p.xi);
  const placed = ROWS.flatMap((pos) => {
    const row = xi.filter((p) => p.pos === pos).sort((a, b) => b.pred - a.pred);
    return row.map((p, i) => ({ p, x: (i + 1) / (row.length + 1), y: ROW_Y[pos] }));
  });
  const trail = useTrail(placed.length, { from: { o: 0, y: 18, s: 0.9 }, to: { o: seen ? 1 : 0, y: seen ? 0 : 18, s: seen ? 1 : 0.9 }, delay: 350, config: { tension: 260, friction: 20 }, immediate: reduced });
  // started from an effect so it only runs when a new player is searched, not on every render
  const [ghostSpring, gapi] = useSpring(() => ({ x: 0, y: 0, s: 1 }));
  useEffect(() => {
    if (!ghost) return;
    gapi.start({ from: { x: ghost.fromX, y: ghost.fromY, s: 0.6 }, to: { x: 0, y: 0, s: 1 }, config: { tension: 120, friction: 16 }, immediate: reduced,
      onRest: () => ghost.onLand && ghost.onLand() });
  }, [ghost, gapi]);
  return (
    <div ref={ref} className="relative aspect-[0.92] w-full overflow-hidden rounded-[22px] border border-line2 bg-gradient-to-b from-surface to-bg shadow-[0_40px_120px_rgb(0_0_0/.45)]">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_35%_at_50%_18%,rgb(var(--mint)/.1),transparent_70%)]" />
      <DotLines go={seen} />
      {placed.map(({ p, x, y }, i) => (
        <PlayerChip key={p.id} p={p} captain={p.id === data.captain} onOpen={open}
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, opacity: trail[i].o, transform: to([trail[i].y, trail[i].s], (v, sc) => `translate(-50%, calc(-50% + ${v}px)) scale(${sc})`) }} />
      ))}
      {ghost && (
        <PlayerChip key={`g${ghost.p.id}`} p={ghost.p} ghost onOpen={open}
          style={{ left: `50%`, top: `${(ROW_Y[ghost.p.pos] + 0.115) * 100}%`, zIndex: 5,
            transform: to([ghostSpring.x, ghostSpring.y, ghostSpring.s], (gx, gy, sc) => `translate(calc(-50% + ${gx}px), calc(-50% + ${gy}px)) scale(${sc})`) }} />
      )}
    </div>
  );
}
