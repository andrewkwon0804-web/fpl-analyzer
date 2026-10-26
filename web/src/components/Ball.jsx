// The hero object: a football drawn with one dot per player. Dot size follows that player's
// predicted points; the black patches are the twelve pentagons of a real ball. Drag to spin,
// hover a dot to see who it is, click it for his next five gameweeks.
import { useEffect, useRef, useState } from "react";
import { usePop } from "./Popover.jsx";
import { reduced } from "../lib/motion.js";

const PHI = (1 + Math.sqrt(5)) / 2;
// icosahedron vertices = pentagon centres of a truncated icosahedron (a football)
const PENT = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]]
  .map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l); });

export default function Ball({ data }) {
  const canvas = useRef(null), anchor = useRef(null);
  const [hover, setHover] = useState(null);
  const { open } = usePop();
  useEffect(() => {
    const c = canvas.current, ctx = c.getContext("2d");
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(`--${v}`).trim().split(/\s+/).join(",");
    let col = { mint: css("mint"), text: css("text3"), bg: css("bg") };
    const theme = new MutationObserver(() => { col = { mint: css("mint"), text: css("text3"), bg: css("bg") }; });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // players sorted best first, laid out on a Fibonacci sphere so they're spread evenly
    const P = data.players, n = P.length, top = P[0].pred;
    const dots = P.map((p, k) => {
      const i = (k * 389) % n;  // spread the best players around the ball instead of bunching them at a pole
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      const v = [Math.cos(th) * r, y, Math.sin(th) * r];
      const near = Math.max(...PENT.map((q) => q[0] * v[0] + q[1] * v[1] + q[2] * v[2]));
      return { p, v, patch: near > 0.95, s: 1.4 + 3.2 * Math.pow(Math.max(0, p.pred) / top, 1.3) };
    });
    // a dense, faint shell of extra dots so the ball and its pentagons read as a solid object
    const SH = 2600;
    const shell = Array.from({ length: SH }, (_, i) => {
      const y = 1 - (i / (SH - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      const v = [Math.cos(th) * r, y, Math.sin(th) * r];
      const near = Math.max(...PENT.map((q) => q[0] * v[0] + q[1] * v[1] + q[2] * v[2]));
      return { v, patch: near > 0.95, seam: near > 0.935 && near <= 0.95 };
    });
    let w = 0, h = 0, R = 0, rx = -0.35, ry = 0.6, vx = 0, vy = reduced ? 0 : 0.0032, drag = null, mouse = null, raf = 0, proj = [];
    const size = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height; R = Math.min(w, h) * 0.42; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size(); addEventListener("resize", size);
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e) => { drag = { at: pos(e), moved: 0 }; c.setPointerCapture(e.pointerId); };
    const move = (e) => {
      mouse = pos(e);
      if (!drag) return;
      const dx = mouse[0] - drag.at[0], dy = mouse[1] - drag.at[1];
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.at = mouse;
      vy = dx * 0.006; vx = dy * 0.006; ry += vy; rx += vx;
    };
    const up = () => {
      if (drag && drag.moved < 6 && hit) {
        const a = anchor.current; a.style.left = `${hit.x}px`; a.style.top = `${hit.y}px`;
        open(hit.d.p, a, `Ranked #${data.rank[hit.d.p.id]} of ${n} by predicted points.`);
      }
      drag = null;
    };
    const leave = () => { mouse = null; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointerleave", leave);
    let hit = null, lastHit = null;
    const frame = () => {
      if (!drag) { ry += vy; rx += vx; vy += (0.0032 * (reduced ? 0 : 1) - vy) * 0.02; vx *= 0.95; rx += (-0.35 - rx) * 0.01; }
      const cx = w / 2, cy = h / 2, sy = Math.sin(ry), cyR = Math.cos(ry), sx = Math.sin(rx), cxR = Math.cos(rx);
      ctx.clearRect(0, 0, w, h);
      // soft glow and the ball's outline
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 1.25);
      g.addColorStop(0, `rgba(${col.mint},.10)`); g.addColorStop(1, `rgba(${col.mint},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(${col.text},.25)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, 7); ctx.stroke();
      const rot = (v) => {
        let [x, y, z] = v;
        [x, z] = [x * cyR + z * sy, -x * sy + z * cyR];
        [y, z] = [y * cxR - z * sx, y * sx + z * cxR];
        return [x, y, z];
      };
      for (const d of shell) {
        const [x, y, z] = rot(d.v), front = (z + 1) / 2;
        if (z < -0.2 && !d.patch) continue;
        const a = d.patch ? 0.15 + front * 0.8 : d.seam ? 0.04 + front * 0.12 : 0.03 + front * 0.2;
        ctx.fillStyle = d.patch ? `rgba(${col.mint},${a})` : `rgba(${col.text},${a})`;
        const r = d.patch ? 1.6 + front * 1.4 : 0.8 + front * 0.7;
        ctx.fillRect(cx + x * R - r / 2, cy + y * R - r / 2, r, r);
      }
      proj = dots.map((d) => {
        let [x, y, z] = d.v;
        [x, z] = [x * cyR + z * sy, -x * sy + z * cyR];
        [y, z] = [y * cxR - z * sx, y * sx + z * cxR];
        return { d, x: cx + x * R, y: cy + y * R, z };
      }).sort((a, b) => a.z - b.z);
      hit = null;
      if (mouse && !drag) {
        let best = 18 * 18;
        for (const q of proj) { if (q.z < 0) continue; const dd = (q.x - mouse[0]) ** 2 + (q.y - mouse[1]) ** 2; if (dd < best) { best = dd; hit = q; } }
      }
      for (const q of proj) {
        if (q.z < -0.1) continue;  // players on the far side stay hidden behind the ball
        const front = (q.z + 0.1) / 1.1, a = 0.25 + front * 0.75, r = q.d.s * (0.6 + front * 0.5);
        ctx.fillStyle = q.d.patch ? `rgba(${col.bg},${a})` : `rgba(${col.mint},${a})`;
        if (q.d.patch) { ctx.strokeStyle = `rgba(${col.mint},${a})`; ctx.lineWidth = 1; }
        ctx.beginPath(); ctx.arc(q.x, q.y, q === hit ? r + 3 : r, 0, 7); ctx.fill();
        if (q.d.patch) ctx.stroke();
      }
      if (hit) { ctx.strokeStyle = `rgba(${col.mint},.9)`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hit.x, hit.y, hit.d.s + 8, 0, 7); ctx.stroke(); }
      if (hit !== lastHit) { lastHit = hit; setHover(hit ? { p: hit.d.p, x: hit.x, y: hit.y } : null); c.style.cursor = hit ? "pointer" : "grab"; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); theme.disconnect(); removeEventListener("resize", size);
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointerleave", leave);
    };
  }, [data, open]);
  return (
    <div className="relative aspect-square w-full select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" role="img"
        aria-label={`A football drawn with one dot for each of ${data.players.length} players, sized by predicted points`} />
      <span ref={anchor} data-pop className="pointer-events-none absolute h-0 w-0" />
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+18px)] whitespace-nowrap rounded-lg border border-line2 bg-surface/95 px-3 py-1.5 text-[13px] shadow-xl"
          style={{ left: hover.x, top: hover.y }}>
          <b className="font-medium">{hover.p.name}</b> <span className="text-text3">{hover.p.short}</span>
          <span className="num ml-2 font-mono text-mint">{hover.p.pred.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}
