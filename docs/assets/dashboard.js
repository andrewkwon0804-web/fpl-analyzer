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
    if (name === "analysis") showSub(curSub, false);
    if (push) history.replaceState(null, "", name === "analysis" ? `#analysis-${curSub}` : `#${name}`);
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
    const W = FPL.autoW(svg), H = W < 600 ? 260 : 300, pad = { l: 40, r: 20, t: 14, b: 34 }, n = m.gw;
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

  // ---------------- analysis
  const A = data.analysis, subDrawn = {};
  let curSub = "value";
  function showSub(name, push = true) {
    curSub = name;
    document.querySelectorAll("#seg .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.sub === name));
    document.querySelectorAll(".sub-panel").forEach((p) => p.classList.toggle("on", p.id === `sub-${name}`));
    if (!subDrawn[name]) { subDrawn[name] = true; ({ value: drawValue, xg: drawXg, fdr: drawFdr, crowd: drawCrowd })[name](); }
    if (push) history.replaceState(null, "", `#analysis-${name}`);
  }
  document.querySelectorAll("#seg .chip").forEach((c) => c.addEventListener("click", () => showSub(c.dataset.sub)));
  const signed = (v, d = 2) => (v > 0 ? "+" : "") + v.toFixed(d);

  function drawValue() {
    const pts = A.value.players.map((p) => ({ x: p.price, y: p.points, color: FPL.POS_COLORS[p.pos], r: 4.5,
      tip: `${p.name} (${p.team}, ${p.pos}): ${p.points} pts at £${p.price.toFixed(1)}m` }));
    FPL.scatter(document.getElementById("value-scatter"), pts, { xLabel: "Current price (£m)", yLabel: "Points",
      xfmt: (v) => `£${v}`, guides: [{ slope: 5, label: "5 pts per £m" }, { slope: 10, label: "10 pts per £m" }] });
    document.getElementById("value-legend").innerHTML = Object.entries(FPL.POS_COLORS)
      .map(([k, c]) => `<span><i style="background:${c};border-radius:50%"></i>${k}</span>`).join("");
    const T = A.value.tiers, pos = ["GK", "DEF", "MID", "FWD"];
    let g = `<span></span>${FPL.TIERS.map((t) => `<span class="h">${t}</span>`).join("")}`;
    pos.forEach((p) => {
      g += `<span class="h" style="text-align:left;padding:12px 0">${p}</span>`;
      for (let t = 1; t <= 5; t++) {
        const r = T.find((x) => x.position === p && x.tier === t);
        g += r ? `<span class="c" style="background:rgba(94,240,176,${Math.max(0.05, (r.points_per_90 - 2.6) / 5.5).toFixed(2)})"
          title="${r.players} player-seasons, ${r.points_per_m} pts per £m">${r.points_per_90.toFixed(1)}</span>` : `<span class="c" style="color:var(--text-3)">-</span>`;
      }
    });
    document.getElementById("tier-grid").innerHTML = g;
    const mid = T.filter((r) => r.position === "MID"), lo = mid[0], hi = mid[mid.length - 1];
    document.getElementById("value-take").innerHTML = `Midfielders over £10.5m scored <b>${hi.points_per_90.toFixed(1)}</b> points per 90 against
      <b>${lo.points_per_90.toFixed(1)}</b> for those under £5m. Per £m every midfield tier lands between
      ${Math.min(...mid.map((r) => r.points_per_m)).toFixed(1)} and ${Math.max(...mid.map((r) => r.points_per_m)).toFixed(1)}, so the extra cost buys roughly proportional extra points.`;
    document.getElementById("value-best").innerHTML = A.value.best.map((p, i) => `<div class="list-row"><span><b>${i + 1}. ${FPL.esc(p.name)}</b>
      <small>${p.team} ${p.pos}, £${p.price.toFixed(1)}m, ${p.points} pts</small></span><span class="v">${p.per_m.toFixed(1)}</span></div>`).join("");
  }

  function drawXg() {
    const narrow = innerWidth < 700, hw = narrow ? 380 : 560, lw = narrow ? 170 : 270;
    const fmtRow = (p) => ({ label: p.name, value: p.diff, sub: narrow ? `${p.goals} from ${p.xg.toFixed(1)}`
      : `${p.team}, ${p.goals} goal${p.goals === 1 ? "" : "s"} from ${p.xg.toFixed(1)} xG` });
    document.getElementById("xg-over").innerHTML = FPL.hbars(A.xg.over.map((p) => ({ ...fmtRow(p), color: "#5ef0b0" })), { width: hw, labelW: lw, fmt: (v) => signed(v, 1) });
    document.getElementById("xg-under").innerHTML = FPL.hbars(A.xg.under.map((p) => ({ ...fmtRow(p), color: "#ff7a8a" })), { width: hw, labelW: lw, fmt: (v) => signed(v, 1) });
    const names = ["Well above xG", "A bit above", "On target", "A bit below", "Well below"];
    const R = A.xg.regression;
    // grouped bars around zero
    const svg = document.getElementById("xg-reg");
    const W = FPL.autoW(svg), H = 320, pad = { l: 50, r: 10, t: 20, b: 52 };
    const lim = Math.max(...R.flatMap((r) => [Math.abs(r.first_half), Math.abs(r.second_half)])) * 1.15;
    const Y = (v) => pad.t + (1 - (v + lim) / (2 * lim)) * (H - pad.t - pad.b);
    const gw = (W - pad.l - pad.r) / R.length, bw = gw * 0.28;
    let sv = `<g class="grid">${[-lim / 1.15, 0, lim / 1.15].map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join("")}</g>
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#3a4650"/>
      <g class="axis">${[-lim / 1.15, 0, lim / 1.15].map((v) => `<text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end">${signed(v, 2)}</text>`).join("")}</g>`;
    R.forEach((r, i) => {
      const cx = pad.l + gw * i + gw / 2;
      [[r.first_half, "#8a9592", -1], [r.second_half, "#5ef0b0", 1]].forEach(([v, c, side], k) => {
        const x = cx + (side < 0 ? -bw - 3 : 3), y = Math.min(Y(0), Y(v)), h = Math.max(2, Math.abs(Y(v) - Y(0)));
        sv += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${c}" data-tip="${names[r.bucket - 1]} (${r.players} players): ${k ? "GW20-38" : "GW1-19"} ${signed(v, 3)} per 90"
          style="transform-origin:${x}px ${Y(0)}px;animation:grow .8s ${i * 0.07 + k * 0.15}s cubic-bezier(.2,.7,.1,1) both"/>`;
      });
      sv += `<text x="${cx}" y="${H - 18}" text-anchor="middle" style="fill:var(--text-2);font-size:${W < 600 ? 10 : 13}px">${names[r.bucket - 1]}</text>
        <text x="${cx}" y="${H - 1}" text-anchor="middle" style="fill:var(--text-3);font-size:11px">${r.players} players</text>`;
    });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `<style>@keyframes grow{from{transform:scaleY(0)}}</style>${sv}`;
    svg.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("mousemove", (e) => FPL.tip.show(el.dataset.tip, e.clientX, e.clientY));
      el.addEventListener("mouseleave", FPL.tip.hide);
    });
    const hot = R[0], cold = R[R.length - 1];
    document.getElementById("xg-take").innerHTML = `The ${hot.players} players who beat their xG by the most in gameweeks 1-19 (<b>${signed(hot.first_half)}</b> goals per 90)
      were at <b>${signed(hot.second_half)}</b> for the rest of the season. The coldest group went from ${signed(cold.first_half)} to ${signed(cold.second_half)}.
      For comparing players, xG is a better guide to future goals than goals scored.`;
  }

  function drawFdr() {
    const F = A.fdr.points, cats = ["1", "2", "3", "4", "5"];
    const series = ["GK", "DEF", "MID", "FWD"].map((p) => ({ name: p, color: FPL.POS_COLORS[p],
      values: cats.map((c) => (F.find((r) => r.pos === p && r.fdr === +c) || {}).points ?? null) }));
    FPL.catLines(document.getElementById("fdr-lines"), cats.map((c) => `FDR ${c}`), series, { yLabel: "Avg points", fmt: (v) => v.toFixed(2) });
    const start = A.fdr.grid_start, gws = [0, 1, 2, 3, 4].map((k) => start + k);
    document.getElementById("grid-title").textContent = `Gameweeks ${start}-${start + 4}`;
    const byTeam = {};
    A.fdr.grid.forEach((r) => { (byTeam[r.team] ??= {})[r.gw] = [...(byTeam[r.team]?.[r.gw] || []), r]; });
    const teams = Object.entries(byTeam).map(([t, g]) => {
      const all = Object.values(g).flat();
      return { t, g, avg: all.reduce((s, r) => s + r.fdr, 0) / all.length };
    }).sort((a, b) => a.avg - b.avg);
    let h = `<span class="h l">Team</span>${gws.map((g) => `<span class="h">GW${g}</span>`).join("")}<span class="h">Avg</span>`;
    teams.forEach(({ t, g, avg }) => {
      h += `<span class="t">${t}</span>`;
      gws.forEach((w) => {
        const f = g[w] || [];
        h += f.length ? `<span class="c f${Math.round(f.reduce((s, r) => s + r.fdr, 0) / f.length)}" title="${f.map((r) => `${r.home ? "vs" : "at"} ${r.opp}, difficulty ${r.fdr}`).join(" and ")}">${f.map((r) => (r.home ? r.opp : r.opp.toLowerCase())).join(" + ")}</span>`
          : `<span class="c" style="color:var(--text-3)">blank</span>`;
      });
      h += `<span class="s">${avg.toFixed(1)}</span>`;
    });
    document.getElementById("heat").innerHTML = h;
    const ratio = (p) => { const r = F.filter((x) => x.pos === p); return r[0].points / r[r.length - 1].points; };
    document.getElementById("fdr-take").innerHTML = `Difficulty matters most for defenders: they average <b>${ratio("DEF").toFixed(1)} times</b> the points in their easiest
      fixtures as their hardest, against <b>${ratio("FWD").toFixed(1)} times</b> for forwards. Clean sheets depend more on the opponent than goals do, which likely explains the gap.
      ${FPL.esc(teams[0].t)} have the easiest next five gameweeks.`;
  }

  function drawCrowd() {
    const C = A.crowd, color = { "Top 10 transferred in": "#6aa8ff", "Top 10 transferred out": "#3d5f8f", "Top 10 most owned": "#5ef0b0",
      "Owned 11th-50th": "#2c8a5e", "Everyone else who played": "#3a4650" };
    document.getElementById("crowd-bars").innerHTML = FPL.hbars(C.map((r) => ({ label: r.grp, sub: `${r.n.toLocaleString("en-US")} player-weeks`, value: r.points, color: color[r.grp] })),
      { width: innerWidth < 700 ? 560 : 900, labelW: innerWidth < 700 ? 250 : 330, row: 44, fmt: (v) => `${v.toFixed(2)} pts` });
    const g = Object.fromEntries(C.map((r) => [r.grp, r.points]));
    document.getElementById("crowd-take").innerHTML = `The ten most transferred-in players averaged <b>${g["Top 10 transferred in"].toFixed(2)}</b> points that week,
      barely more than the ten most sold (<b>${g["Top 10 transferred out"].toFixed(2)}</b>). The ten most owned players averaged ${g["Top 10 most owned"].toFixed(2)}.
      On average, following transfer trends adds little, while the most-owned players score the most.`;
  }

  FPL.planner(data);

  // open the tab in the URL, or the best XI
  lookup(P[0].id);
  // open a player straight from a pop-up link (dashboard.html?player=ID#lookup)
  FPL.showPlayer = (id) => { if (data.byId[id]) { lookup(id); show("lookup"); scrollTo({ top: 0, behavior: FPL.reduced ? "auto" : "smooth" }); } };
  const wanted = +new URLSearchParams(location.search).get("player");
  if (data.byId[wanted]) lookup(wanted);
  const start = location.hash.slice(1);
  if (start.startsWith("analysis")) { const sub = start.split("-")[1]; if (["value", "xg", "fdr", "crowd"].includes(sub)) curSub = sub; }
  show(["xi", "players", "lookup", "record", "planner"].includes(start) ? start : start.startsWith("analysis") ? "analysis" : "xi", false);
});
