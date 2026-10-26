// Transfer planner: given a 15-man squad, a bank balance and free transfers, find the
// transfers that add the most predicted points over the next five open gameweeks.
//
// A squad is scored week by week: pick its best legal XI by predicted points, double the
// captain, and add it up. Every transfer beyond the free ones costs 4 points.
export const QUOTA = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const XI_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 }, XI_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
const sum = (a) => a.reduce((s, v) => s + v, 0);

export function makePlanner(data) {
  const P = data.players, byId = data.byId, GWS = data.planGws;
  const pts = {};
  P.forEach((p) => { pts[p.id] = Object.fromEntries(p.h.map(([g, v]) => [g, v])); });
  const h5 = Object.fromEntries(P.map((p) => [p.id, GWS.reduce((s, g) => s + (pts[p.id][g] || 0), 0)]));

  function xiWeek(ids, g) {
    const ranked = ids.map((id) => ({ id, pos: byId[id].pos, v: pts[id][g] || 0 })).sort((a, b) => b.v - a.v || a.id - b.id);
    const pick = [], count = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const pos of Object.keys(XI_MIN)) ranked.filter((r) => r.pos === pos).slice(0, XI_MIN[pos]).forEach((r) => { pick.push(r); count[pos]++; });
    for (const r of ranked) {
      if (pick.length === 11) break;
      if (!pick.includes(r) && count[r.pos] < XI_MAX[r.pos]) { pick.push(r); count[r.pos]++; }
    }
    const cap = pick.reduce((a, b) => (b.v > a.v ? b : a));
    return { pick, cap, score: sum(pick.map((r) => r.v)) + cap.v };
  }
  const squadScore = (ids) => GWS.map((g) => xiWeek(ids, g).score);

  function teamCounts(ids) {
    const c = {};
    ids.forEach((id) => { c[byId[id].short] = (c[byId[id].short] || 0) + 1; });
    return c;
  }
  // Candidates per position: the best by five-week total plus the best value, so cheap enablers aren't missed.
  const pool = {};
  for (const pos of Object.keys(QUOTA)) {
    const ps = P.filter((p) => p.pos === pos && (p.chance === null || p.chance >= 50));
    const byTotal = [...ps].sort((a, b) => h5[b.id] - h5[a.id]).slice(0, 45);
    const byValue = [...ps].sort((a, b) => h5[b.id] / b.price - h5[a.id] / a.price).slice(0, 25);
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
        out.push({ ids: next, bank: Math.round((bank + o.price - c.price) * 10) / 10, weeks, total: sum(weeks), moves: [...(state.moves || []), { out: outId, in: c.id }] });
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
      const seen = new Set();  // the same squad reached by swapping in a different order
      frontier = next.sort((a, b) => b.total - a.total).filter((s) => {
        const key = [...s.ids].sort().join(",");
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 12);
      if (frontier.length) options.push({ n, ...frontier[0] });
    }
    options.forEach((o) => { o.hit = 4 * Math.max(0, o.n - ft); o.gain = o.total - base; o.net = o.gain - o.hit; });
    const best = options.reduce((a, b) => (b.net > a.net + 0.05 ? b : a));
    return { base, baseWeeks, options, best };
  }
  function validate(ids) {
    if (ids.length < 15) return `${ids.length} of 15 players entered.`;
    if (new Set(ids).size < 15) return "The same player is in the squad twice.";
    const over = Object.entries(teamCounts(ids)).filter(([, c]) => c > 3).map(([t]) => t);
    if (over.length) return `FPL allows at most 3 players per club (${over.join(", ")} has more).`;
    return "";
  }
  // An example: a strong five-week squad for £100m, built greedily.
  function example() {
    const ids = [], counts = {}, need = { ...QUOTA };
    let money = 100;
    const ranked = [...P].filter((p) => p.chance === null || p.chance >= 75).sort((a, b) => h5[b.id] - h5[a.id]);
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
  return { GWS, h5, xiWeek, plan, validate, example };
}
