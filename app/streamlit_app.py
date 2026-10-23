"""FPL Points Lab: predictions for the next gameweek of the season in progress.

Run locally:  streamlit run app/streamlit_app.py
The app only reads the CSVs that run_pipeline.py writes to reports/live/, so it starts
instantly. Re-run the pipeline each gameweek and push to refresh the deployed app.
"""
import html
import sys
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from fpl.picks import best_xi  # noqa: E402

REPO_URL = "https://github.com/andrewkwon0804-web/fpl-analyzer"

# Palette: one accent for the model, quiet grey and orange for the two baselines.
INK, INK_2, MUTED_INK = "#1d2433", "#4d5566", "#7a8190"
PAPER, PANEL, RULE = "#f6f7f4", "#ffffff", "#dfe3dc"
TURF, TURF_DARK, CHALK = "#2f6b4f", "#24563f", "#e6efe8"
MODEL, SEASON, FORM = "#2a78d6", "#a9a8a2", "#eb6834"

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
@media (max-width: 760px) {{
  .line {{ gap: 4px; }}
  .chip .name {{ font-size: .74rem; padding: 4px 3px 0; }}
  .chip .team {{ font-size: .66rem; padding-bottom: 2px; }}
  .chip .pts {{ flex-direction: column; }}
  .chip .pts div + div {{ border-left: 0; border-top: 1px solid {RULE}; }}
  .chip .pts .num {{ font-size: .95rem; }}
  .chip .pts small {{ display: none; }}
  .chip .cap {{ width: 15px; height: 15px; font-size: .6rem; line-height: 15px; top: 2px; right: 2px; }}
}}

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
def load_live():
    """Files written by src/fpl/live.py for the season in progress."""
    folder = ROOT / "reports" / "live"
    try:
        nxt = pd.read_csv(folder / "next_gameweek_predictions.csv")
        played = pd.read_csv(folder / "season_so_far_predictions.csv")
        weekly = pd.read_csv(folder / "season_so_far_weekly.csv")
        sig = pd.read_csv(folder / "season_so_far_significance.csv")
    except FileNotFoundError:
        return None
    nxt["news"] = nxt["news"].fillna("")
    return nxt, played, weekly, sig


data = load_live()
st.markdown("<h1>FPL Points Lab</h1>", unsafe_allow_html=True)
if data is None or data[0].empty:
    st.info("No upcoming gameweek yet. Run the pipeline during the season to get predictions.")
    st.stop()

nxt, played, weekly, sig = data
nxt = nxt.reset_index(drop=True)
GW = int(nxt["gw"].iloc[0])
SEASON_NAME = nxt["season"].iloc[0]
PLAYED = int(played["gw"].max())
team = best_xi(nxt, "predicted_points")
captain = team.loc[team["is_captain"]].iloc[0]


def show_chart(chart, stretch: bool = True) -> None:
    """Draw an Altair chart full-width on both older and newer Streamlit versions."""
    try:
        st.altair_chart(chart, width="stretch" if stretch else "content", theme=None)
    except TypeError:  # Streamlit < 1.50 style API
        st.altair_chart(chart, use_container_width=stretch, theme=None)


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


def edge(metric: str) -> pd.Series:
    return sig[sig.metric == metric].iloc[0]


# ---------------------------------------------------------------- header
mae_edge = edge("MAE (regular starters)")
xi_edge = edge("Best XI: avg points per GW")
st.markdown(
    f'<p class="lede">Predicted Fantasy Premier League points for every player in gameweek {GW} of '
    f'{SEASON_NAME}, from a model trained on four past seasons with SQL and gradient boosting. Updated with '
    f'every match up to gameweek {PLAYED}. <a href="{REPO_URL}">Code and method on GitHub</a>.</p>',
    unsafe_allow_html=True)
st.markdown(f"""
<div class="verdicts">
  <div class="verdict"><div class="num model">{html.escape(captain.web_name)}</div>
    <p>is the model's captain for gameweek {GW}, with {captain.predicted_points:.1f} predicted points,
    the most of any player.</p></div>
  <div class="verdict"><div class="num model">{mae_edge.model_edge:.2f} pts</div>
    <p>smaller error per regular starter than the simple season-average rule, gameweeks 1-{PLAYED}
    this season (95% range {mae_edge.ci_low:.2f} to {mae_edge.ci_high:.2f}).</p></div>
  <div class="verdict"><div class="num">{xi_edge.model_edge:+.0f} pts</div>
    <p>per gameweek from the model's best XI so far. Too early to call: after {PLAYED} gameweeks the
    95% range is {xi_edge.ci_low:+.0f} to {xi_edge.ci_high:+.0f}.</p></div>
</div>
""", unsafe_allow_html=True)

tab_picks, tab_player, tab_record, tab_method = st.tabs(
    [f"GW{GW} picks", "Player lookup", "Track record", "How it works"])


# ---------------------------------------------------------------- next gameweek
def live_chip(r: pd.Series) -> str:
    cap = '<div class="cap">C</div>' if r.is_captain else ""
    flag = " ⚠" if pd.notna(r.chance_of_playing) and r.chance_of_playing < 100 else ""
    return (f'<div class="chip">{cap}<div class="name" title="{html.escape(r.web_name)}">'
            f'{html.escape(r.web_name)}{flag}</div><div class="team">{html.escape(r.team_short)}</div>'
            f'<div class="pts"><div><span class="num">{r.predicted_points:.1f}</span><small>predicted</small></div>'
            f'<div><span class="num">{r.price:.1f}</span><small>£m</small></div></div></div>')


with tab_picks:
    st.markdown(f"<h3>The model's best XI for gameweek {GW}</h3>", unsafe_allow_html=True)
    left, right = st.columns([1.75, 1], gap="large")
    with left:
        lines = []
        for pos in FORMATION_ROWS:
            players = team[team.position == pos].sort_values("predicted_points", ascending=False)
            lines.append('<div class="line">' + "".join(live_chip(r) for _, r in players.iterrows()) + "</div>")
        st.markdown('<div class="pitch">' + "".join(lines) + "</div>", unsafe_allow_html=True)
        st.markdown(f'<p class="note">The highest-predicted valid XI, budget ignored (it would cost '
                    f'£{team.price.sum():.1f}m). Players FPL has flagged are scaled by their chance of '
                    f'playing and marked ⚠.</p>', unsafe_allow_html=True)
    with right:
        st.markdown("<h3>Captain</h3>", unsafe_allow_html=True)
        st.markdown(f'<div class="scoreboard"><div class="row active"><span class="label">'
                    f'{html.escape(captain.web_name)} ({html.escape(captain.team_short)})</span>'
                    f'<span class="num">{captain.predicted_points:.1f}</span></div></div>',
                    unsafe_allow_html=True)
        flagged = (nxt[(nxt.chance_of_playing.fillna(100) < 75) & (nxt.predicted_raw >= 2)]
                   .sort_values("predicted_raw", ascending=False).head(6))
        if len(flagged):
            st.markdown("<h3 style='margin-top:1.2rem'>Downgraded for injury news</h3>", unsafe_allow_html=True)
            rows = "".join(
                f'<div class="row"><span class="label">{html.escape(r.web_name)} '
                f'({int(r.chance_of_playing)}%)<br><small>{html.escape(r.news)}</small></span>'
                f'<span class="num">{r.predicted_raw:.1f}</span></div>' for _, r in flagged.iterrows())
            st.markdown(f'<div class="scoreboard">{rows}</div><p class="note">Predicted points before '
                        f'the availability adjustment.</p>', unsafe_allow_html=True)

    st.markdown("<h3>Top picks</h3>", unsafe_allow_html=True)
    f1, f2 = st.columns([1.2, 1])
    with f1:
        pos_pick = st.radio("Position", ["All", "GK", "DEF", "MID", "FWD"], horizontal=True, key="live_pos")
    with f2:
        max_price = st.slider("Max price (£m)", 4.0, float(nxt.price.max()), float(nxt.price.max()), 0.5)
    view = nxt[(nxt.price <= max_price) & ((nxt.position == pos_pick) | (pos_pick == "All"))].head(15)
    view = view.assign(chance=view.chance_of_playing.map(lambda c: "" if pd.isna(c) else f"{int(c)}%"))
    st.dataframe(
        view[["web_name", "team", "position", "price", "predicted_points", "chance", "news"]]
        .rename(columns={"web_name": "Player", "team": "Team", "position": "Pos", "price": "Price £m",
                         "predicted_points": "Predicted", "chance": "Chance of playing",
                         "news": "FPL news"}),
        hide_index=True, width="stretch",
        column_config={"Predicted": st.column_config.NumberColumn(format="%.2f"),
                       "Price £m": st.column_config.NumberColumn(format="%.1f")})


# ---------------------------------------------------------------- player lookup
with tab_player:
    nxt_labels = nxt.assign(label=nxt.web_name + " (" + nxt.team_short + ")")
    who = st.selectbox("Player", nxt_labels["label"].tolist(), index=0,
                       help=f"Players with a fixture in gameweek {GW}, highest prediction first")
    row = nxt_labels[nxt_labels.label == who].iloc[0]
    hist = played[played.player_id == row.player_id].sort_values("gw")
    a, b, c = st.columns(3)
    a.metric(f"Gameweek {GW} prediction", f"{row.predicted_points:.1f}")
    b.metric(f"Points scored, GW1-{PLAYED}", int(hist.actual_points.sum()) if len(hist) else 0)
    c.metric("Average miss per gameweek",
             f"{(hist.predicted_points - hist.actual_points).abs().mean():.1f}" if len(hist) else "n/a")
    future = pd.DataFrame({"gw": [GW], "predicted_points": [row.predicted_points]})
    x = alt.X("gw:O", title="Gameweek", axis=alt.Axis(labelAngle=0),
              scale=alt.Scale(domain=list(range(1, GW + 1))))
    bars = alt.Chart(hist).mark_bar(color="#cfd4cb", cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        x=x, y=alt.Y("actual_points:Q", title="Points"),
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"), alt.Tooltip("actual_points:Q", title="Scored"),
                 alt.Tooltip("predicted_points:Q", title="Predicted", format=".1f"),
                 alt.Tooltip("minutes:Q", title="Minutes")])
    line = alt.Chart(hist).mark_line(color=MODEL, strokeWidth=2.5,
                                     point=alt.OverlayMarkDef(size=50, filled=True)).encode(
        x=x, y="predicted_points:Q",
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"),
                 alt.Tooltip("predicted_points:Q", title="Predicted", format=".1f")])
    nxt_point = alt.Chart(future).mark_point(color=MODEL, size=160, filled=False, strokeWidth=3).encode(
        x=x, y="predicted_points:Q",
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"),
                 alt.Tooltip("predicted_points:Q", title="Prediction", format=".1f")])
    show_chart(chart_style(alt.layer(bars, line, nxt_point), 320))
    st.markdown(f'<p class="note"><span class="swatch" style="background:#cfd4cb"></span>Points scored '
                f'&nbsp; <span class="swatch" style="background:{MODEL}"></span>Model prediction, made before '
                f'each deadline. The open circle is the gameweek {GW} prediction.</p>', unsafe_allow_html=True)
    if row.news:
        st.markdown(f'<p class="note">FPL news: {html.escape(row.news)}</p>', unsafe_allow_html=True)


# ---------------------------------------------------------------- track record
with tab_record:
    st.markdown(f"<h3>How the predictions did in {SEASON_NAME}, gameweeks 1-{PLAYED}</h3>",
                unsafe_allow_html=True)
    st.markdown('<p class="note" style="margin-top:0">Every gameweek the model and a simple rule (each '
                'player\'s average so far) each pick a best XI before the deadline. Lines show the running '
                'total of points those teams actually scored.</p>', unsafe_allow_html=True)
    cum = weekly.sort_values("gw").assign(total=lambda d: d.groupby("method")["xi_points"].cumsum())
    order = [m for m in ["Model", "Season average"] if m in set(cum.method)]
    color = alt.Color("method:N", scale=alt.Scale(domain=order, range=[METHOD_COLORS[m] for m in order]),
                      legend=None)
    base = alt.Chart(cum).encode(x=alt.X("gw:O", title="Gameweek", axis=alt.Axis(labelAngle=0)),
                                 y=alt.Y("total:Q", title="Total points"), color=color)
    lines = base.mark_line(strokeWidth=2.5, point=alt.OverlayMarkDef(size=50, filled=True)).encode(
        tooltip=[alt.Tooltip("method:N", title=" "), alt.Tooltip("gw:O", title="Gameweek"),
                 alt.Tooltip("xi_points:Q", title="Points that week"),
                 alt.Tooltip("total:Q", title="Running total")])
    last = cum[cum.gw == cum.gw.max()].assign(tag=lambda d: d.method + "  " + d.total.astype(int).astype(str))
    labels = alt.Chart(last).mark_text(align="left", dx=10, fontSize=13, fontWeight=600).encode(
        x="gw:O", y="total:Q", text="tag:N", color=color)
    show_chart(chart_style(alt.layer(lines, labels), 340).properties(padding={"right": 170}))

    rows = ""
    nice = {"MAE (regular starters)": "Smaller prediction error per regular starter",
            "Best XI: avg points per GW": "More points from the best XI each gameweek",
            "Captain pick: avg points": "More points from the captain pick"}
    for _, r in sig.iterrows():
        verdict = '<span class="yes">Yes</span>' if r.significant else '<span class="no">Too early</span>'
        rows += (f"<tr><td>{nice[r.metric]}</td><td class='num'>{r.model_edge:+.2f}</td>"
                 f"<td>{r.ci_low:+.2f} to {r.ci_high:+.2f}</td><td>{verdict}</td></tr>")
    st.markdown(f"""<h3>Is the edge real yet?</h3>
        <table class="edge-table"><thead><tr><th>Model compared with the simple rule</th>
        <th>Edge per GW</th><th>95% range</th><th>Real?</th></tr></thead><tbody>{rows}</tbody></table>
        <p class="note">The range comes from resampling the {PLAYED} gameweeks 4,000 times. With so few
        weeks, only big, steady gaps count as real. This early in a season "last 5 gameweeks" and
        "season average" are the same rule, so only one is shown.</p>""", unsafe_allow_html=True)


# ---------------------------------------------------------------- method
with tab_method:
    st.markdown(f"""
<div style="max-width:70ch; line-height:1.6">

<h3>What this is</h3>
A model that predicts each player's FPL points for the next gameweek. It is retrained on four full
seasons (2022-23 to 2025-26) and fed every {SEASON_NAME} match up to gameweek {PLAYED}. Before going live it
was tested on all of 2025-26 without seeing it, where its best XI beat the season-average rule by about
260 points over the season. The full write-up is on <a href="{REPO_URL}">GitHub</a>.

<h3>Inputs</h3>
Recent and season-long points, minutes, starts, expected goals and assists, last season's points per game,
the opponent's attacking and defensive form, fixture difficulty, home or away, and double gameweeks. All
of it is built in SQL from the open FPL archive, using only what was known before each deadline.

<h3>Injuries</h3>
The model can't see team news. When FPL flags a player, his prediction is multiplied by FPL's chance
of playing (a 25% flag keeps a quarter of it).

<h3>Updates</h3>
The pipeline re-downloads the season, rebuilds the features and predicts the next gameweek. It is
rerun after each gameweek.
</div>
""", unsafe_allow_html=True)
