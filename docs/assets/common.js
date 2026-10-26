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
  const lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
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
  els.forEach((el) => io.observe(el));
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
FPL.lineChart = (svg, series, { width = 900, height = 320, draw = true, yTitle = "" } = {}) => {
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
  FPL.load().then(fn).then(() => FPL.reveal()).catch((err) => {
    console.error(err);
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<p class="notice" style="margin-top:120px">Couldn't load the predictions (${FPL.esc(err.message)}). Refresh the page to try again.</p>`);
  });
};
