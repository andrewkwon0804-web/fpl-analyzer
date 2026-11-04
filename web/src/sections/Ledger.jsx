// The prediction ledger: picks saved before each deadline, scored after the games. Each
// version of a gameweek's file is a commit, so the history on GitHub shows when it was saved.
const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";
const when = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export default function Ledger({ data }) {
  const L = data.ledger || { scored: [], pending: [] };
  const rows = [...L.scored.map((r) => ({ ...r, done: true })), ...L.pending.map((r) => ({ ...r, done: false }))].sort((a, b) => b.gw - a.gw);
  const tot = L.scored.reduce((s, r) => ({ m: s.m + r.model_xi, r: s.r + r.rule_xi }), { m: 0, r: 0 });
  return (
    <section id="ledger" className="page relative py-28 lg:py-36" data-tint="70 120 255" data-tint2="56 225 168" data-tx="20%">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <h2 className="font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1.02] tracking-[-0.04em]">Called before kickoff.</h2>
          <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-text2">
            The track record above replays the season with today's model. This one can't be replayed: each gameweek's picks are saved to the repo before the deadline and never changed after it. Once the games are played, they're scored as they were.
          </p>
          {L.scored.length > 0 && (
            <p className="mt-6 text-[15px] text-text">
              So far: the model's saved XIs scored <span className="num">{Math.round(tot.m)}</span> points, the season-average rule's <span className="num">{Math.round(tot.r)}</span>, over {L.scored.length} gameweek{L.scored.length > 1 ? "s" : ""}.
            </p>
          )}
          <a href={`${REPO}/commits/main/reports/ledger`} target="_blank" rel="noopener" className="mt-8 inline-flex text-[14px] text-text2 underline decoration-line2 underline-offset-4 hover:text-text hover:decoration-text">See every save on GitHub</a>
        </div>
        <ol className="self-start rounded-[6px] border border-line bg-bg/70 backdrop-blur" aria-label="Saved picks by gameweek">
          {rows.length === 0 && (
            <li className="p-6 text-[14px] leading-relaxed text-text2">The first picks are saved on the next refresh before gameweek {data.meta.gw}'s deadline. They'll appear here, and be scored once the gameweek is played.</li>
          )}
          {rows.map((r) => (
            <li key={r.gw} className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 border-b border-line px-5 py-5 last:border-0 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
              <div className="font-display text-[28px] font-medium leading-none tracking-[-0.02em]">GW{r.gw}</div>
              <div className="min-w-0 text-[13px] leading-relaxed text-text2">
                <div>Saved {when(r.saved_at)}</div>
                <div className="text-text3">Deadline {when(r.deadline)}</div>
                {r.done && <div className="mt-1 text-text3">Captain {r.captain}, {Math.round(r.captain_points)} points. Rule's captain {r.rule_captain}, {Math.round(r.rule_captain_points)}.</div>}
              </div>
              <div className="col-span-2 flex gap-6 sm:col-span-1 sm:justify-end">
                {r.done ? (
                  <>
                    <div><div className="text-[11px] text-text3">Model</div><div className="num text-[24px] font-medium text-mint">{Math.round(r.model_xi)}</div></div>
                    <div><div className="text-[11px] text-text3">Rule</div><div className="num text-[24px] font-medium">{Math.round(r.rule_xi)}</div></div>
                    <div><div className="text-[11px] text-text3">Best</div><div className="num text-[24px] font-medium text-text3">{Math.round(r.hindsight_xi)}</div></div>
                  </>
                ) : (
                  <span className="self-center rounded-full border border-amber/50 px-3 py-1 text-[12px] text-amber">Waiting for the games</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
