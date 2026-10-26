// Shared code for both pages: data loading, smooth scroll, scroll reveals, the pitch and charts.
const FPL = {};

FPL.load = async () => {
  const res = await fetch("data/site.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`site.json: ${res.status}`);
  const data = await res.json();
  data.byId = Object.fromEntries(data.players.map((p) => [p.id, p]));
  const m = data.meta;
  data.kickoff = m.next_gw_first_kickoff ? new Date(m.next_gw_first_kickoff) : null;
  data.stale = data.kickoff !== null && data.kickoff < new Date();
  return data;
};

FPL.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
FPL.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
FPL.fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

// Smooth scrolling (Lenis) plus anchor links that glide instead of jump.
FPL.smooth = () => {
  if (FPL.reduced || typeof Lenis === "undefined") return;
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -90 }); }
  }));
  FPL.lenis = lenis;
};

FPL.nav = () => {
  const nav = document.querySelector(".nav");
  const set = () => nav.classList.toggle("scrolled", scrollY > 30);
  addEventListener("scroll", set, { passive: true });
  set();
};

// Anything with .reveal fades up when it enters the screen. data-reveal-fn runs a hook once.
FPL.hooks = {};
FPL.reveal = (root = document) => {
  const els = root.querySelectorAll(".reveal:not(.in), [data-reveal-fn]:not([data-done])");
  if (FPL.reduced || !("IntersectionObserver" in window)) {
    els.forEach((el) => { el.classList.add("in"); FPL.runHook(el); });
    return;
  }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    FPL.runHook(e.target);
    io.unobserve(e.target);
  }), { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  // Whatever is already on screen at load shows straight away (with its stagger delay).
  els.forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight * 0.92) { el.classList.add("in"); FPL.runHook(el); }
    else io.observe(el);
  });
};
FPL.runHook = (el) => {
  const fn = el.dataset.revealFn;
  if (fn && !el.dataset.done && FPL.hooks[fn]) { el.dataset.done = "1"; FPL.hooks[fn](el); }
};

FPL.countUp = (el, to, { dur = 1400, decimals = 0, prefix = "" } = {}) => {
  if (FPL.reduced) { el.textContent = prefix + to.toFixed(decimals); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = prefix + (to * e).toFixed(decimals);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// ---------------------------------------------------------------- pitch
const PITCH_LINES = `
<svg class="lines" viewBox="0 0 100 108.7" aria-hidden="true">
  <rect class="draw" x="3" y="3" width="94" height="102.7" rx="1.5"/>
  <line class="draw" x1="3" y1="54.35" x2="97" y2="54.35"/>
  <circle class="draw" cx="50" cy="54.35" r="11"/>
  <rect class="draw" x="24" y="3" width="52" height="16"/>
  <rect class="draw" x="38" y="3" width="24" height="6"/>
  <rect class="draw" x="24" y="89.7" width="52" height="16"/>
  <rect class="draw" x="38" y="99.7" width="24" height="6"/>
</svg>`;

FPL.initials = (name) => name.replace(/^[A-Z]\./, "").slice(0, 3).toUpperCase();

FPL.pitch = (el, data, { animate = true } = {}) => {
  const xi = data.players.filter((p) => p.xi);
  const rows = ["FWD", "MID", "DEF", "GK"].map((pos) => xi.filter((p) => p.pos === pos).sort((a, b) => b.pred - a.pred));
  let n = 0;
  const html = rows.map((row) => `<div class="row">${row.map((p) => {
    const cap = p.id === data.captain;
    const flag = p.chance !== null && p.chance < 100 ? `<span class="flag" title="${FPL.esc(p.news)}">!</span>` : "";
    return `<div class="player${cap ? " cap" : ""}" style="--d:${0.35 + 0.07 * n++}s">
      <div class="shirt">${FPL.esc(p.short)}${cap ? '<span class="badge">C</span>' : ""}${flag}</div>
      <div class="nm">${FPL.esc(p.name)}</div>
      <div class="meta"><span class="pts num">${p.pred.toFixed(1)}</span> pts<span class="pr"> · £${p.price.toFixed(1)}m</span></div></div>`;
  }).join("")}</div>`).join("");
  el.innerHTML = `${PITCH_LINES}<div class="glow"></div><div class="rows">${html}</div>`;
  el.querySelectorAll(".draw").forEach((d) => {
    const len = d.getTotalLength();
    d.style.strokeDasharray = len;
    d.style.strokeDashoffset = FPL.reduced || !animate ? 0 : len;
  });
  if (!animate || FPL.reduced) el.classList.add("go");
  else requestAnimationFrame(() => setTimeout(() => el.classList.add("go"), 120));
};

// ---------------------------------------------------------------- charts
// Chart width follows the box it sits in, so text stays readable on phones.
FPL.autoW = (svg) => Math.round(Math.min(900, Math.max(360, (svg.parentElement?.clientWidth || 900) - 8)));

const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

FPL.tip = (() => {
  let el;
  return {
    show(html, x, y) {
      if (!el) { el = document.createElement("div"); el.className = "tip"; document.body.appendChild(el); }
      el.innerHTML = html; el.style.left = `${x + 14}px`; el.style.top = `${y - 10}px`; el.style.opacity = 1;
    },
    hide() { if (el) el.style.opacity = 0; },
  };
})();

function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9))));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v);
}

// series: [{name, color, points: [[gw, value], ...], label}]
FPL.lineChart = (svg, series, { width = FPL.autoW(svg), height = 320, draw = true, yTitle = "" } = {}) => {
  if (width < 600) height = Math.round(height * 0.85);
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const pad = { l: 44, r: 150, t: 16, b: 34 };
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const step = niceStep(Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) / 4);
  const ymax = step * Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) / step);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (v) => pad.l + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (width - pad.l - pad.r);
  const Y = (v) => height - pad.b - (v / ymax) * (height - pad.t - pad.b);
  const grid = svgEl("g", { class: "grid" }), axis = svgEl("g", { class: "axis" });
  for (let v = 0; v <= ymax + 1e-9; v += step) {
    grid.appendChild(svgEl("line", { x1: pad.l, x2: width - pad.r, y1: Y(v), y2: Y(v) }));
    const t = svgEl("text", { x: pad.l - 10, y: Y(v) + 4, "text-anchor": "end" }); t.textContent = Math.round(v); axis.appendChild(t);
  }
  for (let g = x0; g <= x1; g++) {
    const t = svgEl("text", { x: X(g), y: height - 10, "text-anchor": "middle" }); t.textContent = `GW${g}`; axis.appendChild(t);
  }
  if (yTitle) { const t = svgEl("text", { x: pad.l - 10, y: 6, "text-anchor": "end" }); t.textContent = yTitle; axis.appendChild(t); }
  svg.append(grid, axis);
  series.forEach((s) => {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    const path = svgEl("path", { d, class: "line", stroke: s.color });
    svg.appendChild(path);
    const len = path.getTotalLength();
    if (draw && !FPL.reduced) {
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      requestAnimationFrame(() => requestAnimationFrame(() => { path.classList.add("drawn"); path.style.strokeDashoffset = 0; }));
    }
    s.points.forEach((p, i) => {
      const c = svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 4, fill: s.color });
      if (draw && !FPL.reduced) { c.style.opacity = 0; c.style.transition = `opacity .4s ${0.3 + (i / s.points.length) * 1.5}s`;
        requestAnimationFrame(() => requestAnimationFrame(() => { c.style.opacity = 1; })); }
      const hit = svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 12, fill: "transparent" });
      hit.addEventListener("mousemove", (e) => FPL.tip.show(`<b>${FPL.esc(s.name)}</b><br>GW${p[0]}: ${p[1]} pts${s.extra ? s.extra(p) : ""}`, e.clientX, e.clientY));
      hit.addEventListener("mouseleave", FPL.tip.hide);
      svg.append(c, hit);
    });
    const last = s.points[s.points.length - 1];
    const lab = svgEl("text", { x: X(last[0]) + 12, y: Y(last[1]) + 5, fill: s.color, "font-size": 14, "font-family": "Geist, sans-serif" });
    lab.textContent = s.label ?? `${s.name} ${last[1]}`;
    if (draw && !FPL.reduced) { lab.style.opacity = 0; lab.style.transition = "opacity .5s 1.6s";
      requestAnimationFrame(() => requestAnimationFrame(() => { lab.style.opacity = 1; })); }
    svg.appendChild(lab);
  });
};

FPL.cumulative = (pairs) => { let t = 0; return pairs.map(([g, v]) => [g, (t += v)]); };

FPL.recordSeries = (data) => [
  { name: "Model", color: "#5ef0b0", points: FPL.cumulative(data.weekly.Model) },
  { name: "Simple rule", color: "#8a9592", points: FPL.cumulative(data.weekly["Season average"]) },
];

FPL.notice = (data) => data.stale
  ? `<div class="notice"><b>Heads up</b><span>Gameweek ${data.meta.gw} started on ${FPL.fmtDate(data.kickoff)}, and these picks
     only use games through gameweek ${data.meta.played}. They'll catch up on the next data refresh.</span></div>` : "";

FPL.boot = (fn) => {
  FPL.nav();
  FPL.smooth();
  FPL.fontPicker();
  FPL.load().then(fn).then(() => FPL.reveal()).catch((err) => {
    console.error(err);
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<p class="notice" style="margin-top:120px">Couldn't load the predictions (${FPL.esc(err.message)}). Refresh the page to try again.</p>`);
  });
};

// ---------------------------------------------------------------- font picker (temporary)
FPL.FONTS = [["startup", "Clean startup"], ["geo", "Techy geometric"], ["editorial", "Editorial"]];
FPL.fontPicker = () => {
  const cur = document.documentElement.dataset.font || "startup";
  const el = document.createElement("div");
  el.className = "font-pick";
  el.innerHTML = `<span>Font</span>${FPL.FONTS.map(([k, n]) => `<button data-f="${k}" aria-pressed="${k === cur}">${n}</button>`).join("")}`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.documentElement.dataset.font = b.dataset.f;
    try { localStorage.setItem("font", b.dataset.f); } catch (err) { /* private mode */ }
    el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    dispatchEvent(new Event("resize"));
  });
  document.body.appendChild(el);
};

// ---------------------------------------------------------------- character field behind the hero
// A grid of scoreboard-style characters. A slow wave runs through it and the cursor lights it up.
FPL.field = () => {
  const c = document.createElement("canvas");
  c.className = "field";
  c.setAttribute("aria-hidden", "true");
  document.body.prepend(c);
  const ctx = c.getContext("2d"), chars = " .·:-+=x*o#%@";
  const cell = 16;
  let w, h, cols, rows, dpr, mx = -999, my = -999, tx = -999, ty = -999, running = true;
  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
    ctx.font = `12px ${getComputedStyle(document.body).getPropertyValue("--mono") || "monospace"}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
  };
  size();
  addEventListener("resize", size);
  addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  const draw = (t) => {
    if (!running) return;
    mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
    const fade = Math.max(0, 1 - scrollY / (h * 0.9));
    ctx.clearRect(0, 0, w, h);
    if (fade > 0) {
      const time = t / 1000;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * cell + cell / 2, y = j * cell + cell / 2;
          const wave = Math.sin(i * 0.16 + time * 0.7) * Math.cos(j * 0.21 - time * 0.45) * 0.5 + 0.5;
          const d = Math.hypot(x - mx, y - my);
          const glow = Math.max(0, 1 - d / 190);
          const v = Math.min(1, wave * wave * 0.5 + glow * 0.95);
          if (v < 0.12) continue;
          const ch = chars[Math.min(chars.length - 1, Math.floor(v * chars.length))];
          ctx.fillStyle = glow > 0.05 ? `rgba(94,240,176,${(0.1 + glow * 0.55) * fade})` : `rgba(150,170,165,${v * 0.16 * fade})`;
          ctx.fillText(ch, x, y);
        }
      }
    }
    requestAnimationFrame(draw);
  };
  if (FPL.reduced) { tx = ty = -999; requestAnimationFrame((t) => { draw(t); running = false; }); }
  else requestAnimationFrame(draw);
};

// Gentle parallax and fade on the hero as you scroll away from it.
FPL.parallax = (sel) => {
  if (FPL.reduced) return;
  const items = [...document.querySelectorAll(sel)];
  const run = () => {
    const y = scrollY;
    items.forEach((el) => {
      const k = parseFloat(el.dataset.speed || 0.08);
      el.style.transform = `translate3d(0, ${(-y * k).toFixed(1)}px, 0)`;
    });
  };
  addEventListener("scroll", run, { passive: true });
  run();
};

// ---------------------------------------------------------------- more charts
const S = (tag, attrs) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`;

// Vertical bars: items [{label, value, color, note}]
FPL.bars = (items, { width = 420, height = 170, fmt = (v) => v.toFixed(1), max } = {}) => {
  const pad = { t: 22, b: 26 }, n = items.length, gap = 12;
  const top = max ?? Math.max(...items.map((d) => d.value)) * 1.05;
  const bw = (width - gap * (n - 1)) / n;
  return `<svg viewBox="0 0 ${width} ${height}">${items.map((d, i) => {
    const hgt = Math.max(2, (d.value / top) * (height - pad.t - pad.b)), x = i * (bw + gap), y = height - pad.b - hgt;
    return `<rect class="b" x="${x}" y="${y}" width="${bw}" height="${hgt}" rx="5" fill="${d.color}" style="--d:${0.1 + i * 0.08}s"/>
      <text class="lab" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${fmt(d.value)}</text>
      <text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle">${FPL.esc(d.label)}</text>`;
  }).join("")}</svg>`;
};

// Horizontal bars, centered on zero when values can be negative: items [{label, sub, value, color}]
FPL.hbars = (items, { width = 560, row = 30, fmt = (v) => v.toFixed(2), labelW = 150 } = {}) => {
  const lo = Math.min(0, ...items.map((d) => d.value)), hi = Math.max(0, ...items.map((d) => d.value));
  const X = (v) => labelW + ((v - lo) / (hi - lo || 1)) * (width - labelW - 56);
  const height = items.length * row + 6;
  return `<svg viewBox="0 0 ${width} ${height}">
    <line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${height}" stroke="#29333a"/>
    ${items.map((d, i) => {
      const y = i * row + 4, x0 = X(Math.min(0, d.value)), x1 = X(Math.max(0, d.value));
      return `<text x="0" y="${y + row / 2}" dominant-baseline="middle" style="fill:var(--text);font-size:13px">${FPL.esc(d.label)}<tspan dx="6" style="fill:var(--text-3);font-size:11px">${FPL.esc(d.sub || "")}</tspan></text>
        <rect class="grow-x" x="${x0}" y="${y + 5}" width="${Math.max(2, x1 - x0)}" height="${row - 12}" rx="4" fill="${d.color}"
          style="transform-origin:${X(0)}px 0;animation:growx .9s ${i * 0.05}s cubic-bezier(.2,.7,.1,1) both"/>
        <text x="${d.value >= 0 ? x1 + 8 : x0 - 8}" y="${y + row / 2}" dominant-baseline="middle" text-anchor="${d.value >= 0 ? "start" : "end"}"
          style="fill:var(--text-2);font-size:12px;font-family:var(--numf)">${fmt(d.value)}</text>`;
    }).join("")}<style>@keyframes growx{from{transform:scaleX(0)}}</style></svg>`;
};

// Scatter: points [{x, y, color, tip}], axis labels
FPL.scatter = (svg, pts, { width = FPL.autoW(svg), height = width < 600 ? 360 : 420, xLabel = "", yLabel = "", xfmt = (v) => v, guides = [] } = {}) => {
  const pad = { l: 48, r: 20, t: 16, b: 42 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const ystep = niceStep(Math.max(...ys) / 5), y1 = ystep * Math.ceil(Math.max(...ys) / ystep);
  const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (width - pad.l - pad.r);
  const Y = (v) => height - pad.b - (v / y1) * (height - pad.t - pad.b);
  let s = `<g class="grid">`;
  for (let v = 0; v <= y1 + 1e-9; v += ystep) s += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
  s += `</g><g class="axis">`;
  for (let v = 0; v <= y1 + 1e-9; v += ystep) s += `<text x="${pad.l - 10}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let v = x0; v <= x1; v++) s += `<text x="${X(v)}" y="${height - 20}" text-anchor="middle">${xfmt(v)}</text>`;
  s += `<text x="${(pad.l + width - pad.r) / 2}" y="${height - 2}" text-anchor="middle">${xLabel}</text>
        <text x="${pad.l - 10}" y="6" text-anchor="end">${yLabel}</text></g>`;
  guides.forEach((g) => {
    const xe = Math.min(x1, y1 / g.slope);
    s += `<line x1="${X(x0)}" y1="${Y(g.slope * x0)}" x2="${X(xe)}" y2="${Y(g.slope * xe)}" stroke="#3a4650" stroke-dasharray="4 5"/>
      <text x="${X(xe) - 4}" y="${Y(g.slope * xe) + 14}" text-anchor="end" style="fill:var(--text-3);font-size:11px">${g.label}</text>`;
  });
  s += pts.map((p, i) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 5}" fill="${p.color}" fill-opacity=".8" stroke="#06080a"
      data-tip="${FPL.esc(p.tip)}" style="animation:pop .5s ${Math.min(1.2, i * 0.004)}s cubic-bezier(.2,.7,.1,1) both;transform-origin:${X(p.x)}px ${Y(p.y)}px"/>`).join("");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `<style>@keyframes pop{from{transform:scale(0)}}</style>${s}`;
  svg.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => FPL.tip.show(el.dataset.tip, e.clientX, e.clientY));
    el.addEventListener("mouseleave", FPL.tip.hide);
  });
};

// Lines over categories: series [{name, color, values: [..]}], categories [..]
FPL.catLines = (svg, cats, series, { width = FPL.autoW(svg), height = width < 600 ? 300 : 320, yLabel = "", fmt = (v) => v.toFixed(1) } = {}) => {
  const pad = { l: 44, r: 90, t: 16, b: 36 };
  const all = series.flatMap((s) => s.values.filter((v) => v !== null));
  const step = niceStep(Math.max(...all) / 4), top = step * Math.ceil(Math.max(...all) / step);
  const X = (i) => pad.l + (i / (cats.length - 1)) * (width - pad.l - pad.r);
  const Y = (v) => height - pad.b - (v / top) * (height - pad.t - pad.b);
  let s = `<g class="grid">`;
  for (let v = 0; v <= top + 1e-9; v += step) s += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
  s += `</g><g class="axis">`;
  for (let v = 0; v <= top + 1e-9; v += step) s += `<text x="${pad.l - 10}" y="${Y(v) + 4}" text-anchor="end">${+v.toFixed(2)}</text>`;
  cats.forEach((c, i) => { s += `<text x="${X(i)}" y="${height - 12}" text-anchor="middle">${FPL.esc(c)}</text>`; });
  s += `<text x="${pad.l - 10}" y="6" text-anchor="end">${yLabel}</text></g>`;
  series.forEach((se) => {
    const pts = se.values.map((v, i) => [i, v]).filter((p) => p[1] !== null);
    s += `<path class="line draw-me" d="${pts.map((p, k) => `${k ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join("")}" stroke="${se.color}"/>`;
    s += pts.map((p) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="4.5" fill="${se.color}" data-tip="${FPL.esc(se.name)}, ${FPL.esc(cats[p[0]])}: ${fmt(p[1])}"/>`).join("");
    const last = pts[pts.length - 1];
    s += `<text x="${X(last[0]) + 12}" y="${Y(last[1]) + 5}" fill="${se.color}" style="font-size:13px">${FPL.esc(se.name)}</text>`;
  });
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = s;
  svg.querySelectorAll("path.draw-me").forEach((p) => {
    if (FPL.reduced) return;
    const len = p.getTotalLength();
    p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    requestAnimationFrame(() => requestAnimationFrame(() => { p.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.2,.7,.1,1)"; p.style.strokeDashoffset = 0; }));
  });
  svg.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => FPL.tip.show(el.dataset.tip, e.clientX, e.clientY));
    el.addEventListener("mouseleave", FPL.tip.hide);
  });
};

FPL.POS_COLORS = { GK: "#f5c451", DEF: "#6aa8ff", MID: "#5ef0b0", FWD: "#ff7a8a" };
FPL.TIERS = ["Under £5m", "£5-6.5m", "£6.5-8.5m", "£8.5-10.5m", "£10.5m+"];
