"""FPL Points Lab: interactive results for the 2025-26 test season.

Run locally:  streamlit run app/streamlit_app.py
The app only reads CSVs that run_pipeline.py already wrote, so it starts instantly.
"""
import html
import sys
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from fpl.picks import best_xi, xi_points  # noqa: E402

REPO_URL = "https://github.com/andrewkwon0804-web/fpl-analyzer"

# Palette: one accent for the model, quiet grey and orange for the two baselines.
INK, INK_2, MUTED_INK = "#1d2433", "#4d5566", "#7a8190"
PAPER, PANEL, RULE = "#f6f7f4", "#ffffff", "#dfe3dc"
TURF, TURF_DARK, CHALK = "#2f6b4f", "#24563f", "#e6efe8"
MODEL, SEASON, FORM = "#2a78d6", "#a9a8a2", "#eb6834"

METHODS = {
    "Model": "predicted_points",
    "Season average": "pred_season_avg",
    "Recent form": "pred_form",
}
METHOD_COLORS = {"Model": MODEL, "Season average": SEASON, "Recent form": FORM}
FORMATION_ROWS = ["FWD", "MID", "DEF", "GK"]  # drawn top to bottom, attack at the top

st.set_page_config(page_title="FPL Points Lab", page_icon="⚽", layout="wide")

st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Source+Sans+3:wght@400;600&display=swap');
html, body, [data-testid="stAppViewContainer"], [data-testid="stMarkdownContainer"], button, input {{
  font-family: 'Source Sans 3', system-ui, sans-serif;
}}
h1, h2, h3, .num {{ font-family: 'Barlow Semi Condensed', 'Source Sans 3', sans-serif; }}
[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding-top: 2.2rem; max-width: 1180px; }}
h1 {{ font-weight: 700; font-size: 2.9rem; letter-spacing: -0.01em; margin-bottom: 0; color: {INK}; }}
.lede {{ color: {INK_2}; font-size: 1.12rem; max-width: 68ch; margin: .35rem 0 1.4rem; line-height: 1.5; }}
.lede a {{ color: {TURF}; }}

.verdicts {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: 0 0 1.6rem;
  border-top: 2px solid {INK}; }}
.verdict {{ padding: .8rem 1.2rem .9rem 0; }}
.verdict + .verdict {{ padding-left: 1.2rem; border-left: 1px solid {RULE}; }}
.verdict .num {{ font-size: 2.1rem; font-weight: 600; line-height: 1.05; color: {INK}; }}
.verdict .num.model {{ color: {MODEL}; }}
.verdict p {{ margin: .25rem 0 0; color: {INK_2}; font-size: .95rem; line-height: 1.4; }}
@media (max-width: 760px) {{
  .verdicts {{ grid-template-columns: 1fr; }}
  .verdict + .verdict {{ border-left: 0; padding-left: 0; border-top: 1px solid {RULE}; }}
}}

.pitch {{ position: relative; background: {TURF}; border-radius: 10px; padding: 18px 10px 14px;
  background-image:
    repeating-linear-gradient(180deg, {TURF} 0 56px, {TURF_DARK} 56px 112px);
  box-shadow: inset 0 0 0 2px rgba(230,239,232,.55); overflow: hidden; }}
.pitch::before {{ content: ""; position: absolute; left: 50%; top: -62px; width: 170px; height: 124px;
  transform: translateX(-50%); border: 2px solid rgba(230,239,232,.45); border-radius: 0 0 50% 50%; }}
.pitch::after {{ content: ""; position: absolute; left: 50%; bottom: 0; width: 46%; height: 74px;
  transform: translateX(-50%); border: 2px solid rgba(230,239,232,.45); border-bottom: 0; }}
.line {{ position: relative; z-index: 1; display: flex; justify-content: center; gap: 8px; margin: 8px 0 14px; }}
.chip {{ flex: 0 1 112px; min-width: 0; background: {PANEL}; border-radius: 6px; text-align: center; overflow: hidden;
  box-shadow: 0 1px 0 rgba(0,0,0,.18); position: relative; }}
.chip .name {{ font-weight: 600; font-size: .9rem; color: {INK}; padding: 6px 6px 0; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }}
.chip .team {{ font-size: .75rem; color: {MUTED_INK}; padding-bottom: 4px; }}
.chip .pts {{ display: flex; border-top: 1px solid {RULE}; }}
.chip .pts div {{ flex: 1; padding: 3px 0 4px; }}
.chip .pts div + div {{ border-left: 1px solid {RULE}; }}
.chip .pts .num {{ font-size: 1.15rem; font-weight: 600; color: {INK}; line-height: 1.1; }}
.chip .pts small {{ display: block; font-size: .68rem; color: {MUTED_INK}; }}
.chip .cap {{ position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; border-radius: 50%;
  background: {INK}; color: #fff; font: 700 .7rem/18px 'Barlow Semi Condensed', sans-serif; }}
@media (max-width: 760px) {{ .line {{ gap: 4px; }} .chip .pts small {{ font-size: .6rem; }} }}

.scoreboard {{ border-top: 2px solid {INK}; }}
.scoreboard .row {{ display: flex; align-items: baseline; justify-content: space-between;
  padding: .55rem 0; border-bottom: 1px solid {RULE}; }}
.scoreboard .row .label {{ color: {INK_2}; }}
.scoreboard .row.active .label {{ color: {INK}; font-weight: 600; }}
.scoreboard .row .num {{ font-size: 1.6rem; font-weight: 600; color: {INK}; }}
.swatch {{ display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 8px; }}
.note {{ color: {MUTED_INK}; font-size: .9rem; line-height: 1.45; margin-top: .6rem; }}
.edge-table {{ width: 100%; border-collapse: collapse; font-size: .97rem; }}
.edge-table th {{ text-align: left; font-weight: 600; color: {INK_2}; border-bottom: 2px solid {INK}; padding: .4rem .5rem .4rem 0; }}
.edge-table td {{ border-bottom: 1px solid {RULE}; padding: .5rem .5rem .5rem 0; vertical-align: top; }}
.edge-table td.num {{ font-size: 1.15rem; font-weight: 600; white-space: nowrap; }}
.yes {{ color: {TURF}; font-weight: 600; }}
.no {{ color: {MUTED_INK}; }}
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------- data
@st.cache_data
def load():
    preds = pd.read_csv(ROOT / "tableau" / "model_predictions_2025_26.csv")
    teams = pd.read_csv(ROOT / "tableau" / "team_season.csv")
    short = teams[teams.season == "2025-26"].set_index("team")["short_name"]
    preds["team_short"] = preds["team"].map(short).fillna(preds["team"].str[:3].str.upper())
    preds["label"] = preds["player"] + " (" + preds["team_short"] + ")"
    sig = pd.read_csv(ROOT / "reports" / "model_significance.csv")
    bias = pd.read_csv(ROOT / "reports" / "bias_by_position.csv")
    form = pd.read_csv(ROOT / "reports" / "sql_results" / "03_does_form_persist.csv")
    defcon = pd.read_csv(ROOT / "reports" / "sql_results" / "06_defcon_rule_change.csv")
    xg = pd.read_csv(ROOT / "reports" / "sql_results" / "05_xg_over_under_performers.csv")
    return preds, sig, bias, form, defcon, xg


@st.cache_data
def weekly_xi_points(preds: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for gw, g in preds.groupby("gw"):
        row = {"gw": gw, "Best possible": xi_points(g, "actual_points", "actual_points")}
        for name, col in METHODS.items():
            row[name] = xi_points(g, col, "actual_points")
        rows.append(row)
    return pd.DataFrame(rows)


preds, sig, bias, form_df, defcon_df, xg_df = load()
weekly = weekly_xi_points(preds)
GWS = sorted(preds["gw"].unique())


def chart_style(chart: alt.Chart, height: int = 320) -> alt.Chart:
    return (chart.properties(height=height, background=PAPER)
            .configure_view(stroke=None)
            .configure_axis(labelFont="Source Sans 3", titleFont="Source Sans 3", labelColor=INK_2,
                            titleColor=INK_2, gridColor="#e6e8e2", domainColor=RULE, tickColor=RULE,
                            labelFontSize=12, titleFontSize=12, titleFontWeight=400)
            .configure_legend(labelFont="Source Sans 3", titleFont="Source Sans 3", labelColor=INK_2,
                              titleColor=INK_2, orient="top", labelFontSize=12,
                              labelLimit=0, columnPadding=18, symbolType="square")
            .configure_text(font="Source Sans 3"))


def edge(baseline: str, metric: str) -> pd.Series:
    return sig[(sig.baseline == baseline) & (sig.metric == metric)].iloc[0]


# ---------------------------------------------------------------- header
xi_vs_season = edge("Season average", "Best XI: avg points per GW")
mae_vs_season = edge("Season average", "MAE (regular starters)")
cap_vs_season = edge("Season average", "Captain pick: avg points")

st.markdown("<h1>FPL Points Lab</h1>", unsafe_allow_html=True)
st.markdown(
    f'<p class="lede">A model that predicts each player\'s Fantasy Premier League points for the next '
    f'gameweek, built with SQL and gradient boosting. Every number below comes from 2025&#8209;26, a full '
    f'season the model never saw while it was being trained. <a href="{REPO_URL}">Code and method on GitHub</a>.</p>',
    unsafe_allow_html=True)

st.markdown(f"""
<div class="verdicts">
  <div class="verdict"><div class="num model">+{xi_vs_season.model_edge:.1f} pts</div>
    <p>per gameweek when it picks the starting XI, compared with picking by season average
    (95% range {xi_vs_season.ci_low:.1f} to {xi_vs_season.ci_high:.1f}).</p></div>
  <div class="verdict"><div class="num model">{mae_vs_season.model_edge:.2f} pts</div>
    <p>smaller error per regular starter than the season-average rule, every week of the season added up.</p></div>
  <div class="verdict"><div class="num">{cap_vs_season.model_edge:+.1f} pts</div>
    <p>on captain picks alone versus season average. Too close to call: one pick a week is mostly luck.</p></div>
</div>
""", unsafe_allow_html=True)

tab_team, tab_season, tab_player, tab_findings, tab_method = st.tabs(
    ["Team of the week", "Season test", "Player lookup", "What the data says", "How it works"])


# ---------------------------------------------------------------- team of the week
def chip(r: pd.Series, score_col: str) -> str:
    cap = '<div class="cap">C</div>' if r.is_captain else ""
    scored = int(r.actual_points) * (2 if r.is_captain else 1)
    return (f'<div class="chip">{cap}<div class="name" title="{html.escape(r.player)}">{html.escape(r.player)}</div>'
            f'<div class="team">{html.escape(r.team_short)}</div>'
            f'<div class="pts"><div><span class="num">{r[score_col]:.1f}</span><small>predicted</small></div>'
            f'<div><span class="num">{scored}</span><small>scored</small></div></div></div>')


with tab_team:
    c1, c2 = st.columns([1.1, 1])
    with c1:
        gw = st.select_slider("Gameweek", options=GWS, value=GWS[-1])
    with c2:
        method = st.radio("Pick the team using", list(METHODS), horizontal=True)
    col = METHODS[method]
    g = preds[preds.gw == gw]
    team = best_xi(g, col)

    left, right = st.columns([1.75, 1], gap="large")
    with left:
        lines = []
        for pos in FORMATION_ROWS:
            players = team[team.position == pos].sort_values(col, ascending=False)
            lines.append('<div class="line">' + "".join(chip(r, col) for _, r in players.iterrows()) + "</div>")
        st.markdown('<div class="pitch">' + "".join(lines) + "</div>", unsafe_allow_html=True)
        st.markdown(
            '<p class="note">Predicted points are what the method expected before the deadline. '
            'Scored is what actually happened (doubled for the captain, marked C). '
            'Budget is ignored, so this tests who ranks players best.</p>', unsafe_allow_html=True)

    with right:
        st.markdown(f"<h3>Gameweek {gw} result</h3>", unsafe_allow_html=True)
        week = weekly[weekly.gw == gw].iloc[0]
        rows = ""
        for name in METHODS:
            active = " active" if name == method else ""
            rows += (f'<div class="row{active}"><span class="label"><span class="swatch" '
                     f'style="background:{METHOD_COLORS[name]}"></span>{name} XI</span>'
                     f'<span class="num">{int(week[name])}</span></div>')
        rows += (f'<div class="row"><span class="label"><span class="swatch" style="background:{RULE}"></span>'
                 f'Best possible XI</span><span class="num">{int(week["Best possible"])}</span></div>')
        st.markdown(f'<div class="scoreboard">{rows}</div>', unsafe_allow_html=True)
        st.markdown('<p class="note">Points the XI scored that week, captain doubled. '
                    'Best possible is the perfect-hindsight team.</p>', unsafe_allow_html=True)

    with st.expander(f"Top 20 predictions for gameweek {gw}"):
        top = (g.sort_values("predicted_points", ascending=False).head(20)
               [["player", "team", "position", "price", "predicted_points", "pred_season_avg",
                 "pred_form", "actual_points", "minutes"]]
               .rename(columns={"player": "Player", "team": "Team", "position": "Pos", "price": "Price £m",
                                "predicted_points": "Model", "pred_season_avg": "Season avg",
                                "pred_form": "Form", "actual_points": "Scored", "minutes": "Minutes"}))
        st.dataframe(top, hide_index=True, width="stretch")


# ---------------------------------------------------------------- season test
with tab_season:
    st.markdown("<h3>Points scored over the whole season</h3>", unsafe_allow_html=True)
    st.markdown('<p class="note" style="margin-top:0">Each method picks a fresh best XI every gameweek. '
                'Lines show the running total of points those teams actually scored.</p>',
                unsafe_allow_html=True)
    cum = weekly.set_index("gw")[list(METHODS)].cumsum().reset_index().melt(
        "gw", var_name="Method", value_name="Total points")
    order = list(METHODS)
    color = alt.Color("Method:N", scale=alt.Scale(domain=order, range=[METHOD_COLORS[m] for m in order]),
                      legend=None)
    hover = alt.selection_point(fields=["gw"], nearest=True, on="pointerover", empty=False)
    base = alt.Chart(cum).encode(x=alt.X("gw:Q", title="Gameweek", scale=alt.Scale(domain=[1, max(GWS)])),
                                 y=alt.Y("Total points:Q", title="Total points"), color=color)
    lines = base.mark_line(strokeWidth=2.5)
    points = base.mark_point(size=60, filled=True).encode(opacity=alt.condition(hover, alt.value(1), alt.value(0)))
    rule = alt.Chart(cum).mark_rule(color=RULE).encode(
        x="gw:Q",
        tooltip=[alt.Tooltip("gw:Q", title="Gameweek")] + [
            alt.Tooltip(f"{m}:Q", title=m, format=",.0f") for m in order],
        opacity=alt.condition(hover, alt.value(1), alt.value(0)),
    ).transform_pivot("Method", value="Total points", groupby=["gw"]).add_params(hover)
    last = cum[cum.gw == max(GWS)]
    last = last.assign(tag=last["Method"] + "  " + last["Total points"].map("{:,.0f}".format))
    labels = alt.Chart(last).mark_text(align="left", dx=8, fontSize=13, fontWeight=600).encode(
        x="gw:Q", y="Total points:Q", text="tag:N", color=color)
    season_chart = chart_style(alt.layer(lines, points, rule, labels), 360).properties(padding={"right": 150})
    st.altair_chart(season_chart, use_container_width=True, theme=None)

    st.markdown("<h3>Is the edge real or luck?</h3>", unsafe_allow_html=True)
    rows = ""
    nice = {"MAE (regular starters)": "Smaller prediction error per regular starter",
            "Best XI: avg points per GW": "More points from the best XI each gameweek",
            "Captain pick: avg points": "More points from the captain pick"}
    for _, r in sig.iterrows():
        verdict = '<span class="yes">Yes</span>' if r.significant else '<span class="no">Not clear</span>'
        rows += (f"<tr><td>{nice[r.metric]}</td><td>{r.baseline.replace('Form (last 5 GW avg)', 'Recent form')}</td>"
                 f'<td class="num num">{r.model_edge:+.2f}</td>'
                 f"<td>{r.ci_low:+.2f} to {r.ci_high:+.2f}</td><td>{verdict}</td></tr>")
    st.markdown(f"""<table class="edge-table"><thead><tr><th>Model compared with the rule</th><th>Rule</th>
        <th>Edge per GW</th><th>95% range</th><th>Real?</th></tr></thead><tbody>{rows}</tbody></table>
        <p class="note">The range comes from resampling the 38 gameweeks 4,000 times. If it stays above zero,
        the edge is unlikely to be luck.</p>""", unsafe_allow_html=True)

    st.markdown("<h3>Where it misses</h3>", unsafe_allow_html=True)
    b = bias.copy()
    b["label"] = b["bias"].map(lambda v: f"{v:+.2f}")
    bars = alt.Chart(b).mark_bar(cornerRadiusEnd=4, height=22).encode(
        y=alt.Y("position:N", sort=["GK", "DEF", "MID", "FWD"], title=None,
                axis=alt.Axis(labelPadding=8, minExtent=44, ticks=False)),
        x=alt.X("bias:Q", title="Average predicted minus actual points (regular starters)",
                axis=alt.Axis(format="+.1f", tickCount=6)),
        color=alt.condition("datum.position == 'DEF'", alt.value(MODEL), alt.value(SEASON)),
        tooltip=[alt.Tooltip("position:N", title="Position"), alt.Tooltip("bias:Q", format="+.2f", title="Bias"),
                 alt.Tooltip("rows:Q", title="Player-gameweeks")])
    st.altair_chart(chart_style(bars, 170), use_container_width=True, theme=None)
    st.markdown('<p class="note">Defenders are under-predicted by about half a point a week. 2025-26 added '
                'points for defensive contributions, a rule the model never saw in training.</p>',
                unsafe_allow_html=True)


# ---------------------------------------------------------------- player lookup
with tab_player:
    totals = preds.groupby("label")["actual_points"].sum().sort_values(ascending=False)
    who = st.selectbox("Player", totals.index.tolist(), index=0,
                       help="Sorted by total points scored in 2025-26")
    p = preds[preds.label == who].sort_values("gw")
    a, b2, c = st.columns(3)
    a.metric("Points scored", int(p.actual_points.sum()))
    b2.metric("Points the model predicted", f"{p.predicted_points.sum():.0f}")
    c.metric("Average miss per gameweek", f"{(p.predicted_points - p.actual_points).abs().mean():.1f}")
    long = p.melt("gw", value_vars=["actual_points", "predicted_points"], var_name="series", value_name="pts")
    long["series"] = long["series"].map({"actual_points": "Scored", "predicted_points": "Model prediction"})
    bars = alt.Chart(p).mark_bar(color="#cfd4cb", cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        x=alt.X("gw:O", title="Gameweek", axis=alt.Axis(labelAngle=0, labelOverlap=True)),
        y=alt.Y("actual_points:Q", title="Points"),
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"), alt.Tooltip("actual_points:Q", title="Scored"),
                 alt.Tooltip("predicted_points:Q", title="Predicted", format=".1f"),
                 alt.Tooltip("minutes:Q", title="Minutes")])
    line = alt.Chart(p).mark_line(color=MODEL, strokeWidth=2.5, point=alt.OverlayMarkDef(size=40, filled=True)).encode(
        x="gw:O", y="predicted_points:Q",
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"), alt.Tooltip("predicted_points:Q", title="Predicted", format=".1f")])
    st.altair_chart(chart_style(alt.layer(bars, line), 330), use_container_width=True, theme=None)
    st.markdown(f'<p class="note"><span class="swatch" style="background:#cfd4cb"></span>Points scored '
                f'&nbsp; <span class="swatch" style="background:{MODEL}"></span>Model prediction made before '
                f'the deadline. Big spikes (hat-tricks, double gameweeks) are what no model can see coming.</p>',
                unsafe_allow_html=True)


# ---------------------------------------------------------------- findings
with tab_findings:
    left, right = st.columns(2, gap="large")
    with left:
        st.markdown("<h3>Hot streaks fade</h3>", unsafe_allow_html=True)
        f = form_df.melt("avg_last5", value_vars=["avg_season_to_date", "avg_next_gw_points"],
                         var_name="series", value_name="pts")
        f["series"] = f["series"].map({"avg_season_to_date": "Season average so far",
                                       "avg_next_gw_points": "Points the next gameweek"})
        dom = ["Points the next gameweek", "Season average so far"]
        ch = alt.Chart(f).mark_line(strokeWidth=2.5, point=alt.OverlayMarkDef(size=60, filled=True)).encode(
            x=alt.X("avg_last5:Q", title="Average points over the last 5 gameweeks"),
            y=alt.Y("pts:Q", title="Points"),
            color=alt.Color("series:N", scale=alt.Scale(domain=dom, range=[MODEL, FORM]), legend=None),
            tooltip=[alt.Tooltip("series:N", title=" "), alt.Tooltip("avg_last5:Q", title="Last 5 avg", format=".1f"),
                     alt.Tooltip("pts:Q", title="Points", format=".2f")])
        diag = alt.Chart(pd.DataFrame({"x": [1, 9.5], "y": [1, 9.5]})).mark_line(
            color=SEASON, strokeDash=[5, 4]).encode(x="x:Q", y="y:Q")
        ends = f[f.avg_last5 == f.avg_last5.max()].assign(
            tag=lambda t: t["series"].map({dom[0]: "Next gameweek", dom[1]: "Season average"}))
        tag_enc = dict(x="avg_last5:Q", y="pts:Q", text="tag:N",
                       color=alt.Color("series:N", scale=alt.Scale(domain=dom, range=[MODEL, FORM]), legend=None))
        tags = alt.layer(  # nudge the two labels apart so they don't touch
            alt.Chart(ends[ends.series == dom[0]]).mark_text(align="left", dx=9, dy=8, fontSize=12, fontWeight=600).encode(**tag_enc),
            alt.Chart(ends[ends.series == dom[1]]).mark_text(align="left", dx=9, dy=-8, fontSize=12, fontWeight=600).encode(**tag_enc))
        form_chart = chart_style(alt.layer(diag, ch, tags), 300).properties(padding={"right": 105})
        st.altair_chart(form_chart, use_container_width=True, theme=None)
        st.markdown('<p class="note">Regular starters averaging 9+ points over five weeks scored about 5 the '
                    'next week, close to their season average. The dashed line is what would happen if form '
                    'carried on.</p>', unsafe_allow_html=True)

    with right:
        st.markdown("<h3>The new rule paid defenders</h3>", unsafe_allow_html=True)
        d = defcon_df[defcon_df.position == "DEF"].copy()
        d["is_new"] = d["season"] == "2025-26"
        d["label"] = d["share_of_points_pct"].map("{:.1f}%".format)
        bars = alt.Chart(d).mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, width=46).encode(
            x=alt.X("season:N", title=None, axis=alt.Axis(labelAngle=0)),
            y=alt.Y("share_of_points_pct:Q", title="Defenders' share of all FPL points (%)",
                    scale=alt.Scale(domain=[0, 40])),
            color=alt.condition("datum.is_new", alt.value(MODEL), alt.value(SEASON)),
            tooltip=[alt.Tooltip("season:N", title="Season"),
                     alt.Tooltip("share_of_points_pct:Q", title="Share %", format=".1f"),
                     alt.Tooltip("points_per_90:Q", title="Points per 90", format=".2f")])
        text = bars.mark_text(dy=-8, fontSize=13, fontWeight=600, color=INK).encode(
            text="label:N", color=alt.value(INK))
        st.altair_chart(chart_style(alt.layer(bars, text), 300), use_container_width=True, theme=None)
        st.markdown('<p class="note">2025-26 (blue) added points for tackles, blocks and recoveries. '
                    'Defenders went from about 29% to 35% of all points scored.</p>', unsafe_allow_html=True)

    st.markdown("<h3>Scoring above xG doesn't last</h3>", unsafe_allow_html=True)
    x = xg_df.dropna(subset=["next_season_goals_minus_xg"])
    x = x[x.goals_minus_xg >= 3].sort_values("goals_minus_xg", ascending=False)
    st.markdown(f'<p class="note" style="margin-top:0">{len(x)} players beat their expected goals by 3 or more '
                f'in a season (2023-24 or 2024-25). On average they were {x.goals_minus_xg.mean():+.1f} goals above '
                f'xG, and {x.next_season_goals_minus_xg.mean():+.1f} the season after. '
                f'{int((x.next_season_goals_minus_xg < x.goals_minus_xg).sum())} of {len(x)} fell back.</p>',
                unsafe_allow_html=True)
    show = x[["season", "web_name", "position", "goals", "xg", "goals_minus_xg", "next_season_goals_minus_xg"]].rename(
        columns={"season": "Season", "web_name": "Player", "position": "Pos", "goals": "Goals", "xg": "xG",
                 "goals_minus_xg": "Goals minus xG", "next_season_goals_minus_xg": "Next season"})
    st.dataframe(show, hide_index=True, width="stretch", height=36 * (len(show) + 1) + 3)


# ---------------------------------------------------------------- method
with tab_method:
    st.markdown(f"""
<div style="max-width:70ch; line-height:1.6">

<h3>Data</h3>
Every player in every Premier League match from 2022-23 to 2025-26, about 113,000 rows, from the open
<a href="https://github.com/vaastav/Fantasy-Premier-League">vaastav/Fantasy-Premier-League</a> archive of the
official FPL API. It is cleaned and loaded into a SQLite database. FPL only started publishing xG in gameweek 16
of 2022-23, so earlier weeks are treated as missing rather than zero.

<h3>Features, all in SQL</h3>
Rolling 3- and 5-gameweek averages of points, minutes, starts, xG and xA, season-to-date averages, last season's
points per game, opponent attack and defence form, fixture difficulty and double gameweeks. Every window stops
at the previous gameweek, so the model only uses what was known before the deadline. Tests check this.

<h3>Model and testing</h3>
Gradient boosting (scikit-learn). Trained on 2022-23 and 2023-24, tuned on 2024-25, then scored once on all of
2025-26. It is compared with two rules a manager might use: each player's season average so far, and his
average over the last five gameweeks.

<h3>A trap avoided</h3>
The dataset includes an expected-points column that looks like a ready-made feature. It correlates four times
more with the gameweek it is meant to predict than with the next one, which means it contains information from
the match itself. It is left out of the model.

<p><a href="{REPO_URL}">Read the code on GitHub</a></p>
</div>
""", unsafe_allow_html=True)
