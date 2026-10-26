// Transfer planner: enter a squad, get the transfers that add the most predicted points over
// the next five gameweeks. The squad is saved in this browser; clearing it can be undone.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import PlayerSelect from "../components/PlayerSelect.jsx";
import { useToast } from "../components/Toast.jsx";
import { makePlanner, QUOTA } from "../lib/planner.js";
import { Box } from "./Overview.jsx";

const KEY = "fpl-squad";
const empty = () => Object.fromEntries(Object.entries(QUOTA).map(([pos, n]) => [pos, Array(n).fill(null)]));
const NAMES = { GK: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" };

function load(byId) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s || !s.ids) return null;
    const slots = empty();
    s.ids.filter((id) => byId[id]).forEach((id) => { const p = byId[id], i = slots[p.pos].indexOf(null); if (i >= 0) slots[p.pos][i] = id; });
    return { slots, bank: s.bank ?? 0, ft: s.ft ?? 1, hits: !!s.hits };
  } catch (e) { return null; }
}

function Fixtures({ data, team, gws }) {
  return (
    <div className="mt-1.5 flex gap-1">
      {gws.map((g) => {
        const f = (data.fixtures[team] || {})[g] || [];
        const fdr = f.length ? Math.round(f.reduce((s, r) => s + r.fdr, 0) / f.length) : 0;
        return <span key={g} className={`rounded px-1 py-px font-mono text-[10px] ${fdr ? `fdr-${fdr}` : "fdr-3"}`}>{f.length ? f.map((r) => (r.home ? r.opp : r.opp.toLowerCase())).join("+") : "—"}</span>;
      })}
    </div>
  );
}

export default function PlannerTab({ data }) {
  const toast = useToast();
  const pl = useMemo(() => makePlanner(data), [data]);
  const saved = useMemo(() => load(data.byId), [data]);
  const [slots, setSlots] = useState(saved?.slots || empty());
  const [bank, setBank] = useState(saved?.bank ?? 0);
  const [ft, setFt] = useState(saved?.ft ?? 1);
  const [hits, setHits] = useState(saved?.hits ?? false);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const ids = Object.values(slots).flat().filter(Boolean);
  const problem = pl.validate(ids);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ ids, bank, ft, hits })); } catch (e) { /* storage blocked */ }
  }, [slots, bank, ft, hits]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (pos, i, id) => setSlots((s) => ({ ...s, [pos]: s[pos].map((x, k) => (k === i ? id : x)) }));
  const run = (sl = slots, b = bank, f = ft, h = hits) => {
    const list = Object.values(sl).flat().filter(Boolean);
    if (pl.validate(list)) return;
    setBusy(true);
    // let the loading state paint before the search blocks the main thread
    setTimeout(() => { setRes(pl.plan(list, +b || 0, +f, h)); setBusy(false); }, 30);
  };
  const example = () => {
    const ex = pl.example(), sl = empty();
    ex.ids.forEach((id) => { const p = data.byId[id], i = sl[p.pos].indexOf(null); sl[p.pos][i] = id; });
    setSlots(sl); setBank(ex.bank); setFt(1); setHits(false); run(sl, ex.bank, 1, false);
  };
  const clear = () => {
    const before = { slots, bank, ft, hits, res };
    setSlots(empty()); setRes(null);
    toast("Squad cleared", { undo: () => { setSlots(before.slots); setBank(before.bank); setFt(before.ft); setHits(before.hits); setRes(before.res); } });
  };
  const range = `GW${pl.GWS[0]}-${pl.GWS[pl.GWS.length - 1]}`;
  const name = (id) => data.byId[id].name;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Box>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-[19px] font-medium">Your squad</h3>
          <div className="flex gap-2">
            <button onClick={example} className="hit rounded-lg border border-line2 px-3 py-1.5 text-sm hover:border-mint">Try an example squad</button>
            <button onClick={clear} disabled={!ids.length} className="hit rounded-lg border border-line2 px-3 py-1.5 text-sm text-text2 hover:text-text disabled:opacity-40">Clear</button>
          </div>
        </div>
        {Object.entries(QUOTA).map(([pos]) => (
          <div key={pos} className="mt-5">
            <div className="mono-label mb-2 text-[10px] text-text3">{pos}</div>
            <div className="grid gap-2">
              {slots[pos].map((id, i) => {
                const p = id ? data.byId[id] : null;
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <PlayerSelect players={data.players.filter((x) => x.pos === pos)} value={p} onPick={(x) => set(pos, i, x.id)} onClear={() => set(pos, i, null)}
                      placeholder={`Search ${NAMES[pos]}`} label={`${pos} ${i + 1}`} />
                    <span className="num w-20 text-right font-mono text-xs text-text3">{p ? <>£{p.price.toFixed(1)}<br /><span className="text-mint">{pl.h5[p.id].toFixed(1)} pts</span></> : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">In the bank £<input type="number" min="0" max="100" step="0.1" value={bank} onChange={(e) => setBank(e.target.value)}
            className="h-9 w-20 rounded-lg border border-line2 bg-bg/60 px-2 font-mono outline-none focus:border-mint" />m</label>
          <label className="flex items-center gap-2">Free transfers <select value={ft} onChange={(e) => setFt(+e.target.value)}
            className="h-9 rounded-lg border border-line2 bg-bg/60 px-2 font-mono outline-none focus:border-mint">{[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={hits} onChange={(e) => setHits(e.target.checked)} className="accent-[rgb(var(--mint))]" /> Allow -4 hits</label>
        </div>
        <p className="mt-3 min-h-5 text-sm text-amber">{ids.length ? problem : ""}</p>
        <button onClick={() => run()} disabled={!!problem || busy}
          className="mt-2 h-11 rounded-[4px] bg-text px-5 font-medium text-bg transition-colors hover:bg-mint disabled:opacity-40">
          {busy ? "Checking every transfer…" : "Find the best transfers ›"}
        </button>
        <p className="mt-4 text-xs leading-relaxed text-text3">Prices are current prices. FPL may sell your players for up to £0.3m less if they rose after you bought them, so lower the bank figure if needed. The squad is saved in this browser.</p>
      </Box>

      <div className="grid content-start gap-4">
        {busy && [0, 1, 2].map((i) => <div key={i} className="skel h-40" />)}
        {!busy && !res && (
          <Box title="Recommendations show up here" hint={`Each squad is scored by its best XI and captain in every gameweek from ${range}.`}>
            <button onClick={example} className="mt-4 text-sm text-mint">Try the example squad ›</button>
          </Box>
        )}
        <AnimatePresence mode="popLayout">
          {!busy && res && [res.best, ...res.options.filter((o) => o !== res.best && (o.n === 0 || o.gain > 0.05))].map((o, k) => {
            const isBest = o === res.best, diff = o.weeks.map((v, i) => v - res.baseWeeks[i]), top = Math.max(1, ...diff.map(Math.abs));
            const wk = pl.xiWeek(o.ids, pl.GWS[0]), xiIds = new Set(wk.pick.map((r) => r.id));
            return (
              <motion.div key={`${o.n}-${o.moves.map((m) => m.in).join(",")}`} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: k * 0.06 } }} exit={{ opacity: 0 }}
                className={`corners p-5 sm:p-6 ${isBest ? "shadow-[inset_0_0_60px_rgb(var(--mint)/.07)] [--c:rgb(var(--mint))]" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {isBest && <div className="mono-label mb-1 text-[10px] text-mint">Best option</div>}
                    <h3 className="font-display text-[20px] font-medium">{o.n === 0 ? "Keep the squad, roll the transfer" : `${o.n} transfer${o.n > 1 ? "s" : ""}`}</h3>
                  </div>
                  <div className="text-right">
                    <div className={`num font-display text-[32px] font-medium leading-none ${o.n && o.net > 0 ? "text-mint" : ""}`}>{o.n === 0 ? o.total.toFixed(1) : `${o.net > 0 ? "+" : ""}${o.net.toFixed(1)}`}</div>
                    <div className="text-xs text-text3">{o.n === 0 ? `predicted points, ${range}` : `points over ${range}${o.hit ? `, after -${o.hit}` : ""}`}</div>
                  </div>
                </div>
                {o.moves.map((mv) => {
                  const a = data.byId[mv.out], b = data.byId[mv.in];
                  return (
                    <div key={mv.in} className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[4px] border border-line bg-bg/40 p-3">
                      <div className="min-w-0"><div className="truncate text-rose">{a.name}</div><div className="text-xs text-text3">{a.short}, £{a.price.toFixed(1)}m, {pl.h5[a.id].toFixed(1)} pts</div><Fixtures data={data} team={a.short} gws={pl.GWS} /></div>
                      <span className="text-text3">→</span>
                      <div className="min-w-0"><div className="truncate text-mint">{b.name}</div><div className="text-xs text-text3">{b.short}, £{b.price.toFixed(1)}m, {pl.h5[b.id].toFixed(1)} pts</div><Fixtures data={data} team={b.short} gws={pl.GWS} /></div>
                    </div>
                  );
                })}
                {o.n > 0 && (
                  <div className="mt-4 flex items-end gap-2">
                    {diff.map((d, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <span className="num font-mono text-[10px] text-text3">{d > 0 ? "+" : ""}{d.toFixed(1)}</span>
                        <i className={`block w-full max-w-[40px] rounded-sm ${d < 0 ? "bg-rose/70" : "bg-mint/80"}`} style={{ height: Math.max(2, (Math.abs(d) / top) * 34) }} />
                        <span className="font-mono text-[10px] text-text3">GW{pl.GWS[i]}</span>
                      </div>
                    ))}
                  </div>
                )}
                {o.n > 0 && <p className="mt-3 text-xs text-text3">£{o.bank.toFixed(1)}m left in the bank.</p>}
                {isBest && (
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="mono-label mb-2 text-[10px] text-text3">GW{pl.GWS[0]} lineup with this squad</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...wk.pick].sort((a, b) => b.v - a.v).map((r) => (
                        <span key={r.id} className={`rounded-md border px-2 py-0.5 text-xs ${r.id === wk.cap.id ? "border-mint/60 bg-mint/10 text-mint" : "border-line2"}`}>{name(r.id)}{r.id === wk.cap.id && " (C)"} <span className="font-mono text-text3">{r.v.toFixed(1)}</span></span>
                      ))}
                      {o.ids.filter((id) => !xiIds.has(id)).map((id) => <span key={id} className="rounded-md border border-dashed border-line2 px-2 py-0.5 text-xs text-text3">{name(id)}</span>)}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!busy && res && res.options.filter((o) => o.n > 0 && o.gain > 0.05).length === 0 && (
          <Box title="No transfer adds points" hint={`No legal transfer improves this squad's predicted points over ${range}. Saving the transfer is the best move.`} />
        )}
      </div>
    </div>
  );
}
