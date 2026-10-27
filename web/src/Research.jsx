// The model report: how the predictions held up on a season the model never saw, plus a SQL
// lab over the project's database. Charts are Observable Plot; the lab is sql.js + CodeMirror.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useSiteData } from "./lib/data.js";
import GlyphField from "./components/GlyphField.jsx";
import Nav, { goTo } from "./components/Nav.jsx";
import Command from "./components/Command.jsx";
import { Footer, Title } from "./sections/Rest.jsx";
import { DataTable, Figure, Stat } from "./components/report/kit.jsx";
import {
  BacktestFigure, BiasFigure, CalibrationFigure, EdgeFigure, HorizonFigure, ImportanceFigure,
  LeakageFigure, LiftFigure, RangeFigure, RankFigure, ResidualFigure, SliceFigure, WeeklyGapFigure,
} from "./components/report/figures.jsx";
// CodeMirror and sql.js only load when the reader gets near the lab
const SqlLab = lazy(() => import("./components/report/SqlLab.jsx"));

const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";
const LINKS = [["./", "Home"], ["./dashboard.html", "Dashboard"], ["#sql", "SQL lab"], ["#method", "Method"]];
const SECTIONS = [
  ["baselines", "Against simple rules"], ["backtest", "A season of picks"], ["ranking", "Getting the order right"],
  ["calibration", "Are the numbers honest?"], ["lift", "Does higher mean more?"], ["errors", "Where it misses"],
  ["features", "What drives it"], ["sql", "SQL lab"], ["method", "Method and limits"],
];
const TINTS = ["56 225 168", "70 120 255", "56 225 168", "245 196 81", "56 225 168", "70 120 255", "56 225 168", "70 120 255", "56 225 168"];

function useResearch() {
  const [s, set] = useState({ R: null, error: null });
  useEffect(() => {
    fetch(import.meta.env.DEV ? "/data/research.json" : "./data/research.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(`research.json: ${r.status}`); return r.json(); })
      .then((R) => set({ R, error: null }))
      .catch((e) => set({ R: null, error: e.message }));
  }, []);
  return s;
}

// which section is on screen, and how far down the page the reader is
function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0]);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let cur = ids[0];
        for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < innerHeight * 0.35) cur = id; }
        const max = document.documentElement.scrollHeight - innerHeight;
        const pr = max > 0 ? scrollY / max : 0;
        setActive(pr > 0.985 ? ids.at(-1) : cur);
        setProgress(pr);
      });
    };
    on();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); };
  }, [ids]);
  return [active, progress];
}

function Section({ id, n, title, intro, children }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-line/70 pb-20 pt-14 first:border-0 first:pt-0" data-tint={TINTS[n - 1]} data-tx={n % 2 ? "80%" : "20%"}>
      <div className="mono-label text-mint"><span className="text-text3">{String(n).padStart(2, "0")} //</span> {SECTIONS[n - 1][1]}</div>
      <Title className="mt-4 !text-[clamp(30px,3.6vw,52px)]">{title}</Title>
      {intro && <p className="mt-5 max-w-[68ch] text-[15.5px] leading-relaxed text-text2">{intro}</p>}
      <div className="mt-10 grid gap-5">{children}</div>
    </section>
  );
}

function ResultsFigure({ R }) {
  const COLS = [
    ["MAE (regular starters)", "Avg miss", 2, "low"], ["RMSE (regular starters)", "RMSE", 2, "low"], ["Rank correlation per GW", "Rank corr", 3, "high"],
    ["Best XI: avg points per GW", "Best XI pts", 1, "high"], ["Captain pick: avg points", "Captain pts", 2, "high"], ["Captain pick: % didn't play", "Captain blank %", 1, "low"],
  ];
  const fair = R.results.filter((r) => !/leaky|ceiling/i.test(r.method));
  const best = Object.fromEntries(COLS.map(([k, , , dir]) => [k, (dir === "low" ? Math.min : Math.max)(...fair.map((r) => r[k]))]));
  const name = (m) => m.replace(" (leaky, reference only)", "").replace(" (ceiling)", "");
  const note = (m) => (/leaky/.test(m) ? "reference only: leaks" : /ceiling/.test(m) ? "ceiling" : "");
  const columns = [
    { key: "method", label: "Method", render: (v) => <span className={/leaky|ceiling/i.test(v) ? "text-text3" : "text-text"}>{name(v)}{note(v) && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text3">{note(v)}</span>}</span> },
    ...COLS.map(([k, label, d]) => ({
      key: k, label, num: true,
      render: (v, r) => (v == null ? "–" : <span className={!/leaky|ceiling/i.test(r.method) && v === best[k] ? "text-mint" : ""}>{v.toFixed(d)}</span>),
    })),
  ];
  return (
    <Figure n={1} title="Results on the 2025-26 season" file="results" toggle={false}
      caption={`Average miss and RMSE are for regular starters (60+ minutes a game over the last five), where a prediction matters. Best values among the fair methods are in green. FPL's own expected-points column is listed for reference only: it's filled in after kickoff (figure 14).`}
      table={{ columns: [{ key: "method", label: "Method" }, ...COLS.map(([k, label]) => ({ key: k, label, num: true }))], rows: R.results }}>
      <DataTable columns={columns} rows={R.results} maxHeight={600} highlight={(r) => r.method.startsWith("Gradient")} />
    </Figure>
  );
}

function Hero({ R }) {
  const m = R.meta, res = Object.fromEntries(R.results.map((r) => [r.method, r]));
  const model = res["Gradient boosting model"], season = res["Season average"];
  const xi = R.significance.find((s) => s.baseline === "Season average" && s.metric.startsWith("Best XI"));
  const p = m.params;
  const card = [
    ["Algorithm", "Histogram gradient boosting (scikit-learn)"], ["Predicts", "FPL points in the coming gameweek"],
    ["Trained on", m.train_seasons.join(", ")], ["Tuned on", `${m.valid_season} (4 settings tried)`], ["Tested on", `${m.test_season}, held out, scored once`],
    ["Features", `${m.features}, all known before the deadline`], ["Settings", `learning rate ${p.learning_rate} · ${p.max_leaf_nodes} leaves · min leaf ${p.min_samples_leaf} · L2 ${p.l2_regularization}`],
    ["Intervals", "Paired bootstrap over gameweeks"],
  ];
  return (
    <header className="page relative pt-32 lg:pt-40" data-tint="56 225 168" data-tint2="70 120 255" data-tx="78%" data-glow="0.6">
      <div className="mono-label text-mint"><span className="text-text3">//</span> Model report · {m.test_season}</div>
      <h1 className="mt-6 max-w-[15ch] font-display text-[clamp(44px,7vw,112px)] font-medium leading-[0.92] tracking-[-0.045em]">Tested on a season it never saw.</h1>
      <p className="mt-7 max-w-[62ch] text-[17px] leading-relaxed text-text2">
        The model learned from {m.train_seasons.join(" and ")}, was tuned on {m.valid_season}, then predicted every player in all {m.gameweeks} gameweeks of {m.test_season} exactly once.
        Everything below comes from that run: where it beats simple rules, where it doesn't, and how much of the gap could be luck.
      </p>
      <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <Stat label="Average miss" value={model["MAE (regular starters)"].toFixed(2)} unit="pts" sub={`Season average: ${season["MAE (regular starters)"].toFixed(2)}`} />
        <Stat label="Rank correlation" value={model["Rank correlation per GW"].toFixed(2)} sub={`Season average: ${season["Rank correlation per GW"].toFixed(2)}`} />
        <Stat label="Best XI per gameweek" value={model["Best XI: avg points per GW"].toFixed(1)} unit="pts" good sub={xi && `+${xi.model_edge.toFixed(1)} vs season average (95% CI ${xi.ci_low.toFixed(1)} to ${xi.ci_high.toFixed(1)})`} />
        <Stat label="Captain points" value={model["Captain pick: avg points"].toFixed(2)} sub={`Captain didn't play: ${model["Captain pick: % didn't play"].toFixed(1)}% of weeks`} />
        <Stat label="Predictions scored" value={m.test_rows.toLocaleString()} sub={`${m.gameweeks} gameweeks · ${m.regular_rows.toLocaleString()} by regular starters`} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <dl className="corners grid gap-x-8 p-5 sm:grid-cols-2">
          <div className="mono-label col-span-full mb-3 text-[10px] text-text3">Model card</div>
          {card.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-t border-line/70 py-2.5 text-[13px]">
              <dt className="w-[86px] shrink-0 text-text3">{k}</dt><dd className="text-text2">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="corners flex flex-col p-5">
          <div className="mono-label mb-3 text-[10px] text-text3">Data and code</div>
          {[["./data/research.json", "research.json", "Every number on this page"], ["./data/fpl-lite.db.gz", "fpl-lite.db.gz", "SQLite database, 6 tables (gzip)"], [REPO, "GitHub", "Pipeline, model and SQL"]].map(([h, t, d]) => (
            <a key={t} href={h} {...(h.startsWith("http") ? { target: "_blank", rel: "noopener" } : { download: "" })}
              className="group flex items-center justify-between border-t border-line/70 py-3">
              <span><span className="font-mono text-[13px] text-text group-hover:text-mint">{t}</span><span className="block text-[12px] text-text3">{d}</span></span>
              <span className="text-text3 transition-transform group-hover:translate-x-0.5 group-hover:text-mint">{h.startsWith("http") ? "↗" : "↓"}</span>
            </a>
          ))}
          <code className="mt-auto block rounded-[4px] border border-line bg-bg/70 px-3 py-2.5 font-mono text-[12px] text-text2"><span className="text-text3">$ </span>python run_pipeline.py</code>
        </div>
      </div>
    </header>
  );
}

function Method({ R }) {
  const m = R.meta;
  const items = [
    ["Data", "The official FPL API for the current season and Vaastav's public archive for past ones, loaded into SQLite: 118,133 player-match rows from 2022-23 on. The SQL lab above runs on a trimmed copy."],
    ["Target", "Points in the gameweek being predicted, both games counted in a double gameweek."],
    ["Features", `${m.features} columns, each computed only from games before that gameweek's deadline: minutes, points, xG, xA, bonus and ICT over the last 3 and 5 weeks; fixture difficulty, home games and number of fixtures; team and opponent xG over 6 weeks; price, ownership and last season's minutes and points per game.`],
    ["Split", `By season, never at random. A random split would put a player's later weeks in training and his earlier ones in the test, so the model would be graded on games it had effectively seen. Train ${m.train_seasons.join(" + ")}, tune ${m.valid_season}, test ${m.test_season} once.`],
    ["Baselines", "Season average so far and the last-5-gameweek average, the two rules most managers use without thinking about it. Both get the same best-XI and captain rules as the model."],
    ["Uncertainty", "Each comparison is repeated on 4,000 resamples of the 38 gameweeks (paired, so the model and the baseline see the same weeks). The interval is the middle 95% of those results."],
  ];
  const limits = [
    "It only knows what happened on the pitch. Team news after the deadline, a manager's rotation plan or a new penalty taker show up a week late.",
    "Players with no history (new signings, promoted teams' squads) start from their price and position until they build a few games.",
    "Rule changes break the past. Defensive contribution points arrived in 2025-26, and defenders are under-predicted because of it (figure 8).",
    "A single FPL score is mostly noise: a goal is worth 4 to 6 points and arrives at random. Even a perfect estimate of a player's expected points would miss by a couple of points in most weeks.",
  ];
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
      <dl className="corners p-5">
        {items.map(([k, v]) => (
          <div key={k} className="grid gap-1 border-t border-line/70 py-4 first:border-0 first:pt-0 sm:grid-cols-[120px_1fr] sm:gap-6">
            <dt className="mono-label pt-0.5 text-[10.5px] text-text3">{k}</dt><dd className="text-[14px] leading-relaxed text-text2">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="corners p-5">
        <div className="mono-label mb-3 text-[10.5px] text-amber">What it can't know</div>
        <ul className="grid gap-3">
          {limits.map((l) => <li key={l} className="border-t border-line/70 pt-3 text-[14px] leading-relaxed text-text2 first:border-0 first:pt-0">{l}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Report({ R }) {
  const ids = useMemo(() => SECTIONS.map(([id]) => id), []);
  const [active, progress] = useScrollSpy(ids);
  return (
    <>
      <div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-mint" style={{ transform: `scaleX(${progress})` }} />
      <Hero R={R} />
      <div className="page mt-24 grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-14">
        <nav aria-label="Report sections" className="hidden lg:block">
          <div className="sticky top-28">
            <div className="mono-label mb-4 text-[10px] text-text3">Contents</div>
            <ol className="grid gap-0.5 border-l border-line">
              {SECTIONS.map(([id, t], i) => (
                <li key={id}>
                  <a href={`#${id}`} onClick={(e) => { e.preventDefault(); goTo(`#${id}`); }}
                    className={`-ml-px flex gap-2.5 border-l py-1.5 pl-3.5 text-[13px] transition-colors ${active === id ? "border-mint text-text" : "border-transparent text-text3 hover:text-text2"}`}>
                    <span className="num font-mono text-[11px] leading-[19px] text-text3">{String(i + 1).padStart(2, "0")}</span>{t}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="min-w-0">
          <Section id="baselines" n={1} title="Beating the rules a manager would use anyway."
            intro="Two simple rules set the bar: a player's season average so far, and his average over the last five gameweeks. A model that can't beat both isn't worth running. Lower is better for the misses; higher is better for everything else.">
            <ResultsFigure R={R} />
            <EdgeFigure R={R} />
          </Section>
          <Section id="backtest" n={2} title="A whole season of picks, replayed."
            intro="Accuracy is one thing; picking a better team is what a manager feels. Each week every method chooses its best XI and captain from its own predictions, and the real points are added up.">
            <BacktestFigure R={R} />
            <WeeklyGapFigure R={R} />
          </Section>
          <Section id="ranking" n={3} title="Getting the order right."
            intro="Most FPL decisions are comparisons: this midfielder or that one. Rank correlation measures exactly that, and it's the number that decays when the model looks further ahead.">
            <RankFigure R={R} />
            <HorizonFigure R={R} />
          </Section>
          <Section id="calibration" n={4} title="When it says 3 points, is that honest?"
            intro="A model can rank well and still be off on the numbers themselves. Calibration checks whether a prediction of 3 points turns into 3 points on average.">
            <div className="grid items-start gap-5 xl:grid-cols-[1.35fr_1fr]">
              <CalibrationFigure R={R} />
              <BiasFigure R={R} />
            </div>
          </Section>
          <Section id="lift" n={5} title="A higher number should mean more points."
            intro="Sort every prediction from lowest to highest and the actual points should climb with it. They do, but any single prediction still covers a wide range, and the range explorer shows how wide.">
            <LiftFigure R={R} />
            <RangeFigure R={R} />
          </Section>
          <Section id="errors" n={6} title="Where it misses, and by how much."
            intro="The average miss hides two things: the shape of the misses, and the groups of players where the model is no better than a long average.">
            <ResidualFigure R={R} />
            <SliceFigure R={R} />
          </Section>
          <Section id="features" n={7} title="What the model leans on."
            intro="Which inputs carry the predictions, and a check that none of them quietly contains the answer.">
            <ImportanceFigure R={R} />
            <LeakageFigure R={R} />
          </Section>
          <Section id="sql" n={8} title="Ask the database yourself."
            intro="The project's SQLite database, trimmed to six tables, running in this tab through WebAssembly. The tabs are the analysis queries from the repo's sql/analysis folder. Edit them, or write your own: autocomplete knows every table and column.">
            <Suspense fallback={<div className="skel h-[620px] rounded-[6px]" />}><SqlLab queries={R.queries} /></Suspense>
          </Section>
          <Section id="method" n={9} title="How it was built, and what it can't know.">
            <Method R={R} />
          </Section>
        </div>
      </div>
    </>
  );
}

export default function Research() {
  const { R, error } = useResearch();
  const { data } = useSiteData();
  const [cmd, setCmd] = useState(false);
  const places = useMemo(() => [
    ...SECTIONS.map(([id, t]) => [t, "Report", () => goTo(`#${id}`)]),
    ["Dashboard", "Page", () => { location.href = "./dashboard.html"; }], ["Home page", "Page", () => { location.href = "./"; }],
  ], []);
  return (
    <>
      <GlyphField />
      <Nav onCommand={() => setCmd(true)} links={LINKS} cta={["./dashboard.html", "Dashboard"]} />
      {data && <Command data={data} open={cmd} setOpen={setCmd} places={places} onPlayer={(p) => { location.href = `./dashboard.html?player=${p.id}#lookup`; }} />}
      <main className="relative z-10">
        {error && <p className="page pt-40 text-text2">Couldn't load the report data ({error}). Refresh the page to try again.</p>}
        {!R && !error && <div className="page pt-40" aria-busy="true"><div className="skel h-24 w-3/4" /><div className="skel mt-6 h-6 w-1/2" /><div className="skel mt-12 h-32 w-full" /></div>}
        {R && <Report R={R} />}
        {data && <Footer data={data} />}
      </main>
    </>
  );
}
