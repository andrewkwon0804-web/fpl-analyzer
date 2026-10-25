"""FPL Points Lab: predictions for the next gameweek of the season in progress.

Run locally:  streamlit run app/streamlit_app.py
The app only reads the files that run_pipeline.py writes to reports/live/, so it starts
instantly. Re-run the pipeline each gameweek and push to refresh the deployed app.
"""
import html
import json
import sys
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from fpl.picks import best_xi  # noqa: E402

REPO_URL = "https://github.com/andrewkwon0804-web/fpl-analyzer"

# Dark theme: near-black surfaces, hairline borders, one glowing accent for the model.
BG, PANEL, PANEL_2 = "#050505", "#0c0c0c", "#121212"
LINE, LINE_2 = "#1f1f1f", "#2c2c2c"
TEXT, TEXT_2, TEXT_3 = "#ededed", "#a3a3a3", "#6b6b6b"
ACCENT, ACCENT_2 = "#5ef0b0", "#6aa8ff"      # mint to sky, used for the glow and the model
BASELINE = "#7c7c7c"
WARN = "#f5c451"
METHOD_COLORS = {"Model": ACCENT, "Season average": BASELINE}
FORMATION_ROWS = ["FWD", "MID", "DEF", "GK"]  # drawn top to bottom, attack at the top

st.set_page_config(page_title="FPL Points Lab", page_icon="⚽", layout="wide")

st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
html, body, [data-testid="stAppViewContainer"], [data-testid="stMarkdownContainer"], button, input, label {{
  font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif;
}}
[data-testid="stAppViewContainer"] {{ background: {BG}; }}
[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding-top: 1.2rem; max-width: 1200px; }}

/* top bar */
.topbar {{ display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 10px 12px 10px 16px;
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: {TEXT_2}; }}
.topbar .brand {{ color: {TEXT}; display: flex; align-items: center; gap: 10px; }}
.brand-mark {{ width: 18px; height: 18px; border: 1.5px solid {ACCENT}; border-radius: 4px;
  box-shadow: 0 0 10px {ACCENT}66; position: relative; }}
.brand-mark::after {{ content: ""; position: absolute; left: 50%; top: 2px; bottom: 2px;
  border-left: 1.5px solid {ACCENT}; }}
.btn {{ display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 6px;
  font-family: 'Geist Mono', monospace; font-size: .76rem; letter-spacing: .08em; text-transform: uppercase;
  text-decoration: none !important; border: 1px solid {LINE_2}; color: {TEXT} !important; background: {PANEL_2}; }}
.btn.primary {{ background: {TEXT}; color: #000 !important; border-color: {TEXT}; font-weight: 500; }}
@media (max-width: 820px) {{ .topbar .mid {{ display: none; }} }}

/* hero */
.hero {{ display: grid; grid-template-columns: 1.15fr 1fr; gap: 40px; align-items: center; margin: 56px 0 40px; }}
.hero h1 {{ font-family: 'Geist', sans-serif; font-weight: 400; font-size: 4.1rem; line-height: 1.02;
  letter-spacing: -0.035em; color: {TEXT}; margin: 0 0 18px; padding: 0; }}
.hero p {{ color: {TEXT_2}; font-size: 1.05rem; line-height: 1.55; max-width: 46ch; margin: 0 0 26px; }}
.hero .actions {{ display: flex; gap: 10px; flex-wrap: wrap; }}
.cap-card {{ position: relative; border: 1px solid {LINE_2}; border-radius: 18px; background: {PANEL};
  aspect-ratio: 1.15 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  overflow: hidden; }}
.cap-card::before {{ content: ""; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 55%, {ACCENT}1f, transparent 60%); }}
.cap-card .glyphs {{ position: absolute; inset: 18px; display: flex; justify-content: space-between;
  font-family: 'Geist Mono', monospace; font-size: .7rem; color: #3a3a3a; letter-spacing: .25em; pointer-events: none; }}
.cap-card .glyphs div {{ display: flex; flex-direction: column; justify-content: space-between; }}
.cap-card .glyphs div:last-child {{ text-align: right; }}
.cap-card .big {{ position: relative; font-weight: 300; font-size: 7.5rem; line-height: 1; letter-spacing: -0.05em;
  color: transparent; background: linear-gradient(180deg, {ACCENT}, {ACCENT_2});
  -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 0 22px {ACCENT}55); }}
.cap-card .who {{ position: relative; margin-top: 14px; font-size: 1.35rem; color: {TEXT}; letter-spacing: -0.01em; }}
.cap-card .sub {{ position: relative; margin-top: 6px; font-family: 'Geist Mono', monospace; font-size: .72rem;
  color: {TEXT_3}; letter-spacing: .12em; text-transform: uppercase; }}
.tag {{ position: relative; display: inline-block; font-family: 'Geist Mono', monospace; font-size: .68rem;
  letter-spacing: .12em; text-transform: uppercase; padding: 3px 8px; border-radius: 4px;
  background: #d9d9d9; color: #0a0a0a; font-weight: 500; }}
.tag.dark {{ background: {PANEL_2}; color: {TEXT_2}; border: 1px solid {LINE_2}; }}
.tag.warn {{ background: {WARN}; color: #111; white-space: nowrap; }}
@media (max-width: 820px) {{
  .hero {{ grid-template-columns: 1fr; margin-top: 32px; gap: 28px; }}
  .hero h1 {{ font-size: 2.8rem; }}
  .cap-card .big {{ font-size: 5.5rem; }}
}}

/* status + stat panels */
.status {{ display: flex; gap: 14px; align-items: flex-start; border: 1px solid #3a3320; background: #12100a;
  border-radius: 10px; padding: 14px 16px; margin: 0 0 28px; color: #d9cfae; font-size: .95rem; line-height: 1.5; }}
.stats {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 0 0 44px; }}
.stat {{ border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 18px 18px 20px; }}
.stat .head {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; gap: 8px; }}
.stat .head .title {{ color: {TEXT}; font-size: .95rem; }}
.stat .val {{ font-size: 2.5rem; font-weight: 400; letter-spacing: -0.03em; color: {TEXT}; line-height: 1; }}
.stat .val.accent {{ color: {ACCENT}; text-shadow: 0 0 18px {ACCENT}40; }}
.stat p {{ margin: 10px 0 0; color: {TEXT_3}; font-family: 'Geist Mono', monospace; font-size: .76rem; line-height: 1.6; }}
@media (max-width: 820px) {{ .stats {{ grid-template-columns: 1fr; }} }}

/* tabs */
.stTabs [data-baseweb="tab-list"] {{ gap: 6px; border-bottom: 1px solid {LINE}; }}
.stTabs [data-baseweb="tab"] {{ font-family: 'Geist Mono', monospace; text-transform: uppercase; letter-spacing: .08em;
  font-size: .76rem; color: {TEXT_3}; padding: 10px 12px; }}
.stTabs [data-baseweb="tab"] p {{ font-family: 'Geist Mono', monospace; font-size: .76rem; }}
.stTabs [aria-selected="true"], .stTabs [aria-selected="true"] p {{ color: {TEXT} !important; }}
.stTabs [data-baseweb="tab-highlight"] {{ background: {ACCENT}; box-shadow: 0 0 10px {ACCENT}; }}

h3.section {{ font-weight: 400; font-size: 1.9rem; letter-spacing: -0.025em; color: {TEXT}; margin: 30px 0 6px; padding: 0; }}
.note {{ color: {TEXT_3}; font-family: 'Geist Mono', monospace; font-size: .76rem; line-height: 1.65; margin-top: .7rem; }}
.note a, .body a {{ color: {ACCENT}; }}

/* tactics board */
.board {{ position: relative; border: 1px solid {LINE_2}; border-radius: 16px; padding: 22px 12px 16px;
  background: linear-gradient(180deg, #0a0d0b, #070707); overflow: hidden; }}
.board::before {{ content: ""; position: absolute; left: 50%; top: -70px; width: 190px; height: 140px;
  transform: translateX(-50%); border: 1px solid {ACCENT}55; border-radius: 0 0 50% 50%;
  box-shadow: 0 0 18px {ACCENT}22; }}
.board::after {{ content: ""; position: absolute; left: 50%; bottom: 0; width: 46%; height: 80px;
  transform: translateX(-50%); border: 1px solid {ACCENT}55; border-bottom: 0; box-shadow: 0 0 18px {ACCENT}22; }}
.board .mid {{ position: absolute; left: 14px; right: 14px; top: 50%; border-top: 1px dashed #1d2a24; }}
.line {{ position: relative; z-index: 1; display: flex; justify-content: center; gap: 8px; margin: 10px 0 16px; }}
.chip {{ flex: 0 1 116px; min-width: 0; background: {PANEL}; border: 1px solid {LINE_2}; border-radius: 8px;
  text-align: center; overflow: hidden; position: relative; }}
.chip.captain {{ border-color: {ACCENT}; box-shadow: 0 0 16px {ACCENT}33; }}
.chip .name {{ font-size: .86rem; color: {TEXT}; padding: 8px 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.chip .team {{ font-family: 'Geist Mono', monospace; font-size: .64rem; letter-spacing: .1em; color: {TEXT_3}; padding: 2px 0 6px; }}
.chip .pts {{ display: flex; border-top: 1px solid {LINE}; }}
.chip .pts div {{ flex: 1; padding: 5px 0 6px; }}
.chip .pts div + div {{ border-left: 1px solid {LINE}; }}
.chip .pts .n {{ font-size: 1.1rem; color: {TEXT}; line-height: 1.1; }}
.chip .pts .n.accent {{ color: {ACCENT}; }}
.chip .pts small {{ display: block; font-family: 'Geist Mono', monospace; font-size: .58rem; letter-spacing: .08em;
  color: {TEXT_3}; text-transform: uppercase; }}
.chip .c {{ position: absolute; top: 5px; right: 5px; width: 17px; height: 17px; border-radius: 50%; background: {ACCENT};
  color: #000; font: 600 .62rem/17px 'Geist Mono', monospace; }}
.chip .flag {{ color: {WARN}; }}
@media (max-width: 820px) {{
  .line {{ gap: 4px; }}
  .chip .name {{ font-size: .72rem; padding: 6px 3px 0; }}
  .chip .pts {{ flex-direction: column; }}
  .chip .pts div + div {{ border-left: 0; border-top: 1px solid {LINE}; }}
  .chip .pts small {{ display: none; }}
}}

/* side panels */
.panel {{ border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 16px; margin-bottom: 6px; }}
.panel .head {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px; }}
.panel .head .title {{ color: {TEXT}; }}
.row {{ display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 0;
  border-top: 1px solid {LINE}; }}
.row .l {{ color: {TEXT}; font-size: .95rem; }}
.row .l small {{ display: block; color: {TEXT_3}; font-family: 'Geist Mono', monospace; font-size: .7rem; margin-top: 3px; }}
.row .r {{ font-size: 1.35rem; color: {TEXT}; }}
.swatch {{ display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 8px; }}

.edge-table {{ width: 100%; border-collapse: collapse; font-size: .95rem; }}
.edge-table th {{ text-align: left; font-family: 'Geist Mono', monospace; font-weight: 400; font-size: .7rem;
  letter-spacing: .1em; text-transform: uppercase; color: {TEXT_3}; border-bottom: 1px solid {LINE_2}; padding: .5rem .5rem .5rem 0; }}
.edge-table td {{ border-bottom: 1px solid {LINE}; padding: .7rem .5rem .7rem 0; color: {TEXT_2}; }}
.edge-table td.n {{ color: {TEXT}; font-size: 1.1rem; white-space: nowrap; }}
.yes {{ color: {ACCENT}; }}
.no {{ color: {TEXT_3}; }}
.body {{ max-width: 68ch; line-height: 1.7; color: {TEXT_2}; }}
.body h4 {{ color: {TEXT}; font-weight: 400; font-size: 1.25rem; letter-spacing: -0.01em; margin: 26px 0 6px; padding: 0; }}
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
    try:
        meta = json.loads((folder / "meta.json").read_text())
    except FileNotFoundError:
        meta = {}
    nxt["news"] = nxt["news"].fillna("")
    return nxt, played, weekly, sig, meta


data = load_live()
if data is None or data[0].empty:
    st.markdown('<div class="topbar"><span class="brand"><span class="brand-mark"></span>FPL Points Lab</span></div>',
                unsafe_allow_html=True)
    st.info("No upcoming gameweek yet. Run the pipeline during the season to get predictions.")
    st.stop()

nxt, played, weekly, sig, meta = data
nxt = nxt.reset_index(drop=True)
GW = int(nxt["gw"].iloc[0])
SEASON_NAME = nxt["season"].iloc[0]
PLAYED = int(played["gw"].max())
team = best_xi(nxt, "predicted_points")
captain = team.loc[team["is_captain"]].iloc[0]

kickoff = pd.Timestamp(meta["next_gw_first_kickoff"]) if meta.get("next_gw_first_kickoff") else None
STALE = kickoff is not None and kickoff < pd.Timestamp.now(tz="UTC")


def show_chart(chart, stretch: bool = True) -> None:
    """Draw an Altair chart full-width on both older and newer Streamlit versions."""
    try:
        st.altair_chart(chart, width="stretch" if stretch else "content", theme=None)
    except TypeError:  # Streamlit < 1.50 style API
        st.altair_chart(chart, use_container_width=stretch, theme=None)


def chart_style(chart: alt.Chart, height: int = 320) -> alt.Chart:
    return (chart.properties(height=height, background=BG)
            .configure_view(stroke=None)
            .configure_axis(labelFont="Geist Mono", titleFont="Geist Mono", labelColor=TEXT_3, titleColor=TEXT_3,
                            gridColor="#161616", domainColor=LINE_2, tickColor=LINE_2, labelFontSize=11,
                            titleFontSize=11, titleFontWeight=400)
            .configure_text(font="Geist"))


def edge(metric: str) -> pd.Series:
    return sig[sig.metric == metric].iloc[0]


mae_edge = edge("MAE (regular starters)")
xi_edge = edge("Best XI: avg points per GW")


# ---------------------------------------------------------------- top bar + hero
st.markdown(f"""
<div class="topbar">
  <span class="brand"><span class="brand-mark"></span>FPL Points Lab</span>
  <span class="mid">{html.escape(SEASON_NAME)} &nbsp;/&nbsp; Gameweek {GW}</span>
  <a class="btn primary" href="{REPO_URL}">GitHub &nbsp;›</a>
</div>
""", unsafe_allow_html=True)

st.markdown(f"""
<div class="hero">
  <div>
    <h1>Gameweek {GW},<br>predicted.</h1>
    <p>Every Fantasy Premier League player's expected points for the next gameweek, from a model
    trained on four past seasons with SQL and gradient boosting.</p>
    <div class="actions">
      <a class="btn primary" href="{REPO_URL}">Read the method &nbsp;›</a>
      <span class="btn">Data through GW{PLAYED}</span>
    </div>
  </div>
  <div class="cap-card">
    <div class="glyphs"><div><span>+x8o</span><span>##@</span><span>o+x</span></div>
      <div><span>%$s</span><span>08x</span><span>x@#</span></div></div>
    <span class="tag">Captain pick</span>
    <div class="big" style="margin-top:18px">{captain.predicted_points:.1f}</div>
    <div class="who">{html.escape(captain.web_name)}</div>
    <div class="sub">{html.escape(captain.team)} &nbsp;/&nbsp; predicted points</div>
  </div>
</div>
""", unsafe_allow_html=True)

if STALE:
    st.markdown(f"""
<div class="status"><span class="tag warn">Out of date</span><span>These picks use matches up to
gameweek {PLAYED}, but gameweek {GW} kicked off on {kickoff:%d %B}. The open FPL archive this site reads
hasn't published those results yet. The picks will move on once it does.</span></div>
""", unsafe_allow_html=True)

st.markdown(f"""
<div class="stats">
  <div class="stat"><div class="head"><span class="title">Prediction error</span><span class="tag">Real edge</span></div>
    <div class="val accent">{mae_edge.model_edge:.2f}</div>
    <p>points smaller per regular starter than the simple season-average rule, GW1-{PLAYED} this season.
    95% range {mae_edge.ci_low:.2f} to {mae_edge.ci_high:.2f}.</p></div>
  <div class="stat"><div class="head"><span class="title">Best XI</span><span class="tag dark">Too early</span></div>
    <div class="val">{xi_edge.model_edge:+.0f}</div>
    <p>points per gameweek over the simple rule's XI so far. After {PLAYED} gameweeks the 95% range
    is {xi_edge.ci_low:+.0f} to {xi_edge.ci_high:+.0f}, so it can't be called yet.</p></div>
  <div class="stat"><div class="head"><span class="title">Last season</span><span class="tag">Unseen test</span></div>
    <div class="val">+260</div>
    <p>points over all of 2025-26 for the model's weekly XI versus the simple rule, in a season it
    never saw while training.</p></div>
</div>
""", unsafe_allow_html=True)

tab_picks, tab_player, tab_record, tab_method = st.tabs(
    [f"GW{GW} picks", "Player lookup", "Track record", "How it works"])


# ---------------------------------------------------------------- next gameweek
def chip(r: pd.Series) -> str:
    cap = '<div class="c">C</div>' if r.is_captain else ""
    flag = ' <span class="flag">⚠</span>' if pd.notna(r.chance_of_playing) and r.chance_of_playing < 100 else ""
    cls = "chip captain" if r.is_captain else "chip"
    return (f'<div class="{cls}">{cap}<div class="name" title="{html.escape(r.web_name)}">'
            f'{html.escape(r.web_name)}{flag}</div><div class="team">{html.escape(r.team_short)}</div>'
            f'<div class="pts"><div><span class="n accent">{r.predicted_points:.1f}</span><small>pts</small></div>'
            f'<div><span class="n">{r.price:.1f}</span><small>£m</small></div></div></div>')


with tab_picks:
    st.markdown(f'<h3 class="section">The model\'s best XI for gameweek {GW}</h3>', unsafe_allow_html=True)
    left, right = st.columns([1.75, 1], gap="large")
    with left:
        lines = []
        for pos in FORMATION_ROWS:
            players = team[team.position == pos].sort_values("predicted_points", ascending=False)
            lines.append('<div class="line">' + "".join(chip(r) for _, r in players.iterrows()) + "</div>")
        st.markdown('<div class="board"><div class="mid"></div>' + "".join(lines) + "</div>",
                    unsafe_allow_html=True)
        st.markdown(f'<p class="note">Each card shows predicted points, then price. Highest-predicted valid '
                    f'XI, budget ignored (it would cost £{team.price.sum():.1f}m). Flagged players (⚠) are '
                    f'scaled by FPL\'s chance of playing.</p>', unsafe_allow_html=True)
    with right:
        flagged = (nxt[(nxt.chance_of_playing.fillna(100) < 75) & (nxt.predicted_raw >= 2)]
                   .sort_values("predicted_raw", ascending=False).head(6))
        rows = "".join(
            f'<div class="row"><span class="l">{html.escape(r.web_name)} ({int(r.chance_of_playing)}%)'
            f'<small>{html.escape(r.news)}</small></span><span class="r">{r.predicted_raw:.1f}</span></div>'
            for _, r in flagged.iterrows())
        st.markdown(f'<div class="panel"><div class="head"><span class="title">Downgraded for injury news</span>'
                    f'<span class="tag dark">FPL flags</span></div>{rows}</div>'
                    f'<p class="note">Predicted points before the availability adjustment.</p>',
                    unsafe_allow_html=True)

    st.markdown('<h3 class="section">Top picks</h3>', unsafe_allow_html=True)
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
                         "predicted_points": "Predicted", "chance": "Chance of playing", "news": "FPL news"}),
        hide_index=True, width="stretch",
        column_config={"Predicted": st.column_config.NumberColumn(format="%.2f"),
                       "Price £m": st.column_config.NumberColumn(format="%.1f")})


# ---------------------------------------------------------------- player lookup
with tab_player:
    st.markdown('<h3 class="section">Player lookup</h3>', unsafe_allow_html=True)
    labels = nxt.assign(label=nxt.web_name + " (" + nxt.team_short + ")")
    who = st.selectbox("Player", labels["label"].tolist(), index=0,
                       help=f"Players with a fixture in gameweek {GW}, highest prediction first")
    row = labels[labels.label == who].iloc[0]
    hist = played[played.player_id == row.player_id].sort_values("gw")
    miss = f"{(hist.predicted_points - hist.actual_points).abs().mean():.1f}" if len(hist) else "n/a"
    st.markdown(f"""
<div class="stats" style="margin:14px 0 22px">
  <div class="stat"><div class="head"><span class="title">Gameweek {GW}</span><span class="tag">Prediction</span></div>
    <div class="val accent">{row.predicted_points:.1f}</div></div>
  <div class="stat"><div class="head"><span class="title">GW1-{PLAYED}</span><span class="tag dark">Scored</span></div>
    <div class="val">{int(hist.actual_points.sum()) if len(hist) else 0}</div></div>
  <div class="stat"><div class="head"><span class="title">Average miss</span><span class="tag dark">Per GW</span></div>
    <div class="val">{miss}</div></div>
</div>""", unsafe_allow_html=True)
    future = pd.DataFrame({"gw": [GW], "predicted_points": [row.predicted_points]})
    x = alt.X("gw:O", title="GAMEWEEK", axis=alt.Axis(labelAngle=0), scale=alt.Scale(domain=list(range(1, GW + 1))))
    bars = alt.Chart(hist).mark_bar(color="#262626", cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        x=x, y=alt.Y("actual_points:Q", title="POINTS"),
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"), alt.Tooltip("actual_points:Q", title="Scored"),
                 alt.Tooltip("predicted_points:Q", title="Predicted", format=".1f"),
                 alt.Tooltip("minutes:Q", title="Minutes")])
    line = alt.Chart(hist).mark_line(color=ACCENT, strokeWidth=2,
                                     point=alt.OverlayMarkDef(size=45, filled=True, color=ACCENT)).encode(
        x=x, y="predicted_points:Q",
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"), alt.Tooltip("predicted_points:Q", title="Predicted", format=".1f")])
    nxt_point = alt.Chart(future).mark_point(color=ACCENT, size=170, filled=False, strokeWidth=2.5).encode(
        x=x, y="predicted_points:Q",
        tooltip=[alt.Tooltip("gw:O", title="Gameweek"), alt.Tooltip("predicted_points:Q", title="Prediction", format=".1f")])
    show_chart(chart_style(alt.layer(bars, line, nxt_point), 320))
    st.markdown(f'<p class="note"><span class="swatch" style="background:#262626"></span>points scored &nbsp; '
                f'<span class="swatch" style="background:{ACCENT}"></span>prediction made before each deadline. '
                f'The open circle is gameweek {GW}.</p>', unsafe_allow_html=True)
    if row.news:
        st.markdown(f'<p class="note">FPL news: {html.escape(row.news)}</p>', unsafe_allow_html=True)


# ---------------------------------------------------------------- track record
with tab_record:
    st.markdown(f'<h3 class="section">{SEASON_NAME}, gameweeks 1-{PLAYED}</h3>', unsafe_allow_html=True)
    st.markdown('<p class="note" style="margin-top:0">Each gameweek the model and a simple rule (each '
                'player\'s average so far) pick a best XI before the deadline. Lines are the running total of '
                'points those teams scored.</p>', unsafe_allow_html=True)
    cum = weekly.sort_values("gw").assign(total=lambda d: d.groupby("method")["xi_points"].cumsum())
    order = [m for m in ["Model", "Season average"] if m in set(cum.method)]
    color = alt.Color("method:N", scale=alt.Scale(domain=order, range=[METHOD_COLORS[m] for m in order]), legend=None)
    base = alt.Chart(cum).encode(x=alt.X("gw:O", title="GAMEWEEK", axis=alt.Axis(labelAngle=0)),
                                 y=alt.Y("total:Q", title="TOTAL POINTS"), color=color)
    lines = base.mark_line(strokeWidth=2, point=alt.OverlayMarkDef(size=45, filled=True)).encode(
        tooltip=[alt.Tooltip("method:N", title=" "), alt.Tooltip("gw:O", title="Gameweek"),
                 alt.Tooltip("xi_points:Q", title="Points that week"), alt.Tooltip("total:Q", title="Running total")])
    last = cum[cum.gw == cum.gw.max()].assign(tag=lambda d: d.method + "  " + d.total.astype(int).astype(str))
    labels_ = alt.Chart(last).mark_text(align="left", dx=10, fontSize=13).encode(
        x="gw:O", y="total:Q", text="tag:N", color=color)
    show_chart(chart_style(alt.layer(lines, labels_), 340).properties(padding={"right": 170}))

    nice = {"MAE (regular starters)": "Smaller prediction error per regular starter",
            "Best XI: avg points per GW": "More points from the best XI each gameweek",
            "Captain pick: avg points": "More points from the captain pick"}
    rows = "".join(
        f"<tr><td>{nice[r.metric]}</td><td class='n'>{r.model_edge:+.2f}</td>"
        f"<td>{r.ci_low:+.2f} to {r.ci_high:+.2f}</td>"
        f"<td>{'<span class=yes>Yes</span>' if r.significant else '<span class=no>Too early</span>'}</td></tr>"
        for _, r in sig.iterrows())
    st.markdown(f"""<h3 class="section">Is the edge real yet?</h3>
<table class="edge-table"><thead><tr><th>Model vs the simple rule</th><th>Edge per GW</th><th>95% range</th>
<th>Real?</th></tr></thead><tbody>{rows}</tbody></table>
<p class="note">Ranges come from resampling the {PLAYED} gameweeks 4,000 times. With so few weeks only big,
steady gaps count. This early in a season "last 5 gameweeks" and "season average" are the same rule.</p>""",
                unsafe_allow_html=True)


# ---------------------------------------------------------------- method
with tab_method:
    st.markdown(f"""
<div class="body">
<h4>What this is</h4>
A model that predicts each player's FPL points for the next gameweek. It is trained on four full seasons
(2022-23 to 2025-26) and fed every {SEASON_NAME} match up to gameweek {PLAYED}. Before going live it was tested
on all of 2025-26 without seeing it, where its best XI beat the season-average rule by about 260 points.
The full write-up is on <a href="{REPO_URL}">GitHub</a>.

<h4>Inputs</h4>
Recent and season-long points, minutes, starts, expected goals and assists, last season's points per game,
the opponent's attacking and defensive form, fixture difficulty, home or away, and double gameweeks. All of
it is built in SQL from the open FPL archive, using only what was known before each deadline.

<h4>Injuries</h4>
The model can't see team news. When FPL flags a player, his prediction is multiplied by FPL's chance of
playing, so a 25% flag keeps a quarter of it.

<h4>Freshness</h4>
The site reads an open archive of the official FPL data, which can lag the real season. When the next
gameweek has already kicked off, a notice at the top says so.
</div>
""", unsafe_allow_html=True)
