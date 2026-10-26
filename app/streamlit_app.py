"""FPL Points Lab web app: a scrolling home page plus a dashboard.

Run locally:  streamlit run app/streamlit_app.py
The app only reads the files run_pipeline.py writes to reports/live/, so it starts
instantly. Re-run the pipeline after each gameweek and push to refresh the deployed app.
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

BG, PANEL, PANEL_2 = "#050505", "#0c0c0c", "#121212"
LINE, LINE_2 = "#1f1f1f", "#2c2c2c"
TEXT, TEXT_2, TEXT_3 = "#ededed", "#a3a3a3", "#6b6b6b"
ACCENT, ACCENT_2 = "#5ef0b0", "#6aa8ff"
BASELINE = "#7c7c7c"
WARN = "#f5c451"
METHOD_COLORS = {"Model": ACCENT, "Season average": BASELINE}
FORMATION_ROWS = ["FWD", "MID", "DEF", "GK"]  # attack at the top of the board

st.set_page_config(page_title="FPL Points Lab", page_icon="⚽", layout="wide")


# ---------------------------------------------------------------- styles
CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
html, body, [data-testid="stAppViewContainer"], [data-testid="stMarkdownContainer"], button, input, label {{
  font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif;
}}
[data-testid="stAppViewContainer"] {{ background: {BG}; }}
[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding-top: 1.2rem; max-width: 1200px; }}
a {{ text-decoration: none !important; }}

.topbar {{ display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 8px 8px 8px 16px;
  font-family: 'Geist Mono', monospace; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; }}
.topbar .brand {{ color: {TEXT} !important; display: flex; align-items: center; gap: 10px; }}
.topbar nav {{ display: flex; gap: 22px; }}
.topbar nav a {{ color: {TEXT_3} !important; }}
.topbar nav a.on, .topbar nav a:hover {{ color: {TEXT} !important; }}
.topbar .right {{ display: flex; gap: 8px; }}
.brand-mark {{ width: 18px; height: 18px; border: 1.5px solid {ACCENT}; border-radius: 4px;
  box-shadow: 0 0 10px {ACCENT}66; position: relative; }}
.brand-mark::after {{ content: ""; position: absolute; left: 50%; top: 2px; bottom: 2px; border-left: 1.5px solid {ACCENT}; }}
.btn {{ display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 6px;
  font-family: 'Geist Mono', monospace; font-size: .76rem; letter-spacing: .08em; text-transform: uppercase;
  border: 1px solid {LINE_2}; color: {TEXT} !important; background: {PANEL_2}; white-space: nowrap; }}
.btn.primary {{ background: {TEXT}; color: #000 !important; border-color: {TEXT}; font-weight: 500; }}
.btn.primary:hover {{ background: {ACCENT}; border-color: {ACCENT}; }}
@media (max-width: 820px) {{ .topbar nav, .topbar .gh {{ display: none; }} }}

.tag {{ display: inline-block; font-family: 'Geist Mono', monospace; font-size: .68rem; letter-spacing: .12em;
  text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: #d9d9d9; color: #0a0a0a; font-weight: 500; }}
.tag.dark {{ background: {PANEL_2}; color: {TEXT_2}; border: 1px solid {LINE_2}; }}
.tag.warn {{ background: {WARN}; color: #111; white-space: nowrap; }}

/* home sections */
.hero {{ display: grid; grid-template-columns: 1.15fr 1fr; gap: 40px; align-items: center; min-height: min(72vh, 760px); padding: 40px 0; }}
.hero h1 {{ font-weight: 400; font-size: 4.2rem; line-height: 1.02; letter-spacing: -0.035em; color: {TEXT}; margin: 0 0 20px; padding: 0; }}
.hero p {{ color: {TEXT_2}; font-size: 1.08rem; line-height: 1.6; max-width: 44ch; margin: 0 0 28px; }}
.actions {{ display: flex; gap: 10px; flex-wrap: wrap; }}
.cap-card {{ position: relative; border: 1px solid {LINE_2}; border-radius: 18px; background: {PANEL};
  aspect-ratio: 1.15 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }}
.cap-card::before {{ content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, {ACCENT}1f, transparent 60%); }}
.cap-card > * {{ position: relative; }}
.cap-card .big {{ font-weight: 300; font-size: 7.5rem; line-height: 1; letter-spacing: -0.05em; margin-top: 18px;
  color: transparent; background: linear-gradient(180deg, {ACCENT}, {ACCENT_2}); -webkit-background-clip: text;
  background-clip: text; filter: drop-shadow(0 0 22px {ACCENT}55); }}
.cap-card .who {{ margin-top: 14px; font-size: 1.35rem; color: {TEXT}; }}
.cap-card .sub {{ margin-top: 6px; font-family: 'Geist Mono', monospace; font-size: .72rem; color: {TEXT_3};
  letter-spacing: .12em; text-transform: uppercase; }}

.section {{ border-top: 1px solid {LINE}; padding: 72px 0 24px; }}
.eyebrow {{ font-family: 'Geist Mono', monospace; font-size: .74rem; letter-spacing: .14em; text-transform: uppercase;
  color: {ACCENT}; margin-bottom: 14px; }}
.section h2 {{ font-weight: 400; font-size: 2.7rem; line-height: 1.08; letter-spacing: -0.03em; color: {TEXT};
  margin: 0 0 14px; padding: 0; max-width: 28ch; }}
.section .lede {{ color: {TEXT_2}; font-size: 1.05rem; line-height: 1.6; max-width: 60ch; margin: 0 0 30px; }}
.section .lede b {{ color: {TEXT}; font-weight: 500; }}

.top5 {{ border: 1px solid {LINE}; border-radius: 12px; background: {PANEL}; }}
.top5 .r {{ display: grid; grid-template-columns: 34px 1fr 70px 70px; align-items: center; gap: 12px;
  padding: 14px 18px; border-top: 1px solid {LINE}; }}
.top5 .r:first-child {{ border-top: 0; }}
.top5 .rank {{ font-family: 'Geist Mono', monospace; color: {TEXT_3}; font-size: .8rem; }}
.top5 .nm {{ color: {TEXT}; font-size: 1.05rem; }}
.top5 .nm small {{ display: block; color: {TEXT_3}; font-family: 'Geist Mono', monospace; font-size: .7rem;
  letter-spacing: .08em; margin-top: 2px; }}
.top5 .num {{ text-align: right; font-size: 1.25rem; color: {TEXT}; }}
.top5 .num.accent {{ color: {ACCENT}; }}
.top5 .num small {{ display: block; font-family: 'Geist Mono', monospace; font-size: .6rem; color: {TEXT_3};
  letter-spacing: .1em; text-transform: uppercase; }}

.stats {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 26px 0 10px; }}
.stat {{ border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 18px 18px 20px; }}
.stat .head {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 8px; }}
.stat .head .title {{ color: {TEXT}; font-size: .95rem; }}
.stat .val {{ font-size: 2.5rem; letter-spacing: -0.03em; color: {TEXT}; line-height: 1; }}
.stat .val.accent {{ color: {ACCENT}; text-shadow: 0 0 18px {ACCENT}40; }}
.stat p {{ margin: 10px 0 0; color: {TEXT_3}; font-family: 'Geist Mono', monospace; font-size: .76rem; line-height: 1.6; }}

.steps {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }}
.step {{ border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 20px; }}
.step .n {{ font-family: 'Geist Mono', monospace; color: {ACCENT}; font-size: .8rem; }}
.step h4 {{ color: {TEXT}; font-weight: 400; font-size: 1.2rem; margin: 26px 0 8px; padding: 0; }}
.step p {{ color: {TEXT_3}; font-size: .92rem; line-height: 1.6; margin: 0; }}

.cta {{ text-align: center; padding: 90px 0 70px; border-top: 1px solid {LINE}; margin-top: 40px; }}
.cta h2 {{ font-weight: 400; font-size: 3rem; letter-spacing: -0.03em; color: {TEXT}; margin: 0 0 26px; padding: 0; }}
.cta .actions {{ justify-content: center; }}
.footer {{ display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-top: 1px solid {LINE};
  padding: 22px 0 8px; font-family: 'Geist Mono', monospace; font-size: .72rem; letter-spacing: .06em; color: {TEXT_3}; }}
.footer a {{ color: {TEXT_2} !important; }}

.status {{ display: flex; gap: 14px; align-items: flex-start; border: 1px solid #3a3320; background: #12100a;
  border-radius: 10px; padding: 13px 16px; margin: 18px 0 0; color: #d9cfae; font-size: .94rem; line-height: 1.5; }}

@media (max-width: 820px) {{
  .hero {{ grid-template-columns: 1fr; min-height: 0; gap: 28px; padding-top: 28px; }}
  .hero h1 {{ font-size: 2.8rem; }}
  .cap-card .big {{ font-size: 5.5rem; }}
  .section {{ padding-top: 52px; }}
  .section h2, .cta h2 {{ font-size: 2rem; }}
  .stats, .steps {{ grid-template-columns: 1fr; }}
  .top5 .r {{ grid-template-columns: 26px 1fr 56px 56px; padding: 12px; gap: 8px; }}
}}

/* dashboard */
.dash-head {{ display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin: 34px 0 8px; }}
.dash-head h1 {{ font-weight: 400; font-size: 2.6rem; letter-spacing: -0.03em; color: {TEXT}; margin: 0; padding: 0; }}
.dash-head .meta {{ font-family: 'Geist Mono', monospace; font-size: .74rem; color: {TEXT_3}; letter-spacing: .06em; }}
.stTabs [data-baseweb="tab-list"] {{ gap: 6px; border-bottom: 1px solid {LINE}; }}
.stTabs [data-baseweb="tab"] {{ color: {TEXT_3}; padding: 10px 12px; }}
.stTabs [data-baseweb="tab"] p {{ font-family: 'Geist Mono', monospace; font-size: .76rem; text-transform: uppercase; letter-spacing: .08em; }}
.stTabs [aria-selected="true"], .stTabs [aria-selected="true"] p {{ color: {TEXT} !important; }}
.stTabs [data-baseweb="tab-highlight"] {{ background: {ACCENT}; box-shadow: 0 0 10px {ACCENT}; }}
h3.sub {{ font-weight: 400; font-size: 1.6rem; letter-spacing: -0.02em; color: {TEXT}; margin: 26px 0 12px; padding: 0; }}
.note {{ color: {TEXT_3}; font-family: 'Geist Mono', monospace; font-size: .76rem; line-height: 1.65; margin-top: .7rem; }}

.board {{ position: relative; border: 1px solid {LINE_2}; border-radius: 16px; padding: 22px 12px 16px;
  background: linear-gradient(180deg, #0a0d0b, #070707); overflow: hidden; }}
.board::before {{ content: ""; position: absolute; left: 50%; top: -70px; width: 190px; height: 140px;
  transform: translateX(-50%); border: 1px solid {ACCENT}55; border-radius: 0 0 50% 50%; box-shadow: 0 0 18px {ACCENT}22; }}
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
.chip .pts small {{ display: block; font-family: 'Geist Mono', monospace; font-size: .58rem; letter-spacing: .08em; color: {TEXT_3}; text-transform: uppercase; }}
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
.panel {{ border: 1px solid {LINE}; background: {PANEL}; border-radius: 10px; padding: 16px; margin-bottom: 6px; }}
.panel .head {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px; color: {TEXT}; }}
.row {{ display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 0; border-top: 1px solid {LINE}; }}
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
</style>
"""


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
st.markdown(CSS, unsafe_allow_html=True)
if data is None or data[0].empty:
    st.info("No upcoming gameweek yet. Run the pipeline during the season to get predictions.")
    st.stop()

nxt, played, weekly, sig, meta = data
nxt = nxt.reset_index(drop=True)
GW = int(nxt["gw"].iloc[0])
SEASON_NAME = nxt["season"].iloc[0]
PLAYED = int(played["gw"].max())
team = best_xi(nxt, "predicted_points")
captain = team.loc[team["is_captain"]].iloc[0]
totals = weekly.groupby("method")["xi_points"].sum()

kickoff = pd.Timestamp(meta["next_gw_first_kickoff"]) if meta.get("next_gw_first_kickoff") else None
STALE = kickoff is not None and kickoff < pd.Timestamp.now(tz="UTC")
refreshed = pd.Timestamp(meta["refreshed_at"]) if meta.get("refreshed_at") else None
SOURCE = meta.get("source", "open FPL archive")


def edge(metric: str) -> pd.Series:
    return sig[sig.metric == metric].iloc[0]


def show_chart(chart) -> None:
    """Draw an Altair chart full-width on both older and newer Streamlit versions."""
    try:
        st.altair_chart(chart, width="stretch", theme=None)
    except TypeError:
        st.altair_chart(chart, use_container_width=True, theme=None)


def chart_style(chart, height: int = 320):
    return (chart.properties(height=height, background=BG)
            .configure_view(stroke=None)
            .configure_axis(labelFont="Geist Mono", titleFont="Geist Mono", labelColor=TEXT_3, titleColor=TEXT_3,
                            gridColor="#161616", domainColor=LINE_2, tickColor=LINE_2, labelFontSize=11,
                            titleFontSize=11, titleFontWeight=400)
            .configure_text(font="Geist"))


def topbar(active: str) -> None:
    def on(name: str) -> str:
        return ' class="on"' if name == active else ""
    st.markdown(f"""
<div class="topbar">
  <a class="brand" href="/" target="_self"><span class="brand-mark"></span>FPL Points Lab</a>
  <nav><a href="/" target="_self"{on("home")}>Home</a>
       <a href="/dashboard" target="_self"{on("dashboard")}>Dashboard</a>
       <a href="{REPO_URL}" target="_blank">Code</a></nav>
  <span class="right"><a class="btn gh" href="{REPO_URL}" target="_blank">GitHub</a>
    <a class="btn primary" href="/dashboard" target="_self">Dashboard &nbsp;›</a></span>
</div>""", unsafe_allow_html=True)


def stale_notice() -> str:
    if not STALE:
        return ""
    return (f'<div class="status"><span class="tag warn">Heads up</span><span>Gameweek {GW} started on '
            f'{kickoff:%d %B}, and these picks only use games through gameweek {PLAYED}. They\'ll catch up '
            f'on the next data refresh.</span></div>')


def track_chart(height: int):
    cum = weekly.sort_values("gw").assign(total=lambda d: d.groupby("method")["xi_points"].cumsum())
    order = [m for m in ["Model", "Season average"] if m in set(cum.method)]
    color = alt.Color("method:N", scale=alt.Scale(domain=order, range=[METHOD_COLORS[m] for m in order]), legend=None)
    base = alt.Chart(cum).encode(x=alt.X("gw:O", title="GAMEWEEK", axis=alt.Axis(labelAngle=0)),
                                 y=alt.Y("total:Q", title="TOTAL POINTS"), color=color)
    lines = base.mark_line(strokeWidth=2, point=alt.OverlayMarkDef(size=45, filled=True)).encode(
        tooltip=[alt.Tooltip("method:N", title=" "), alt.Tooltip("gw:O", title="Gameweek"),
                 alt.Tooltip("xi_points:Q", title="Points that week"), alt.Tooltip("total:Q", title="Running total")])
    last = cum[cum.gw == cum.gw.max()].assign(
        tag=lambda d: d.method.replace({"Season average": "Simple rule"}) + "  " + d.total.astype(int).astype(str))
    labels = alt.Chart(last).mark_text(align="left", dx=10, fontSize=13).encode(
        x="gw:O", y="total:Q", text="tag:N", color=color)
    return chart_style(alt.layer(lines, labels), height).properties(padding={"right": 130})


# ---------------------------------------------------------------- home page
def home() -> None:
    topbar("home")
    xi_edge = edge("Best XI: avg points per GW")
    model_total, rule_total = int(totals.get("Model", 0)), int(totals.get("Season average", 0))

    st.markdown(f"""
<div class="hero">
  <div>
    <h1>Who to pick for<br>gameweek {GW}.</h1>
    <p>I trained a model on four seasons of Premier League stats to guess how many FPL points every
    player will score next week. It reruns after each gameweek.</p>
    <div class="actions">
      <a class="btn primary" href="/dashboard" target="_self">Open the dashboard &nbsp;›</a>
      <a class="btn" href="{REPO_URL}" target="_blank">See the code</a>
    </div>
    {stale_notice()}
  </div>
  <div class="cap-card">
    <span class="tag">Captain pick</span>
    <div class="big">{captain.predicted_points:.1f}</div>
    <div class="who">{html.escape(captain.web_name)}</div>
    <div class="sub">{html.escape(captain.team)} &nbsp;/&nbsp; points predicted</div>
  </div>
</div>
""", unsafe_allow_html=True)

    rows = "".join(
        f'<div class="r"><span class="rank">0{i}</span>'
        f'<span class="nm">{html.escape(r.web_name)}<small>{html.escape(r.team_short)} · {r.position}</small></span>'
        f'<span class="num accent">{r.predicted_points:.1f}<small>pts</small></span>'
        f'<span class="num">{r.price:.1f}<small>£m</small></span></div>'
        for i, (_, r) in enumerate(nxt.head(5).iterrows(), start=1))
    st.markdown(f"""
<div class="section">
  <div class="eyebrow">01 / This week</div>
  <h2>The top five for gameweek {GW}</h2>
  <p class="lede">Ranked by predicted points. The full best XI, every other player and the injury list
  are on the <a href="/dashboard" target="_self" style="color:{ACCENT}">dashboard</a>.</p>
  <div class="top5">{rows}</div>
</div>
""", unsafe_allow_html=True)

    st.markdown(f"""
<div class="section">
  <div class="eyebrow">02 / Track record</div>
  <h2>Is it better than just picking in-form players?</h2>
  <p class="lede">Before every deadline this season I let the model pick a team, and I let a simple rule
  pick one too: the eleven players with the best average so far. Through gameweek {PLAYED} the model's
  team has <b>{model_total}</b> points and the simple rule's has <b>{rule_total}</b>.</p>
</div>
""", unsafe_allow_html=True)
    show_chart(track_chart(320))
    st.markdown(f"""
<div class="stats">
  <div class="stat"><div class="head"><span class="title">Last season</span><span class="tag">Never seen in training</span></div>
    <div class="val accent">+260</div>
    <p>points over the whole 2025-26 season for the model's team compared with the simple rule.</p></div>
  <div class="stat"><div class="head"><span class="title">This season</span><span class="tag dark">Too early to say</span></div>
    <div class="val">{xi_edge.model_edge:+.0f}</div>
    <p>points a week so far. With {PLAYED} weeks of data the real gap could be anywhere from
    {xi_edge.ci_low:+.0f} to {xi_edge.ci_high:+.0f}.</p></div>
  <div class="stat"><div class="head"><span class="title">Per player</span><span class="tag">Clear win</span></div>
    <div class="val">{edge("MAE (regular starters)").model_edge:.2f}</div>
    <p>points closer to what each regular starter actually scores, on average.</p></div>
</div>
""", unsafe_allow_html=True)

    live_from = ("This season comes from the official FPL API, older seasons from"
                 if SOURCE == "official FPL API" else "All of it comes from")
    st.markdown(f"""
<div class="section">
  <div class="eyebrow">03 / How it works</div>
  <h2>From raw stats to a pick</h2>
  <p class="lede">Python and SQL from start to finish. The write-up on GitHub has the details and the
  mistakes I fixed along the way.</p>
  <div class="steps">
    <div class="step"><span class="n">01</span><h4>Data</h4><p>Every player's stats for every match since
      2022-23. {live_from} Vaastav Anand's open archive.</p></div>
    <div class="step"><span class="n">02</span><h4>SQL</h4><p>Rolling averages of points, minutes, xG and xA,
      plus how good the opponent is. Each row only uses games played before that week's deadline.</p></div>
    <div class="step"><span class="n">03</span><h4>Model</h4><p>A gradient boosting model from scikit-learn.
      I tested it on 2025-26 with that season held out, then retrained it on all four seasons.</p></div>
    <div class="step"><span class="n">04</span><h4>Injuries</h4><p>The model can't read team news, so if FPL
      gives a player a 25% chance of playing, his prediction gets cut to a quarter.</p></div>
  </div>
</div>
""", unsafe_allow_html=True)

    updated = f" · updated {refreshed:%d %b %Y}" if refreshed is not None else ""
    st.markdown(f"""
<div class="cta">
  <h2>Gameweek {GW} picks are up.</h2>
  <div class="actions"><a class="btn primary" href="/dashboard" target="_self">Open the dashboard &nbsp;›</a></div>
</div>
<div class="footer"><span>Made by Andrew Kwon</span>
  <span>Data: {html.escape(SOURCE)}{updated}</span>
  <a href="{REPO_URL}" target="_blank">github.com/andrewkwon0804-web/fpl-analyzer</a></div>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------- dashboard page
def chip(r: pd.Series) -> str:
    cap = '<div class="c">C</div>' if r.is_captain else ""
    flag = ' <span class="flag">⚠</span>' if pd.notna(r.chance_of_playing) and r.chance_of_playing < 100 else ""
    cls = "chip captain" if r.is_captain else "chip"
    return (f'<div class="{cls}">{cap}<div class="name" title="{html.escape(r.web_name)}">'
            f'{html.escape(r.web_name)}{flag}</div><div class="team">{html.escape(r.team_short)}</div>'
            f'<div class="pts"><div><span class="n accent">{r.predicted_points:.1f}</span><small>pts</small></div>'
            f'<div><span class="n">{r.price:.1f}</span><small>£m</small></div></div></div>')


def dashboard() -> None:
    topbar("dashboard")
    updated = f" · updated {refreshed:%d %b}" if refreshed is not None else ""
    st.markdown(f"""<div class="dash-head"><h1>Gameweek {GW}</h1>
<span class="meta">{SEASON_NAME} · games through GW{PLAYED}{updated}</span></div>{stale_notice()}""",
                unsafe_allow_html=True)
    t_xi, t_all, t_player, t_record = st.tabs(["Best XI", "All players", "Player lookup", "Track record"])

    with t_xi:
        left, right = st.columns([1.75, 1], gap="large")
        with left:
            lines = []
            for pos in FORMATION_ROWS:
                players = team[team.position == pos].sort_values("predicted_points", ascending=False)
                lines.append('<div class="line">' + "".join(chip(r) for _, r in players.iterrows()) + "</div>")
            st.markdown('<h3 class="sub">Highest-scoring team</h3><div class="board"><div class="mid"></div>'
                        + "".join(lines) + "</div>", unsafe_allow_html=True)
            st.markdown(f'<p class="note">Predicted points, then price. Budget ignored: this team would cost '
                        f'£{team.price.sum():.1f}m. ⚠ means FPL has flagged the player.</p>', unsafe_allow_html=True)
        with right:
            flagged = (nxt[(nxt.chance_of_playing.fillna(100) < 75) & (nxt.predicted_raw >= 2)]
                       .sort_values("predicted_raw", ascending=False).head(6))
            rows = "".join(
                f'<div class="row"><span class="l">{html.escape(r.web_name)} ({int(r.chance_of_playing)}%)'
                f'<small>{html.escape(r.news)}</small></span><span class="r">{r.predicted_raw:.1f}</span></div>'
                for _, r in flagged.iterrows()) or '<p class="note">No big names flagged this week.</p>'
            st.markdown(f'<h3 class="sub">Injury list</h3><div class="panel"><div class="head">'
                        f'<span>Would have scored</span><span class="tag dark">FPL flags</span></div>{rows}</div>'
                        f'<p class="note">What these players were predicted before the injury cut.</p>',
                        unsafe_allow_html=True)

    with t_all:
        f1, f2 = st.columns([1.2, 1])
        with f1:
            pos_pick = st.radio("Position", ["All", "GK", "DEF", "MID", "FWD"], horizontal=True, key="live_pos")
        with f2:
            max_price = st.slider("Max price (£m)", 4.0, float(nxt.price.max()), float(nxt.price.max()), 0.5)
        view = nxt[(nxt.price <= max_price) & ((nxt.position == pos_pick) | (pos_pick == "All"))]
        view = view.assign(chance=view.chance_of_playing.map(lambda c: "" if pd.isna(c) else f"{int(c)}%"))
        st.dataframe(
            view[["web_name", "team", "position", "price", "predicted_points", "chance", "news"]]
            .rename(columns={"web_name": "Player", "team": "Team", "position": "Pos", "price": "Price £m",
                             "predicted_points": "Predicted", "chance": "Chance of playing", "news": "FPL news"}),
            hide_index=True, width="stretch", height=560,
            column_config={"Predicted": st.column_config.NumberColumn(format="%.2f"),
                           "Price £m": st.column_config.NumberColumn(format="%.1f")})

    with t_player:
        labels = nxt.assign(label=nxt.web_name + " (" + nxt.team_short + ")")
        who = st.selectbox("Player", labels["label"].tolist(), index=0)
        row = labels[labels.label == who].iloc[0]
        hist = played[played.player_id == row.player_id].sort_values("gw")
        miss = f"{(hist.predicted_points - hist.actual_points).abs().mean():.1f}" if len(hist) else "n/a"
        st.markdown(f"""
<div class="stats" style="margin:14px 0 22px">
  <div class="stat"><div class="head"><span class="title">Gameweek {GW}</span><span class="tag">Predicted</span></div>
    <div class="val accent">{row.predicted_points:.1f}</div></div>
  <div class="stat"><div class="head"><span class="title">GW1-{PLAYED}</span><span class="tag dark">Scored</span></div>
    <div class="val">{int(hist.actual_points.sum()) if len(hist) else 0}</div></div>
  <div class="stat"><div class="head"><span class="title">Usually off by</span><span class="tag dark">Per week</span></div>
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
        st.markdown(f'<p class="note"><span class="swatch" style="background:#262626"></span>scored &nbsp; '
                    f'<span class="swatch" style="background:{ACCENT}"></span>predicted before the deadline. '
                    f'Open circle: gameweek {GW}.</p>', unsafe_allow_html=True)
        if row.news:
            st.markdown(f'<p class="note">FPL news: {html.escape(row.news)}</p>', unsafe_allow_html=True)

    with t_record:
        st.markdown(f'<h3 class="sub">Model vs the simple rule, GW1-{PLAYED}</h3>', unsafe_allow_html=True)
        show_chart(track_chart(340))
        nice = {"MAE (regular starters)": "Closer to each starter's real score",
                "Best XI: avg points per GW": "More points from the best XI",
                "Captain pick: avg points": "More points from the captain"}
        rows = "".join(
            f"<tr><td>{nice[r.metric]}</td><td class='n'>{r.model_edge:+.2f}</td>"
            f"<td>{r.ci_low:+.2f} to {r.ci_high:+.2f}</td>"
            f"<td>{'<span class=yes>Yes</span>' if r.significant else '<span class=no>Not yet</span>'}</td></tr>"
            for _, r in sig.iterrows())
        st.markdown(f"""<h3 class="sub">Is the gap real yet?</h3>
<table class="edge-table"><thead><tr><th>Model vs simple rule</th><th>Per week</th><th>Likely range</th>
<th>Sure?</th></tr></thead><tbody>{rows}</tbody></table>
<p class="note">The range comes from resampling the {PLAYED} weeks 4,000 times. It only says yes when the
whole range is above zero.</p>""", unsafe_allow_html=True)


pg = st.navigation([st.Page(home, title="FPL Points Lab", default=True),
                    st.Page(dashboard, title="Dashboard · FPL Points Lab", url_path="dashboard")],
                   position="hidden")
pg.run()
