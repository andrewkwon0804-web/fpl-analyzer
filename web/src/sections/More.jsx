// Findings, this week's top picks, FAQ, closing call to action and footer.
import { useState } from "react";
import { animated, useSpring } from "@react-spring/web";
import { Kicker, SplitTitle, Reveal, Button, BigWord } from "../components/ui.jsx";
import { Bars, HBars } from "../components/charts.jsx";
import { usePop } from "../components/Popover.jsx";
import { reduced } from "../lib/motion.js";

const REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer";
const TIERS = ["<£5", "£5-6.5", "£6.5-8.5", "£8.5-10.5", "£10.5+"];
const FDR = { 1: "#1f7a52", 2: "#2c8a5e", 3: "rgb(var(--text3))", 4: "#8a4a50", 5: "#a8394a" };
const C = { mint: "rgb(var(--mint))", mint2: "rgb(var(--mint) / .4)", sky: "rgb(var(--sky))", sky2: "rgb(var(--sky) / .45)", rose: "rgb(var(--rose))", rose2: "rgb(var(--rose) / .4)", grey: "rgb(var(--line2))" };

function Find({ href, title, body, link, wide, delay, children }) {
  return (
    <Reveal delay={delay} className={`min-w-0 ${wide ? "lg:col-span-7" : "lg:col-span-5"}`}>
      <a href={href} className="card group flex h-full flex-col p-7 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-line2 lg:p-9">
        <h3 className="font-display text-[clamp(21px,1.8vw,27px)] font-medium leading-tight tracking-[-0.015em]">{title}</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-text2">{body}</p>
        <div className="mt-auto pt-8">{children}</div>
        <span className="mt-6 text-sm text-mint">{link} <span className="inline-block transition-transform group-hover:translate-x-1">›</span></span>
      </a>
    </Reveal>
  );
}

export function Findings({ data }) {
  const A = data.analysis;
  const def = A.fdr.points.filter((r) => r.pos === "DEF");
  const hot = A.xg.regression[0], cold = A.xg.regression[A.xg.regression.length - 1];
  const mid = A.value.tiers.filter((r) => r.position === "MID");
  const crowd = Object.fromEntries(A.crowd.map((r) => [r.grp, r.points]));
  const ppm = mid.map((r) => r.points_per_m);
  return (
    <section id="findings" data-scene="network" data-tint="106 168 255" data-tx="80%" className="page relative py-28 lg:py-40">
      <Kicker>Findings</Kicker>
      <SplitTitle text="Findings from four seasons of data" className="max-w-[900px] font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1] tracking-[-0.035em]" />
      <Reveal delay={150}><p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-text2">
        Four questions about FPL strategy, each answered with a SQL query over every match since 2022-23. The full charts are on the dashboard.
      </p></Reveal>
      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        <Find wide href="../dashboard.html#analysis-fdr" link="See every team's next five fixtures"
          title={`Defenders average ${def[0].points.toFixed(1)} points in the easiest fixtures and ${def[def.length - 1].points.toFixed(1)} in the hardest`}
          body="Average points for defenders who played 60+ minutes, by FPL's difficulty rating for that match.">
          <Bars rows={def.map((r) => ({ label: `FDR ${r.fdr}`, value: r.points, color: FDR[r.fdr] }))} />
        </Find>
        <Find delay={80} href="../dashboard.html#analysis-xg" link="This season's goals vs xG"
          title="Scoring above xG doesn't carry into the second half of a season"
          body="Goals minus xG per 90, 2023-24 to 2025-26. The players furthest above their xG in gameweeks 1-19 were level with it in 20-38.">
          <HBars rows={[
            { label: "Hot, GW1-19", value: hot.first_half, color: C.mint }, { label: "Hot, GW20-38", value: hot.second_half, color: C.mint2 },
            { label: "Cold, GW1-19", value: cold.first_half, color: C.rose }, { label: "Cold, GW20-38", value: cold.second_half, color: C.rose2 },
          ]} fmt={(v) => (v > 0 ? "+" : "") + v.toFixed(2)} />
        </Find>
        <Find href="../dashboard.html#analysis-value" link="Best value this season"
          title="Expensive midfielders score more per 90 at similar value per £m"
          body={`Points per 90 for midfielders by price, 2022-23 to 2025-26. Points per £m stays between ${Math.min(...ppm).toFixed(0)} and ${Math.max(...ppm).toFixed(0)}.`}>
          <Bars rows={mid.map((r) => ({ label: TIERS[r.tier - 1], value: r.points_per_90, color: C.mint }))} />
        </Find>
        <Find wide delay={80} href="../dashboard.html#analysis-crowd" link="Full breakdown"
          title="The most transferred-in players score about the same as the most transferred-out"
          body="Average points that gameweek, every gameweek since 2022-23. The ten most-owned players scored the most.">
          <Bars fmt={(v) => v.toFixed(2)} rows={[
            { label: "Most transferred in", value: crowd["Top 10 transferred in"], color: C.sky },
            { label: "Most transferred out", value: crowd["Top 10 transferred out"], color: C.sky2 },
            { label: "Most owned", value: crowd["Top 10 most owned"], color: C.mint },
            { label: "Everyone else", value: crowd["Everyone else who played"], color: C.grey },
          ]} />
        </Find>
      </div>
    </section>
  );
}

export function TopPicks({ data }) {
  const { open } = usePop();
  const top = data.players.slice(0, 14);
  const card = (p, i, hidden) => (
    <button key={`${hidden ? "b" : "a"}${p.id}`} data-pid={p.id} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : 0}
      onClick={(e) => open(p, e.currentTarget, `Ranked #${i + 1} by predicted points this week.`)}
      className="card w-[230px] shrink-0 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-mint/50">
      <div className="flex justify-between text-xs text-text3"><span>#{i + 1}</span><span>{p.pos}</span></div>
      <div className="mt-4 truncate font-display text-xl font-medium">{p.name}</div>
      <div className="text-sm text-text3">{p.team}</div>
      <div className="mt-5 flex items-end justify-between">
        <span className="num font-display text-[34px] font-medium leading-none text-mint">{p.pred.toFixed(1)}</span>
        <span className="num text-sm text-text2">£{p.price.toFixed(1)}m</span>
      </div>
    </button>
  );
  return (
    <section id="picks" data-scene="dust" data-tint="94 240 176" data-tx="50%" className="relative py-28 lg:py-36">
      <div className="page">
        <Kicker>This week</Kicker>
        <SplitTitle text={`Top predicted players, gameweek ${data.meta.gw}`} className="max-w-[900px] font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1] tracking-[-0.035em]" />
        <Reveal delay={150}><p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-text2">
          Ranked by predicted points. The dashboard lists every player, with filters and each player's week-by-week record.
        </p></Reveal>
      </div>
      <Reveal className="marquee mt-12 overflow-hidden">
        <div className="marquee-track flex w-max gap-4 pr-4">{top.map((p, i) => card(p, i, false))}{top.map((p, i) => card(p, i, true))}</div>
      </Reveal>
    </section>
  );
}

const QA = [
  ["Why doesn't the best XI fit the £100m budget?", "The best XI is the eleven highest-predicted players in a legal formation, with no budget limit. It's meant for choosing transfers and a captain. The model team on the dashboard is the budget version: a full 15-man squad that follows every FPL rule."],
  ["How does it handle injuries and other news?", "The model only sees match stats, so each prediction is multiplied by FPL's own chance of playing. A news file covers things FPL's flags miss, such as a player dropped after a falling-out with his manager."],
  ["How often does it update?", "After every gameweek. One script pulls the new results from the FPL API, retrains and republishes this site."],
  ["How accurate is it?", "Over 2025-26, a season left out of training, the model's best XI scored about 260 more points than the season-average rule. It's ahead this season too, but this early the sample is too small to be sure."],
  ["Can anyone run it?", "Yes. Clone the repo, install the requirements and run python run_pipeline.py. It downloads the data, builds the database and writes every result."],
];

function Item({ q, a }) {
  const [open, setOpen] = useState(false);
  const s = useSpring({ h: open ? 1 : 0, config: { tension: 260, friction: 30 }, immediate: reduced });
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-[clamp(18px,1.6vw,22px)]">
        {q}
        <span className="relative h-8 w-8 shrink-0 rounded-full border border-line2">
          <i className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 bg-text" />
          <animated.i className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-text" style={{ transform: s.h.to((h) => `translate(-50%,-50%) scaleY(${1 - h})`) }} />
        </span>
      </button>
      <animated.div style={{ gridTemplateRows: s.h.to((h) => `${h}fr`), opacity: s.h }} className="grid">
        <div className="overflow-hidden"><p className="max-w-[680px] pb-6 leading-relaxed text-text2">{a}</p></div>
      </animated.div>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" data-scene="none" data-tint="106 168 255" data-tx="20%" className="page relative grid gap-10 py-28 lg:grid-cols-[0.8fr_1.2fr] lg:py-40">
      <div>
        <Kicker>FAQ</Kicker>
        <SplitTitle text="Common questions" className="font-display text-[clamp(36px,5vw,76px)] font-medium leading-[1] tracking-[-0.035em]" />
      </div>
      <Reveal className="border-t border-line">{QA.map(([q, a]) => <Item key={q} q={q} a={a} />)}</Reveal>
    </section>
  );
}

export function Closing({ data }) {
  return (
    <section data-scene="floor" data-tint="94 240 176" data-tx="50%" className="page relative py-24">
      <Reveal className="relative overflow-hidden rounded-[28px] border border-line2 bg-surface/60 px-6 py-20 text-center sm:px-12 lg:py-28">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_100%,rgb(var(--mint)/.16),transparent_70%)]" />
        <SplitTitle text={`Gameweek ${data.meta.gw} predictions`} className="relative font-display text-[clamp(40px,6vw,96px)] font-medium leading-[0.95] tracking-[-0.04em]" />
        <div className="relative mt-10 flex flex-wrap justify-center gap-3">
          <Button href="../dashboard.html">Open the dashboard</Button>
          <Button variant="ghost" href={REPO}>Read the code</Button>
        </div>
      </Reveal>
      <BigWord offset={-8}>FPL POINTS LAB</BigWord>
    </section>
  );
}

export function Footer({ data }) {
  const m = data.meta;
  const when = m.refreshed_at ? new Date(m.refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const cols = [
    ["Site", [["./", "Home"], ["../dashboard.html", "Dashboard"], ["../dashboard.html#analysis-value", "Analysis"]]],
    ["Project", [[REPO, "GitHub repo"], [`${REPO}#readme`, "Method and results"], [`${REPO}/tree/main/tableau`, "Tableau workbook"]]],
    ["Data", [["https://fantasy.premierleague.com/", "Official FPL API"], ["https://github.com/vaastav/Fantasy-Premier-League", "Vaastav Anand's FPL archive"]]],
  ];
  return (
    <footer className="page relative pb-[max(24px,env(safe-area-inset-bottom))] pt-10">
      <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="font-display font-semibold">FPL Points Lab</div>
          <p className="mt-3 max-w-[340px] text-sm leading-relaxed text-text3">Predicted Fantasy Premier League points for every player, rebuilt after each gameweek. Made by Andrew Kwon.</p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <h5 className="mb-3 text-xs uppercase tracking-[0.12em] text-text3">{h}</h5>
            {links.map(([href, t]) => <a key={t} href={href} className="block py-1.5 text-sm text-text2 hover:text-text">{t}</a>)}
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-xs text-text3">
        <span>Data from the {m.source || "open FPL archive"}{when && `, updated ${when}`}</span>
        <span>Not affiliated with the Premier League or FPL.</span>
      </div>
    </footer>
  );
}
