// The model's own £100m FPL team, picked and managed under FPL's rules.
import { BarLine } from "../components/charts.jsx";
import { Box, Stat } from "./Overview.jsx";

export default function TeamTab({ data }) {
  const T = data.model_team;
  if (!T) return <p className="text-text3">The model team appears after the next pipeline run.</p>;
  const done = T.weeks.filter((w) => w.finished), next = T.weeks.find((w) => !w.finished);
  const total = done.reduce((s, w) => s + w.points, 0);
  const avg = done.filter((w) => T.fpl[w.gw]).map((w) => T.fpl[w.gw].average);
  const fplTotal = avg.length === done.length && avg.length ? avg.reduce((s, v) => s + v, 0) : null;
  const best = done.reduce((a, b) => (b.points > a.points ? b : a));
  const moves = done.reduce((s, w) => s + w.transfers.length, 0) + (next ? next.transfers.length : 0);
  const hits = done.reduce((s, w) => s + w.hits, 0);
  const nameIn = (w, id) => (w.squad.find((p) => p.id === id) || {}).name || "?";
  const prevName = (i, id) => { for (let k = i - 1; k >= 0; k--) { const p = T.weeks[k].squad.find((q) => q.id === id); if (p) return p.name; } return "?"; };
  return (
    <div className="grid gap-4">
      <p className="max-w-[760px] text-text2">
        A £100m squad picked and managed by the model: 15 players, at most 3 per club, one free transfer a week (unused ones roll over) and -4 for each extra.
        Every pick was made before that gameweek's results, by a model trained only on earlier seasons.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label={`Total, GW1-${done[done.length - 1].gw}`} tag="after hits" value={total} good>
          {fplTotal !== null ? `${total - fplTotal >= 0 ? "+" : ""}${total - fplTotal} against the average FPL manager (${fplTotal}).` : `${(total / done.length).toFixed(1)} points a gameweek.`}
        </Stat>
        <Stat label="Best gameweek" tag={`GW${best.gw}`} value={best.points}>Captain {nameIn(best, best.captain)}.</Stat>
        <Stat label="Transfers" tag={hits ? `${hits} pts in hits` : "no hits taken"} value={moves}>£{(next || done[done.length - 1]).bank.toFixed(1)}m in the bank.</Stat>
      </div>
      <Box title="Points each gameweek" hint={avg.length > 1 ? "Bars are the model team. The dashed line is the average FPL manager." : "The average FPL manager's score is added after the next data refresh."}>
        <div className="mt-4">
          <BarLine rows={done.map((w) => ({ label: `GW${w.gw}`, value: w.points, compare: T.fpl[w.gw]?.average,
            tip: `GW${w.gw}: ${w.points} pts${w.hits ? ` after -${w.hits}` : ""}${T.fpl[w.gw] ? `, FPL average ${T.fpl[w.gw].average}` : ""}` }))} />
        </div>
      </Box>
      <div className="grid gap-4 lg:grid-cols-2">
        {next && (
          <Box title={`Gameweek ${next.gw} squad`} hint={next.transfers.length
            ? `${next.transfers.map((t) => `${nameIn(next, t.in)} in for ${prevName(T.weeks.indexOf(next), t.out)}`).join(", ")}${next.hits ? `, -${next.hits} hit` : ""}. Predicted points shown.`
            : "No transfer this week, so the free transfer rolls over. Predicted points shown."}>
            {["GK", "DEF", "MID", "FWD"].map((pos) => (
              <div key={pos} className="mt-4">
                <div className="mono-label mb-2 text-[10px] text-text3">{pos}</div>
                <div className="flex flex-wrap gap-2">
                  {next.squad.filter((p) => p.pos === pos).sort((a, b) => b.start - a.start || b.pred - a.pred).map((p) => (
                    <span key={p.id} className={`rounded-lg border px-2.5 py-1 text-sm ${p.id === next.captain ? "border-mint/50 bg-mint/10 text-mint" : p.start ? "border-line2" : "border-dashed border-line2 text-text3"}`}>
                      {p.name}{p.id === next.captain && " (C)"} <span className="num font-mono text-xs text-text3">{p.pred.toFixed(1)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Box>
        )}
        <Box title="Transfer log" hint="Every transfer the team has made, newest first.">
          <table className="mt-4 w-full text-sm">
            <thead><tr className="mono-label border-b border-line text-left text-[10px] text-text3"><th className="py-2 font-normal">GW</th><th className="font-normal">Transfers</th><th className="text-right font-normal">Points</th></tr></thead>
            <tbody>
              {T.weeks.map((w, i) => (
                <tr key={w.gw} className="border-b border-line/60 align-top">
                  <td className="py-2.5 font-mono text-text3">{w.gw}</td>
                  <td className="py-2.5">{w.transfers.length ? w.transfers.map((t) => <div key={t.in}>{prevName(i, t.out)} <span className="text-text3">→</span> {nameIn(w, t.in)}</div>) : <span className="text-text3">none</span>}
                    {w.hits ? <span className="ml-1 font-mono text-amber">-{w.hits}</span> : null}</td>
                  <td className="num py-2.5 text-right font-mono">{w.finished ? w.points : <span className="text-text3">to play</span>}</td>
                </tr>
              )).reverse()}
            </tbody>
          </table>
        </Box>
      </div>
      <p className="text-sm text-text3">Gameweeks 1-7 were simulated afterwards with the predictions made before each deadline. FPL doesn't keep past injury flags, so those weeks had no injury news. From gameweek 8 on, each decision is saved before the gameweek starts and never changed.</p>
    </div>
  );
}
