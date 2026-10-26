// The full-screen canvas behind the page. Each section names a scene with data-scene and a
// glow colour with data-tint; the background crossfades as sections reach mid-screen.
// Add a scene by adding a function to SCENES: (ctx, w, h, t, mouse, alpha, state, rgb) => void.
import { useEffect, useRef } from "react";
import { reduced } from "../lib/motion.js";

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(`--${v}`).trim().split(/\s+/).map(Number);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, a).toFixed(3)})`;

const SCENES = {
  // Faint dust that drifts and parts around the cursor.
  dust(ctx, w, h, t, m, alpha, st, col) {
    if (!st.dust || st.w !== w || st.h !== h) {
      st.w = w; st.h = h;
      st.dust = Array.from({ length: w < 700 ? 140 : 300 }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, s: Math.random() }));
    }
    for (const d of st.dust) {
      d.vx += Math.sin(t * 0.3 + d.s * 20) * 0.01; d.vy += Math.cos(t * 0.25 + d.s * 30) * 0.01 - 0.004;
      const dx = d.x - m.x, dy = d.y - m.y, dd = Math.hypot(dx, dy);
      if (dd < 110) { d.vx += (dx / dd) * 0.9; d.vy += (dy / dd) * 0.9; }
      d.vx *= 0.9; d.vy *= 0.9; d.x = (d.x + d.vx + w) % w; d.y = (d.y + d.vy + h) % h;
      ctx.fillStyle = rgba(col.mint, (0.12 + d.s * 0.25) * alpha);
      ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
    }
  },
  // A pitch floor in perspective, rolling towards you.
  floor(ctx, w, h, t, m, alpha, st, col) {
    const vx = w / 2 + (m.x - w / 2) * 0.05, hz = h * 0.38;
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const z = ((i + t * 0.35) % 22) / 22, y = hz + (h - hz) * Math.pow(z, 2.3);
      ctx.strokeStyle = rgba(col.mint, 0.2 * z * alpha); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let j = -14; j <= 14; j++) {
      ctx.strokeStyle = rgba(col.mint, (j === 0 ? 0.2 : 0.09) * alpha);
      ctx.beginPath(); ctx.moveTo(vx + j * w * 0.012, hz); ctx.lineTo(vx + j * w * 0.11, h); ctx.stroke();
    }
  },
  // Flowing lines, like stacked running-total charts.
  flow(ctx, w, h, t, m, alpha, st, col) {
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) {
      const base = h * (0.1 + i * 0.055);
      ctx.strokeStyle = rgba(i % 3 ? col.sky : col.mint, (0.06 + (i % 4) * 0.02) * alpha);
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 18) {
        let y = base + Math.sin(x * 0.0035 + t * 0.45 + i * 0.8) * 34 + Math.sin(x * 0.011 - t * 0.3 + i * 1.7) * 10;
        y += (y > m.y ? 1 : -1) * 60 * Math.exp(-((x - m.x) ** 2 + (y - m.y) ** 2) / 26000);
        x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
  // Points that join up when close, like a passing network.
  network(ctx, w, h, t, m, alpha, st, col) {
    if (!st.net || st.nw !== w) {
      st.nw = w;
      st.net = Array.from({ length: Math.round((w * h) / 17000) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25 }));
    }
    const P = st.net;
    for (const p of P) { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; }
    ctx.lineWidth = 1;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y);
      if (d < 120) { ctx.strokeStyle = rgba(col.sky, (1 - d / 120) * 0.15 * alpha); ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
    }
    for (const p of P) { ctx.fillStyle = rgba(col.sky, 0.45 * alpha); ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
  },
  none() {},
};

export default function Stage() {
  const canvas = useRef(null), tint = useRef(null);
  useEffect(() => {
    const c = canvas.current, ctx = c.getContext("2d");
    const mouse = { x: -999, y: -999 }, target = { x: -999, y: -999 }, state = {};
    let w, h, cur = "dust", prev = null, k = 1, last = performance.now(), raf = 0, col = {};
    const colours = () => { col = { mint: css("mint"), sky: css("sky") }; };
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const pick = () => {
      const secs = [...document.querySelectorAll("[data-scene]")];
      let el = secs[0];
      for (const s of secs) if (s.getBoundingClientRect().top < h * 0.55) el = s;
      if (!el) return;
      tint.current.style.setProperty("--tc", `rgb(${el.dataset.tint || "var(--mint)"} / ${getComputedStyle(document.documentElement).getPropertyValue("--glow")})`);
      tint.current.style.setProperty("--tx", el.dataset.tx || "75%");
      if (el.dataset.scene !== cur) { prev = cur; cur = el.dataset.scene; k = 0; }
    };
    const onMove = (e) => { target.x = e.clientX; target.y = e.clientY; };
    colours(); size(); pick();
    const theme = new MutationObserver(() => { colours(); pick(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    addEventListener("resize", size); addEventListener("scroll", pick, { passive: true }); addEventListener("pointermove", onMove, { passive: true });
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const frame = (now) => {
      const dt = Math.min(64, now - last); last = now;
      mouse.x += (target.x - mouse.x) * 0.08; mouse.y += (target.y - mouse.y) * 0.08;
      if (k < 1) k = Math.min(1, k + dt / 1100);
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      if (prev && k < 1) (SCENES[prev] || SCENES.none)(ctx, w, h, t, mouse, 1 - ease(k), state, col);
      (SCENES[cur] || SCENES.none)(ctx, w, h, t, mouse, ease(k), state, col);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // keep the scene in step with new sections after data loads
    const late = setTimeout(pick, 800);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(late); theme.disconnect();
      removeEventListener("resize", size); removeEventListener("scroll", pick); removeEventListener("pointermove", onMove);
    };
  }, []);
  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
      <div ref={tint} aria-hidden className="tint pointer-events-none fixed inset-0 z-0" />
    </>
  );
}
