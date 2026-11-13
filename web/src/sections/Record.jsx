// The season so far, in one place: every gameweek's points for the model's XI and the
// simple rule's XI, the running lead between them, and the weeks whose picks were saved to
// the repo before kickoff. Scrolling plays the season week by week; hover a week for detail.
//
// Two kinds of number appear and they are kept apart on purpose. The bars replay every
// played week with today's model (fair, since it never trained on this season). The rings
// mark weeks from the prediction ledger, where the picks were committed before the deadline
// and scored as they were. When they differ, the ring is the honest one.
import { useCallback, useMemo, useState } from "react";
import { usePinProgress } from "../lib/motion.js";
import { Label, Title } from "./Rest.jsx";

const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";
const when = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export default function Record({ data }) {
  const weeks = useMemo(() => {
    const rule = Object.fromEntries(data.weekly["Season average"]);
    const saved = Object.fromEntries((data.ledger?.scored || []).map((r) => [r.gw, r]));
    let lead = 0, m = 0, r = 0;
    return data.weekly.Model.map(([gw, pts]) => {
      m += pts; r += rule[gw] ?? 0; lead = m - r;
      return { gw, model: pts, rule: rule[gw] ?? 0, total: m, ruleTotal: r, lead, saved: saved[gw] };
    });
  }, [data]);
  const pending = data.ledger?.pending?.[0];
  const n = weeks.length;
  const [k, setK] = useState(0);
  const [hover, setHover] = useState(null);
  const onProgress = useCallback((p) => {
    // phones get the whole season at once; the pinned scroll is for wide screens
    const v = innerWidth < 1024 ? n : Math.min(n, Math.max(0, ((p - 0.06) / 0.72) * n));
    setK((old) => (Math.abs(old - v) > 0.02 ? v : old));
  }, [n]);
  const ref = usePinProgress(onProgress);

  // chart geometry
  const W = 1000, H = 520, L = 46, R = 20, barTop = 250, barBot = H - 44, leadTop = 34, leadBot = 190;
  const colW = (W - L - R) / n, bw = Math.min(26, colW * 0.3);
  const maxPts = Math.max(...weeks.flatMap((w) => [w.model, w.rule, w.saved?.model_xi || 0])) * 1.08;
  const maxLead = Math.max(20, ...weeks.map((w) => Math.abs(w.lead))) * 1.15;
  const cx = (i) => L + colW * (i + 0.5);
  const yb = (v) => barBot - (v / maxPts) * (barBot - barTop);
  const zero = (leadTop + leadBot) / 2, yl = (v) => zero - (v / maxLead) * ((leadBot - leadTop) / 2);

  const shown = Math.floor(k), part = k - shown;
  const grow = (i) => (i < shown ? 1 : i === shown ? part : 0);
  const cur = weeks[Math.min(n - 1, Math.max(0, Math.ceil(k) - 1))];
  const focus = hover !== null ? weeks[hover] : cur;
  // the lead line, drawn up to where the season has played to
  const leadPts = weeks.slice(0, Math.max(1, Math.ceil(k))).map((w, i) => [cx(i), yl(w.lead)]);
  if (part > 0 && shown < n && shown > 0) { const a = weeks[shown - 1], b = weeks[shown]; leadPts[shown] = [cx(shown - 1) + colW * part, yl(a.lead + (b.lead - a.lead) * part)]; }
  const leadPath = leadPts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = leadPts.length ? `${leadPath}L${leadPts.at(-1)[0].toFixed(1)},${zero}L${leadPts[0][0].toFixed(1)},${zero}Z` : "";

  const last = weeks.at(-1), ledgerTotal = (data.ledger?.scored || []).reduce((s, r) => ({ m: s.m + r.model_xi, r: s.r + r.rule_xi }), { m: 0, r: 0 });
  const xi = data.edges["Best XI: avg points per GW"];
  const sg = (v) => (v > 0 ? "+" : "") + Math.round(v);

  return (
    <section ref={ref} id="record" data-tint="70 120 255" data-tint2="56 225 168" data-tx="80%" className="relative py-24 lg:h-[300vh] lg:py-0">
      <div className="flex items-center lg:sticky lg:top-0 lg:h-screen">
        <div className="page grid w-full items-center gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <div>
            <Label>Track record, {data.meta.season}</Label>
            <Title className="mt-4 !text-[clamp(34px,3.8vw,62px)]">Model vs a simple rule, week by week.</Title>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-text2">
              Each week both pick their best eleven: the model from its predictions, the rule from each player's average so far. Scroll to play the season.
            </p>
            <div className="mt-8 grid grid-cols-3 border-y border-line">
              <div className="py-5 pr-4"><Label>Model</Label><div className="num mt-2 font-display text-[44px] font-medium leading-none text-mint">{focus ? focus.total : 0}</div></div>
              <div className="border-l border-line py-5 pl-4 pr-4"><Label>Rule</Label><div className="num mt-2 font-display text-[44px] font-medium leading-none">{focus ? focus.ruleTotal : 0}</div></div>
              <div className="border-l border-line py-5 pl-4"><Label>Lead</Label><div className={`num mt-2 font-display text-[44px] font-medium leading-none ${focus && focus.lead < 0 ? "text-rose" : ""}`}>{focus ? sg(focus.lead) : 0}</div></div>
            </div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-text3">{focus ? `Through gameweek ${focus.gw}` : "Before gameweek 1"}</div>
            <div className="mt-6 grid gap-2.5 text-[13.5px] leading-relaxed text-text2" style={{ opacity: Math.min(1, Math.max(0, (k - n + 0.6) / 0.6)) }}>
              <p>Over the season the model's picks average {sg(xi.edge)} points a week more, but the range is still wide ({sg(xi.lo)} to {sg(xi.hi)}), so it's {xi.sure ? "a clear lead" : "too early to call"}. On 2025-26, which it never saw, the lead was {data.last_season_edge} points.</p>
              {data.ledger?.scored?.length > 0 && (
                <p>Saved before kickoff (the rings): {Math.round(ledgerTotal.m)} points for the model, {Math.round(ledgerTotal.r)} for the rule, over {data.ledger.scored.length} week{data.ledger.scored.length > 1 ? "s" : ""}. <a href={`${REPO}/commits/main/reports/ledger`} target="_blank" rel="noopener" className="text-text underline decoration-line2 underline-offset-4 hover:decoration-text">See every save</a>.</p>
              )}
              {pending && <p className="text-text3">Gameweek {pending.gw} picks saved {when(pending.saved_at)}. Deadline {when(pending.deadline)}.</p>}
            </div>
          </div>

          <div className="relative rounded-[6px] border border-line bg-bg/80 p-4 backdrop-blur-md sm:p-6">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full lg:min-h-[56vh]" role="img"
              aria-label={`Weekly points for the model and the simple rule over ${n} gameweeks, with the running lead. After gameweek ${last.gw} the model leads by ${last.lead}.`}
              onMouseLeave={() => setHover(null)}>
              {/* running lead */}
              <text x={L} y={leadTop - 14} className="fill-text3 font-mono text-[12px]">RUNNING LEAD</text>
              <line x1={L} x2={W - R} y1={zero} y2={zero} stroke="rgb(var(--line2))" />
              <path d={area} fill="url(#leadFill)" />
              <path d={leadPath} fill="none" stroke="rgb(var(--mint))" strokeWidth="2.5" strokeLinejoin="round" />
              {leadPts.length > 0 && <circle cx={leadPts.at(-1)[0]} cy={leadPts.at(-1)[1]} r="5" fill="rgb(var(--mint))" />}
              <defs>
                <linearGradient id="leadFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(56 225 168)" stopOpacity=".28" /><stop offset="1" stopColor="rgb(56 225 168)" stopOpacity="0" /></linearGradient>
              </defs>
              {/* weekly bars */}
              <text x={L} y={barTop - 22} className="fill-text3 font-mono text-[12px]">POINTS EACH GAMEWEEK</text>
              {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={L} x2={W - R} y1={yb(maxPts * f)} y2={yb(maxPts * f)} stroke="rgb(var(--line))" strokeDasharray="2 4" />)}
              <line x1={L} x2={W - R} y1={barBot} y2={barBot} stroke="rgb(var(--line2))" />
              {weeks.map((w, i) => {
                const g = grow(i), on = hover === null || hover === i;
                return (
                  <g key={w.gw} style={{ opacity: on ? 1 : 0.35, transition: "opacity .2s" }}>
                    <rect x={cx(i) - bw - 2} y={yb(w.model * g)} width={bw} height={barBot - yb(w.model * g)} rx="3" fill="rgb(var(--mint))" />
                    <rect x={cx(i) + 2} y={yb(w.rule * g)} width={bw} height={barBot - yb(w.rule * g)} rx="3" fill="rgb(var(--text3))" />
                    {w.saved && g > 0.98 && (
                      <g>
                        <circle cx={cx(i) - bw / 2 - 2} cy={yb(w.saved.model_xi)} r="7" fill="rgb(var(--bg))" stroke="rgb(var(--text))" strokeWidth="2" />
                        <circle cx={cx(i) + bw / 2 + 2} cy={yb(w.saved.rule_xi)} r="7" fill="rgb(var(--bg))" stroke="rgb(var(--text))" strokeWidth="2" />
                      </g>
                    )}
                    <text x={cx(i)} y={H - 18} textAnchor="middle" className={`font-mono text-[13px] ${hover === i ? "fill-text" : "fill-text3"}`}>{w.gw}</text>
                    <rect x={cx(i) - colW / 2} y={leadTop - 20} width={colW} height={H - leadTop} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                  </g>
                );
              })}
              {[0, 50, 100].filter((v) => v < maxPts).map((v) => <text key={v} x={L - 10} y={yb(v) + 4} textAnchor="end" className="fill-text3 font-mono text-[12px]">{Math.round(v)}</text>)}
            </svg>
            {/* hover card */}
            {hover !== null && (() => {
              const w = weeks[hover], left = (cx(hover) / W) * 100;
              return (
                <div className="pointer-events-none absolute top-[44%] z-10 w-[230px] -translate-x-1/2 rounded-[4px] border border-line2 bg-bg/90 px-3.5 py-3 text-[12.5px] leading-snug backdrop-blur"
                  style={{ left: `${Math.min(84, Math.max(16, left))}%` }}>
                  <div className="font-medium text-text">Gameweek {w.gw}</div>
                  <div className="mt-1.5 flex justify-between text-text2"><span>Model's XI</span><span className="num text-mint">{w.model}</span></div>
                  <div className="flex justify-between text-text2"><span>Rule's XI</span><span className="num">{w.rule}</span></div>
                  <div className="flex justify-between text-text3"><span>Lead after this week</span><span className="num">{sg(w.lead)}</span></div>
                  {w.saved && <div className="mt-2 border-t border-line pt-2 text-text2">Saved before kickoff: model <span className="num text-text">{Math.round(w.saved.model_xi)}</span>, rule <span className="num text-text">{Math.round(w.saved.rule_xi)}</span>. Captain {w.saved.captain} scored {Math.round(w.saved.captain_points)}.</div>}
                </div>
              );
            })()}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.1em] text-text3">
              <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-[2px] bg-mint" />Model, replayed</span>
              <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-[2px] bg-text3" />Simple rule</span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full border-2 border-text" />Saved before kickoff</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
