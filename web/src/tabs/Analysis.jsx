// Four analyses, each one SQL query over every match since 2022-23.
import { CatLines, PairBars, POS_COLORS, RankBars, Scatter } from "../components/charts.jsx";
import { Box } from "./Overview.jsx";

const TIERS = ["Under £5m", "£5-6.5m", "£6.5-8.5m", "£8.5-10.5m", "£10.5m+"];
const sg = (v, d = 2) => (v > 0 ? "+" : "") + v.toFixed(d);
const Take = ({ children }) => <p className="max-w-[760px] border-l-2 border-mint pl-4 leading-relaxed text-text2">{children}</p>;
const Legend = ({ items }) => (
  <div className="mono-label mt-3 flex flex-wrap gap-5 text-[10px] text-text3">
    {items.map(([c, t]) => <span key={t} className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{t}</span>)}
  </div>
);

export function Value({ A }) {
  const T = A.value.tiers, mid = T.filter((r) => r.position === "MID"), lo = mid[0], hi = mid[mid.length - 1];
  return (
    <div className="grid gap-4">
      <Box title="Price vs points" hint="Every player this season with 180+ minutes. The dashed lines mark 5 and 10 points per £m.">
        <div className="mt-4"><Scatter xLabel="Current price (£m)" yLabel="Points" guides={[{ slope: 5, label: "5 pts per £m" }, { slope: 10, label: "10 pts per £m" }]}
          pts={A.value.players.map((p) => ({ x: p.price, y: p.points, color: POS_COLORS[p.pos], tip: `${p.name} (${p.team}, ${p.pos}): ${p.points} pts at £${p.price.toFixed(1)}m` }))} /></div>
        <Legend items={Object.entries(POS_COLORS).map(([k, c]) => [c, k])} />
      </Box>
      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Points per 90 by price, 2022-23 to 2025-26" hint="Player-seasons with 900+ minutes. Brighter means more points per 90.">
          <div className="mt-4 grid grid-cols-[48px_repeat(5,minmax(0,1fr))] gap-1 text-center text-xs">
            <span />{TIERS.map((t) => <span key={t} className="font-mono text-[10px] text-text3">{t}</span>)}
            {["GK", "DEF", "MID", "FWD"].map((pos) => [
              <span key={pos} className="py-3 text-left font-mono text-text3">{pos}</span>,
              ...[1, 2, 3, 4, 5].map((t) => {
                const r = T.find((x) => x.position === pos && x.tier === t);
                return r ? <span key={pos + t} title={`${r.players} player-seasons, ${r.points_per_m} pts per £m`} className="num rounded py-3 font-mono"
                  style={{ background: `rgb(var(--mint) / ${Math.max(0.05, (r.points_per_90 - 2.6) / 5.5).toFixed(2)})` }}>{r.points_per_90.toFixed(1)}</span>
                  : <span key={pos + t} className="py-3 text-text3">-</span>;
              }),
            ])}
          </div>
        </Box>
        <Box title="Best value this season" hint="Points per £m, minimum 360 minutes.">
          <ol className="mt-4 divide-y divide-line">
            {A.value.best.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="mr-2 font-mono text-xs text-text3">{String(i + 1).padStart(2, "0")}</span>{p.name}
                  <small className="ml-2 text-text3">{p.team} {p.pos}, £{p.price.toFixed(1)}m, {p.points} pts</small></span>
                <span className="num font-mono text-mint">{p.per_m.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </Box>
      </div>
      <Take>Midfielders over £10.5m scored {hi.points_per_90.toFixed(1)} points per 90 against {lo.points_per_90.toFixed(1)} for those under £5m. Per £m every
        midfield tier lands between {Math.min(...mid.map((r) => r.points_per_m)).toFixed(1)} and {Math.max(...mid.map((r) => r.points_per_m)).toFixed(1)}, so the
        extra cost buys roughly proportional extra points.</Take>
    </div>
  );
}

export function Xg({ A }) {
  const R = A.xg.regression, hot = R[0], cold = R[R.length - 1];
  const names = ["Well above xG", "A bit above", "On target", "A bit below", "Well below"];
  const row = (p, color) => ({ label: p.name, sub: `${p.team}, ${p.goals} from ${p.xg.toFixed(1)} xG`, value: p.diff, color });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Most goals above xG" hint="This season, goals minus xG."><div className="mt-4"><RankBars rows={A.xg.over.map((p) => row(p, "rgb(var(--mint))"))} fmt={(v) => sg(v, 1)} /></div></Box>
        <Box title="Most goals below xG" hint="This season, goals minus xG."><div className="mt-4"><RankBars rows={A.xg.under.map((p) => row(p, "rgb(var(--rose))"))} fmt={(v) => sg(v, 1)} /></div></Box>
      </div>
      <Box title="First half vs second half, 2023-24 to 2025-26" hint="Players grouped by goals minus xG per 90 in gameweeks 1-19, then the same number for them in 20-38. 900+ minutes in each half.">
        <div className="mt-4"><PairBars names={["GW1-19", "GW20-38"]} colors={["rgb(var(--text3))", "rgb(var(--mint))"]}
          groups={R.map((r) => ({ label: names[r.bucket - 1], sub: `${r.players} players`, a: r.first_half, b: r.second_half }))} /></div>
        <Legend items={[["rgb(var(--text3))", "Gameweeks 1-19"], ["rgb(var(--mint))", "Gameweeks 20-38"]]} />
      </Box>
      <Take>The {hot.players} players furthest above their xG in gameweeks 1-19 ({sg(hot.first_half)} goals per 90) were at {sg(hot.second_half)} for the rest of
        the season. The coldest group went from {sg(cold.first_half)} to {sg(cold.second_half)}. For comparing players, xG predicts future goals better than goals do.</Take>
    </div>
  );
}

export function Fdr({ A, data }) {
  const F = A.fdr.points, cats = ["1", "2", "3", "4", "5"], gws = data.planGws;
  const teams = Object.entries(data.fixtures).map(([t, g]) => {
    const all = gws.flatMap((w) => g[w] || []);
    return { t, g, avg: all.reduce((s, r) => s + r.fdr, 0) / Math.max(1, all.length) };
  }).sort((a, b) => a.avg - b.avg);
  const ratio = (p) => { const r = F.filter((x) => x.pos === p); return r[0].points / r[r.length - 1].points; };
  return (
    <div className="grid gap-4">
      <Box title="Average points by fixture difficulty" hint="Players with 60+ minutes, 2022-23 to 2025-26. FPL rates each fixture from 1 (easiest) to 5.">
        <div className="mt-4"><CatLines cats={cats.map((c) => `FDR ${c}`)} yLabel="Avg points"
          series={["GK", "DEF", "MID", "FWD"].map((p) => ({ name: p, color: POS_COLORS[p], values: cats.map((c) => (F.find((r) => r.pos === p && r.fdr === +c) || {}).points ?? null) }))} /></div>
      </Box>
      <Box title={`Gameweeks ${gws[0]}-${gws[gws.length - 1]}`} hint="Easiest run first. Capitals are home games.">
        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-[56px_repeat(5,minmax(0,1fr))_48px] gap-1 text-center text-xs">
            <span className="mono-label text-left text-[10px] text-text3">Team</span>
            {gws.map((g) => <span key={g} className="mono-label text-[10px] text-text3">GW{g}</span>)}<span className="mono-label text-[10px] text-text3">Avg</span>
            {teams.map(({ t, g, avg }) => [
              <span key={t} className="py-2 text-left font-mono">{t}</span>,
              ...gws.map((w) => {
                const f = g[w] || [], d = f.length ? Math.round(f.reduce((s, r) => s + r.fdr, 0) / f.length) : 0;
                return <span key={t + w} className={`rounded py-2 font-mono ${d ? `fdr-${d}` : "text-text3"}`}>{f.length ? f.map((r) => (r.home ? r.opp : r.opp.toLowerCase())).join("+") : "blank"}</span>;
              }),
              <span key={t + "a"} className="num py-2 font-mono text-text2">{avg.toFixed(1)}</span>,
            ])}
          </div>
        </div>
      </Box>
      <Take>Difficulty matters most for defenders: they average {ratio("DEF").toFixed(1)} times the points in their easiest fixtures as in their hardest,
        against {ratio("FWD").toFixed(1)} times for forwards. Clean sheets depend more on the opponent than goals do. {teams[0].t} have the easiest next five.</Take>
    </div>
  );
}

export function Crowd({ A }) {
  const C = A.crowd, g = Object.fromEntries(C.map((r) => [r.grp, r.points]));
  const color = { "Top 10 transferred in": "rgb(var(--sky))", "Top 10 transferred out": "rgb(var(--sky) / .45)", "Top 10 most owned": "rgb(var(--mint))",
    "Owned 11th-50th": "rgb(var(--mint) / .45)", "Everyone else who played": "rgb(var(--line2))" };
  return (
    <div className="grid gap-4">
      <Box title="Transfers, ownership and points" hint="Every gameweek since 2022-23, players are grouped by transfers in, transfers out and ownership, and each group's points that week are averaged.">
        <div className="mt-5"><RankBars fmt={(v) => `${v.toFixed(2)}`} rows={C.map((r) => ({ label: r.grp, sub: `${r.n.toLocaleString("en-US")} player-weeks`, value: r.points, color: color[r.grp] }))} /></div>
      </Box>
      <Take>The ten most transferred-in players averaged {g["Top 10 transferred in"].toFixed(2)} points that week, barely more than the ten most sold
        ({g["Top 10 transferred out"].toFixed(2)}). The ten most owned averaged {g["Top 10 most owned"].toFixed(2)}.</Take>
    </div>
  );
}
