// Everything below the 3D stack, in the same restrained style: black, white, one colour,
// Geist with small mono labels. Two pinned scroll moments: the track record draws itself
// as you scroll, and the findings slide past sideways.
import { useCallback, useMemo, useRef, useState } from "react";
import { animated, useSpring } from "@react-spring/web";
import { PixelTeam } from "./Story.jsx";
import { Bars, HBars, cumulative } from "../components/charts.jsx";
import { usePop } from "../components/Popover.jsx";
import { useInView, usePinProgress, reduced } from "../lib/motion.js";

const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";

export function Label({ children }) {
  return <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-text3">{children}</div>;
}

// a heading that rises out of a mask when it scrolls into view
export function Title({ children, className = "" }) {
  const [ref, seen] = useInView();
  return (
    <h2 ref={ref} className={`overflow-hidden pb-[0.08em] font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1.02] tracking-[-0.04em] ${className}`}>
      <span className="block transition-[transform,opacity,filter] duration-[1100ms] ease-[cubic-bezier(.2,.7,.1,1)]"
        style={{ transform: seen ? "none" : "translateY(70%)", opacity: seen ? 1 : 0, filter: seen ? "none" : "blur(6px)" }}>{children}</span>
    </h2>
  );
}

function Fade({ children, delay = 0, className = "" }) {
  const [ref, seen] = useInView();
  return <div ref={ref} className={`transition-[transform,opacity] duration-1000 ease-[cubic-bezier(.2,.7,.1,1)] ${className}`}
    style={{ transitionDelay: `${delay}ms`, transform: seen ? "none" : "translateY(28px)", opacity: seen ? 1 : 0 }}>{children}</div>;
}

function Count({ to, decimals = 0 }) {
  const [ref, seen] = useInView();
  const s = useSpring({ v: seen ? to : 0, config: { tension: 50, friction: 20 }, immediate: reduced });
  return <animated.span ref={ref} className="num">{s.v.to((v) => v.toFixed(decimals))}</animated.span>;
}

// ------------------------------------------------------------------ last gameweek
export function LastGameweek({ data }) {
  const L = data.last_gw;
  const cells = [["Model's XI", L.model, "captain doubled"], ["Simple rule's XI", L.rule, "best average so far"], ["Best possible XI", L.best, "picked with hindsight"],
    [`Captain ${L.captain.name}`, L.captain.points * 2, `predicted ${L.captain.pred}, scored ${L.captain.points}`]];
  return (
    <section id="last" data-tint="56 225 168" data-tint2="70 120 255" data-tx="20%" className="page relative py-32 lg:py-44">
      <Label>Gameweek {L.gw} result</Label>
      <Title className="mt-4 max-w-[980px]">The model's XI scored {L.model} points. The best possible XI scored {L.best}.</Title>
      <div className="mt-14 grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
        {cells.map(([k, v, note], i) => (
          <Fade key={k} delay={i * 80} className={`py-7 sm:px-6 ${i ? "border-t border-line sm:border-t-0 lg:border-l" : ""} ${i === 2 ? "sm:border-l-0 lg:border-l" : ""} ${i % 2 ? "sm:border-l" : ""}`}>
            <Label>{k}</Label>
            <div className={`mt-3 font-display text-[56px] font-medium leading-none tracking-[-0.03em] ${i === 0 ? "text-mint" : ""}`}><Count to={v} /></div>
            <div className="mt-2 font-mono text-[12px] text-text3">{note}</div>
          </Fade>
        ))}
      </div>
      <Fade className="mt-14"><PixelTeam team={L.team} /></Fade>
    </section>
  );
}

// ------------------------------------------------------------------ track record, drawn by scroll
export function TrackRecord({ data }) {
  const model = useMemo(() => cumulative(data.weekly.Model), [data]), rule = useMemo(() => cumulative(data.weekly["Season average"]), [data]);
  const W = 1000, H = 420, n = model.length, top = Math.max(...model.map((x) => x[1]), ...rule.map((x) => x[1])) * 1.08;
  const X = (i) => 40 + (i / (n - 1)) * (W - 80), Y = (v) => H - 40 - (v / top) * (H - 80);
  const path = (s) => s.map(([, v], i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const refs = useRef({});
  const onProgress = useCallback((p) => {
    const k = Math.min(1, Math.max(0, (p - 0.08) / 0.7)), r = refs.current;
    if (r.m) r.m.style.strokeDashoffset = String(1 - k);
    if (r.r) r.r.style.strokeDashoffset = String(1 - k);
    const i = Math.min(n - 1, Math.floor(k * (n - 1) + 0.0001));
    if (r.mv) r.mv.textContent = String(Math.round(model[i][1] + (k * (n - 1) - i) * ((model[i + 1] || model[i])[1] - model[i][1])));
    if (r.rv) r.rv.textContent = String(Math.round(rule[i][1] + (k * (n - 1) - i) * ((rule[i + 1] || rule[i])[1] - rule[i][1])));
    if (r.gw) r.gw.textContent = `GW${model[i][0]}`;
    (r.dots || []).forEach((d, j) => d && (d.style.opacity = j <= k * (n - 1) + 0.01 ? "1" : "0"));
    if (r.facts) r.facts.style.opacity = String(Math.min(1, Math.max(0, (p - 0.78) / 0.12)));
  }, [model, rule, n]);
  const ref = usePinProgress(onProgress);
  const xi = data.edges["Best XI: avg points per GW"], mae = data.edges["MAE (regular starters)"];
  const sg = (v) => (v > 0 ? "+" : "") + Math.round(v);
  return (
    <section ref={ref} id="record" data-tint="70 120 255" data-tint2="56 225 168" data-tx="80%" className="relative h-[260vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="page grid w-full items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <Label>Track record, {data.meta.season}</Label>
            <Title className="mt-4">Model vs a simple rule.</Title>
            <p className="mt-5 max-w-[440px] text-text2">Before each deadline the model picks an XI, and so does a rule that takes the eleven best averages so far. Scroll to play the season.</p>
            <div className="mt-10 grid grid-cols-2 border-y border-line">
              <div className="py-6 pr-6"><Label>Model, total</Label><div ref={(e) => (refs.current.mv = e)} className="num mt-3 font-display text-[64px] font-medium leading-none text-mint">0</div></div>
              <div className="border-l border-line py-6 pl-6"><Label>Simple rule, total</Label><div ref={(e) => (refs.current.rv = e)} className="num mt-3 font-display text-[64px] font-medium leading-none">0</div></div>
            </div>
            <div ref={(e) => (refs.current.facts = e)} className="mt-6 grid gap-3 font-mono text-[12px] leading-relaxed text-text3" style={{ opacity: 0 }}>
              <span>2025-26, never seen in training: <b className="font-normal text-text">+{data.last_season_edge} pts</b> over the season.</span>
              <span>This season: <b className="font-normal text-text">{sg(xi.edge)} a week</b>, range {sg(xi.lo)} to {sg(xi.hi)}. {xi.sure ? "Clear." : "Too early to call."}</span>
              <span>Per player: <b className="font-normal text-text">{mae.edge.toFixed(2)} pts</b> closer to what each starter scores. {mae.sure ? "Clear." : ""}</span>
            </div>
          </div>
          <div className="relative">
            <div ref={(e) => (refs.current.gw = e)} className="absolute right-0 top-0 font-mono text-[12px] uppercase tracking-[0.12em] text-text3">GW1</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full lg:min-h-[52vh]" role="img" aria-label="Running points total for the model and the simple rule">
              {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="40" x2={W - 40} y1={Y(top * f / 1.08)} y2={Y(top * f / 1.08)} stroke="rgb(var(--line))" />)}
              {model.map(([g], i) => <text key={g} x={X(i)} y={H - 10} textAnchor="middle" className="fill-text3 font-mono text-[13px]">GW{g}</text>)}
              <path ref={(e) => (refs.current.r = e)} d={path(rule)} fill="none" stroke="rgb(var(--text3))" strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
              <path ref={(e) => (refs.current.m = e)} d={path(model)} fill="none" stroke="rgb(var(--mint))" strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                style={{ filter: "drop-shadow(0 0 8px rgb(var(--mint) / .6))" }} />
              {model.map(([g, v], i) => <circle key={g} ref={(e) => ((refs.current.dots ||= [])[i] = e)} cx={X(i)} cy={Y(v)} r="5" fill="rgb(var(--mint))" style={{ opacity: 0, transition: "opacity .3s" }} />)}
            </svg>
            <div className="mt-3 flex gap-6 font-mono text-[11px] uppercase tracking-[0.12em] text-text3">
              <span className="flex items-center gap-2"><i className="h-[2px] w-5 bg-mint" />Model</span><span className="flex items-center gap-2"><i className="h-[2px] w-5 bg-text3" />Simple rule</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ findings, a sideways gallery
export function Findings({ data }) {
  const A = data.analysis;
  const def = A.fdr.points.filter((r) => r.pos === "DEF"), hot = A.xg.regression[0], cold = A.xg.regression[A.xg.regression.length - 1];
  const mid = A.value.tiers.filter((r) => r.position === "MID"), crowd = Object.fromEntries(A.crowd.map((r) => [r.grp, r.points]));
  const FDR = { 1: "#1f8a5b", 2: "#2f6f52", 3: "rgb(var(--text3))", 4: "#7a3b45", 5: "#a3333f" };
  const items = [
    { href: "#analysis-fdr", title: `Defenders average ${def[0].points.toFixed(1)} points in the easiest fixtures and ${def[def.length - 1].points.toFixed(1)} in the hardest.`,
      body: "Defenders with 60+ minutes, by FPL's difficulty rating, 2022-23 to 2025-26.", chart: <Bars rows={def.map((r) => ({ label: `FDR ${r.fdr}`, value: r.points, color: FDR[r.fdr] }))} /> },
    { href: "#analysis-xg", title: "Scoring above xG doesn't last into the second half of a season.",
      body: "Goals minus xG per 90. The players furthest above it in gameweeks 1-19 were level with it in 20-38.",
      chart: <HBars fmt={(v) => (v > 0 ? "+" : "") + v.toFixed(2)} rows={[{ label: "Hot, GW1-19", value: hot.first_half, color: "rgb(var(--mint))" }, { label: "Hot, GW20-38", value: hot.second_half, color: "rgb(var(--mint) / .4)" },
        { label: "Cold, GW1-19", value: cold.first_half, color: "rgb(var(--rose))" }, { label: "Cold, GW20-38", value: cold.second_half, color: "rgb(var(--rose) / .4)" }]} /> },
    { href: "#analysis-value", title: "Expensive midfielders score more per 90, at about the same value per £m.",
      body: "Points per 90 for midfielders by price band, 2022-23 to 2025-26.", chart: <Bars rows={mid.map((r, i) => ({ label: ["<£5", "£5-6.5", "£6.5-8.5", "£8.5-10.5", "£10.5+"][r.tier - 1], value: r.points_per_90, color: `rgb(var(--mint) / ${0.35 + i * 0.16})` }))} /> },
    { href: "#analysis-crowd", title: "The most transferred-in players score about the same as the most transferred-out.",
      body: "Average points that gameweek, every gameweek since 2022-23. The most owned scored the most.",
      chart: <Bars fmt={(v) => v.toFixed(2)} rows={[{ label: "Top 10 in", value: crowd["Top 10 transferred in"], color: "rgb(var(--sky))" }, { label: "Top 10 out", value: crowd["Top 10 transferred out"], color: "rgb(var(--sky) / .45)" },
        { label: "Most owned", value: crowd["Top 10 most owned"], color: "rgb(var(--mint))" }, { label: "Everyone else", value: crowd["Everyone else who played"], color: "rgb(var(--line2))" }]} /> },
  ];
  const track = useRef(null), bar = useRef(null);
  const onProgress = useCallback((p) => {
    const t = track.current; if (!t) return;
    const max = t.scrollWidth - t.parentElement.clientWidth;
    t.style.transform = `translate3d(${-p * max}px,0,0)`;
    if (bar.current) bar.current.style.transform = `scaleX(${p})`;
  }, []);
  const ref = usePinProgress(onProgress);
  return (
    <section ref={ref} id="findings" data-tint="56 225 168" data-tint2="70 120 255" data-tx="50%" className="relative h-[340vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="page">
          <Label>Findings</Label>
          <Title className="mt-4">Four questions, answered in SQL.</Title>
        </div>
        <div className="mt-10 overflow-hidden pl-4 sm:pl-8 lg:pl-14">
          <div ref={track} className="flex w-max gap-5 pr-[10vw] will-change-transform">
            {items.map((it, i) => (
              <a key={it.href} href={`./dashboard.html${it.href}`} className="group flex w-[min(86vw,620px)] flex-col border border-line bg-bg/70 p-7 backdrop-blur transition-colors hover:border-line2 sm:p-9">
                <div className="flex justify-between font-mono text-[12px] text-text3"><span>{String(i + 1).padStart(2, "0")} / 04</span><span className="transition-colors group-hover:text-mint">Full chart ›</span></div>
                <h3 className="mt-6 text-[clamp(22px,2vw,28px)] font-medium leading-tight tracking-[-0.02em]">{it.title}</h3>
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-text3">{it.body}</p>
                <div className="mt-auto pt-10">{it.chart}</div>
              </a>
            ))}
          </div>
        </div>
        <div className="page mt-10"><div className="h-px bg-line"><i ref={bar} className="block h-px origin-left bg-text" style={{ transform: "scaleX(0)" }} /></div></div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ this week's top 10
export function TopPicks({ data }) {
  const { open } = usePop();
  const top = data.players.slice(0, 10), gws = data.planGws;
  const max = Math.max(...top.flatMap((p) => p.h.map(([, v]) => v)));
  return (
    <section id="picks" data-tint="56 225 168" data-tint2="70 120 255" data-tx="80%" className="page relative py-32 lg:py-44">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div><Label>Gameweek {data.meta.gw}</Label><Title className="mt-4">The top ten.</Title></div>
        <a href="./dashboard.html#players" className="font-mono text-[12px] uppercase tracking-[0.12em] text-text2 hover:text-text">All {data.players.length} players ›</a>
      </div>
      <div className="mt-12 border-t border-line">
        <div className="grid grid-cols-[40px_minmax(0,1fr)_120px_80px] gap-4 border-b border-line py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text3 sm:grid-cols-[48px_minmax(0,1.4fr)_80px_80px_minmax(0,1fr)_90px]">
          <span>#</span><span>Player</span><span className="max-sm:hidden">Club</span><span className="max-sm:hidden">Price</span><span>Next {gws.length}</span><span className="text-right">Pts</span>
        </div>
        {top.map((p, i) => {
          const pts = Object.fromEntries(p.h);
          return (
            <Fade key={p.id} delay={i * 40}>
              <button data-pid={p.id} onClick={(e) => open(p, e.currentTarget, `Ranked #${i + 1} by predicted points this week.`)}
                className="group grid w-full grid-cols-[40px_minmax(0,1fr)_120px_80px] items-center gap-4 border-b border-line py-4 text-left transition-colors hover:bg-raised/40 sm:grid-cols-[48px_minmax(0,1.4fr)_80px_80px_minmax(0,1fr)_90px]">
                <span className="font-mono text-[13px] text-text3">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate text-[clamp(18px,1.6vw,24px)] tracking-[-0.01em] transition-transform duration-500 group-hover:translate-x-2">{p.name}</span>
                <span className="font-mono text-[13px] text-text2 max-sm:hidden">{p.short} {p.pos}</span>
                <span className="font-mono text-[13px] text-text2 max-sm:hidden">£{p.price.toFixed(1)}m</span>
                <span className="flex h-6 items-end gap-1">{gws.map((g) => <i key={g} className="w-full max-w-[16px] bg-text3/60 transition-colors group-hover:bg-mint" style={{ height: `${((pts[g] || 0) / max) * 100}%` }} />)}</span>
                <span className="num text-right font-mono text-[18px] text-mint">{p.pred.toFixed(1)}</span>
              </button>
            </Fade>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ questions
// Answers are built from this week's data, so they stay true after every refresh.
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
function buildQA(data) {
  const P = data.players, m = data.meta, top = P.slice(0, 3), cap = data.byId[data.captain];
  let n = 0, err = 0, close = 0;
  Object.values(data.history).forEach((h) => h.forEach(([, pred, pts, mins]) => { if (mins > 0) { n++; err += Math.abs(pred - pts); close += Math.abs(pred - pts) <= 2; } }));
  const flagged = P.filter((p) => p.chance !== null && p.chance < 75).sort((a, b) => b.raw - a.raw)[0];
  const T = data.model_team, hits = T ? T.weeks.reduce((s, w) => s + w.hits, 0) : 0, weeks = T ? T.weeks.filter((w) => w.finished).length : 0;
  return [
    [`Who should I captain in gameweek ${m.gw}?`,
      `${cap.name}, at ${cap.pred.toFixed(1)} predicted points, so ${(Math.round(cap.pred * 10) / 5).toFixed(1)} as captain. ${top[1].name} (${top[1].pred.toFixed(1)}) and ${top[2].name} (${top[2].pred.toFixed(1)}) are next. If you don't own ${cap.name}, the best captain is whoever in your squad sits highest on the dashboard's player list.`],
    ["How far off are the predictions?",
      `This season, for players who got on the pitch, the average miss is ${(err / n).toFixed(1)} points, and ${Math.round((close / n) * 100)}% of predictions land within 2 points of the real score. Most of the misses are goals and assists, which swing a lot from week to week. The predictions are best used to rank players against each other.`],
    ["Is it worth taking a -4 hit?",
      `Only when the player coming in out-scores the one going out by more than 4 points over the weeks you'll keep him, which is 0.8 a week across five gameweeks. The transfer planner does that sum for you. The model's own team has taken ${hits ? `${hits / 4} hit${hits > 4 ? "s" : ""}` : "no hits"} in ${weeks} gameweeks.`],
    [flagged ? `Why isn't ${flagged.name} in the best XI?` : "Why is a big name missing from the best XI?",
      flagged ? `On form and fixtures he'd be predicted ${flagged.raw.toFixed(1)}, but ${flagged.news.startsWith("Note:") ? "this site's news file" : "FPL"} puts his chance of playing at ${flagged.chance}%, and every prediction is multiplied by that chance. The note says: ${lower(flagged.news.replace(/^Note: /, "").replace(/\.$/, ""))}. When the flag goes, he comes back in.`
        : "Usually an injury flag: every prediction is multiplied by FPL's chance of playing, so a doubtful player drops down the list until the flag goes."],
    ["What can't it know?",
      "Anything that isn't in the stats or FPL's flags: a manager's press conference, a surprise rotation, a new penalty taker, or a player who just joined from abroad and has no Premier League minutes to learn from. A small news file covers the obvious cases, like a player dropped after a falling-out."],
    ["Can I run it myself?",
      "Yes. Clone the repo, install the requirements and run python run_pipeline.py. It downloads the data, builds the SQLite database, trains the model and writes everything this site shows."],
  ];
}
function QItem({ i, q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-baseline gap-6 py-6 text-left">
        <span className="font-mono text-[12px] text-text3">{String(i + 1).padStart(2, "0")}</span>
        <span className="flex-1 text-[clamp(18px,1.6vw,22px)] tracking-[-0.01em]">{q}</span>
        <span className={`font-mono text-text3 transition-transform duration-500 ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      <div className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.7,.1,1)]" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden"><p className="max-w-[640px] pb-7 pl-[calc(12px+1.5rem+1ch)] text-text2">{a}</p></div>
      </div>
    </div>
  );
}
export function FAQ({ data }) {
  return (
    <section id="faq" data-tint="70 120 255" data-tint2="56 225 168" data-tx="15%" className="page relative grid gap-10 py-32 lg:grid-cols-[0.7fr_1.3fr] lg:py-44">
      <div><Label>Questions</Label><Title className="mt-4">Before you copy the picks.</Title></div>
      <div className="border-t border-line">{buildQA(data).map(([q, a], i) => <QItem key={q} i={i} q={q} a={a} />)}</div>
    </section>
  );
}

// ------------------------------------------------------------------ end
export function Closing({ data }) {
  return (
    <section data-tint="56 225 168" data-tint2="70 120 255" data-tx="50%" data-glow="0.8" className="page relative py-32 text-center lg:py-48">
      <Label>Gameweek {data.meta.gw}</Label>
      <a href="./dashboard.html" className="group mt-6 inline-flex items-baseline gap-4 font-display text-[clamp(48px,9vw,148px)] font-medium leading-none tracking-[-0.05em]">
        Open the dashboard<span className="text-mint transition-transform duration-500 group-hover:translate-x-3">›</span>
      </a>
      <p className="mx-auto mt-8 max-w-[520px] font-mono text-[12px] leading-relaxed text-text3">Every player's prediction, the model's own FPL team, a transfer planner for the next five gameweeks, and the analysis behind the findings.</p>
    </section>
  );
}

export function Footer({ data }) {
  const m = data.meta;
  const when = m.refreshed_at ? new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const cols = [
    ["Site", [["./", "Home"], ["./dashboard.html", "Dashboard"], ["./dashboard.html#planner", "Transfer planner"]]],
    ["Project", [[REPO, "GitHub"], [`${REPO}#readme`, "Method"], [`${REPO}/tree/main/tableau`, "Tableau"]]],
    ["Data", [["https://fantasy.premierleague.com/", "FPL API"], ["https://github.com/vaastav/Fantasy-Premier-League", "Vaastav archive"]]],
  ];
  return (
    <footer className="relative border-t border-line">
      <div className="page grid gap-10 pb-10 pt-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <p className="max-w-[340px] text-sm leading-relaxed text-text3">Predicted Fantasy Premier League points for every player, rebuilt after each gameweek. Made by Andrew Kwon.</p>
        {cols.map(([h, links]) => (
          <div key={h}>
            <Label>{h}</Label>
            <div className="mt-4 grid gap-2">{links.map(([href, t]) => <a key={t} href={href} className="text-sm text-text2 hover:text-text">{t}</a>)}</div>
          </div>
        ))}
      </div>
      <div className="page flex flex-wrap justify-between gap-3 border-t border-line pb-[max(24px,env(safe-area-inset-bottom))] pt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-text3">
        <span>Data: {m.source || "open FPL archive"}{when && `, ${when}`}</span><span>Not affiliated with the Premier League or FPL</span>
      </div>
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <div className="page translate-y-[18%] whitespace-nowrap font-display text-[clamp(64px,15.5vw,250px)] font-medium leading-none tracking-[-0.06em] text-text/[.06]">FPL Points Lab</div>
      </div>
    </footer>
  );
}
