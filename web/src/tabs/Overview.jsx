// Dashboard tabs: best XI, all players, player lookup and track record.
import { useMemo, useState } from "react";
import PitchGL from "../components/PitchGL.jsx";
import PlayerSelect from "../components/PlayerSelect.jsx";
import { usePop } from "../components/Popover.jsx";
import { LineChart, PlayerChart, cumulative } from "../components/charts.jsx";
import { CountUp } from "../components/ui.jsx";

export const Box = ({ children, className = "", title, hint }) => (
  <div className={`corners p-5 sm:p-6 ${className}`}>
    {title && <h3 className="font-display text-[19px] font-medium">{title}</h3>}
    {hint && <p className="mt-1 text-sm text-text3">{hint}</p>}
    {children}
  </div>
);

export const Stat = ({ label, tag, value, good, children, decimals = 0, count = true }) => (
  <div className="corners p-5 sm:p-6">
    <div className="mono-label flex justify-between gap-3 text-[10px] text-text3"><span>{label}</span>{tag && <span>{tag}</span>}</div>
    <div className={`num mt-3 font-display text-[40px] font-medium leading-none ${good ? "text-mint" : ""}`}>
      {count && typeof value === "number" ? <CountUp to={value} decimals={decimals} /> : value}
    </div>
    {children && <p className="mt-3 text-sm leading-relaxed text-text2">{children}</p>}
  </div>
);

export function XITab({ data }) {
  const { open } = usePop();
  const hurt = data.players.filter((p) => p.chance !== null && p.chance < 75 && p.raw >= 2).sort((a, b) => b.raw - a.raw).slice(0, 8);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <PitchGL data={data} />
        <p className="relative mt-3 text-sm text-text3">No budget limit: this XI costs £{data.meta.xi_cost}m. Pin height is predicted points and the captain's label shows ×2.</p>
      </div>
      <Box title="Flagged by FPL" hint="What the model predicted before the cut, and FPL's chance of playing.">
        <ul className="mt-4 divide-y divide-line">
          {hurt.length ? hurt.map((p) => (
            <li key={p.id}>
              <button data-pid={p.id} onClick={(e) => open(p, e.currentTarget)} className="flex w-full items-center gap-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block">{p.name} <span className="text-text3">{p.short}</span></span>
                  <small className="block truncate text-text3">{p.news}</small>
                </span>
                <span className="num font-mono text-sm text-amber">{p.chance}%</span>
                <span className="num w-10 text-right font-display text-lg">{p.raw.toFixed(1)}</span>
              </button>
            </li>
          )) : <li className="py-3 text-sm text-text3">No high scorers flagged this week.</li>}
        </ul>
      </Box>
    </div>
  );
}

const COLS = [["name", "Player"], ["team", "Team"], ["pos", "Pos"], ["price", "Price", true], ["pred", "Predicted", true], ["h5", "Next 5", true], ["chance", "Chance", true], ["news", "FPL news"]];

export function PlayersTab({ data, showPlayer }) {
  const P = data.players;
  const maxPrice = Math.ceil(Math.max(...P.map((p) => p.price)) * 2) / 2;
  const [q, setQ] = useState(""), [pos, setPos] = useState(""), [cap, setCap] = useState(maxPrice);
  const [sort, setSort] = useState(["pred", -1]);
  const h5 = useMemo(() => Object.fromEntries(P.map((p) => [p.id, p.h.filter(([g]) => data.planGws.includes(g)).reduce((s, [, v]) => s + v, 0)])), [P, data.planGws]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(), [k, dir] = sort;
    const val = (p) => (k === "h5" ? h5[p.id] : k === "chance" ? p.chance ?? 100 : p[k]);
    return P.filter((p) => (!pos || p.pos === pos) && p.price <= cap && (!t || p.name.toLowerCase().includes(t) || p.team.toLowerCase().includes(t)))
      .sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }, [P, q, pos, cap, sort, h5]);
  const top = Math.max(...P.map((p) => p.pred));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search players or teams" aria-label="Search players or teams"
          className="h-11 w-full rounded-[4px] border border-line2 bg-bg/60 px-4 outline-none placeholder:text-text3 focus:border-mint sm:w-72" />
        <div className="flex gap-1 rounded-[4px] border border-line2 p-1">
          {["", "GK", "DEF", "MID", "FWD"].map((x) => (
            <button key={x} onClick={() => setPos(x)} aria-pressed={pos === x}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs ${pos === x ? "bg-raised text-mint" : "text-text3 hover:text-text"}`}>{x || "ALL"}</button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm text-text2">
          <span className="mono-label text-[10px] text-text3">Max price</span>
          <input type="range" min="4" max={maxPrice} step="0.5" value={cap} onChange={(e) => setCap(+e.target.value)} className="w-36 accent-[rgb(var(--mint))]" />
          <span className="num w-14 font-mono">£{cap.toFixed(1)}m</span>
        </label>
      </div>
      <div className="corners mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line">
              {COLS.map(([k, label, right]) => (
                <th key={k} className={`px-4 py-3 font-normal ${right ? "text-right" : "text-left"}`}>
                  <button onClick={() => setSort(([sk, sd]) => [k, sk === k ? -sd : ["name", "team", "pos", "news"].includes(k) ? 1 : -1])}
                    className={`mono-label text-[10px] ${sort[0] === k ? "text-mint" : "text-text3 hover:text-text"}`}>
                    {label}{sort[0] === k ? (sort[1] > 0 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 150).map((p) => (
              <tr key={p.id} className="border-b border-line/60 hover:bg-raised/40">
                <td className="px-4 py-2.5"><button onClick={() => showPlayer(p.id)} className="text-left hover:text-mint">{p.name}</button>{p.xi && <span className="ml-2 rounded bg-mint/15 px-1.5 font-mono text-[10px] text-mint">XI</span>}</td>
                <td className="px-4 text-text2">{p.team}</td>
                <td className="px-4 font-mono text-xs text-text3">{p.pos}</td>
                <td className="num px-4 text-right font-mono">£{p.price.toFixed(1)}</td>
                <td className="px-4">
                  <div className="flex items-center justify-end gap-2">
                    <i className="hidden h-1 w-16 overflow-hidden rounded bg-raised sm:block"><i className="block h-full bg-mint" style={{ width: `${(Math.max(0, p.pred) / top) * 100}%` }} /></i>
                    <span className="num w-10 text-right font-mono text-mint">{p.pred.toFixed(2)}</span>
                  </div>
                </td>
                <td className="num px-4 text-right font-mono">{h5[p.id].toFixed(1)}</td>
                <td className="num px-4 text-right font-mono text-amber">{p.chance === null || p.chance >= 100 ? "" : `${p.chance}%`}</td>
                <td className="max-w-[260px] truncate px-4 text-text3" title={p.news}>{p.news}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-text3">{rows.length > 150 ? `Showing the top 150 of ${rows.length}. Search or filter to narrow it down.` : `${rows.length} players`}. Next 5 = predicted points for gameweeks {data.planGws[0]}-{data.planGws[data.planGws.length - 1]}.</p>
    </div>
  );
}

export function LookupTab({ data, playerId, setPlayerId }) {
  const p = data.byId[playerId] || data.players[0], hist = data.history[p.id] || [], m = data.meta;
  const scored = hist.reduce((s, h) => s + h[2], 0);
  const off = hist.length ? hist.reduce((s, h) => s + Math.abs(h[1] - h[2]), 0) / hist.length : null;
  return (
    <div>
      <PlayerSelect players={data.players} value={p} onPick={(x) => setPlayerId(x.id)} placeholder="Type a player's name" label="Player" className="max-w-[420px]" />
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[clamp(36px,4.5vw,64px)] font-medium leading-none tracking-[-0.03em]">{p.name}</h2>
          <p className="mt-2 text-text3">{p.team}, {p.pos}, £{p.price.toFixed(1)}m{data.rank[p.id] && ` · #${data.rank[p.id]} this week`}</p>
        </div>
        {p.chance !== null && p.chance < 100 && <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm"><b className="text-amber">{p.chance}% to play.</b> {p.news}</p>}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label={`Gameweek ${m.gw}`} tag="predicted" value={p.pred} decimals={1} good />
        <Stat label={`GW1-${m.played}`} tag="scored" value={scored} />
        <Stat label="Usually off by" tag="per week" value={off === null ? "n/a" : off} decimals={1} />
      </div>
      <Box className="mt-4">
        <PlayerChart key={p.id} hist={hist} next={p.pred} nextGw={m.gw} />
        <div className="mono-label mt-2 flex flex-wrap gap-5 text-[10px] text-text3">
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-line2" />Scored</span>
          <span className="flex items-center gap-2"><i className="h-[3px] w-4 bg-mint" />Predicted before the deadline</span>
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full border-2 border-mint" />Gameweek {m.gw}</span>
        </div>
      </Box>
    </div>
  );
}

const NICE = { "MAE (regular starters)": "Closer to each starter's real score", "Best XI: avg points per GW": "More points from the best XI", "Captain pick: avg points": "More points from the captain" };
export function RecordTab({ data }) {
  const sg = (v) => (v > 0 ? "+" : "") + v.toFixed(2);
  return (
    <div className="grid gap-4">
      <Box title="Model vs the simple rule" hint="Running total for each side's best XI this season. The simple rule picks the players with the best average so far.">
        <div className="mt-4">
          <LineChart series={[{ name: "Model", color: "rgb(var(--mint))", points: cumulative(data.weekly.Model) }, { name: "Simple rule", color: "rgb(var(--text3))", points: cumulative(data.weekly["Season average"]) }]} />
        </div>
      </Box>
      <Box title="Is the gap real?" hint={`The range comes from resampling the ${data.meta.played} played weeks 4,000 times. It says yes only when the whole range is above zero.`}>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="mono-label border-b border-line text-left text-[10px] text-text3"><th className="py-2 font-normal">Model vs simple rule</th><th className="font-normal">Per week</th><th className="font-normal">Likely range</th><th className="font-normal">Sure?</th></tr></thead>
            <tbody>
              {Object.entries(data.edges).map(([k, e]) => (
                <tr key={k} className="border-b border-line/60">
                  <td className="py-3">{NICE[k] || k}</td>
                  <td className="num font-mono text-mint">{sg(e.edge)}</td>
                  <td className="num font-mono text-text2">{sg(e.lo)} to {sg(e.hi)}</td>
                  <td>{e.sure ? <span className="rounded bg-mint/15 px-2 py-0.5 font-mono text-xs text-mint">YES</span> : <span className="font-mono text-xs text-text3">NOT YET</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
    </div>
  );
}
