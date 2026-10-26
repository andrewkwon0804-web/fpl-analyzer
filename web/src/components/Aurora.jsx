// Full-page WebGL background: two slow light fields with film grain. Each section names its
// colours with data-tint and data-tint2 ("r g b"); the light drifts to them as you scroll.
// Falls back to a plain CSS glow when WebGL isn't available.
import { useEffect, useRef } from "react";
import { reduced } from "../lib/motion.js";

const FRAG = `
precision mediump float;
uniform vec2 res; uniform float t; uniform vec3 c1, c2, base; uniform float glow; uniform vec2 m; uniform float side;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*n(p); p = p*2.03 + 7.1; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / res; vec2 p = uv; p.x *= res.x / res.y;
  float s = t * 0.035;
  vec2 q = vec2(fbm(p*0.7 + s), fbm(p*0.7 - s + 3.1));
  float f = fbm(p*0.8 + q*1.4 + vec2(s*0.6, -s));
  // light pooled towards one side (side: 0 = left, 1 = right) and towards the cursor
  float pool = smoothstep(1.1, 0.0, distance(uv, vec2(mix(0.15, 0.85, side), 0.7)));
  float pool2 = smoothstep(0.9, 0.0, distance(uv, vec2(mix(0.85, 0.15, side), 0.1)));
  float cur = smoothstep(0.5, 0.0, distance(uv, m)) * 0.25;
  float a = smoothstep(0.3, 0.9, f) * pool * 1.1 + cur;
  float b = smoothstep(0.35, 0.9, fbm(p*1.1 - q + s*1.2)) * pool2 * 0.8;
  vec3 col = base + c1 * a * glow * 0.8 + c2 * b * glow * 0.7;
  col *= 1.0 - 0.35 * distance(uv, vec2(0.5)); // vignette
  col += (h(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.03; // film grain
  gl_FragColor = vec4(col, 1.0);
}`;
const VERT = "attribute vec2 v; void main(){ gl_Position = vec4(v, 0.0, 1.0); }";

const rgb = (s) => s.trim().split(/\s+/).map((x) => +x / 255);

export default function Aurora() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, gl = c.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) { c.style.background = "radial-gradient(60% 50% at 70% 40%, rgb(var(--mint) / .18), transparent 70%)"; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "v"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = Object.fromEntries(["res", "t", "c1", "c2", "base", "glow", "m", "side"].map((k) => [k, gl.getUniformLocation(prog, k)]));
    const root = () => getComputedStyle(document.documentElement);
    let cur = { c1: [0.37, 0.94, 0.69], c2: [0.42, 0.66, 1], side: 1 }, goal = { ...cur }, base = [0, 0, 0], glow = 0.35;
    const readTheme = () => { const r = root(); base = rgb(r.getPropertyValue("--bg")); glow = +r.getPropertyValue("--glow") * 1.25; };
    const pick = () => {
      const r = root(), secs = [...document.querySelectorAll("[data-tint]")];
      let el = secs[0];
      for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * 0.55) el = s;
      if (!el) return;
      const tone = (v, d) => rgb(v ? v : r.getPropertyValue(d));
      goal = { c1: tone(el.dataset.tint, "--mint"), c2: tone(el.dataset.tint2, "--sky"), side: parseFloat(el.dataset.tx || "75") / 100 };
    };
    const size = () => { const k = Math.min(devicePixelRatio || 1, 1.5) * 0.5; c.width = innerWidth * k; c.height = innerHeight * k; gl.viewport(0, 0, c.width, c.height); };
    const mouse = [0.7, 0.5], mt = [0.7, 0.5];
    const move = (e) => { mt[0] = e.clientX / innerWidth; mt[1] = 1 - e.clientY / innerHeight; };
    readTheme(); size(); pick();
    const mo = new MutationObserver(() => { readTheme(); pick(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    addEventListener("resize", size); addEventListener("scroll", pick, { passive: true }); addEventListener("pointermove", move, { passive: true });
    const late = setTimeout(pick, 900);
    let raf = 0;
    const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const frame = (now) => {
      cur = { c1: lerp(cur.c1, goal.c1, 0.02), c2: lerp(cur.c2, goal.c2, 0.02), side: cur.side + (goal.side - cur.side) * 0.015 };
      mouse[0] += (mt[0] - mouse[0]) * 0.04; mouse[1] += (mt[1] - mouse[1]) * 0.04;
      gl.uniform2f(U.res, c.width, c.height); gl.uniform1f(U.t, reduced ? 20 : now / 1000);
      gl.uniform3fv(U.c1, cur.c1); gl.uniform3fv(U.c2, cur.c2); gl.uniform3fv(U.base, base);
      gl.uniform1f(U.glow, glow); gl.uniform2f(U.m, mouse[0], mouse[1]); gl.uniform1f(U.side, cur.side);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(late); mo.disconnect();
      removeEventListener("resize", size); removeEventListener("scroll", pick); removeEventListener("pointermove", move);
    };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
