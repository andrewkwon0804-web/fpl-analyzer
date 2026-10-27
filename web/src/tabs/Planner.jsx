// Transfer planner. Build your squad on a pitch, then the planner works out a transfer plan
// for the next five gameweeks: when to use or roll each free transfer, whether a -4 hit pays,
// who to captain each week and which chip to play when. The search runs in a Web Worker.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../components/Toast.jsx";
import { usePop } from "../components/Popover.jsx";
import { QUOTA } from "../lib/planEngine.js";

const KEY = "fpl-planner";
const POS = ["GK", "DEF", "MID", "FWD"];
const NAMES = { GK: "goalkeeper", DEF: "defender", MID: "midfielder", FWD: "forward" };
const empty = () => Object.fromEntries(POS.map((p) => [p, Array(QUOTA[p]).fill(null)]));
const r1 = (v) => Math.round(v * 10) / 10;
const sg = (v) => (v > 0 ? "+" : "") + v.toFixed(1);

// put ids into position slots; ignores anything that isn't a known player or overflows a position
function toSlots(ids, byId) {
  const slots = empty();
  ids.forEach((id) => { const p = byId[id]; if (!p) return; const i = slots[p.pos].indexOf(null); if (i >= 0) slots[p.pos][i] = id; });
  return slots;
}
// read a shared link: ?squad=1,2,3&bank=0.5&ft=2. Only digits and known ids get through.
function fromUrl(byId) {
  const q = new URLSearchParams(location.search), raw = q.get("squad");
  if (!raw || !/^[\d,]{1,200}$/.test(raw)) return null;
  const bank = Math.min(100, Math.max(0, parseFloat(q.get("bank")) || 0)), ft = Math.min(5, Math.max(0, parseInt(q.get("ft"), 10) || 1));
  return { slots: toSlots(raw.split(",").map(Number), byId), bank, ft };
}
function fromStorage(byId) {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s && Array.isArray(s.ids) ? { ...s, slots: toSlots(s.ids.filter(Number.isInteger), byId) } : null; }
  catch (e) { return null; }
}

function Fix({ data, team, gws }) {
  return (
    <span className="flex gap-0.5">
      {gws.map((g) => {
        const f = (data.fixtures[team] || {})[g] || [], d = f.length ? Math.round(f.reduce((s, r) => s + r.fdr, 0) / f.length) : 0;
        return <span key={g} title={`GW${g}`} className={`w-9 rounded-[2px] py-px text-center font-mono text-[10px] ${d ? `fdr-${d}` : "text-text3"}`}>{f.length ? f.map((r) => (r.home ? r.opp : r.opp.toLowerCase())).join("+") : "—"}</span>;
      })}
    </span>
  );
}

// ------------------------------------------------------------ picker sheet
function Picker({ data, pos, current, taken, onPick, onRemove, onClose, h5, gws }) {
  const [q, setQ] = useState(""), [sort, setSort] = useState("h5");
  const input = useRef(null);
  useEffect(() => { setTimeout(() => input.current?.focus(), 80); const k = (e) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const key = { h5: (p) => -h5[p.id], price: (p) => -p.price, value: (p) => -h5[p.id] / p.price, cheap: (p) => p.price }[sort];
    return data.players.filter((p) => p.pos === pos && !taken.has(p.id) && (!t || p.name.toLowerCase().includes(t) || p.team.toLowerCase().includes(t)))
      .sort((a, b) => key(a) - key(b)).slice(0, 60);
  }, [q, sort, pos, taken, data, h5]);
  return (
    <motion.div className="fixed inset-0 z-[140] flex justify-end bg-bg/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div role="dialog" aria-label={`Choose a ${NAMES[pos]}`} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="flex h-full w-full max-w-[520px] flex-col border-l border-line2 bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text3">Choose a {NAMES[pos]}</div>{current && <div className="mt-1 text-sm text-text2">Replacing {current.name}</div>}</div>
          <button onClick={onClose} className="hit h-9 w-9 rounded-[4px] border border-line2 text-text2 hover:text-text" aria-label="Close">×</button>
        </div>
        <div className="space-y-3 border-b border-line px-5 py-4">
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or club" aria-label="Search players"
            className="h-10 w-full rounded-[4px] border border-line2 bg-bg/60 px-3 outline-none placeholder:text-text3 focus:border-mint" />
          <div className="flex flex-wrap gap-1 font-mono text-[11px] uppercase tracking-[0.08em]">
            {[["h5", `Points GW${gws[0]}-${gws[gws.length - 1]}`], ["value", "Points per £m"], ["price", "Price high"], ["cheap", "Price low"]].map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k} className={`rounded-[3px] px-2.5 py-1.5 ${sort === k ? "bg-text text-bg" : "border border-line2 text-text2"}`}>{l}</button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto overscroll-contain">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPick(p.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-line px-5 py-3 text-left hover:bg-raised/60">
                <span className="truncate">{p.name} <span className="font-mono text-[11px] text-text3">{p.short}</span>{p.chance !== null && p.chance < 100 && <span className="ml-2 font-mono text-[11px] text-amber">{p.chance}%</span>}</span>
                <span className="text-right font-mono text-[13px]"><span className="text-mint">{h5[p.id].toFixed(1)}</span> <span className="text-text3">· £{p.price.toFixed(1)}</span></span>
                <Fix data={data} team={p.short} gws={gws} />
              </button>
            </li>
          ))}
          {!list.length && <li className="px-5 py-8 text-center text-sm text-text3">No {NAMES[pos]} matches "{q}".</li>}
        </ul>
        {current && <button onClick={onRemove} className="border-t border-line px-5 py-4 text-left font-mono text-[12px] uppercase tracking-[0.1em] text-rose hover:bg-raised/60">Remove {current.name}</button>}
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------ the tab
export default function PlannerTab({ data }) {
  const toast = useToast();
  const { open: openPop } = usePop();
  const gws = data.planGws, byId = data.byId;
  const h5 = useMemo(() => Object.fromEntries(data.players.map((p) => [p.id, gws.reduce((s, g) => s + (Object.fromEntries(p.h)[g] || 0), 0)])), [data, gws]);
  const start = useMemo(() => fromUrl(byId) || fromStorage(byId), [byId]);
  const [slots, setSlots] = useState(start?.slots || empty());
  const [bank, setBank] = useState(start?.bank ?? 0);
  const [ft, setFt] = useState(start?.ft ?? 1);
  const [hits, setHits] = useState(start?.hits ?? false);
  const [have, setHave] = useState(start?.have ?? { tc: true, bb: true, fh: true, wc: true });
  const [pick, setPick] = useState(null); // { pos, i }
  const [out, setOut] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const worker = useRef(null), job = useRef(0);
  const ids = POS.flatMap((p) => slots[p]).filter(Boolean);
  const value = ids.reduce((s, id) => s + byId[id].price, 0);
  const clubsOver = Object.entries(ids.reduce((c, id) => ({ ...c, [byId[id].short]: (c[byId[id].short] || 0) + 1 }), {})).filter(([, n]) => n > 3).map(([t]) => t);
  const problem = ids.length < 15 ? `${15 - ids.length} slot${ids.length === 14 ? "" : "s"} to fill.` : clubsOver.length ? `At most 3 players per club (${clubsOver.join(", ")}).` : "";

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ ids, bank, ft, hits, have })); } catch (e) { /* storage blocked */ } }, [slots, bank, ft, hits, have]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => worker.current?.terminate(), []);

  // re-plan shortly after anything changes; a newer request replaces an older one
  const run = useCallback(() => {
    if (problem) { setOut(null); return; }
    if (!worker.current) worker.current = new Worker(new URL("../lib/planWorker.js", import.meta.url), { type: "module" });
    const id = ++job.current;
    setBusy(true); setErr("");
    worker.current.onmessage = (e) => {
      if (e.data.id !== job.current) return;
      setBusy(false);
      if (e.data.ok) setOut({ ...e.data, squad: ids, bank: +bank }); else setErr(e.data.error);
    };
    worker.current.postMessage({ id, gws, squad: ids, bank: +bank || 0, ft, hits, have,
      players: data.players.map((p) => ({ id: p.id, pos: p.pos, short: p.short, price: p.price, chance: p.chance, pts: Object.fromEntries(p.h) })) });
  }, [problem, ids.join(), bank, ft, hits, have, data, gws]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(run, 350); return () => clearTimeout(t); }, [run]);

  const fill = (list, b, f = 1) => { setSlots(toSlots(list, byId)); setBank(r1(b)); setFt(f); };
  const example = () => {
    // a strong £100m squad for these five weeks, built greedily
    const cheapest = {}; data.players.forEach((p) => { cheapest[p.pos] = Math.min(cheapest[p.pos] ?? 99, p.price); });
    const need = { ...QUOTA }, c = {}, list = []; let money = 100;
    for (const p of [...data.players].filter((p) => p.chance === null || p.chance >= 75).sort((a, b) => h5[b.id] - h5[a.id])) {
      if (!need[p.pos] || (c[p.short] || 0) >= 3) continue;
      const reserve = Object.entries(need).reduce((s, [pos, n]) => s + (n - (pos === p.pos ? 1 : 0)) * cheapest[pos], 0);
      if (p.price + reserve > money + 1e-9) continue;
      list.push(p.id); need[p.pos]--; c[p.short] = (c[p.short] || 0) + 1; money -= p.price;
    }
    fill(list, money);
  };
  const modelSquad = () => {
    const T = data.model_team; if (!T) return;
    const w = T.weeks.find((x) => !x.finished) || T.weeks[T.weeks.length - 1];
    fill(w.squad.map((p) => p.id), w.bank, 1);
  };
  const clear = () => {
    const before = { slots, bank, ft };
    setSlots(empty()); setOut(null);
    toast("Squad cleared", { undo: () => { setSlots(before.slots); setBank(before.bank); setFt(before.ft); } });
  };
  const share = () => {
    const url = `${location.origin}${location.pathname}?squad=${ids.join(",")}&bank=${(+bank).toFixed(1)}&ft=${ft}#planner`;
    navigator.clipboard?.writeText(url).then(() => toast("Link copied. It opens this squad."), () => toast("Couldn't copy the link."));
  };
  const setSlot = (pos, i, id) => setSlots((s) => ({ ...s, [pos]: s[pos].map((x, k) => (k === i ? id : x)) }));
  const taken = new Set(ids);
  const range = `GW${gws[0]}-${gws[gws.length - 1]}`;
  const name = (id) => byId[id]?.name || "?";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* ---------------- squad */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text3">Your squad</div>
            <p className="mt-1 text-sm text-text2">Click a shirt to pick a player. The plan updates as you go.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]">
            <button onClick={example} className="rounded-[4px] border border-line2 px-2.5 py-1.5 hover:border-mint">Example</button>
            {data.model_team && <button onClick={modelSquad} className="rounded-[4px] border border-line2 px-2.5 py-1.5 hover:border-mint">Model's squad</button>}
            <button onClick={share} disabled={!!problem} className="rounded-[4px] border border-line2 px-2.5 py-1.5 hover:border-mint disabled:opacity-40">Copy link</button>
            <button onClick={clear} disabled={!ids.length} className="rounded-[4px] border border-line2 px-2.5 py-1.5 text-text2 disabled:opacity-40">Clear</button>
          </div>
        </div>

        {/* pitch of slots */}
        <div className="relative mt-4 overflow-hidden rounded-[6px] border border-line bg-[repeating-linear-gradient(180deg,#0b1f15_0_10%,#0d2418_10%_20%)] p-3 sm:p-5">
          <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[4px] border border-[rgb(190_255_220/.22)] sm:inset-5">
            <div className="absolute inset-x-0 top-1/2 border-t border-[rgb(190_255_220/.22)]" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgb(190_255_220/.22)]" />
          </div>
          {[...POS].reverse().map((pos) => (
            <div key={pos} className="relative flex justify-center gap-1.5 py-2 sm:gap-2.5">
              {slots[pos].map((id, i) => {
                const p = id ? byId[id] : null;
                return (
                  <button key={i} onClick={() => setPick({ pos, i })}
                    className={`group w-[19%] max-w-[110px] rounded-[4px] border px-1 py-2 text-center transition-colors ${p ? "border-line2 bg-bg/80 hover:border-mint" : "border-dashed border-[rgb(190_255_220/.35)] bg-bg/30 hover:border-mint"}`}>
                    {p ? <>
                      <div className="truncate text-[12px] sm:text-[13px]">{p.name}</div>
                      <div className="font-mono text-[10px] text-text3">{p.short} · £{p.price.toFixed(1)}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-mint">{h5[p.id].toFixed(1)}{p.chance !== null && p.chance < 100 && <span className="ml-1 text-amber">{p.chance}%</span>}</div>
                    </> : <div className="py-2 font-mono text-[11px] uppercase text-text3 group-hover:text-mint">+ {pos}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* budget and options */}
        <div className="mt-4 grid gap-4 rounded-[6px] border border-line bg-bg/60 p-4 sm:p-5">
          <div>
            <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-text3"><span>Squad £{value.toFixed(1)}m + bank</span><span>£{(value + (+bank || 0)).toFixed(1)}m</span></div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-raised">
              <i className="block bg-text2" style={{ width: `${Math.min(100, value)}%` }} /><i className="block bg-mint" style={{ width: `${Math.min(100 - Math.min(100, value), +bank || 0)}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2 text-text2">Bank £<input type="number" min="0" max="100" step="0.1" value={bank} onChange={(e) => setBank(e.target.value)}
              className="h-8 w-16 rounded-[3px] border border-line2 bg-bg/60 px-2 font-mono text-text outline-none focus:border-mint" />m</label>
            <div className="flex items-center gap-2 text-text2">Free transfers
              <div className="flex overflow-hidden rounded-[3px] border border-line2">
                {[0, 1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setFt(n)} aria-pressed={ft === n} className={`h-8 w-7 font-mono text-[12px] ${ft === n ? "bg-text text-bg" : "text-text2 hover:text-text"}`}>{n}</button>)}
              </div>
            </div>
            <label className="flex items-center gap-2 text-text2"><input type="checkbox" checked={hits} onChange={(e) => setHits(e.target.checked)} className="accent-[rgb(var(--mint))]" /> Allow -4 hits</label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text2">Chips left
            {[["tc", "Triple captain"], ["bb", "Bench boost"], ["fh", "Free hit"], ["wc", "Wildcard"]].map(([k, l]) => (
              <button key={k} onClick={() => setHave((h) => ({ ...h, [k]: !h[k] }))} aria-pressed={have[k]}
                className={`rounded-[3px] border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] ${have[k] ? "border-mint/60 text-mint" : "border-line2 text-text3 line-through"}`}>{l}</button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-text3">Prices are current prices. If a player has risen since you bought him, FPL sells him for up to £0.3m less, so lower the bank to match. Your squad is saved in this browser.</p>
        </div>
      </div>

      {/* ---------------- plan */}
      <div className="min-w-0">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text3">Five-week plan, {range}</div>
          {busy && <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-text3"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />Searching</div>}
        </div>
        {problem && !out && (
          <div className="mt-4 rounded-[6px] border border-line bg-bg/60 p-6">
            <p className="text-text">{ids.length ? problem : "Start with your 15 players."}</p>
            <p className="mt-2 text-sm text-text3">Or load the example squad or the model's own squad to see how a plan looks.</p>
          </div>
        )}
        {err && <p className="mt-4 text-sm text-rose">The planner hit an error: {err}</p>}
        {!out && !problem && busy && <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skel h-28" />)}</div>}
        {out && (
          <div className={`mt-4 grid gap-4 transition-opacity ${busy || problem ? "opacity-50" : ""}`}>
            <Summary out={out} range={range} />
            <Timeline out={out} gws={gws} name={name} byId={byId} />
            <NowMoves out={out} data={data} gws={gws} name={name} h5={h5} openPop={openPop} />
            <Chips out={out} name={name} />
          </div>
        )}
      </div>
      {createPortal(<AnimatePresence>
        {pick && <Picker data={data} pos={pick.pos} gws={gws} h5={h5} current={slots[pick.pos][pick.i] ? byId[slots[pick.pos][pick.i]] : null} taken={taken}
          onPick={(id) => { setSlot(pick.pos, pick.i, id); setPick(null); }} onRemove={() => { setSlot(pick.pos, pick.i, null); setPick(null); }} onClose={() => setPick(null)} />}
      </AnimatePresence>, document.body)}
    </div>
  );
}

function Summary({ out, range }) {
  const base = out.res.base.reduce((a, b) => a + b, 0), plan = out.res.best.pts, moves = out.res.best.log.reduce((s, l) => s + l.moves.length, 0);
  const hits = out.res.best.hitCost;
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-[6px] border border-line bg-bg/60">
      {[["Keep the squad", base.toFixed(1), "no transfers"], ["With the plan", plan.toFixed(1), `${moves} transfer${moves === 1 ? "" : "s"}${hits ? `, -${hits} in hits` : ""}`], ["Difference", sg(plan - base), range]].map(([k, v, n], i) => (
        <div key={k} className={`p-4 sm:p-5 ${i ? "border-l border-line" : ""}`}>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text3">{k}</div>
          <div className={`num mt-2 font-display text-[28px] font-medium leading-none sm:text-[34px] ${i === 2 ? "text-mint" : ""}`}>{v}</div>
          <div className="mt-1.5 font-mono text-[11px] text-text3">{n}</div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ out, gws, name }) {
  const log = out.res.best.log, top = Math.max(...log.map((l) => l.score), ...out.res.base);
  return (
    <div className="rounded-[6px] border border-line bg-bg/60 p-4 sm:p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text3">Week by week</div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        {log.map((l, i) => (
          <motion.div key={l.gw} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`flex flex-col rounded-[4px] border p-3 ${l.moves.length ? "border-mint/40" : "border-line"}`}>
            <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.08em]"><span className="text-text">GW{l.gw}</span><span className="text-text3">{l.ftBefore} FT</span></div>
            <div className="mt-2 min-h-[44px] space-y-1 text-[12px]">
              {l.moves.length ? l.moves.map((m) => <div key={m.in} className="leading-tight"><span className="text-rose">{name(m.out)}</span> <span className="text-text3">→</span> <span className="text-mint">{name(m.in)}</span></div>)
                : <div className="text-text3">Roll the transfer</div>}
              {l.hit > 0 && <div className="font-mono text-[11px] text-amber">-{l.hit} hit</div>}
            </div>
            <div className="mt-3 flex items-end gap-1" style={{ height: 40 }} title={`Plan ${l.score.toFixed(1)}, without transfers ${out.res.base[i].toFixed(1)}`}>
              <i className="w-1/2 rounded-t-[2px] bg-line2" style={{ height: `${(out.res.base[i] / top) * 100}%` }} />
              <i className="w-1/2 rounded-t-[2px] bg-mint" style={{ height: `${(l.score / top) * 100}%` }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[11px]"><span className="text-text3">C {name(l.cap)}</span><span className="text-mint">{l.score.toFixed(1)}</span></div>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 flex gap-5 font-mono text-[10px] uppercase tracking-[0.1em] text-text3">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-line2" />No transfers</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-mint" />Plan</span>
      </div>
    </div>
  );
}

function NowMoves({ out, data, gws, name, openPop }) {
  const [openI, setOpenI] = useState(0);
  const moves = out.res.now.filter((m) => m.gain > 0.05).slice(0, 5);
  if (!moves.length) return <div className="rounded-[6px] border border-line bg-bg/60 p-5 text-sm text-text2">No single transfer adds points over these five weeks. Rolling the transfer is the right call.</div>;
  return (
    <div className="rounded-[6px] border border-line bg-bg/60 p-4 sm:p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text3">Best single transfers this week</div>
      <ul className="mt-3 divide-y divide-line">
        {moves.map((m, i) => {
          const a = data.byId[m.move.out], b = data.byId[m.move.in], top = Math.max(0.5, ...m.weeks.map(Math.abs));
          return (
            <li key={m.move.in + "-" + m.move.out}>
              <button onClick={() => setOpenI(openI === i ? -1 : i)} aria-expanded={openI === i} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="w-5 font-mono text-[11px] text-text3">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]"><span className="text-rose">{a.name}</span> <span className="text-text3">→</span> <span className="text-mint">{b.name}</span></span>
                <span className="font-mono text-[13px] text-mint">{sg(m.gain)}</span>
              </button>
              <div className="grid transition-[grid-template-rows] duration-500" style={{ gridTemplateRows: openI === i ? "1fr" : "0fr" }}>
                <div className="overflow-hidden">
                  <div className="grid gap-3 pb-4 pl-8 sm:grid-cols-2">
                    {[a, b].map((p, k) => (
                      <button key={p.id} data-pid={p.id} onClick={(e) => openPop(p, e.currentTarget)} className="rounded-[4px] border border-line p-3 text-left hover:border-line2">
                        <div className="text-[13px]">{k ? "In" : "Out"}: {p.name} <span className="font-mono text-[11px] text-text3">{p.short} · £{p.price.toFixed(1)}</span></div>
                        <div className="mt-2"><Fix data={data} team={p.short} gws={gws} /></div>
                      </button>
                    ))}
                    <div className="sm:col-span-2">
                      <div className="flex items-end gap-1.5" style={{ height: 44 }}>
                        {m.weeks.map((w, j) => <div key={j} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                          <span className="font-mono text-[10px] text-text3">{sg(w)}</span>
                          <i className={`block w-full max-w-[34px] rounded-t-[2px] ${w < 0 ? "bg-rose/70" : "bg-mint/80"}`} style={{ height: `${Math.max(3, (Math.abs(w) / top) * 26)}px` }} />
                        </div>)}
                      </div>
                      <div className="mt-1 flex gap-1.5">{gws.map((g) => <span key={g} className="flex-1 text-center font-mono text-[10px] text-text3">GW{g}</span>)}</div>
                      <p className="mt-2 text-xs text-text3">Points added each week by this one swap, captain included. £{m.bank.toFixed(1)}m left in the bank.</p>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chips({ out, name }) {
  if (!out.chips.length) return null;
  const say = (c) => {
    if (c.chip === "Triple captain") return [`GW${c.gw}`, `${name(c.who)} is the best captain in the plan, at ${c.gain} predicted. Triple captain adds another ${c.gain}.`, c.gain >= 7];
    if (c.chip === "Bench boost") return [`GW${c.gw}`, `The bench is predicted ${c.gain} that week, the most in the plan.`, c.gain >= 12];
    if (c.chip === "Free hit") return [`GW${c.gw}`, `A one-week squad would score ${sg(c.gain)} more than the plan that week.`, c.gain >= 10];
    return ["now", `A new squad picked from scratch with the same budget would score ${sg(c.gain)} over the five weeks compared with the plan.`, c.gain >= 12];
  };
  return (
    <div className="rounded-[6px] border border-line bg-bg/60 p-4 sm:p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-text3">Chips</div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {out.chips.map((c) => {
          const [when, text, play] = say(c);
          return (
            <li key={c.chip} className={`rounded-[4px] border p-3 ${play ? "border-mint/50" : "border-line"}`}>
              <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.08em]"><span>{c.chip}</span><span className={play ? "text-mint" : "text-text3"}>{play ? `Play ${when}` : "Hold"}</span></div>
              <p className="mt-2 text-[13px] leading-snug text-text2">{text}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-text3">Marked "play" when triple captain is worth 7+, bench boost 12+, free hit 10+ and wildcard 12+ points over the plan. Holding a chip for a double gameweek later in the season is often worth more.</p>
    </div>
  );
}
