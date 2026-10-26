// Last gameweek, how it works, and the track record.
import { useEffect, useRef, useState } from "react";
import { animated, useTrail } from "@react-spring/web";
import { Kicker, SplitTitle, Reveal, CountUp, BigWord } from "../components/ui.jsx";
import { LineChart, cumulative } from "../components/charts.jsx";
import { useInView, reduced } from "../lib/motion.js";

const C = { mint: "rgb(var(--mint))", sky: "rgb(var(--sky))", grey: "rgb(var(--text3))", dim: "rgb(var(--line2))" };

function Head({ kicker, title, children }) {
  return (
    <div className="max-w-[820px]">
      <Kicker>{kicker}</Kicker>
      <SplitTitle text={title} className="font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1] tracking-[-0.035em]" />
      {children && <Reveal delay={150}><p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-text2">{children}</p></Reveal>}
    </div>
  );
}

export function LastGameweek({ data }) {
  const L = data.last_gw;
  const [ref, seen] = useInView();
  const top = Math.max(...L.team.map((p) => Math.max(p.points, p.pred)), 1);
  const trail = useTrail(L.team.length, { h: seen ? 1 : 0, config: { tension: 140, friction: 20 }, immediate: reduced });
  if (!L) return null;
  const diff = L.model - (L.rule ?? L.model);
  const vs = L.rule === null ? "" : diff > 0 ? `, ${diff} more than the simple rule's XI` : diff < 0 ? `, ${-diff} fewer than the simple rule's XI` : ", the same as the simple rule's XI";
  const cells = [["Model's XI", L.model, C.mint, "captain doubled"], ["Simple rule's XI", L.rule, C.grey, "best average so far"], ["Best possible XI", L.best, C.dim, "picked with hindsight"]];
  if (L.fpl_average !== undefined) cells.push(["Average FPL manager", L.fpl_average, C.sky, `highest was ${L.fpl_highest}`]);
  return (
    <section id="last" data-scene="flow" data-tint="106 168 255" data-tx="70%" className="page relative py-28 lg:py-40">
      <Head kicker="Last gameweek" title={`Gameweek ${L.gw} result`}>
        The model's best XI scored {L.model} points{vs}. The best possible XI, picked with hindsight, scored {L.best}. Captain {L.captain.name} was
        predicted {L.captain.pred} and scored {L.captain.points}, doubled to {L.captain.points * 2}.
      </Head>
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-[repeat(var(--n),1fr)]" style={{ "--n": cells.length }}>
        {cells.filter((c) => c[1] !== null).map(([lbl, v, col, note], i) => (
          <Reveal key={lbl} delay={i * 70} className="bg-surface p-6 lg:p-8">
            <div className="flex items-center gap-2 text-sm text-text2"><i className="h-2 w-2 rounded-full" style={{ background: col }} />{lbl}</div>
            <CountUp to={v} className={`mt-3 block font-display text-[clamp(44px,5vw,72px)] font-medium leading-none tracking-[-0.03em] ${i === 0 ? "text-mint" : ""}`} />
            <small className="text-text3">{note}</small>
          </Reveal>
        ))}
      </div>
      <div ref={ref} className="mt-10 grid grid-cols-11 gap-1.5 sm:gap-3">
        {L.team.map((p, i) => (
          <div key={p.name} className="min-w-0 text-center" title={`${p.name}: predicted ${p.pred}, scored ${p.points}${p.cap ? " (captain)" : ""}`}>
            <div className="flex h-[140px] items-end justify-center gap-[3px] sm:h-[180px]">
              <animated.span className="w-2.5 rounded-t sm:w-4" style={{ background: C.dim, height: trail[i].h.to((h) => `${h * (p.pred / top) * 100}%`) }} />
              <animated.span className="w-2.5 rounded-t sm:w-4" style={{ background: C.mint, height: trail[i].h.to((h) => `${Math.max(2, h * (p.points / top) * 100)}%`) }} />
            </div>
            <div className="mt-2 truncate text-[11px] sm:text-[13px]">{p.name}{p.cap && <b className="ml-1 text-mint">C</b>}</div>
            <div className="num text-[10px] text-text3 sm:text-xs">{p.pred} / {p.points}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-5 text-[13px] text-text3">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: C.dim }} />Predicted</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: C.mint }} />Scored</span>
      </div>
    </section>
  );
}

function Terminal({ data }) {
  const m = data.meta;
  const lines = [
    ["$ python run_pipeline.py", "text-text"],
    ["[ingest] 2022-23 to 2025-26 from the open archive", "text-text3"],
    [`[ingest] ${m.season} from the official FPL API, GW1-${m.played}`, "text-text3"],
    [`[load]   ${data.analysis.rows.toLocaleString("en-US")} player-match rows into SQLite`, "text-text3"],
    ["[sql]    rolling features, every window ends 1 PRECEDING", "text-text3"],
    [`[test]   2025-26 held out: best XI +${data.last_season_edge} pts vs the simple rule`, "text-mint"],
    [`[live]   GW${m.gw} predictions for ${data.players.length} players`, "text-mint"],
    ["[site]   docs/data/site.json written", "text-text3"],
  ];
  const [ref, seen] = useInView(0.8);
  const [pos, setPos] = useState(reduced ? [lines.length, 0] : [0, 0]);
  const timer = useRef(0);
  useEffect(() => {
    if (!seen || reduced) return;
    const tick = ([li, ci]) => {
      if (li >= lines.length) return;
      const t = lines[li][0];
      const next = ci + (li === 0 ? 1 : 3) >= t.length ? [li + 1, 0] : [li, ci + (li === 0 ? 1 : 3)];
      setPos(next);
      timer.current = setTimeout(() => tick(next), next[1] === 0 ? (li === 0 ? 420 : 160) : li === 0 ? 45 : 12);
    };
    tick([0, 0]);
    return () => clearTimeout(timer.current);
  }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [li, ci] = pos;
  return (
    <div ref={ref} className="mt-8 overflow-hidden rounded-2xl border border-line2 bg-[#05070a] shadow-2xl">
      <div className="flex gap-1.5 border-b border-white/5 px-4 py-3">{[0, 1, 2].map((i) => <i key={i} className="h-2.5 w-2.5 rounded-full bg-white/10" />)}</div>
      <pre className="min-h-[236px] overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.75] [&_.text-text]:text-[#eef1ef] [&_.text-text3]:text-[#8b9592] [&_.text-mint]:text-[#5ef0b0]">
        {lines.slice(0, li).map(([t, c]) => <span key={t} className={`block ${c}`}>{t}</span>)}
        {li < lines.length && <span className={lines[li][1]}>{lines[li][0].slice(0, ci)}</span>}
        <span className="cursor" />
      </pre>
    </div>
  );
}

const STEPS = [
  ["Python", "Data", "Stats for every player in every Premier League match since 2022-23. This season comes straight from the official FPL API, older seasons from Vaastav Anand's open archive."],
  ["SQLite", "Features in SQL", "Rolling averages of points, minutes, xG and xA, plus how strong the opponent is. Every window ends at 1 PRECEDING, so a row only knows about games played before that week's deadline."],
  ["scikit-learn", "Model training and testing", "A gradient boosting model, tuned on 2024-25 and tested on 2025-26, a season left out of training. For this season it was retrained on all four."],
  ["Every gameweek", "Team selection", "Each prediction is multiplied by FPL's chance of playing, plus a news file for things FPL's flags miss. The best XI is the highest-predicted legal formation."],
];

export function HowItWorks({ data }) {
  return (
    <section id="how" data-scene="floor" data-tint="94 240 176" data-tx="50%" className="page relative py-28 lg:py-40">
      <BigWord offset={-4}>PIPELINE</BigWord>
      <div className="mt-10 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Head kicker="How it works" title="How the predictions are made">
            The pipeline is written in Python and SQL. The README on GitHub has the full method and the problems fixed along the way.
          </Head>
          <Terminal data={data} />
        </div>
        <div className="space-y-4">
          {STEPS.map(([tool, title, body], i) => (
            <Reveal key={title} delay={i * 60} className="card group relative overflow-hidden p-7 transition-colors hover:border-line2 lg:p-9">
              <div className="flex items-center gap-3 text-sm text-text3">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-line2 font-mono text-xs text-mint">{i + 1}</span>{tool}
              </div>
              <h3 className="mt-5 font-display text-[clamp(24px,2.2vw,32px)] font-medium tracking-[-0.02em]">{title}</h3>
              <p className="mt-3 max-w-[560px] leading-relaxed text-text2">{body}</p>
              <span aria-hidden className="absolute -right-4 -top-8 font-display text-[160px] font-bold leading-none text-line/60 transition-colors group-hover:text-mint/10">{i + 1}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TrackRecord({ data }) {
  const m = data.meta;
  const total = (k) => (data.weekly[k] || []).reduce((s, [, v]) => s + v, 0);
  const xi = data.edges["Best XI: avg points per GW"], mae = data.edges["MAE (regular starters)"];
  const fmt = (v) => (v > 0 ? "+" : "") + Math.round(v);
  const facts = [
    ["Last season", "never seen in training", `+${data.last_season_edge}`, "points over all of 2025-26 for the model's team compared with the simple rule.", true],
    ["This season", xi.sure ? "clear" : "too early to say", fmt(xi.edge), `points a week so far. With ${m.played} weeks of data the real gap could be anywhere from ${fmt(xi.lo)} to ${fmt(xi.hi)}.`],
    ["Per player", mae.sure ? "clear" : "not yet", mae.edge.toFixed(2), "points closer, on average, to what each regular starter actually scores."],
  ];
  return (
    <section id="record" data-scene="flow" data-tint="106 168 255" data-tx="25%" className="page relative py-28 lg:py-40">
      <Head kicker="Track record" title="Model vs a simple rule">
        Before every deadline this season the model picks a team, and so does a simple rule: the eleven players with the best average so far.
        Through gameweek {m.played}, here's how they've done.
      </Head>
      <div className="mt-12 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[["Model", "Model's team, total points", C.mint], ["Season average", "Simple rule's team, total points", C.grey]].map(([k, lbl, col], i) => (
            <Reveal key={k} delay={i * 80} className={`card p-7 ${i === 0 ? "border-mint/30 shadow-[inset_0_0_60px_rgb(var(--mint)/.06)]" : ""}`}>
              <div className="flex items-center gap-2 text-sm text-text2"><i className="h-2 w-2 rounded-full" style={{ background: col }} />{lbl}</div>
              <CountUp to={total(k)} className="mt-3 block font-display text-[64px] font-medium leading-none tracking-[-0.03em]" />
            </Reveal>
          ))}
        </div>
        <Reveal delay={120} className="card p-5 sm:p-7">
          <LineChart series={[{ name: "Model", color: C.mint, points: cumulative(data.weekly.Model) }, { name: "Simple rule", color: C.grey, points: cumulative(data.weekly["Season average"]) }]} />
        </Reveal>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {facts.map(([t, tag, v, body, good], i) => (
          <Reveal key={t} delay={i * 80} className="card p-7">
            <div className="flex justify-between text-sm text-text2">{t}<span className="text-text3">{tag}</span></div>
            <div className={`num mt-4 font-display text-[44px] font-medium leading-none ${good ? "text-mint" : ""}`}>{v}</div>
            <p className="mt-3 text-[15px] leading-relaxed text-text2">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
