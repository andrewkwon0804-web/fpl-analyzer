"""Files for search engines and AI crawlers, rewritten with every data refresh.

- sitemap.xml with the date of the latest refresh
- llms.txt: a plain-text summary of the site and this week's top picks
- the site's HTML (docs/index.html, docs/dashboard.html) gets a static copy of its content between
  <!--pre--> and <!--/pre-->, so "view source" and crawlers see text, not an empty <div>.
  React replaces it as soon as the page loads.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
BASE = "https://andrewkwon0804-web.github.io/fpl-analyzer/"
REPO = "https://github.com/andrewkwon0804-web/fpl-analyzer"
PAGES = [("", "1.0"), ("dashboard.html", "0.8")]


def sitemap(data: dict) -> str:
    day = (data["meta"].get("refreshed_at") or "")[:10]
    urls = "".join(
        f"  <url><loc>{BASE}{path}</loc>{f'<lastmod>{day}</lastmod>' if day else ''}<priority>{pri}</priority></url>\n"
        for path, pri in PAGES
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n'


def llms(data: dict) -> str:
    m = data["meta"]
    top = "\n".join(
        f"- {p['name']} ({p['team']}, {p['pos']}, £{p['price']:.1f}m): {p['pred']:.1f} predicted points"
        for p in data["players"][:15]
    )
    xi = ", ".join(p["name"] for p in data["players"] if p["xi"])
    return f"""# FPL Points Lab

> Predicted Fantasy Premier League points for every player, from a gradient boosting model trained on
> four seasons of Premier League match data. Retrained and republished after each gameweek.

Season {m['season']}, predictions for gameweek {m['gw']} (using games through gameweek {m['played']}).
Data source: {m.get('source', 'open FPL archive')}. Last refreshed: {(m.get('refreshed_at') or '')[:10]}.

## Pages

- [Home]({BASE}): this week's best XI, last gameweek's result, track record and findings
- [Dashboard]({BASE}dashboard.html): every player's prediction, player lookup, model team, transfer planner and analysis
- [Raw predictions (JSON)]({BASE}data/site.json): everything the site shows, in one file
- [Source code and method]({REPO}#readme): Python, SQL (SQLite) and scikit-learn pipeline

## This week's best XI

{xi}. Captain: {data['byId_captain']}.

## Top 15 predicted players, gameweek {m['gw']}

{top}

## Method in short

Features are rolling averages of points, minutes, xG and xA plus opponent strength, built in SQL with every
window ending at 1 PRECEDING so no row sees its own match. The model was tuned on 2024-25 and tested on
2025-26, a season left out of training; over that season its best XI scored {data['last_season_edge']} more
points than a team picked by season average. Predictions are multiplied by FPL's chance of playing.
"""


def prerender(data: dict) -> str:
    """Plain HTML version of the React home page."""
    e = html.escape
    m = data["meta"]
    rows = "".join(
        f"<li>{e(p['name'])}, {e(p['team'])} {p['pos']}, £{p['price']:.1f}m: {p['pred']:.1f} points</li>"
        for p in data["players"] if p["xi"]
    )
    top = "".join(f"<li>{e(p['name'])} ({e(p['team'])}): {p['pred']:.1f}</li>" for p in data["players"][:14])
    L = data.get("last_gw")
    last = (f"<h2>Gameweek {L['gw']} result</h2><p>The model's best XI scored {L['model']} points. "
            f"The simple rule's XI scored {L['rule']}. The best possible XI, picked with hindsight, scored {L['best']}.</p>") if L else ""
    return f"""<div class="page" style="padding:120px 24px;max-width:900px;margin:auto;font-family:Inter,sans-serif">
<header><a href="./">FPL Points Lab</a> · <a href="./dashboard.html">Dashboard</a></header>
<main>
<h1>Who to pick for gameweek {m['gw']}.</h1>
<p>A model trained on four seasons of Premier League stats predicts how many FPL points every player will score next week. It retrains after each gameweek.</p>
<h2>Best XI for gameweek {m['gw']}</h2><ul>{rows}</ul>
{last}
<h2>How the predictions are made</h2>
<p>Stats for every player in every Premier League match since 2022-23 go into SQLite. Rolling features are built in SQL,
a gradient boosting model is trained with scikit-learn, and each prediction is multiplied by FPL's chance of playing.</p>
<h2>Track record</h2>
<p>Over 2025-26, a season left out of training, the model's best XI scored {data['last_season_edge']} more points than the season-average rule.</p>
<h2>Top predicted players, gameweek {m['gw']}</h2><ol>{top}</ol>
<p><a href="./dashboard.html">Open the dashboard</a> · <a href="{REPO}">Read the code</a></p>
</main>
</div>"""


def prerender_dash(data: dict) -> str:
    e = html.escape
    m = data["meta"]
    rows = "".join(f"<tr><td>{e(p['name'])}</td><td>{e(p['team'])}</td><td>{p['pos']}</td><td>£{p['price']:.1f}m</td><td>{p['pred']:.2f}</td></tr>"
                   for p in data["players"][:50])
    return f"""<div class="page" style="padding:120px 24px;max-width:900px;margin:auto;font-family:Inter,sans-serif">
<header><a href="./">FPL Points Lab</a> · <a href="./dashboard.html">Dashboard</a></header>
<main><h1>Gameweek {m['gw']}</h1>
<p>Best XI, every player's predicted points, player history, the model's FPL team, a transfer planner and four analyses.</p>
<h2>Top 50 predicted players</h2><table><tr><th>Player</th><th>Team</th><th>Pos</th><th>Price</th><th>Predicted</th></tr>{rows}</table></main></div>"""


def main(data: dict) -> None:
    data = dict(data, byId_captain=next((p["name"] for p in data["players"] if p["id"] == data["captain"]), ""))
    (DOCS / "sitemap.xml").write_text(sitemap(data))
    (DOCS / "llms.txt").write_text(llms(data))
    page = DOCS / "index.html"
    if page.exists():
        text = page.read_text()
        new = re.sub(r"<!--pre-->.*?<!--/pre-->", lambda _: f"<!--pre-->{prerender(data)}<!--/pre-->", text, flags=re.S)
        page.write_text(new)
    dash = DOCS / "dashboard.html"
    if dash.exists():
        text = dash.read_text()
        dash.write_text(re.sub(r"<!--pre-dash-->.*?<!--/pre-dash-->", lambda _: f"<!--pre-dash-->{prerender_dash(data)}<!--/pre-dash-->", text, flags=re.S))
    print("[site] wrote sitemap.xml, llms.txt and the static copy of the React page")


if __name__ == "__main__":
    import json
    main(json.loads((DOCS / "data" / "site.json").read_text()))
