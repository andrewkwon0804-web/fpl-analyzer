// Home page: fills the hero, track record and this week's picks from site.json.
FPL.parallax(".hero-pitch");
FPL.boot((data) => {
  const m = data.meta, gw = m.gw, A = data.analysis;
  const pill = document.getElementById("pill");
  document.getElementById("hero-gw").textContent = `gameweek ${gw}`;
  document.getElementById("pill-text").textContent = data.stale
    ? `Gameweek ${gw} picks, using games through GW${m.played}` : `Gameweek ${gw} picks are live`;
  if (data.stale) pill.classList.add("warn");
  document.getElementById("notice").innerHTML = FPL.notice(data);
  FPL.pitch(document.getElementById("pitch"), data);

  // last gameweek: what the model's XI actually scored
  const L = data.last_gw;
  if (L) {
    document.getElementById("last-title").textContent = `Gameweek ${L.gw} result`;
    const diff = L.model - (L.rule ?? L.model);
    const vs = L.rule === null ? "" : diff > 0 ? `, ${diff} more than the simple rule's XI` : diff < 0 ? `, ${-diff} fewer than the simple rule's XI` : ", the same as the simple rule's XI";
    document.getElementById("last-sub").textContent = `The model's best XI scored ${L.model} points${vs}. The best possible XI, picked with hindsight, scored ${L.best}. `
      + `Captain ${L.captain.name} was predicted ${L.captain.pred} and scored ${L.captain.points}, doubled to ${L.captain.points * 2}.`;
    const cells = [["model", "Model's XI", L.model, "var(--mint)", "captain doubled"],
      ["", "Simple rule's XI", L.rule, "#8a9592", "best average so far"],
      ["", "Best possible XI", L.best, "#3a4650", "picked with hindsight"]];
    if (L.fpl_average !== undefined) cells.push(["", "Average FPL manager", L.fpl_average, "#6aa8ff", `highest was ${L.fpl_highest}`]);
    const res = document.getElementById("last-result");
    res.style.setProperty("--cols", cells.length);
    res.innerHTML = cells.filter((c) => c[2] !== null).map(([cls, lbl, v, col, note]) =>
      `<div class="${cls}"><div class="lbl"><i style="background:${col}"></i>${lbl}</div><div class="big-n num" data-to="${v}">0</div><small>${note}</small></div>`).join("");
    res.dataset.revealFn = "lastCount";
    FPL.hooks.lastCount = (el) => el.querySelectorAll("[data-to]").forEach((n) => FPL.countUp(n, +n.dataset.to));
    const top = Math.max(...L.team.map((p) => Math.max(p.points, p.pred)), 1);
    document.getElementById("last-xi").innerHTML = L.team.map((p, i) => `<div class="p" title="${FPL.esc(p.name)}: predicted ${p.pred}, scored ${p.points}${p.cap ? " (captain)" : ""}">
      <div class="bars"><span class="pr" style="height:${(p.pred / top) * 100}%;--d:${0.2 + i * 0.05}s"></span><span class="ac" style="height:${Math.max(2, (p.points / top) * 100)}%;--d:${0.3 + i * 0.05}s"></span></div>
      <div class="nm">${FPL.esc(p.name)}${p.cap ? " <b>C</b>" : ""}</div><div class="sc">${p.pred} / ${p.points}</div></div>`).join("");
  }

  // track record
  const total = (k) => (data.weekly[k] || []).reduce((s, [, v]) => s + v, 0);
  document.getElementById("record-sub").insertAdjacentHTML("beforeend",
    ` Through gameweek ${m.played}, here's how they've done.`);
  FPL.hooks.count = (el) => FPL.countUp(el.querySelector(".val"), total(el.dataset.key));
  FPL.hooks.record = () => FPL.lineChart(document.getElementById("record-chart"), FPL.recordSeries(data),
    { height: 330, yTitle: "Points" });
  const xi = data.edges["Best XI: avg points per GW"], mae = data.edges["MAE (regular starters)"];
  const fmt = (v) => (v > 0 ? "+" : "") + Math.round(v);
  document.getElementById("facts").innerHTML = `
    <div class="fact reveal clip"><div class="t">Last season<span>never seen in training</span></div>
      <div class="v good num">+${data.last_season_edge}</div><p>points over all of 2025-26 for the model's team compared with the simple rule.</p></div>
    <div class="fact reveal clip" style="--d:.08s"><div class="t">This season<span>${xi.sure ? "clear" : "too early to say"}</span></div>
      <div class="v num">${fmt(xi.edge)}</div><p>points a week so far. With ${m.played} weeks of data the real gap could be anywhere from ${fmt(xi.lo)} to ${fmt(xi.hi)}.</p></div>
    <div class="fact reveal clip" style="--d:.16s"><div class="t">Per player<span>${mae.sure ? "clear" : "not yet"}</span></div>
      <div class="v num">${mae.edge.toFixed(2)}</div><p>points closer, on average, to what each regular starter actually scores.</p></div>`;

  // this week marquee (list twice so the loop is seamless)
  document.getElementById("picks-title").textContent = `Top predicted players, gameweek ${gw}`;
  const top = data.players.slice(0, 14);
  const cards = top.map((p, i) => `<div class="pcard" data-pid="${p.id}" role="button" tabindex="0"><div class="rk"><span>#${i + 1}</span><span>${p.pos}</span></div>
    <div class="nm">${FPL.esc(p.name)}</div><div class="tm">${FPL.esc(p.team)}</div>
    <div class="row"><span class="pp num">${p.pred.toFixed(1)}</span><span class="pr num">£${p.price.toFixed(1)}m</span></div></div>`).join("");
  document.getElementById("marquee-track").innerHTML = cards + cards.replaceAll('class="pcard"', 'class="pcard" aria-hidden="true"');
  FPL.marquee(document.getElementById("marquee-track"));

  document.getElementById("closing-title").textContent = `Gameweek ${gw} predictions`;
  const when = m.refreshed_at ? new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  document.getElementById("foot-data").textContent = `Data from the ${m.source || "open FPL archive"}${when ? `, updated ${when}` : ""}`;

  // terminal: a pipeline run, typed out when it scrolls into view
  const lines = [
    ["$ python run_pipeline.py", ""],
    ["[ingest] 2022-23 to 2025-26 from the open archive", "dim"],
    [`[ingest] ${m.season} from the official FPL API, GW1-${m.played}`, "dim"],
    [`[load]   ${A.rows.toLocaleString("en-US")} player-match rows into SQLite`, "dim"],
    ["[sql]    rolling features, every window ends 1 PRECEDING", "dim"],
    [`[test]   2025-26 held out: best XI +${data.last_season_edge} pts vs the simple rule`, "ok"],
    [`[live]   GW${gw} predictions for ${data.players.length} players`, "ok"],
    ["[site]   docs/data/site.json written", "dim"],
  ];
  FPL.hooks.terminal = () => {
    const pre = document.getElementById("term");
    if (FPL.reduced) { pre.innerHTML = lines.map(([t, c]) => `<span class="${c}">${FPL.esc(t)}</span>`).join("\n"); return; }
    let li = 0, ci = 0, done = "";
    const tick = () => {
      const [t, c] = lines[li];
      ci += li === 0 ? 1 : 3;
      const cur = `<span class="${c}">${FPL.esc(t.slice(0, ci))}</span>`;
      pre.innerHTML = done + cur + '<span class="cursor"></span>';
      if (ci >= t.length) { done += `<span class="${c}">${FPL.esc(t)}</span>\n`; li++; ci = 0; }
      if (li < lines.length) setTimeout(tick, ci === 0 ? (li === 1 ? 420 : 160) : (li === 0 ? 45 : 12));
      else pre.innerHTML = done + '<span class="cursor"></span>';
    };
    tick();
  };

  // findings bento, each card a small chart from the SQL results
  const def = A.fdr.points.filter((r) => r.pos === "DEF");
  const easy = def[0], hard = def[def.length - 1];
  const fdrColor = { 1: "#1f7a52", 2: "#2c8a5e", 3: "#3a4650", 4: "#8a4a50", 5: "#a8394a" };
  const hot = A.xg.regression[0], cold = A.xg.regression[A.xg.regression.length - 1];
  const mid = A.value.tiers.filter((r) => r.position === "MID");
  const crowd = Object.fromEntries(A.crowd.map((r) => [r.grp, r.points]));
  document.getElementById("bento").innerHTML = `
    <a class="find wide reveal clip" href="dashboard.html#analysis-fdr">
      <h3>Defenders average ${easy.points.toFixed(1)} points in the easiest fixtures and ${hard.points.toFixed(1)} in the hardest</h3>
      <p>Average points for defenders who played 60+ minutes, by FPL's difficulty rating for that match.</p>
      <div class="viz">${FPL.bars(def.map((r) => ({ label: `FDR ${r.fdr}`, value: r.points, color: fdrColor[r.fdr] })), { width: 560, height: 170 })}</div>
      <span class="go">See every team's next five fixtures ›</span></a>
    <a class="find narrow reveal clip" style="--d:.08s" href="dashboard.html#analysis-xg">
      <h3>Scoring above xG doesn't carry into the second half of a season</h3>
      <p>Goals minus xG per 90, 2023-24 to 2025-26. The players furthest above their xG in gameweeks 1-19 were level with it in 20-38.</p>
      <div class="viz">${FPL.hbars([
        { label: "Hot, GW1-19", value: hot.first_half, color: "#5ef0b0" }, { label: "Hot, GW20-38", value: hot.second_half, color: "#2c6a52" },
        { label: "Cold, GW1-19", value: cold.first_half, color: "#ff7a8a" }, { label: "Cold, GW20-38", value: cold.second_half, color: "#6a3a3f" },
      ], { width: 360, labelW: 104, row: 34, fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(2) })}</div>
      <span class="go">This season's goals vs xG ›</span></a>
    <a class="find narrow reveal clip" href="dashboard.html#analysis-value">
      <h3>Expensive midfielders score more per 90 at similar value per £m</h3>
      <p>Points per 90 for midfielders by price, 2022-23 to 2025-26. Points per £m stays between ${Math.min(...mid.map((r) => r.points_per_m)).toFixed(0)} and ${Math.max(...mid.map((r) => r.points_per_m)).toFixed(0)}.</p>
      <div class="viz">${FPL.bars(mid.map((r) => ({ label: FPL.TIERS[r.tier - 1].replace("Under ", "<").replace("m+", "+").replace(/m$/, ""), value: r.points_per_90, color: "#5ef0b0" })), { width: 360, height: 170 })}</div>
      <span class="go">Best value this season ›</span></a>
    <a class="find wide reveal clip" style="--d:.08s" href="dashboard.html#analysis-crowd">
      <h3>The most transferred-in players score about the same as the most transferred-out</h3>
      <p>Average points that gameweek, every gameweek since 2022-23. The ten most-owned players scored the most.</p>
      <div class="viz">${FPL.bars([
        { label: "Most transferred in", value: crowd["Top 10 transferred in"], color: "#6aa8ff" },
        { label: "Most transferred out", value: crowd["Top 10 transferred out"], color: "#3d5f8f" },
        { label: "Most owned", value: crowd["Top 10 most owned"], color: "#5ef0b0" },
        { label: "Everyone else", value: crowd["Everyone else who played"], color: "#3a4650" },
      ], { width: 560, height: 170, fmt: (v) => v.toFixed(2) })}</div>
      <span class="go">Full breakdown ›</span></a>`;

  // faq accordion
  document.querySelectorAll(".qa button").forEach((b) => b.addEventListener("click", () => {
    const qa = b.parentElement, open = !qa.classList.contains("open");
    qa.classList.toggle("open", open);
    b.setAttribute("aria-expanded", open);
  }));
});
