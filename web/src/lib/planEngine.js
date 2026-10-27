// The search behind the transfer planner. Runs in a Web Worker (planWorker.js) so the page
// stays responsive while it works.
//
// Input: players [{ id, pos, short, price, chance, pts: { gw: predicted } }], the gameweeks
// to plan, the user's squad (15 ids), bank, free transfers, whether -4 hits are allowed, and
// which chips they still have.
//
// A squad's score in a gameweek is its best legal XI by predicted points plus the captain
// again. The plan is a beam search over gameweeks: each week every kept plan can roll its
// transfer or make 1-3 transfers (beyond the free ones at -4 each), and only the best few
// plans by "points so far + what the squad would score from here" survive to the next week.
export const QUOTA = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const XI_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 }, XI_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
const MAX_FT = 5, BEAM = 10;
const r1 = (v) => Math.round(v * 10) / 10;

export function engine({ players, gws }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const pt = (id, g) => byId.get(id).pts[g] || 0;

  function xiWeek(ids, g) {
    const ranked = ids.map((id) => ({ id, pos: byId.get(id).pos, v: pt(id, g) })).sort((a, b) => b.v - a.v || a.id - b.id);
    const pick = [], count = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const pos of Object.keys(XI_MIN)) ranked.filter((r) => r.pos === pos).slice(0, XI_MIN[pos]).forEach((r) => { pick.push(r); count[pos]++; });
    for (const r of ranked) {
      if (pick.length === 11) break;
      if (!pick.includes(r) && count[r.pos] < XI_MAX[r.pos]) { pick.push(r); count[r.pos]++; }
    }
    const inXi = new Set(pick.map((r) => r.id));
    const cap = pick.reduce((a, b) => (b.v > a.v ? b : a)), xi = pick.reduce((s, r) => s + r.v, 0);
    const bench = ranked.filter((r) => !inXi.has(r.id)).reduce((s, r) => s + r.v, 0);
    return { pick, cap, xi, bench, score: xi + cap.v };
  }
  const rest = (ids, from) => gws.slice(from).reduce((s, g) => s + xiWeek(ids, g).score, 0);
  const clubs = (ids) => { const c = {}; ids.forEach((id) => { const s = byId.get(id).short; c[s] = (c[s] || 0) + 1; }); return c; };

  // candidates worth trying per position: best over the plan, plus best value
  const total = (id) => gws.reduce((s, g) => s + pt(id, g), 0);
  const pool = {};
  for (const pos of Object.keys(QUOTA)) {
    const ps = players.filter((p) => p.pos === pos && (p.chance === null || p.chance >= 50));
    const best = [...ps].sort((a, b) => total(b.id) - total(a.id)).slice(0, 32);
    const value = [...ps].sort((a, b) => total(b.id) / b.price - total(a.id) / a.price).slice(0, 14);
    pool[pos] = [...new Map([...best, ...value].map((p) => [p.id, p])).values()];
  }

  // every single swap from `ids`, scored by what the new squad makes from week `from` on
  function singles(ids, bank, from, limit, skip = new Set()) {
    const have = new Set(ids), c = clubs(ids), out = [];
    for (const o of ids) {
      if (skip.has(o)) continue;
      const po = byId.get(o);
      for (const cand of pool[po.pos]) {
        if (have.has(cand.id) || cand.price > bank + po.price + 1e-9) continue;
        if (cand.short !== po.short && (c[cand.short] || 0) >= 3) continue;
        const next = ids.map((x) => (x === o ? cand.id : x));
        out.push({ ids: next, bank: r1(bank + po.price - cand.price), move: { out: o, in: cand.id }, value: rest(next, from) });
      }
    }
    return out.sort((a, b) => b.value - a.value).slice(0, limit);
  }
  // sets of k transfers, built by chaining good singles
  function moveSets(ids, bank, from, maxK) {
    const sets = [];
    const one = singles(ids, bank, from, 10);
    one.forEach((s) => sets.push({ ids: s.ids, bank: s.bank, moves: [s.move], value: s.value }));
    if (maxK >= 2) {
      one.slice(0, 5).forEach((a) => singles(a.ids, a.bank, from, 4, new Set([a.move.in])).forEach((b) => {
        sets.push({ ids: b.ids, bank: b.bank, moves: [a.move, b.move], value: b.value });
        if (maxK >= 3) singles(b.ids, b.bank, from, 2, new Set([a.move.in, b.move.in])).forEach((c) =>
          sets.push({ ids: c.ids, bank: c.bank, moves: [a.move, b.move, c.move], value: c.value }));
      }));
    }
    // the same squad reached in a different order is the same option
    const seen = new Set();
    return sets.filter((s) => { const k = [...s.ids].sort().join(); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function plan({ squad, bank, ft, hits }) {
    const base = gws.map((g) => xiWeek(squad, g).score);
    let beams = [{ ids: squad, bank, ft, pts: 0, hitCost: 0, log: [] }];
    gws.forEach((g, w) => {
      const next = [];
      for (const b of beams) {
        const now = xiWeek(b.ids, g);
        // roll the transfer
        next.push({ ...b, ft: Math.min(MAX_FT, b.ft + 1), pts: b.pts + now.score,
          log: [...b.log, { gw: g, moves: [], hit: 0, score: now.score, cap: now.cap.id, ftBefore: b.ft }], est: rest(b.ids, w + 1) });
        const maxK = Math.min(3, hits ? b.ft + 2 : b.ft);
        if (maxK < 1) continue;
        for (const s of moveSets(b.ids, b.bank, w, maxK)) {
          if (s.moves.length > maxK) continue;
          const hit = 4 * Math.max(0, s.moves.length - b.ft), wk = xiWeek(s.ids, g);
          next.push({ ids: s.ids, bank: s.bank, ft: Math.min(MAX_FT, Math.max(0, b.ft - s.moves.length) + 1), pts: b.pts + wk.score - hit,
            hitCost: b.hitCost + hit, log: [...b.log, { gw: g, moves: s.moves, hit, score: wk.score, cap: wk.cap.id, ftBefore: b.ft }], est: rest(s.ids, w + 1) });
        }
      }
      const seen = new Set();
      beams = next.sort((a, b) => b.pts + b.est - (a.pts + a.est)).filter((b) => {
        const k = [...b.ids].sort().join() + "|" + b.ft; if (seen.has(k)) return false; seen.add(k); return true;
      }).slice(0, BEAM);
    });
    const best = beams.reduce((a, b) => (b.pts > a.pts ? b : a));
    // squads week by week under the best plan, for the chip advice
    let ids = squad; const squads = best.log.map((l) => { l.moves.forEach((m) => { ids = ids.map((x) => (x === m.out ? m.in : x)); }); return ids; });
    // the best single transfers right now, judged over the whole plan
    const now = singles(squad, bank, 0, 6).map((s) => ({ move: s.move, gain: r1(s.value - base.reduce((a, b) => a + b, 0)),
      weeks: gws.map((g, i) => r1(xiWeek(s.ids, g).score - base[i])), bank: s.bank }));
    return { base, best, squads, now };
  }

  // the best 15 for a budget, greedily, scored over `weeks`; leaves money for the cheapest fillers
  function greedySquad(budget, weeks) {
    const score = (p) => weeks.reduce((s, g) => s + (p.pts[g] || 0), 0);
    const ranked = players.filter((p) => p.chance === null || p.chance >= 75).sort((a, b) => score(b) - score(a));
    const cheapest = {}; players.forEach((p) => { cheapest[p.pos] = Math.min(cheapest[p.pos] ?? 99, p.price); });
    const ids = [], need = { ...QUOTA }, c = {}; let money = budget;
    for (const p of ranked) {
      if (!need[p.pos] || (c[p.short] || 0) >= 3) continue;
      const reserve = Object.entries(need).reduce((s, [pos, n]) => s + (n - (pos === p.pos ? 1 : 0)) * cheapest[pos], 0);
      if (p.price + reserve > money + 1e-9) continue;
      ids.push(p.id); need[p.pos]--; c[p.short] = (c[p.short] || 0) + 1; money -= p.price;
      if (ids.length === 15) break;
    }
    return ids.length === 15 ? ids : null;
  }

  function chips(res, { squad, bank, have }) {
    const value = squad.reduce((s, id) => s + byId.get(id).price, 0) + bank;
    const weeks = res.best.log.map((l, i) => ({ g: l.gw, wk: xiWeek(res.squads[i], l.gw) }));
    const out = [];
    if (have.tc) { const b = weeks.reduce((a, x) => (x.wk.cap.v > a.wk.cap.v ? x : a)); out.push({ chip: "Triple captain", gw: b.g, gain: r1(b.wk.cap.v), who: b.wk.cap.id }); }
    if (have.bb) { const b = weeks.reduce((a, x) => (x.wk.bench > a.wk.bench ? x : a)); out.push({ chip: "Bench boost", gw: b.g, gain: r1(b.wk.bench) }); }
    if (have.fh) {
      const opts = weeks.map((x) => { const ids = greedySquad(value, [x.g]); return ids ? { g: x.g, gain: xiWeek(ids, x.g).score - x.wk.score, ids } : null; }).filter(Boolean);
      if (opts.length) { const b = opts.reduce((a, x) => (x.gain > a.gain ? x : a)); out.push({ chip: "Free hit", gw: b.g, gain: r1(b.gain), squad: b.ids }); }
    }
    if (have.wc) {
      const ids = greedySquad(value, gws);
      if (ids) {
        const wcTotal = gws.reduce((s, g) => s + xiWeek(ids, g).score, 0);
        out.push({ chip: "Wildcard", gw: gws[0], gain: r1(wcTotal - res.best.pts), squad: ids });
      }
    }
    return out;
  }

  return { xiWeek, plan, chips };
}
