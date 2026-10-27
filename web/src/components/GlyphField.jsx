// Full-page background: a grid of small characters (digits and points), lit by slow-moving
// patches of colour. Dim cells show a dot or nothing; bright cells show denser glyphs.
// Sections set the colours with data-tint / data-tint2 ("r g b") and where the light sits
// with data-tx. WebGL; falls back to plain black.
import { useEffect, useRef } from "react";
import { reduced } from "../lib/motion.js";

const GLYPHS = " .·:-+=x*%#0123456789";

const FRAG = `
precision highp float;
uniform vec2 res; uniform float t, cell, side, zoom, n, amp; uniform vec3 c1, c2, base; uniform vec2 m; uniform sampler2D atlas;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.02 + 5.3; a *= 0.5; } return v; }
void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 id = floor(frag / cell), inCell = fract(frag / cell);
  vec2 uv = (id * cell + cell * 0.5) / res;           // sample the light once per cell
  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0) / zoom;
  float s = t * 0.04;
  vec2 q = vec2(fbm(p * 1.1 + s), fbm(p * 1.1 - s + 4.0));
  float f = fbm(p * 1.4 + q * 1.6 + vec2(0.0, -s));
  // a broad diagonal band of light, like memorable's, pinned towards one side
  vec2 c = vec2(mix(-0.55, 0.55, side), 0.08);
  float band = exp(-pow(dot(p - c, normalize(vec2(1.0, -0.55))) * 1.6, 2.0)) * smoothstep(1.6, 0.2, length(p - c));
  float light = clamp(band * (0.4 + f * 1.25) + smoothstep(0.35, 0.0, distance(uv, m)) * 0.22, 0.0, 1.0);
  light *= amp;
  // twinkle: some cells change glyph over time
  float tw = h(id + floor(t * 1.5 + h(id) * 20.0));
  float level = clamp(pow(light, 1.35) * 0.95 + (tw - 0.5) * 0.10, 0.0, 0.999);
  float g = floor(level * n);
  vec2 auv = vec2((g + inCell.x) / n, inCell.y);
  float ink = texture2D(atlas, auv).r;
  vec3 hue = mix(c2, c1, smoothstep(0.25, 0.85, f));
  // glyphs on top of a soft wash of the same colour, both fading out away from the band
  vec3 col = base + hue * ink * (0.15 + light * 1.1) * smoothstep(0.05, 0.3, light) + hue * pow(light, 2.0) * 0.28;
  gl_FragColor = vec4(col, 1.0);
}`;
const VERT = "attribute vec2 v; void main(){ gl_Position = vec4(v, 0.0, 1.0); }";
const rgb = (s) => s.trim().split(/\s+/).map((x) => +x / 255);

export default function GlyphField() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, gl = c.getContext("webgl", { antialias: false });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "v"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = Object.fromEntries(["res", "t", "cell", "side", "zoom", "n", "amp", "c1", "c2", "base", "m", "atlas"].map((k) => [k, gl.getUniformLocation(prog, k)]));

    // glyph atlas: one row of characters drawn white on black
    const N = GLYPHS.length, G = 32, a = document.createElement("canvas"); a.width = N * G; a.height = G;
    const ax = a.getContext("2d"); ax.fillStyle = "#000"; ax.fillRect(0, 0, a.width, a.height);
    ax.fillStyle = "#fff"; ax.font = `500 ${G * 0.62}px "Geist Mono", ui-monospace, monospace`; ax.textAlign = "center"; ax.textBaseline = "middle";
    [...GLYPHS].forEach((ch, i) => ax.fillText(ch, i * G + G / 2, G / 2 + 1));
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const root = () => getComputedStyle(document.documentElement);
    let cur = { c1: [0.2, 0.85, 0.6], c2: [0.15, 0.45, 0.95], side: 0.75, zoom: 1, amp: 1 }, goal = { ...cur }, base = [0, 0, 0];
    const readTheme = () => { base = rgb(root().getPropertyValue("--bg")); };
    const pick = () => {
      const secs = [...document.querySelectorAll("[data-tint]")];
      let el = secs[0];
      for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * 0.55) el = s;
      if (!el) return;
      const r = root();
      goal = { c1: rgb(el.dataset.tint || r.getPropertyValue("--mint")), c2: rgb(el.dataset.tint2 || r.getPropertyValue("--sky")),
        side: parseFloat(el.dataset.tx || "75") / 100, amp: parseFloat(el.dataset.glow ?? "0.12"), zoom: 1 + Math.min(1, scrollY / innerHeight) * 0.35 };
    };
    let dpr = 1;
    const size = () => { dpr = Math.min(devicePixelRatio || 1, 1.5); c.width = innerWidth * dpr; c.height = innerHeight * dpr; gl.viewport(0, 0, c.width, c.height); };
    const mouse = [0.7, 0.5], mt = [0.7, 0.5];
    const move = (e) => { mt[0] = e.clientX / innerWidth; mt[1] = 1 - e.clientY / innerHeight; };
    readTheme(); size(); pick();
    const mo = new MutationObserver(() => { readTheme(); pick(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    addEventListener("resize", size); addEventListener("scroll", pick, { passive: true }); addEventListener("pointermove", move, { passive: true });
    const late = setTimeout(pick, 900);
    let raf = 0;
    const lerp = (x, y, k) => x.map((v, i) => v + (y[i] - v) * k);
    let drawn = 0;
    const frame = (now) => {
      // the light moves slowly, so 30 frames a second is plenty; skip work while the tab is hidden
      if (document.hidden || now - drawn < 32) { raf = requestAnimationFrame(frame); return; }
      drawn = now;
      cur = { c1: lerp(cur.c1, goal.c1, 0.03), c2: lerp(cur.c2, goal.c2, 0.03), side: cur.side + (goal.side - cur.side) * 0.02, amp: cur.amp + (goal.amp - cur.amp) * 0.03, zoom: cur.zoom + (goal.zoom - cur.zoom) * 0.06 };
      mouse[0] += (mt[0] - mouse[0]) * 0.05; mouse[1] += (mt[1] - mouse[1]) * 0.05;
      gl.uniform2f(U.res, c.width, c.height); gl.uniform1f(U.t, reduced ? 10 : now / 1000);
      gl.uniform1f(U.cell, Math.round(10 * dpr)); gl.uniform1f(U.side, cur.side); gl.uniform1f(U.zoom, cur.zoom); gl.uniform1f(U.amp, cur.amp); gl.uniform1f(U.n, N);
      gl.uniform3fv(U.c1, cur.c1); gl.uniform3fv(U.c2, cur.c2); gl.uniform3fv(U.base, base); gl.uniform2f(U.m, mouse[0], mouse[1]);
      gl.uniform1i(U.atlas, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    document.fonts.ready.then(() => { // redraw the atlas once Geist Mono has loaded
      ax.fillStyle = "#000"; ax.fillRect(0, 0, a.width, a.height); ax.fillStyle = "#fff";
      [...GLYPHS].forEach((ch, i) => ax.fillText(ch, i * G + G / 2, G / 2 + 1));
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(late); mo.disconnect();
      removeEventListener("resize", size); removeEventListener("scroll", pick); removeEventListener("pointermove", move);
    };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
