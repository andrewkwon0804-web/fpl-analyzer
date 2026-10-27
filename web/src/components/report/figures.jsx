// The charts on the model report. Each one is an Observable Plot spec fed from research.json.
import { useMemo, useState } from "react";
import { C, METHOD, Plot, SHORT, fmt, pct, usePlot } from "../../lib/plot.js";
import { Figure, Legend, Seg } from "./kit.jsx";

const BASE3 = ["Model", "Season average", "Form (last 5 GW avg)"];
const methodScale = (names) => ({ domain: names, range: names.map((n) => METHOD[n]) });
const tip = (o) => ({ fontSize: 11, ...o });
const r2 = (v) => (v == null ? "–" : v.toFixed(2));

// ---------- 1. how far ahead of each baseline, with 95% bootstrap intervals ----------
const EDGE_METRICS = [
  ["MAE (regular starters)", "Average miss", "points smaller"],
  ["Best XI: avg points per GW", "Best XI points per GW", "points more"],
  ["Captain pick: avg points", "Captain points per GW", "points more"],
];
function EdgePanel({ rows, title }) {
  const ref = usePlot((w) => ({
    height: 128, marginLeft: 82, marginTop: 8,
    x: { grid: true, label: null, nice: true, domain: [Math.min(0, ...rows.map((r) => r.ci_low)) * 1.1, Math.max(...rows.map((r) => r.ci_high)) * 1.1] },
    y: { label: null, domain: rows.map((r) => SHORT[r.baseline]) },
    color: methodScale(["Season average", "Form (last 5 GW avg)"]),
    marks: [
      Plot.ruleX([0], { stroke: C.ink, strokeOpacity: 0.5 }),
      Plot.link(rows, { x1: "ci_low", x2: "ci_high", y1: (d) => SHORT[d.baseline], y2: (d) => SHORT[d.baseline], stroke: "baseline", strokeWidth: 2, strokeLinecap: "round" }),
      Plot.dot(rows, { x: "model_edge", y: (d) => SHORT[d.baseline], fill: "baseline", r: 5, stroke: "rgb(3 4 5)", strokeWidth: 2 }),
      Plot.tip(rows, Plot.pointerY({ x: "model_edge", y: (d) => SHORT[d.baseline], title: (d) => `Model vs ${d.baseline}\nEdge ${d.model_edge.toFixed(2)}\n95% CI ${d.ci_low.toFixed(2)} to ${d.ci_high.toFixed(2)}\n${d.significant ? "Interval excludes zero" : "Interval includes zero"}` })),
    ],
  }), [rows]);
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[12.5px] text-text2">{title}</div>
      <div ref={ref} />
    </div>
  );
}
export function EdgeFigure({ R }) {
  const rows = R.significance;
  const capSeason = rows.find((r) => r.baseline === "Season average" && r.metric.startsWith("Captain"));
  return (
    <Figure n={2} title="How far ahead of each baseline, with 95% intervals" file="model-edge"
      legend={<Legend items={[["vs Season average", METHOD["Season average"]], ["vs Form (last 5 GW avg)", METHOD["Form (last 5 GW avg)"]]]} />}
      caption="Right of zero means the model did better. Intervals come from a paired bootstrap that resamples whole gameweeks (4,000 draws). Players in the same week share fixtures and luck, so the week is the unit, not the player."
      takeaway={capSeason && !capSeason.significant ? `Every interval clears zero except captaincy against the season average (${capSeason.ci_low.toFixed(1)} to ${capSeason.ci_high.toFixed(1)}): over 38 picks the two choose the same captain too often to separate them.` : null}
      table={{ columns: [{ key: "baseline", label: "Baseline" }, { key: "metric", label: "Metric" }, { key: "model_edge", label: "Edge", num: true, fmt: r2 }, { key: "ci_low", label: "CI low", num: true, fmt: r2 }, { key: "ci_high", label: "CI high", num: true, fmt: r2 }, { key: "significant", label: "Excludes 0", render: (v) => (v ? "yes" : "no") }], rows }}>
      <div className="grid gap-5 md:grid-cols-3">
        {EDGE_METRICS.map(([m, t, unit]) => <EdgePanel key={m} title={`${t} (${unit})`} rows={rows.filter((r) => r.metric === m)} />)}
      </div>
    </Figure>
  );
}

// ---------- 3. the season replayed: cumulative best-XI points ----------
export function BacktestFigure({ R }) {
  const [ceil, setCeil] = useState(false);
  const names = ceil ? [...BASE3, "Perfect hindsight"] : BASE3;
  const rows = useMemo(() => names.flatMap((m) => { let t = 0; return R.weekly[m].map((w) => ({ method: m, gw: w.gw, week: w.xi, total: (t += w.xi) })); }), [R, ceil]);
  const wide = useMemo(() => R.weekly.Model.map((w, i) => {
    const o = { gw: w.gw };
    names.forEach((m) => { o[m] = rows.find((r) => r.method === m && r.gw === w.gw).total; o[`${m} wk`] = R.weekly[m][i].xi; });
    return o;
  }), [R, rows]);
  const ref = usePlot((w) => ({
    height: Math.min(440, Math.max(300, w * 0.48)), marginRight: w < 560 ? 16 : 118,
    x: { label: "Gameweek", domain: [1, 38], ticks: [1, 5, 10, 15, 20, 25, 30, 35, 38] },
    y: { label: "Points, season total", grid: true },
    color: methodScale(names),
    marks: [
      Plot.ruleY([0], { stroke: C.muted, strokeOpacity: 0.4 }),
      Plot.lineY(rows.filter((r) => r.method !== "Perfect hindsight"), { x: "gw", y: "total", stroke: "method", strokeWidth: (d) => (d.method === "Model" ? 2.5 : 1.75), curve: "monotone-x" }),
      ceil ? Plot.lineY(rows.filter((r) => r.method === "Perfect hindsight"), { x: "gw", y: "total", stroke: C.ceiling, strokeDasharray: "4,4", strokeWidth: 1.5 }) : null,
      w >= 560 ? Plot.text(rows, Plot.selectLast({ x: "gw", y: "total", z: "method", text: (d) => `${SHORT[d.method]} ${Math.round(d.total).toLocaleString()}`, dx: 8, textAnchor: "start", fill: C.ink, fontSize: 11 })) : null,
      Plot.ruleX(wide, Plot.pointerX({ x: "gw", stroke: C.ink, strokeOpacity: 0.35 })),
      Plot.tip(wide, Plot.pointerX({ x: "gw", y: "Model", ...tip({}), title: (d) => [`GW${d.gw}`, ...names.map((m) => `${SHORT[m]}  ${Math.round(d[m])}  (+${d[`${m} wk`].toFixed(0)})`)].join("\n") })),
    ],
  }), [rows, wide, ceil]);
  const last = (m) => rows.filter((r) => r.method === m).at(-1)?.total ?? 0;
  const gap = last("Model") - last("Season average");
  return (
    <Figure n={3} title="The season replayed: points from each method's best XI" file="season-backtest"
      controls={<Seg label="Ceiling" options={[["off", "Hide ceiling"], ["on", "Show hindsight"]]} value={ceil ? "on" : "off"} onChange={(v) => setCeil(v === "on")} />}
      legend={<Legend items={names.map((m) => [m, METHOD[m], m === "Perfect hindsight"])} />}
      caption="Each week every method picks the highest-scoring legal XI (one keeper, 3-5 defenders, 2-5 midfielders, 1-3 forwards) by its own prediction, captain counted twice. No budget, no transfers: this isolates how well each method ranks players. Hindsight picks with the real scores."
      takeaway={`By gameweek 38 the model's picks were ${Math.round(gap)} points ahead of the season-average rule, about ${(gap / 38).toFixed(1)} a week.`}
      table={{ columns: [{ key: "gw", label: "GW", num: true }, ...names.map((m) => ({ key: m, label: `${SHORT[m]} total`, num: true, fmt: (v) => v.toFixed(0) }))], rows: wide }}>
      <div ref={ref} />
    </Figure>
  );
}

export function WeeklyGapFigure({ R }) {
  const rows = useMemo(() => R.weekly.Model.map((w, i) => {
    const d = w.xi - R.weekly["Season average"][i].xi;
    return { gw: w.gw, d, side: d >= 0 ? "Model ahead" : "Season average ahead" };
  }), [R]);
  const won = rows.filter((r) => r.d > 0).length;
  const ref = usePlot(() => ({
    height: 220,
    x: { label: "Gameweek", tickFormat: (g) => (g === 1 || g % 5 === 0 ? g : ""), padding: 0.15 },
    y: { label: "Model minus season average", grid: true },
    color: { domain: ["Model ahead", "Season average ahead"], range: [C.model, C.season] },
    marks: [
      Plot.barY(rows, { x: "gw", y: "d", fill: "side", rx: 2 }),
      Plot.ruleY([0], { stroke: C.ink, strokeOpacity: 0.5 }),
      Plot.tip(rows, Plot.pointerX({ x: "gw", y: "d", title: (d) => `GW${d.gw}\n${d.d >= 0 ? "+" : ""}${d.d.toFixed(1)} points` })),
    ],
  }), [rows]);
  return (
    <Figure n={4} title="Week by week: model's XI minus season average's XI" file="weekly-gap"
      legend={<Legend items={[["Model ahead", C.model], ["Season average ahead", C.season]]} />}
      caption="Same best-XI rule as figure 3, one bar per gameweek."
      takeaway={`The model's XI scored more in ${won} of 38 gameweeks. The edge is steady rather than a few big weeks.`}
      table={{ columns: [{ key: "gw", label: "GW", num: true }, { key: "d", label: "Difference", num: true, fmt: (v) => v.toFixed(1) }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

// ---------- 5/6. ranking quality, by week and by how far ahead ----------
export function RankFigure({ R }) {
  const res = Object.fromEntries(R.results.map((r) => [r.method, r]));
  const mo = res["Gradient boosting model"], fo = res["Form (last 5 GW avg)"];
  const rows = useMemo(() => BASE3.flatMap((m) => R.weekly[m].map((w) => ({ method: m, gw: w.gw, rho: w.rho }))), [R]);
  const ref = usePlot((w) => ({
    height: Math.min(360, Math.max(260, w * 0.42)),
    x: { label: "Gameweek", domain: [1, 38], ticks: [1, 5, 10, 15, 20, 25, 30, 35, 38] },
    y: { label: "Rank correlation (Spearman)", grid: true, nice: true },
    color: methodScale(BASE3),
    marks: [
      Plot.lineY(rows, { x: "gw", y: "rho", stroke: "method", strokeOpacity: 0.22, strokeWidth: 1 }),
      Plot.lineY(rows, Plot.windowY({ k: 5, anchor: "middle", strict: false }, { x: "gw", y: "rho", stroke: "method", strokeWidth: (d) => (d.method === "Model" ? 2.5 : 1.75), curve: "monotone-x" })),
      Plot.tip(rows, Plot.pointer({ x: "gw", y: "rho", title: (d) => `${d.method}\nGW${d.gw}: ${d.rho.toFixed(3)}` })),
    ],
  }), [rows]);
  return (
    <Figure n={5} title="Does it put players in the right order each week?" file="rank-correlation"
      legend={<Legend items={BASE3.map((m) => [m, METHOD[m]])} />}
      caption="Spearman correlation between predicted and actual points across all players, each gameweek. Faint lines are the raw weeks; solid lines are a 5-week rolling mean."
      takeaway={mo && fo ? `On ordering alone the model and the five-week form rule are level (${mo["Rank correlation per GW"].toFixed(3)} vs ${fo["Rank correlation per GW"].toFixed(3)}). The model's lead in figure 3 comes from the top of the list, where form picks players who then don't play: its captain sat out ${fo["Captain pick: % didn't play"].toFixed(1)}% of weeks, the model's ${mo["Captain pick: % didn't play"].toFixed(1)}%.` : null}
      table={{ columns: [{ key: "method", label: "Method" }, { key: "gw", label: "GW", num: true }, { key: "rho", label: "Rank corr", num: true, fmt: fmt(3) }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

function SmallLine({ rows, y, label, f, domain }) {
  const ref = usePlot(() => ({
    height: 210, marginLeft: 48, insetTop: 18,
    x: { label: "Weeks ahead", ticks: [1, 2, 3, 4, 5], tickFormat: (d) => d, domain: [0.7, 5.3] },
    y: { label, grid: true, domain },
    marks: [
      Plot.lineY(rows, { x: "weeks ahead", y, stroke: C.model, strokeWidth: 2 }),
      Plot.dot(rows, { x: "weeks ahead", y, fill: C.model, r: 4.5, stroke: "rgb(3 4 5)", strokeWidth: 2 }),
      Plot.text(rows, { x: "weeks ahead", y, text: (d) => f(d[y]), dy: -12, fill: C.ink, fontSize: 10.5 }),
      Plot.tip(rows, Plot.pointerX({ x: "weeks ahead", y, title: (d) => `${d["weeks ahead"]} week${d["weeks ahead"] > 1 ? "s" : ""} ahead\n${label}: ${f(d[y])}\n${d.rows.toLocaleString()} rows` })),
    ],
  }), [rows]);
  return <div ref={ref} />;
}
export function HorizonFigure({ R }) {
  const rows = R.horizon;
  if (!rows.length) return null;
  const a = rows[0], b = rows.at(-1);
  return (
    <Figure n={6} title="Predicting further ahead" file="horizon"
      caption="The same model scored on predicting points 1 to 5 gameweeks out, using only data available at the deadline. Two panels instead of one chart with two y-axes."
      takeaway={`Ranking slips from ${a["rank corr"].toFixed(2)} to ${b["rank corr"].toFixed(2)} at five weeks out, while the average miss barely moves (${a["MAE regulars"].toFixed(2)} to ${b["MAE regulars"].toFixed(2)}). Long-range plans should lean on the order more than the exact numbers.`}
      table={{ columns: [{ key: "weeks ahead", label: "Weeks ahead", num: true }, { key: "MAE regulars", label: "MAE regulars", num: true, fmt: fmt(3) }, { key: "rank corr", label: "Rank corr", num: true, fmt: fmt(3) }, { key: "rows", label: "Rows", num: true }], rows }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SmallLine rows={rows} y="rank corr" label="Rank correlation" f={fmt(3)} domain={[0.5, 0.75]} />
        <SmallLine rows={rows} y="MAE regulars" label="Average miss (pts)" f={fmt(2)} domain={[2, 2.6]} />
      </div>
    </Figure>
  );
}

// ---------- 7/8. calibration ----------
export function CalibrationFigure({ R }) {
  const [pos, setPos] = useState("All");
  const rows = R.calibration[pos];
  const ref = usePlot((w) => {
    const hi = Math.ceil(Math.max(...rows.map((r) => Math.max(r.hi, r.pred))) + 0.5);
    return {
      height: Math.min(420, Math.max(280, w * 0.62)), marginLeft: 44,
      x: { label: "Predicted points (bin average)", domain: [0, hi], grid: true },
      y: { label: "Actual points", domain: [0, hi], grid: true },
      marks: [
        Plot.line([[0, 0], [hi, hi]], { stroke: C.muted, strokeDasharray: "3,4" }),
        Plot.text([[hi * 0.86, hi * 0.86]], { text: ["perfect"], rotate: -Math.atan((420 - 60) / Math.max(1, w - 60)) * 0, dy: 12, dx: 14, fill: C.muted, fontSize: 10 }),
        Plot.ruleX(rows, { x: "pred", y1: "lo", y2: "hi", stroke: C.model, strokeWidth: 2, strokeLinecap: "round" }),
        Plot.dot(rows, { x: "pred", y: "actual", r: (d) => 3 + Math.sqrt(d.n) / 8, fill: C.model, stroke: "rgb(3 4 5)", strokeWidth: 2 }),
        Plot.tip(rows, Plot.pointer({ x: "pred", y: "actual", title: (d) => `Predicted ${d.pred.toFixed(2)}\nActual ${d.actual.toFixed(2)}\n95% CI ${d.lo.toFixed(2)} to ${d.hi.toFixed(2)}\n${d.n.toLocaleString()} player-weeks` })),
      ],
    };
  }, [rows]);
  return (
    <Figure n={7} title="When it says 3 points, do players score 3?" file={`calibration-${pos}`}
      controls={<Seg label="Position" options={["All", "GK", "DEF", "MID", "FWD"]} value={pos} onChange={setPos} />}
      caption="Regular starters grouped by predicted points (1-point bins, at least 20 player-weeks each). Dot size follows the number of player-weeks; bars are 95% intervals for the bin's average. Points on the dashed line are perfectly calibrated."
      table={{ columns: [{ key: "bin", label: "Bin", num: true }, { key: "pred", label: "Predicted", num: true, fmt: r2 }, { key: "actual", label: "Actual", num: true, fmt: r2 }, { key: "lo", label: "CI low", num: true, fmt: r2 }, { key: "hi", label: "CI high", num: true, fmt: r2 }, { key: "n", label: "n", num: true }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

export function BiasFigure({ R }) {
  const rows = ["GK", "DEF", "MID", "FWD"].map((p) => R.bias.find((b) => b.position === p)).filter(Boolean);
  const def = rows.find((r) => r.position === "DEF");
  const ref = usePlot(() => ({
    height: 230, marginLeft: 92, marginRight: 16,
    x: { label: "Average predicted minus actual (points)", grid: true, domain: [-0.7, 0.4] },
    y: { label: null, domain: rows.map((r) => r.position), tickFormat: (p) => { const b = rows.find((r) => r.position === p).bias; return `${p}  ${b > 0 ? "+" : ""}${b.toFixed(2)}`; } },
    marks: [
      Plot.barX(rows, { x: "bias", y: "position", fill: C.model, rx: 2, insetTop: 4, insetBottom: 4 }),
      Plot.ruleX([0], { stroke: C.ink, strokeOpacity: 0.5 }),
      Plot.tip(rows, Plot.pointerY({ x: "bias", y: "position", title: (d) => `${d.position}\nPredicted ${d.avg_pred.toFixed(2)}\nActual ${d.avg_actual.toFixed(2)}\n${d.rows.toLocaleString()} player-weeks` })),
    ],
  }), [rows]);
  return (
    <Figure n={8} title="Bias by position" file="bias-by-position"
      caption="Average prediction minus average score for regular starters. Below zero means the model expected too little."
      takeaway={def ? `Defenders come in ${Math.abs(def.bias).toFixed(2)} points a week under. 2025-26 added points for defensive contributions (tackles, blocks, clearances), a rule none of the training seasons had, so the model has never seen defenders earn them.` : null}
      table={{ columns: [{ key: "position", label: "Position" }, { key: "avg_pred", label: "Predicted", num: true, fmt: r2 }, { key: "avg_actual", label: "Actual", num: true, fmt: r2 }, { key: "bias", label: "Bias", num: true, fmt: r2 }, { key: "rows", label: "Rows", num: true }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

// ---------- 9. lift by decile ----------
export function LiftFigure({ R }) {
  const rows = R.lift;
  const rates = rows.flatMap((d) => [{ decile: d.decile, what: "Hauls (10+ pts)", v: d.haul }, { decile: d.decile, what: "Blanks (2 pts or fewer)", v: d.blank }]);
  const a = usePlot(() => ({
    height: 240,
    x: { label: "Predicted-points decile (1 = lowest tenth)", padding: 0.2 },
    y: { label: "Average points", grid: true },
    marks: [
      Plot.barY(rows, { x: "decile", y: "actual", fill: C.model, rx: 2 }),
      Plot.tickY(rows, { x: "decile", y: "pred", stroke: C.ink, strokeWidth: 2 }),
      Plot.ruleY([0], { stroke: C.muted, strokeOpacity: 0.5 }),
      Plot.tip(rows, Plot.pointerX({ x: "decile", y: "actual", title: (d) => `Decile ${d.decile}\nActual ${d.actual.toFixed(2)}\nPredicted ${d.pred.toFixed(2)}\n${d.n.toLocaleString()} player-weeks` })),
    ],
  }), [rows]);
  const b = usePlot(() => ({
    height: 240, marginLeft: 44,
    x: { label: "Predicted-points decile", ticks: rows.map((d) => d.decile), domain: [0.6, 10.4] },
    y: { label: "Share of player-weeks", grid: true, tickFormat: (v) => pct(v), domain: [0, 0.75] },
    color: { domain: ["Hauls (10+ pts)", "Blanks (2 pts or fewer)"], range: [C.ink, C.muted] },
    marks: [
      Plot.lineY(rates, { x: "decile", y: "v", stroke: "what", strokeWidth: 2, strokeDasharray: (d) => (d.what.startsWith("Blank") ? "4,3" : null) }),
      Plot.dot(rates, { x: "decile", y: "v", fill: "what", r: 3.5 }),
      Plot.tip(rates, Plot.pointer({ x: "decile", y: "v", title: (d) => `Decile ${d.decile}\n${d.what}: ${pct(d.v, 1)}` })),
    ],
  }), [rates]);
  const top = rows.at(-1), bot = rows[0];
  return (
    <Figure n={9} title="Higher prediction, more points: lift by decile" file="lift"
      caption="Regular starters split into ten equal groups by predicted points. Left: what each group actually averaged against what was predicted. Right: how often each group hauled or blanked."
      takeaway={`The top tenth averaged ${top.actual.toFixed(2)} points and hauled ${pct(top.haul)} of the time; the bottom tenth averaged ${bot.actual.toFixed(2)} and blanked ${pct(bot.blank)} of the time. Every step up the ladder scores more.`}
      table={{ columns: [{ key: "decile", label: "Decile", num: true }, { key: "pred", label: "Predicted", num: true, fmt: r2 }, { key: "actual", label: "Actual", num: true, fmt: r2 }, { key: "haul", label: "Haul rate", num: true, fmt: (v) => pct(v, 1) }, { key: "blank", label: "Blank rate", num: true, fmt: (v) => pct(v, 1) }, { key: "n", label: "n", num: true }], rows }}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div><Legend items={[["Actual average", C.model], ["Predicted average (tick)", C.ink]]} /><div ref={a} className="mt-3" /></div>
        <div><Legend items={[["Haul rate (10+ pts)", C.ink], ["Blank rate (2 pts or fewer)", C.muted, true]]} /><div ref={b} className="mt-3" /></div>
      </div>
    </Figure>
  );
}

// ---------- 10. what actually happens at each predicted level ----------
export function RangeFigure({ R }) {
  const rows = R.intervals;
  const [i, setI] = useState(() => Math.max(0, rows.findIndex((r) => r.pbin >= 4)));
  const s = rows[i];
  const ref = usePlot((w) => ({
    height: Math.min(380, Math.max(260, w * 0.5)),
    x: { label: "Predicted points", grid: true },
    y: { label: "Actual points", grid: true, domain: [0, Math.max(...rows.map((r) => r.p90)) + 1] },
    marks: [
      Plot.areaY(rows, { x: "pbin", y1: "p10", y2: "p90", fill: C.model, fillOpacity: 0.14, curve: "step" }),
      Plot.areaY(rows, { x: "pbin", y1: "p25", y2: "p75", fill: C.model, fillOpacity: 0.3, curve: "step" }),
      Plot.lineY(rows, { x: "pbin", y: "p50", stroke: C.model, strokeWidth: 2, curve: "step" }),
      Plot.lineY(rows, { x: "pbin", y: "mean", stroke: C.ink, strokeWidth: 1.5, strokeDasharray: "4,3" }),
      Plot.ruleX([s.pbin], { stroke: C.ink, strokeOpacity: 0.7 }),
      Plot.dot([s], { x: "pbin", y: "mean", r: 5, fill: C.ink, stroke: "rgb(3 4 5)", strokeWidth: 2 }),
    ],
  }), [rows, i]);
  const pos = (v) => `${v.toFixed(0)} pt${v === 1 ? "" : "s"}`;
  return (
    <Figure n={10} title="The range behind a prediction" file="prediction-ranges"
      legend={<Legend items={[["Middle 50% of outcomes", "rgba(32,173,125,.55)"], ["Middle 80%", "rgba(32,173,125,.25)"], ["Median", C.model], ["Mean", C.ink, true]]} />}
      caption="Regular starters grouped by predicted points in half-point steps (groups with at least 30 player-weeks). FPL scores are lumpy, so the middle of the range is often a step, not a slope."
      table={{ columns: [{ key: "pbin", label: "Predicted", num: true, fmt: fmt(1) }, { key: "n", label: "n", num: true }, { key: "mean", label: "Mean", num: true, fmt: r2 }, ...["p10", "p25", "p50", "p75", "p90"].map((k) => ({ key: k, label: k.toUpperCase(), num: true, fmt: fmt(1) }))], rows }}>
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div ref={ref} />
        <div className="flex flex-col gap-6 self-start rounded-[4px] border border-line bg-surface/60 p-4">
          <div>
            <label htmlFor="range-pick" className="mono-label text-[10px] text-text3">Predicted points</label>
            <div className="num mt-1 font-display text-[44px] font-medium leading-none tracking-[-0.03em]">{s.pbin.toFixed(1)}</div>
            <input id="range-pick" type="range" min={0} max={rows.length - 1} value={i} onChange={(e) => setI(+e.target.value)}
              className="mt-4 w-full accent-[#20AD7D]" aria-valuetext={`${s.pbin} predicted points`} />
          </div>
          <dl className="grid gap-2.5 text-[13px] leading-snug text-text2">
            <div><dt className="inline text-text">Typical score: </dt><dd className="inline">{pos(s.p50)} (average {s.mean.toFixed(1)})</dd></div>
            <div><dt className="inline text-text">Half of them: </dt><dd className="inline">between {pos(s.p25)} and {pos(s.p75)}</dd></div>
            <div><dt className="inline text-text">1 in 10: </dt><dd className="inline">{pos(s.p90)} or more</dd></div>
            <div><dt className="inline text-text">1 in 10: </dt><dd className="inline">{pos(s.p10)} or fewer</dd></div>
            <div className="font-mono text-[11px] text-text3">{s.n.toLocaleString()} player-weeks</div>
          </dl>
        </div>
      </div>
    </Figure>
  );
}

// ---------- 11. residuals ----------
export function ResidualFigure({ R }) {
  const { edges, counts } = R.residuals;
  const POS = ["GK", "DEF", "MID", "FWD"];
  const rows = useMemo(() => POS.flatMap((p) => {
    const tot = counts[p].reduce((a, b) => a + b, 0);
    return counts[p].map((c, i) => ({ pos: p, x1: edges[i], x2: edges[i + 1], n: c, share: c / tot }));
  }), [R]);
  const within = (p) => { const r = rows.filter((d) => d.pos === p && d.x1 >= -2 && d.x2 <= 2); return r.reduce((a, b) => a + b.share, 0); };
  const ref = usePlot((w) => {
    const narrow = w < 640;
    return {
      height: narrow ? 520 : 230, marginLeft: 44,
      [narrow ? "fy" : "fx"]: { domain: POS, label: null },
      x: { label: "Actual minus predicted (points)", domain: [-8, 16], ticks: [-8, -4, 0, 4, 8, 12, 16] },
      y: { label: "Share", grid: true, tickFormat: (v) => pct(v) },
      marks: [
        Plot.frame({ stroke: C.muted, strokeOpacity: 0.15 }),
        Plot.rectY(rows, { x1: "x1", x2: "x2", y: "share", [narrow ? "fy" : "fx"]: "pos", fill: C.model, insetLeft: 0.5, insetRight: 0.5 }),
        Plot.ruleX([0], { stroke: C.ink, strokeOpacity: 0.6 }),
        Plot.tip(rows, Plot.pointerX({ x1: "x1", x2: "x2", y: "share", [narrow ? "fy" : "fx"]: "pos", title: (d) => `${d.pos}: ${d.x1} to ${d.x2} points\n${d.n.toLocaleString()} player-weeks (${pct(d.share, 1)})` })),
      ],
    };
  }, [rows]);
  return (
    <Figure n={11} title="How the misses are shaped" file="residuals"
      caption="Actual minus predicted points for regular starters, one panel per position (misses beyond 16 points are counted in the last bar). Right of zero means the player scored more than predicted."
      takeaway={`Most misses are small (${POS.map((p) => `${p} ${pct(within(p))}`).join(", ")} within 2 points) but the right tail is long: goals and bonus arrive in lumps the model can only expect on average.`}
      table={{ columns: [{ key: "pos", label: "Position" }, { key: "x1", label: "From", num: true }, { key: "x2", label: "To", num: true }, { key: "n", label: "Count", num: true }, { key: "share", label: "Share", num: true, fmt: (v) => pct(v, 1) }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

// ---------- 12. error slices ----------
export function SliceFigure({ R }) {
  const dims = Object.keys(R.slices);
  const [dim, setDim] = useState(dims[0]);
  const ORDER = ["GK", "DEF", "MID", "FWD"];
  const rows = dim === "Position" ? [...R.slices[dim]].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group)) : R.slices[dim];
  const label = (g) => (dim === "Fixture difficulty" ? `FDR ${g}` : g);
  const long = rows.flatMap((r) => [{ group: label(r.group), method: "Model", mae: r.model, n: r.n }, { group: label(r.group), method: "Season average", mae: r.baseline, n: r.n }]);
  const ref = usePlot(() => ({
    height: 60 + rows.length * 38, marginLeft: 86,
    x: { label: "Average miss (points, lower is better)", grid: true, nice: true },
    y: { label: null, domain: rows.map((r) => label(r.group)) },
    color: methodScale(["Model", "Season average"]),
    marks: [
      Plot.link(rows, { x1: "model", x2: "baseline", y1: (d) => label(d.group), y2: (d) => label(d.group), stroke: C.muted, strokeWidth: 2, strokeOpacity: 0.5 }),
      Plot.dot(long, { x: "mae", y: "group", fill: "method", r: 5.5, stroke: "rgb(3 4 5)", strokeWidth: 2 }),
      Plot.tip(rows, Plot.pointerY({ x: "model", y: (d) => label(d.group), title: (d) => `${label(d.group)}\nModel ${d.model.toFixed(2)}\nSeason average ${d.baseline.toFixed(2)}\n${d.n.toLocaleString()} player-weeks` })),
    ],
  }), [rows, dim]);
  const worst = [...rows].sort((a, b) => (a.baseline - a.model) - (b.baseline - b.model))[0];
  const lost = worst.model > worst.baseline;
  return (
    <Figure n={12} title="Where it wins and where it doesn't" file={`error-slices-${dim.toLowerCase().replace(/ /g, "-")}`}
      controls={<Seg label="Slice by" options={dims} value={dim} onChange={setDim} />}
      legend={<Legend items={[["Model", METHOD.Model], ["Season average", METHOD["Season average"]]]} />}
      caption="Average absolute miss for regular starters within each group. The gap between the dots is the model's edge."
      takeaway={lost ? `The one group where the season average does better is ${label(worst.group)} (${worst.model.toFixed(2)} vs ${worst.baseline.toFixed(2)}, ${worst.n} player-weeks): premium players' scores swing on single hauls, and a long average already captures their level.` : `The model is ahead in every ${dim.toLowerCase()} group; its smallest edge is ${label(worst.group)} (${(worst.baseline - worst.model).toFixed(2)} points).`}
      table={{ columns: [{ key: "group", label: dim, render: (v) => label(v) }, { key: "model", label: "Model", num: true, fmt: r2 }, { key: "baseline", label: "Season avg", num: true, fmt: r2 }, { key: "n", label: "n", num: true }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

// ---------- 13. permutation importance ----------
const FEATURE_NAMES = {
  minutes_l3: "Minutes, last 3 GWs", minutes_l5: "Minutes, last 5 GWs", minutes_std: "Minutes, spread", prev_minutes: "Minutes, last season",
  fixture_difficulty: "Fixture difficulty", n_fixtures: "Fixtures this GW", home_fixtures: "Home fixtures", points_std: "Points, spread",
  points_l3: "Points, last 3 GWs", points_l5: "Points, last 5 GWs", xa_l5: "xA, last 5", xg_l5: "xG, last 5", xgc_l5: "xG conceded, last 5",
  team_attack_xg_l6: "Team attack xG, last 6", opp_defence_xga_l6: "Opponent xG against, last 6", opp_attack_xg_l6: "Opponent attack xG, last 6",
  position_code: "Position", bonus_l5: "Bonus, last 5", bps_l5: "BPS, last 5", ict_l5: "ICT index, last 5", price: "Price",
  gws_so_far: "Gameweeks played so far", starts_l5: "Starts, last 5", prev_ppg: "Points per game, last season",
  price_change_season: "Price change this season", xgi_total_std: "xGI, spread", selected_by_prev: "Ownership, last GW",
};
export function ImportanceFigure({ R }) {
  const [all, setAll] = useState(false);
  const rows = R.importance.map((r) => ({ ...r, name: FEATURE_NAMES[r.feature] || r.feature, kind: r.mae_increase > 0.0005 ? "Shuffling it hurts" : "No measurable effect" }));
  const shown = all ? rows : rows.slice(0, 12);
  const ref = usePlot((w) => ({
    height: 40 + shown.length * 22, marginLeft: w < 500 ? 150 : 176,
    x: { label: "MAE increase when shuffled (points)", grid: true, ticks: w < 500 ? 3 : 6 },
    y: { label: null, domain: shown.map((r) => r.name) },
    color: { domain: ["Shuffling it hurts", "No measurable effect"], range: [C.model, C.muted] },
    marks: [
      Plot.barX(shown, { x: "mae_increase", y: "name", fill: "kind", rx: 2, insetTop: 3, insetBottom: 3 }),
      Plot.ruleX([0], { stroke: C.ink, strokeOpacity: 0.5 }),
      Plot.tip(shown, Plot.pointerY({ x: "mae_increase", y: "name", title: (d) => `${d.name} (${d.feature})\n+${d.mae_increase.toFixed(3)} MAE` })),
    ],
  }), [shown]);
  return (
    <Figure n={13} title="What the model leans on" file="feature-importance"
      controls={<Seg label="Features" options={[["top", "Top 12"], ["all", `All ${rows.length}`]]} value={all ? "all" : "top"} onChange={(v) => setAll(v === "all")} />}
      legend={<Legend items={[["Shuffling it hurts", C.model], ["No measurable effect", C.muted]]} />}
      caption="Permutation importance on the test season: shuffle one feature's values, re-score, and measure how much the average miss grows. Near-zero bars are usually features that overlap with another one (minutes over 3 and 5 weeks), not features with no signal."
      takeaway="Whether a player is getting minutes, who he's playing and how many games he has that week matter most. Recent points matter less than they look once minutes are known."
      table={{ columns: [{ key: "feature", label: "Feature" }, { key: "name", label: "Meaning" }, { key: "mae_increase", label: "MAE increase", num: true, fmt: fmt(3) }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}

// ---------- 14. leakage ----------
export function LeakageFigure({ R }) {
  const rows = R.leakage;
  const long = rows.flatMap((r) => [{ column: r.column, when: "Same gameweek", v: r.corr_this_gw, verdict: r.verdict }, { column: r.column, when: "Next gameweek", v: r.corr_next_gw, verdict: r.verdict }]);
  const ref = usePlot(() => ({
    height: 60 + rows.length * 34, marginLeft: 86,
    x: { label: "Correlation with points", grid: true, domain: [0, 0.6] },
    y: { label: null, domain: rows.map((r) => r.column) },
    color: { domain: ["Same gameweek", "Next gameweek"], range: [C.ink, C.season] },
    marks: [
      Plot.link(rows, { x1: "corr_next_gw", x2: "corr_this_gw", y1: "column", y2: "column", stroke: (d) => (d.verdict === "LEAKS" ? C.bad : C.muted), strokeWidth: 2, strokeOpacity: 0.8 }),
      Plot.dot(long, { x: "v", y: "column", fill: "when", r: 5, stroke: "rgb(3 4 5)", strokeWidth: 2 }),
      Plot.text(rows.filter((r) => r.verdict === "LEAKS"), { x: "corr_this_gw", y: "column", text: () => "leaks", dx: 10, textAnchor: "start", fill: C.bad }),
      Plot.tip(rows, Plot.pointerY({ x: "corr_this_gw", y: "column", title: (d) => `${d.column}\nSame GW ${d.corr_this_gw.toFixed(3)}\nNext GW ${d.corr_next_gw.toFixed(3)}\nRatio ${d.ratio.toFixed(2)}: ${d.verdict}` })),
    ],
  }), [rows]);
  const xp = rows.find((r) => r.verdict === "LEAKS");
  return (
    <Figure n={14} title="Leakage check: does a column already know the answer?" file="leakage-check"
      legend={<Legend items={[["Same gameweek", C.ink], ["Next gameweek", C.season]]} />}
      caption="A fair feature is about as related to next week's points as to this week's. A column that tracks the current week far more closely was filled in after the games, and would make a backtest look better than the model really is."
      takeaway={xp ? `FPL's own expected-points column correlates ${xp.corr_this_gw.toFixed(2)} with the same week's points but ${xp.corr_next_gw.toFixed(2)} with the next: it's updated after kickoff, so it's kept out of the model and shown in the results table only as a reference.` : null}
      table={{ columns: [{ key: "column", label: "Column" }, { key: "corr_this_gw", label: "Same GW", num: true, fmt: fmt(3) }, { key: "corr_next_gw", label: "Next GW", num: true, fmt: fmt(3) }, { key: "ratio", label: "Ratio", num: true, fmt: r2 }, { key: "verdict", label: "Verdict", className: (r) => (r.verdict === "LEAKS" ? "text-rose" : "text-text2") }], rows }}>
      <div ref={ref} />
    </Figure>
  );
}
