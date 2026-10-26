// Shared code for both pages: data loading, smooth scroll, scroll reveals, the pitch and charts.
const FPL = { afterLoad: [] };

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
  const links = nav.querySelector(".nav-links");
  if (links) {
    const btn = document.createElement("button");
    btn.className = "menu-btn"; btn.setAttribute("aria-label", "Menu"); btn.setAttribute("aria-expanded", "false"); btn.innerHTML = "<i></i>";
    nav.querySelector(".nav-right").appendChild(btn);
    const menu = document.createElement("nav");
    menu.className = "menu"; menu.setAttribute("aria-label", "Menu");
    const dash = links.querySelector('a[href="dashboard.html"]') ? "" : '<a href="dashboard.html">Dashboard</a>';
    menu.innerHTML = links.innerHTML + dash + '<a href="https://github.com/andrewkwon0804-web/fpl-analyzer">GitHub</a>';
    nav.appendChild(menu);
    const toggle = (open) => { nav.classList.toggle("open", open); btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", () => toggle(!nav.classList.contains("open")));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) toggle(false); });
  }
  const set = () => nav.classList.toggle("scrolled", scrollY > 30);
  addEventListener("scroll", set, { passive: true });
  set();
};

// Anything with .reveal fades up when it enters the screen. data-reveal-fn runs a hook once.
FPL.hooks = {};
FPL.reveal = (root = document) => {
  const els = [...root.querySelectorAll(".reveal:not(.in), [data-reveal-fn]:not([data-done])")];
  const show = (el) => { el.classList.add("in"); FPL.runHook(el); };
  if (FPL.reduced) { els.forEach(show); return; }
  // A plain position check rather than IntersectionObserver: clipped cards have no visible
  // area until they're revealed, so an observer would never see them.
  let pending = els, queued = false;
  const check = () => {
    queued = false;
    const line = innerHeight * 0.9;
    pending = pending.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < line && r.bottom > 0) { show(el); return false; }
      return true;
    });
    if (!pending.length) removeEventListener("scroll", onScroll);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  check();
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
    return `<div class="player${cap ? " cap" : ""}" data-pid="${p.id}" tabindex="0" role="button" aria-label="${FPL.esc(p.name)}, details" style="--d:${0.35 + 0.07 * n++}s">
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
  ? `<div class="notice"><b>Note</b><span>Gameweek ${data.meta.gw} started on ${FPL.fmtDate(data.kickoff)}, and these picks
     only use games through gameweek ${data.meta.played}. They'll catch up on the next data refresh.</span></div>` : "";

// ---------------------------------------------------------------- player pop-up
// Click (or press Enter on) any element with data-pid to see that player's next five
// gameweeks, price, injury news and a link to his full record on the dashboard.
FPL.popover = (data) => {
  const fixtures = {};
  data.analysis.fdr.grid.forEach((r) => { (fixtures[r.team] ??= {})[r.gw] = [...(fixtures[r.team]?.[r.gw] || []), r]; });
  const start = data.analysis.fdr.grid_start;
  const gws = data.meta.horizon_gws.filter((g) => g >= start).slice(0, 5);
  const pop = document.createElement("div");
  pop.className = "pop"; pop.setAttribute("role", "dialog"); pop.hidden = true;
  document.body.appendChild(pop);
  let anchor = null;
  const close = () => { pop.hidden = true; pop.classList.remove("on"); anchor = null; if (FPL.onPopClose) FPL.onPopClose(); };
  const place = () => {
    if (!anchor || innerWidth < 640) return;  // phones: CSS pins it to the bottom
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 10;
    if (y + h > innerHeight - 12) y = r.top - h - 10;
    x = Math.max(12, Math.min(innerWidth - w - 12, x));
    pop.style.left = `${x}px`; pop.style.top = `${Math.max(12, y)}px`;
  };
  const open = (el, note = "") => {
    const p = data.byId[+el.dataset.pid];
    if (!p) return;
    if (anchor === el && !note) { close(); return; }
    anchor = el;
    const pts = Object.fromEntries(p.h.map(([g, v]) => [g, v]));
    const top = Math.max(1, ...gws.map((g) => pts[g] || 0));
    const total = gws.reduce((s, g) => s + (pts[g] || 0), 0);
    const weeks = gws.map((g) => {
      const f = (fixtures[p.short] || {})[g] || [];
      const opp = f.length ? f.map((r) => (r.home ? r.opp : r.opp.toLowerCase())).join("+") : "blank";
      const fdr = f.length ? Math.round(f.reduce((s, r) => s + r.fdr, 0) / f.length) : 0;
      const v = pts[g] || 0;
      return `<div class="wk"><span class="v num">${v.toFixed(1)}</span><i style="height:${Math.max(3, (v / top) * 44)}px"></i>
        <span class="o ${fdr ? `f${fdr}` : ""}">${FPL.esc(opp)}</span><small>GW${g}</small></div>`;
    }).join("");
    const flag = p.chance !== null && p.chance < 100
      ? `<p class="pop-news"><b>${p.chance}% to play.</b> ${FPL.esc(p.news)}</p>` : "";
    const here = location.pathname.endsWith("dashboard.html");
    pop.innerHTML = `<button class="pop-x" aria-label="Close">×</button>
      <div class="pop-head"><div><h4>${FPL.esc(p.name)}</h4><span>${FPL.esc(p.team)}, ${p.pos}, £${p.price.toFixed(1)}m</span></div>
        <div class="pop-now"><b class="num">${p.pred.toFixed(1)}</b><span>GW${data.meta.gw}</span></div></div>
      ${flag}${note ? `<p class="pop-note">${note}</p>` : ""}
      <div class="pop-sub">Next five gameweeks<span class="num">${total.toFixed(1)} pts</span></div>
      <div class="pop-weeks">${weeks}</div>
      <a class="pop-link" href="dashboard.html?player=${p.id}#lookup" ${here ? 'data-here="1"' : ""}>Full record and chart ›</a>`;
    pop.hidden = false;
    requestAnimationFrame(() => { place(); pop.classList.add("on"); });
  };
  FPL.openPop = open;
  FPL.onPopClose = null;
  document.addEventListener("click", (e) => {
    if (e.target.closest(".pop-x")) { close(); return; }
    const link = e.target.closest(".pop-link[data-here]");
    if (link) { e.preventDefault(); close(); FPL.showPlayer?.(+new URL(link.href).searchParams.get("player")); return; }
    const el = e.target.closest("[data-pid]");
    if (el) { open(el); return; }
    if (!e.target.closest(".pop, .finder")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && e.target.matches?.("[data-pid]")) open(e.target);
  });
  addEventListener("scroll", () => { if (innerWidth >= 640) place(); }, { passive: true });
  addEventListener("resize", place);
};

FPL.boot = (fn) => {
  FPL.nav();
  FPL.smooth();
  FPL.stage();
  if (FPL.fxInit) FPL.fxInit();
  FPL.split();
  FPL.load().then((d) => { fn(d); FPL.popover(d); FPL.afterLoad.forEach((f) => f(d)); return d; }).then((d) => { FPL.split(); FPL.reveal(); if (FPL.fxAfter) FPL.fxAfter(d); }).catch((err) => {
    console.error(err);
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<p class="notice" style="margin-top:120px">Couldn't load the predictions (${FPL.esc(err.message)}). Refresh the page to try again.</p>`);
  });
};

// ---------------------------------------------------------------- scroll scenes
// One full-screen canvas sits behind the page. Each section names a scene with data-scene
// (and a glow colour with data-tint). As a section reaches the middle of the screen the
// background crossfades to its scene. To add a scene, add a function to FPL.scenes:
//   (ctx, w, h, t, mouse, alpha, state) => void      t is seconds, alpha is 0-1
FPL.scenes = {};
const MINT = [94, 240, 176], SKY = [106, 168, 255], AMBER = [245, 196, 81];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

// Scoreboard characters with a slow wave; the cursor lights them up.
FPL.scenes.chars = (ctx, w, h, t, m, base) => {
  let alpha = base;
  const chars = " .·:-+=x*o#%@", cell = 18;
  ctx.font = "12px JetBrains Mono, monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let y = cell / 2; y < h; y += cell) {
    for (let x = cell / 2; x < w; x += cell) {
      const wave = Math.sin(x * 0.009 + t * 0.7) * Math.cos(y * 0.012 - t * 0.45) * 0.5 + 0.5;
      const glow = Math.max(0, 1 - Math.hypot(x - m.x, y - m.y) / 220);
      const v = Math.min(1, wave * wave * 0.5 + glow * 0.95);
      if (v < 0.12) continue;
      // fade out over the left side, where the headline and text sit
      const side = FPL.loud ? 1 : w > 900 ? Math.min(1, Math.max(0.08, (x - w * 0.4) / (w * 0.3))) : 0.35;
      alpha = base * side;
      ctx.fillStyle = glow > 0.05 ? rgba(MINT, (0.1 + glow * 0.55) * alpha) : `rgba(150,170,165,${(v * 0.15 * alpha).toFixed(3)})`;
      ctx.fillText(chars[Math.min(chars.length - 1, Math.floor(v * chars.length))], x, y);
    }
  }
};

// A pitch floor in perspective, rolling towards you. The cursor shifts the vanishing point.
FPL.scenes.pitch = (ctx, w, h, t, m, alpha) => {
  const vx = w / 2 + (m.x - w / 2) * 0.05, horizon = h * 0.38 + (m.y - h / 2) * 0.03;
  ctx.lineWidth = 1;
  const N = 22;
  for (let i = 0; i < N; i++) {
    const z = ((i + t * 0.35) % N) / N, y = horizon + (h - horizon) * Math.pow(z, 2.3);
    ctx.strokeStyle = rgba(MINT, 0.22 * z * alpha);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let j = -14; j <= 14; j++) {
    ctx.strokeStyle = rgba(MINT, (j === 0 ? 0.22 : 0.1) * alpha);
    ctx.beginPath(); ctx.moveTo(vx + j * w * 0.012, horizon); ctx.lineTo(vx + j * w * 0.11, h); ctx.stroke();
  }
  // centre circle laid on the floor
  ctx.strokeStyle = rgba(MINT, 0.18 * alpha);
  ctx.beginPath(); ctx.ellipse(vx, horizon + (h - horizon) * 0.55, w * 0.16, h * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
  const fade = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 120);
  fade.addColorStop(0, "rgba(6,8,10,1)"); fade.addColorStop(1, "rgba(6,8,10,0)");
  ctx.fillStyle = fade; ctx.fillRect(0, horizon - 40, w, 160);
};

// Flowing lines, like a stack of running-total charts. They bend away from the cursor.
FPL.scenes.flow = (ctx, w, h, t, m, alpha) => {
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    const base = h * (0.1 + i * 0.055), col = i % 3 === 0 ? MINT : SKY;
    ctx.strokeStyle = rgba(col, (0.07 + (i % 4) * 0.025) * alpha);
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 18) {
      let y = base + Math.sin(x * 0.0035 + t * 0.45 + i * 0.8) * 34 + Math.sin(x * 0.011 - t * 0.3 + i * 1.7) * 10;
      const d = (x - m.x) ** 2 + (y - m.y) ** 2;
      y += (y > m.y ? 1 : -1) * 60 * Math.exp(-d / 26000);
      x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

// Drifting points that join up when close, like a passing network.
FPL.scenes.stars = (ctx, w, h, t, m, alpha, st) => {
  if (!st.pts || st.w !== w) {
    st.w = w;
    st.pts = Array.from({ length: Math.round((w * h) / 16000) }, () => ({
      x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25 }));
  }
  const P = st.pts;
  for (const p of P) {
    const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
    if (d < 200) { p.vx += (dx / d) * 0.012; p.vy += (dy / d) * 0.012; }
    p.vx *= 0.99; p.vy *= 0.99;
    p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < P.length; i++) {
    for (let j = i + 1; j < P.length; j++) {
      const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y);
      if (d < 120) { ctx.strokeStyle = rgba(SKY, (1 - d / 120) * 0.16 * alpha); ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
    }
  }
  for (const p of P) { ctx.fillStyle = rgba(SKY, 0.5 * alpha); ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
};

// Rising bars along the bottom, like a gameweek points table filling up.
FPL.scenes.rise = (ctx, w, h, t, m, alpha) => {
  const bw = 26, gap = 10;
  for (let i = 0, x = 0; x < w; i++, x += bw + gap) {
    const n = Math.sin(i * 0.7 + t * 0.9) * 0.5 + Math.sin(i * 0.23 - t * 0.5) * 0.5;
    const near = Math.max(0, 1 - Math.abs(x - m.x) / 260);
    const bh = h * (0.08 + 0.14 * (n * 0.5 + 0.5) + 0.14 * near);
    const g = ctx.createLinearGradient(0, h - bh, 0, h);
    g.addColorStop(0, rgba(MINT, (0.08 + near * 0.12) * alpha)); g.addColorStop(1, rgba(MINT, 0));
    ctx.fillStyle = g; ctx.fillRect(x, h - bh, bw, bh);
  }
};

FPL.scenes.none = () => {};

FPL.stage = () => {
  const c = document.createElement("canvas");
  c.className = "field"; c.setAttribute("aria-hidden", "true");
  const tint = document.createElement("div");
  tint.className = "tint"; tint.setAttribute("aria-hidden", "true");
  document.body.prepend(c, tint);
  const ctx = c.getContext("2d");
  const sections = [...document.querySelectorAll("[data-scene]")];
  const mouse = { x: -999, y: -999 }, target = { x: -999, y: -999 }, state = {};
  let w, h, cur = sections[0]?.dataset.scene || "chars", prev = null, k = 1, last = performance.now(), dirty = true;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = true;
  };
  const pick = () => {
    let el = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top < h * 0.55) el = s;
    if (!el) return;
    const tc = el.dataset.tint || "94,240,176";
    tint.style.setProperty("--tc", `rgba(${tc},.11)`);
    tint.style.setProperty("--tx", el.dataset.tx || "75%");
    if (el.dataset.scene !== cur) { prev = cur; cur = el.dataset.scene; k = 0; dirty = true; }
  };
  size(); pick();
  addEventListener("resize", size);
  addEventListener("scroll", pick, { passive: true });
  addEventListener("pointermove", (e) => { target.x = e.clientX; target.y = e.clientY; }, { passive: true });
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const frame = (now) => {
    const dt = Math.min(64, now - last); last = now;
    mouse.x += (target.x - mouse.x) * 0.08; mouse.y += (target.y - mouse.y) * 0.08;
    if (k < 1) k = Math.min(1, k + dt / 1100);
    ctx.clearRect(0, 0, w, h);
    const t = now / 1000;
    const q = FPL.loud ? 1.25 : 0.75;  // overall strength of the background (loud mode turns it up)
    if (prev && k < 1) (FPL.scenes[prev] || FPL.scenes.none)(ctx, w, h, t, mouse, q * (1 - ease(k)), state);
    (FPL.scenes[cur] || FPL.scenes.none)(ctx, w, h, t, mouse, q * ease(k), state);
    if (!FPL.reduced) requestAnimationFrame(frame);
  };
  if (FPL.reduced) {
    const still = () => { if (dirty) { k = 1; frame(performance.now()); dirty = false; } };
    addEventListener("scroll", still, { passive: true }); addEventListener("resize", still); still();
  } else requestAnimationFrame(frame);
};

// ---------------------------------------------------------------- transitions
// Headings rise in word by word from behind a mask.
FPL.split = (root = document) => {
  root.querySelectorAll("[data-split]:not(.split)").forEach((el) => {
    let i = 0;
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement("span"); w.className = "w";
          const inner = document.createElement("span"); inner.textContent = part; inner.style.setProperty("--i", i++);
          w.append(inner); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.classList.contains("gw")) walk(n);
    });
    walk(el);
    el.classList.add("split");
  });
};

// Cards lean towards the cursor.
FPL.tilt = (sel) => {
  if (FPL.reduced || matchMedia("(hover: none)").matches) return;
  document.querySelectorAll(sel).forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`); el.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`); el.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
  });
};

// A thin bar at the top that fills as you scroll.
FPL.progress = () => {
  const bar = document.createElement("div"); bar.className = "progress"; document.body.appendChild(bar);
  const set = () => { const max = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`; };
  addEventListener("scroll", set, { passive: true }); set();
};

// A row of cards that drifts on its own and pauses under the cursor.
FPL.marquee = (track) => {
  let x = 0, boost = 0, lastY = scrollY, paused = false;
  track.addEventListener("pointerenter", () => { paused = true; });
  track.addEventListener("pointerleave", () => { paused = false; });
  const step = () => {
    const dy = Math.abs(scrollY - lastY); lastY = scrollY;
    if (!paused) x -= 0.45 + boost;
    const half = track.scrollWidth / 2;
    if (-x >= half) x += half;
    track.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(step);
  };
  if (!FPL.reduced) requestAnimationFrame(step);
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
  const room = lo < 0 ? 50 : 0;  // space for the value label left of negative bars
  const X = (v) => labelW + room + ((v - lo) / (hi - lo || 1)) * (width - labelW - room - 56);
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
