// Dashboard: best XI, a sortable player table, player lookup and the track record.
FPL.boot((data) => {
  const m = data.meta, P = data.players;
  document.getElementById("title").textContent = `Gameweek ${m.gw}`;
  const when = m.refreshed_at ? new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  document.getElementById("meta").textContent = `${m.season}, games through GW${m.played}${when ? `, updated ${when}` : ""}`;
  document.getElementById("notice").innerHTML = FPL.notice(data);

  // ---------------- tabs
  const tabs = [...document.querySelectorAll(".tabs button")], ind = document.querySelector(".tabs .ind");
  const drawn = {};
  const moveInd = (b) => { ind.style.left = `${b.offsetLeft}px`; ind.style.width = `${b.offsetWidth}px`; };
  const show = (name, push = true) => {
    tabs.forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute("aria-selected", on);
      if (on) moveInd(b);
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("on", p.id === `tab-${name}`));
    if (name === "record" && !drawn.record) { drawn.record = true; drawRecord(); }
    if (push) history.replaceState(null, "", `#${name}`);
  };
  tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  addEventListener("resize", () => moveInd(tabs.find((b) => b.getAttribute("aria-selected") === "true")));

  // ---------------- best XI + injuries
  FPL.pitch(document.getElementById("pitch"), data);
  document.getElementById("xi-note").textContent = `The highest-predicted legal XI, budget ignored: it would cost £${m.xi_cost}m. The captain has the C, and a yellow ! means FPL has flagged the player.`;
  const hurt = P.filter((p) => p.chance !== null && p.chance < 75 && p.raw >= 2).sort((a, b) => b.raw - a.raw).slice(0, 7);
  document.getElementById("injuries").innerHTML = hurt.length ? hurt.map((p) => `<div class="inj"><span><b>${FPL.esc(p.name)}</b>
      <span style="color:var(--amber)"> ${p.chance}%</span><small>${FPL.esc(p.news)}</small></span><span class="v num">${p.raw.toFixed(1)}</span></div>`).join("")
    : '<p class="hint">No big names flagged this week.</p>';

  // ---------------- all players
  const q = document.getElementById("q"), price = document.getElementById("price"), priceVal = document.getElementById("price-val");
  const maxPrice = Math.ceil(Math.max(...P.map((p) => p.price)) * 2) / 2;
  price.max = maxPrice; price.value = maxPrice; priceVal.textContent = maxPrice.toFixed(1);
  let pos = "", sortK = "pred", sortDir = -1;
  const renderRows = () => {
    const term = q.value.trim().toLowerCase(), cap = +price.value;
    priceVal.textContent = cap.toFixed(1);
    const rows = P.filter((p) => (!pos || p.pos === pos) && p.price <= cap &&
      (!term || p.name.toLowerCase().includes(term) || p.team.toLowerCase().includes(term)))
      .sort((a, b) => {
        const x = a[sortK] ?? (sortK === "chance" ? 100 : ""), y = b[sortK] ?? (sortK === "chance" ? 100 : "");
        return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
      });
    document.getElementById("rows").innerHTML = rows.slice(0, 150).map((p) => `<tr>
      <td><a href="#lookup" data-id="${p.id}">${FPL.esc(p.name)}</a>${p.xi ? '<span class="xi">XI</span>' : ""}</td>
      <td>${FPL.esc(p.team)}</td><td>${p.pos}</td><td class="r num">£${p.price.toFixed(1)}m</td>
      <td class="r p num">${p.pred.toFixed(2)}</td><td class="r num">${p.chance === null || p.chance >= 100 ? "" : `${p.chance}%`}</td>
      <td class="news" title="${FPL.esc(p.news)}">${FPL.esc(p.news)}</td></tr>`).join("");
    document.getElementById("count").textContent = rows.length > 150
      ? `Showing the top 150 of ${rows.length} players. Search or filter to narrow it down.` : `${rows.length} players`;
  };
  q.addEventListener("input", renderRows);
  price.addEventListener("input", renderRows);
  document.querySelectorAll("#pos .chip").forEach((c) => c.addEventListener("click", () => {
    pos = c.dataset.pos;
    document.querySelectorAll("#pos .chip").forEach((x) => x.setAttribute("aria-pressed", x === c));
    renderRows();
  }));
  document.querySelectorAll("table.players th").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    sortDir = sortK === k ? -sortDir : (["name", "team", "pos", "news"].includes(k) ? 1 : -1);
    sortK = k;
    document.querySelectorAll("table.players th").forEach((x) => {
      x.classList.toggle("sorted", x === th);
      x.textContent = x.textContent.replace(/ [↑↓]$/, "") + (x === th ? (sortDir > 0 ? " ↑" : " ↓") : "");
    });
    renderRows();
  }));
  document.getElementById("rows").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-id]");
    if (!a) return;
    e.preventDefault();
    lookup(+a.dataset.id);
    show("lookup");
    scrollTo({ top: 0, behavior: FPL.reduced ? "auto" : "smooth" });
  });
  renderRows();

  // ---------------- player lookup
  const label = (p) => `${p.name} (${p.short})`;
  document.getElementById("names").innerHTML = P.map((p) => `<option value="${FPL.esc(label(p))}">`).join("");
  const who = document.getElementById("who");
  const byLabel = Object.fromEntries(P.map((p) => [label(p), p]));
  who.addEventListener("change", () => { const p = byLabel[who.value]; if (p) lookup(p.id); });

  function lookup(id) {
    const p = data.byId[id], hist = data.history[id] || [];
    who.value = label(p);
    document.getElementById("who-name").textContent = `${p.name}, ${p.team}`;
    const scored = hist.reduce((s, h) => s + h[2], 0);
    const off = hist.length ? (hist.reduce((s, h) => s + Math.abs(h[1] - h[2]), 0) / hist.length).toFixed(1) : "n/a";
    document.getElementById("who-stats").innerHTML = `
      <div class="fact"><div class="t">Gameweek ${m.gw}<span>predicted</span></div><div class="v good num">${p.pred.toFixed(1)}</div></div>
      <div class="fact"><div class="t">GW1-${m.played}<span>scored</span></div><div class="v num">${scored}</div></div>
      <div class="fact"><div class="t">Usually off by<span>per week</span></div><div class="v num">${off}</div></div>`;
    document.getElementById("who-news").textContent = p.news ? `FPL news: ${p.news}` : "";
    document.getElementById("who-next").innerHTML = `<i style="background:none;border:2px solid var(--mint);border-radius:50%"></i>Gameweek ${m.gw}`;
    playerChart(document.getElementById("who-chart"), hist, p);
  }

  function playerChart(svg, hist, p) {
    const W = 900, H = 300, pad = { l: 40, r: 20, t: 14, b: 34 }, n = m.gw;
    const top = Math.max(6, ...hist.map((h) => Math.max(h[1], h[2])), p.pred), step = niceStep(top / 3);
    const ymax = step * Math.ceil(top / step);
    const ticks = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
    const bw = (W - pad.l - pad.r) / n;
    const X = (g) => pad.l + (g - 0.5) * bw, Y = (v) => H - pad.b - (v / ymax) * (H - pad.t - pad.b);
    let s = `<g class="grid">${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join("")}</g>
      <g class="axis">${ticks.map((v) => `<text x="${pad.l - 10}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
      ${Array.from({ length: n }, (_, i) => `<text x="${X(i + 1)}" y="${H - 10}" text-anchor="middle">GW${i + 1}</text>`).join("")}</g>`;
    s += hist.map((h, i) => `<rect class="bar" x="${X(h[0]) - bw * 0.3}" width="${bw * 0.6}" y="${Y(Math.max(h[2], 0))}"
      height="${Math.abs(Y(0) - Y(h[2]))}" rx="4" fill="#2a3338" style="transform-origin:${X(h[0])}px ${Y(0)}px;
      animation:grow .7s ${i * 0.05}s cubic-bezier(.2,.7,.1,1) both" data-tip="GW${h[0]}: scored ${h[2]}, predicted ${h[1].toFixed(1)}, ${h[3]} min"/>`).join("");
    const line = hist.map((h, i) => `${i ? "L" : "M"}${X(h[0])},${Y(h[1])}`).join("");
    s += `<path class="line" d="${line}" stroke="#5ef0b0"/>`;
    s += hist.map((h) => `<circle cx="${X(h[0])}" cy="${Y(h[1])}" r="4" fill="#5ef0b0"/>`).join("");
    s += `<circle cx="${X(n)}" cy="${Y(p.pred)}" r="8" fill="none" stroke="#5ef0b0" stroke-width="2.5" data-tip="GW${n}: predicted ${p.pred.toFixed(1)}"/>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `<style>@keyframes grow{from{transform:scaleY(0)}}</style>${s}`;
    svg.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("mousemove", (e) => FPL.tip.show(el.dataset.tip, e.clientX, e.clientY));
      el.addEventListener("mouseleave", FPL.tip.hide);
    });
  }

  // ---------------- track record
  function drawRecord() {
    FPL.lineChart(document.getElementById("record-chart"), FPL.recordSeries(data), { height: 330, yTitle: "Points" });
  }
  const nice = { "MAE (regular starters)": "Closer to each starter's real score",
    "Best XI: avg points per GW": "More points from the best XI", "Captain pick: avg points": "More points from the captain" };
  const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(2);
  document.getElementById("edges").innerHTML = Object.entries(data.edges).map(([k, e]) => `<tr><td>${nice[k] || k}</td>
    <td class="n num">${sign(e.edge)}</td><td class="num">${sign(e.lo)} to ${sign(e.hi)}</td>
    <td>${e.sure ? '<span class="yes">Yes</span>' : "Not yet"}</td></tr>`).join("");
  document.getElementById("edges-note").textContent = `The range comes from resampling the ${m.played} played weeks 4,000 times. It only says yes when the whole range is above zero.`;

  // open the tab in the URL, or the best XI
  lookup(P[0].id);
  const start = location.hash.slice(1);
  show(["xi", "players", "lookup", "record"].includes(start) ? start : "xi", false);
});
