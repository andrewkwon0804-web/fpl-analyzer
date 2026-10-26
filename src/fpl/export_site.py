"""Step 8: write the data file for the website in docs/ (served by GitHub Pages).

The site is plain HTML and JavaScript, so everything it shows comes from one JSON file
built here from reports/live/.
"""
import json

import pandas as pd

from fpl.config import REPORTS_DIR, ROOT
from fpl.picks import best_xi

SITE_DATA = ROOT / "docs" / "data" / "site.json"


def _num(x, nd=2):
    return None if pd.isna(x) else round(float(x), nd)


def last_season_edge() -> int:
    """Held-out 2025-26 test (model.py): extra best-XI points over the season vs the season-average rule."""
    sig = pd.read_csv(REPORTS_DIR / "model_significance.csv")
    row = sig[(sig.baseline == "Season average") & (sig.metric == "Best XI: avg points per GW")].iloc[0]
    return int(round(row.model_edge * 38))


def build() -> dict:
    live = REPORTS_DIR / "live"
    nxt = pd.read_csv(live / "next_gameweek_predictions.csv").reset_index(drop=True)
    played = pd.read_csv(live / "season_so_far_predictions.csv")
    weekly = pd.read_csv(live / "season_so_far_weekly.csv")
    sig = pd.read_csv(live / "season_so_far_significance.csv")
    meta = json.loads((live / "meta.json").read_text())

    xi = best_xi(nxt, "predicted_points")
    xi_ids = set(xi.player_id)
    captain_id = int(xi.loc[xi.is_captain, "player_id"].iloc[0])

    players = [{
        "id": int(r.player_id), "name": r.web_name, "team": r.team, "short": r.team_short,
        "pos": r.position, "price": _num(r.price, 1), "pred": _num(r.predicted_points),
        "raw": _num(r.predicted_raw), "chance": None if pd.isna(r.chance_of_playing) else int(r.chance_of_playing),
        "news": r.news if isinstance(r.news, str) else "", "xi": int(r.player_id) in xi_ids,
    } for r in nxt.itertuples()]

    history = {}
    for r in played.sort_values("gw").itertuples():
        history.setdefault(str(int(r.player_id)), []).append(
            [int(r.gw), _num(r.predicted_points), int(r.actual_points), int(r.minutes)])

    edges = {r.metric: {"edge": _num(r.model_edge), "lo": _num(r.ci_low), "hi": _num(r.ci_high),
                        "sure": bool(r.significant)} for r in sig.itertuples()}
    weekly = weekly[weekly.method.isin(["Model", "Season average"])]
    return {
        "meta": {**meta, "gw": int(nxt.gw.iloc[0]), "played": int(played.gw.max()),
                 "xi_cost": _num(xi.price.sum(), 1)},
        "captain": captain_id,
        "players": players,
        "history": history,
        "weekly": {m: g.sort_values("gw")[["gw", "xi_points"]].values.astype(int).tolist()
                   for m, g in weekly.groupby("method")},
        "edges": edges,
        "last_season_edge": last_season_edge(),
    }


def main() -> None:
    SITE_DATA.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    SITE_DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"[site] wrote {SITE_DATA.relative_to(ROOT)} ({SITE_DATA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
