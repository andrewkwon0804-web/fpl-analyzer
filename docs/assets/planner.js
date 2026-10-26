// Transfer planner: given a 15-man squad, a bank balance and free transfers, find the
// transfers that add the most predicted points over the next five open gameweeks.
//
// A squad is scored week by week: pick its best legal XI by predicted points, double
// the captain, and add it up. Every transfer beyond the free ones costs 4 points.
FPL.planner = (data) => {
  const QUOTA = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const XI_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 }, XI_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
  const P = data.players, byId = data.byId;
  const start = data.analysis.fdr.grid_start;  // first gameweek that hasn't kicked off
  const GWS = data.meta.horizon_gws.filter((g) => g >= start).slice(0, 5);
  const pts = {};
  P.forEach((p) => { pts[p.id] = Object.fromEntries(p.h.map(([g, v]) => [g, v])); });
  const total = (id) => GWS.reduce((s, g) => s + (pts[id][g] || 0), 0);
  P.forEach((p) => { p.h5 = total(p.id); });
  const fixtures = {};
  data.analysis.fdr.grid.forEach((r) => { (fixtures[r.team] ??= []).push(r); });

  // ---------------- scoring
  function xiWeek(ids, g) {
    const ranked = ids.map((id) => ({ id, pos: byId[id].pos, v: pts[id][g] || 0 }))
      .sort((a, b) => b.v - a.v || a.id - b.id);
    const pick = [], count = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const pos of Object.keys(XI_MIN)) {
      ranked.filter((r) => r.pos === pos).slice(0, XI_MIN[pos]).forEach((r) => { pick.push(r); count[pos]++; });
    }
    for (const r of ranked) {
      if (pick.length === 11) break;
      if (!pick.includes(r) && count[r.pos] < XI_MAX[r.pos]) { pick.push(r); count[r.pos]++; }
    }
    const cap = pick.reduce((a, b) => (b.v > a.v ? b : a));
    return { pick, cap, score: pick.reduce((s, r) => s + r.v, 0) + cap.v };
  }
  const squadScore = (ids) => GWS.map((g) => xiWeek(ids, g).score);
  const sum = (a) => a.reduce((s, v) => s + v, 0);

  // ---------------- search
  function teamCounts(ids) {
    const c = {};
    ids.forEach((id) => { c[byId[id].short] = (c[byId[id].short] || 0) + 1; });
    return c;
  }
  // Candidates worth considering per position: the best by five-week total, plus the
  // best value, so cheap enablers aren't missed.
  const pool = {};
  for (const pos of Object.keys(QUOTA)) {
    const ps = P.filter((p) => p.pos === pos && (p.chance === null || p.chance >= 50));
    const byTotal = [...ps].sort((a, b) => b.h5 - a.h5).slice(0, 45);
    const byValue = [...ps].sort((a, b) => b.h5 / b.price - a.h5 / a.price).slice(0, 25);
    pool[pos] = [...new Map([...byTotal, ...byValue].map((p) => [p.id, p])).values()];
  }
  function singles(state, limit) {
    const { ids, bank } = state, have = new Set(ids), counts = teamCounts(ids), out = [];
    for (const outId of ids) {
      const o = byId[outId];
      for (const c of pool[o.pos]) {
        if (have.has(c.id) || c.price > bank + o.price + 1e-9) continue;
        if (c.short !== o.short && (counts[c.short] || 0) >= 3) continue;
        const next = ids.map((x) => (x === outId ? c.id : x));
        const weeks = squadScore(next);
        out.push({ ids: next, bank: Math.round((bank + o.price - c.price) * 10) / 10, weeks, total: sum(weeks),
          moves: [...(state.moves || []), { out: outId, in: c.id }] });
      }
    }
    return out.sort((a, b) => b.total - a.total).slice(0, limit);
  }
  function plan(ids, bank, ft, hits) {
    const baseWeeks = squadScore(ids), base = sum(baseWeeks);
    const maxN = Math.min(hits ? Math.max(ft, 1) + 2 : ft, 4);
    const options = [{ n: 0, ids, bank, weeks: baseWeeks, total: base, moves: [] }];
    let frontier = [{ ids, bank, moves: [] }];
    for (let n = 1; n <= maxN; n++) {
      const next = [];
      frontier.forEach((s) => next.push(...singles(s, n === 1 ? 30 : 12)));
      // drop duplicate squads reached by swapping the same players in a different order
      const seen = new Set();
      frontier = next.sort((a, b) => b.total - a.total).filter((s) => {
        const key = [...s.ids].sort().join(",");
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 12);
      if (frontier.length) options.push({ n, ...frontier[0] });
    }
    options.forEach((o) => {
      o.hit = 4 * Math.max(0, o.n - ft);
      o.gain = o.total - base;
      o.net = o.gain - o.hit;
    });
    return { base, baseWeeks, options };
  }

  // ---------------- squad entry
  const label = (p) => `${p.name} (${p.short}) £${p.price.toFixed(1)}m`;
  const byLabel = {};
  P.forEach((p) => { byLabel[label(p)] = p; byLabel[`${p.name} (${p.short})`] = p; });
  const squadEl = document.getElementById("squad");
  squadEl.innerHTML = Object.entries(QUOTA).map(([pos, n]) => `<div class="pos-group"><h5>${pos}</h5>
    ${Array.from({ length: n }, (_, i) => `<div class="slot"><input list="dl-${pos}" data-pos="${pos}" data-i="${i}" placeholder="Search ${pos === "GK" ? "goalkeepers" : pos === "DEF" ? "defenders" : pos === "MID" ? "midfielders" : "forwards"}" aria-label="${pos} ${i + 1}">
      <span class="pr num"></span><span class="pt num" title="Predicted points, next five gameweeks"></span></div>`).join("")}
    <datalist id="dl-${pos}">${P.filter((p) => p.pos === pos).map((p) => `<option value="${FPL.esc(label(p))}">`).join("")}</datalist></div>`).join("");
  const inputs = [...squadEl.querySelectorAll("input")];
  const bankEl = document.getElementById("bank"), ftEl = document.getElementById("ft"), hitsEl = document.getElementById("hits");
  const msg = document.getElementById("squad-msg");

  function readSquad() {
    const ids = [];
    inputs.forEach((inp) => {
      const p = byLabel[inp.value.trim()];
      const ok = p && p.pos === inp.dataset.pos;
      inp.classList.toggle("bad", inp.value.trim() !== "" && !ok);
      const row = inp.parentElement;
      row.querySelector(".pr").textContent = ok ? `£${p.price.toFixed(1)}` : "";
      row.querySelector(".pt").textContent = ok ? p.h5.toFixed(1) : "";
      if (ok) ids.push(p.id);
    });
    return ids;
  }
  function validate(ids) {
    if (ids.length < 15) return `${ids.length} of 15 players entered.`;
    if (new Set(ids).size < 15) return "The same player is in the squad twice.";
    const over = Object.entries(teamCounts(ids)).filter(([, c]) => c > 3).map(([t]) => t);
    if (over.length) return `FPL allows at most 3 players per club (${over.join(", ")} has more).`;
    return "";
  }
  function save() {
    const ids = inputs.map((i) => (byLabel[i.value.trim()] || {}).id || 0);
    const state = { ids, bank: +bankEl.value || 0, ft: +ftEl.value, hits: hitsEl.checked };
    try { localStorage.setItem("fpl-squad", JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function fill(ids, bank, ft, hits) {
    const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
    ids.forEach((id) => { if (byId[id]) byPos[byId[id].pos].push(byId[id]); });
    inputs.forEach((inp) => { const p = byPos[inp.dataset.pos][+inp.dataset.i]; inp.value = p ? label(p) : ""; });
    if (bank !== undefined) bankEl.value = (+bank).toFixed(1);
    if (ft !== undefined) ftEl.value = String(ft);
    if (hits !== undefined) hitsEl.checked = !!hits;
    msg.textContent = validate(readSquad());
  }
  inputs.forEach((inp) => inp.addEventListener("change", () => { msg.textContent = validate(readSquad()); save(); }));
  [bankEl, ftEl, hitsEl].forEach((el) => el.addEventListener("change", save));

  // An example: the best five-week squad the planner can find for £100m, built greedily.
  function example() {
    const ids = [], counts = {}, need = { ...QUOTA };
    let money = 100;
    const ranked = [...P].filter((p) => p.chance === null || p.chance >= 75).sort((a, b) => b.h5 - a.h5);
    const cheapest = {};
    P.forEach((p) => { cheapest[p.pos] = Math.min(cheapest[p.pos] ?? 99, p.price); });
    for (const p of ranked) {
      if (!need[p.pos] || (counts[p.short] || 0) >= 3) continue;
      // keep enough money to fill every other empty slot with the cheapest player there
      const reserve = Object.entries(need).reduce((s, [pos, n]) => s + (n - (pos === p.pos ? 1 : 0)) * cheapest[pos], 0);
      if (p.price + reserve > money + 1e-9) continue;
      ids.push(p.id); need[p.pos]--; counts[p.short] = (counts[p.short] || 0) + 1; money -= p.price;
      if (ids.length === 15) break;
    }
    return { ids, bank: Math.round(money * 10) / 10 };
  }
  document.getElementById("plan-example").addEventListener("click", () => {
    const ex = example(); fill(ex.ids, ex.bank, 1, false); save(); run();
  });
  document.getElementById("plan-clear").addEventListener("click", () => {
    inputs.forEach((i) => { i.value = ""; }); readSquad(); msg.textContent = ""; save();
    document.getElementById("plan-out").innerHTML = '<div class="box empty-plan"><h3>Recommendations show up here</h3><p class="hint">Start by typing a player\'s name in each slot, or try the example squad.</p></div>';
  });

  // ---------------- results
  const fdrChips = (team) => (fixtures[team] || []).filter((r) => GWS.includes(r.gw))
    .map((r) => `<span class="f${r.fdr}">${r.home ? r.opp : r.opp.toLowerCase()}</span>`).join("");
  const name = (id) => FPL.esc(byId[id].name);
  function render(res, ids) {
    const best = res.options.reduce((a, b) => (b.net > a.net + 0.05 ? b : a));
    const range = `GW${GWS[0]}-${GWS[GWS.length - 1]}`;
    const card = (o) => {
      const isBest = o === best;
      const title = o.n === 0 ? "Keep the squad (roll the transfer)" : `${o.n} transfer${o.n > 1 ? "s" : ""}`;
      const gain = o.n === 0 ? `<span class="gain neg">${o.total.toFixed(1)}<small>predicted points, ${range}</small></span>`
        : `<span class="gain${o.net <= 0 ? " neg" : ""}">${o.net > 0 ? "+" : ""}${o.net.toFixed(1)}<small>points over ${range}${o.hit ? `, after a -${o.hit} hit` : ""}</small></span>`;
      const swaps = o.moves.map((mv) => {
        const a = byId[mv.out], b = byId[mv.in];
        return `<div class="swap"><div class="out"><b>${FPL.esc(a.name)}</b><small>${a.short}, £${a.price.toFixed(1)}m, ${a.h5.toFixed(1)} pts</small>
          <div class="fdr-row">${fdrChips(a.short)}</div></div><div class="arrow">›</div>
          <div class="in"><b>${FPL.esc(b.name)}</b><small>${b.short}, £${b.price.toFixed(1)}m, ${b.h5.toFixed(1)} pts</small>
          <div class="fdr-row">${fdrChips(b.short)}</div></div></div>`;
      }).join("");
      const diff = o.weeks.map((v, i) => v - res.baseWeeks[i]);
      const top = Math.max(1, ...diff.map(Math.abs));
      const bars = o.n === 0 ? "" : `<div class="gw-gain">${diff.map((d, i) => `<div><i class="${d < 0 ? "neg" : ""}" style="height:${Math.max(2, Math.abs(d) / top * 30)}px"></i>GW${GWS[i]}</div>`).join("")}</div>`;
      const wk = xiWeek(o.ids, GWS[0]);
      const xiIds = new Set(wk.pick.map((r) => r.id));
      const line = `<div class="lineup">${wk.pick.sort((a, b) => b.v - a.v).map((r) => `<span class="${r.id === wk.cap.id ? "c" : ""}">${name(r.id)}${r.id === wk.cap.id ? " (C)" : ""} ${r.v.toFixed(1)}</span>`).join("")}
        ${o.ids.filter((id) => !xiIds.has(id)).map((id) => `<span class="bench">${name(id)}</span>`).join("")}</div>`;
      return `<div class="option${isBest ? " best" : ""}"><div class="head"><h3>${isBest ? "Best: " : ""}${title}</h3>${gain}</div>
        ${swaps}${bars}${o.n ? `<p class="hint" style="margin-top:10px">£${o.bank.toFixed(1)}m left in the bank.</p>` : ""}
        ${isBest ? `<p class="hint" style="margin-top:12px">Gameweek ${GWS[0]} lineup and captain with this squad (bench faded):</p>${line}` : ""}</div>`;
    };
    // Only show transfer options that actually add predicted points.
    const useful = res.options.filter((o) => o.n === 0 || o.gain > 0.05);
    const none = useful.length === 1
      ? `<div class="option"><div class="head"><h3>No transfer adds points</h3></div><p class="hint" style="margin-top:8px">
          No legal transfer improves this squad's predicted points over ${range}. Saving the transfer is the best move.</p></div>` : "";
    document.getElementById("plan-out").innerHTML = [best, ...useful.filter((o) => o !== best)].map(card).join("") + none;
    if (FPL.burst && best.net > 0) {  // loud mode: celebrate a good transfer
      const r = document.querySelector(".option.best").getBoundingClientRect();
      FPL.burst(r.right - 60, r.top + 30, 60);
    }
  }
  function run() {
    const ids = readSquad(), problem = validate(ids);
    msg.textContent = problem;
    if (problem) return;
    const res = plan(ids, +bankEl.value || 0, +ftEl.value, hitsEl.checked);
    render(res, ids);
  }
  document.getElementById("plan-go").addEventListener("click", run);
  document.getElementById("plan-intro").insertAdjacentHTML("beforeend",
    ` Planning covers gameweeks ${GWS[0]} to ${GWS[GWS.length - 1]}.`);

  // restore a saved squad
  try {
    const saved = JSON.parse(localStorage.getItem("fpl-squad") || "null");
    if (saved && saved.ids) fill(saved.ids.filter(Boolean), saved.bank, saved.ft, saved.hits);
  } catch (e) { /* nothing saved */ }
  FPL.plan = plan;  // handy for testing in the console
};
