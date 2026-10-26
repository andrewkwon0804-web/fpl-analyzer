"""Step 8: write the data file for the website in docs/ (served by GitHub Pages).

The site is plain HTML and JavaScript, so everything it shows comes from one JSON file
built here from reports/live/.
"""
import json
import sqlite3

import pandas as pd

from fpl.config import DB_PATH, LIVE_SEASON, RAW_DIR, REPORTS_DIR, ROOT, SQL_DIR
from fpl import site_seo
from fpl.picks import best_xi, xi_points

SITE_DATA = ROOT / "docs" / "data" / "site.json"


def _num(x, nd=2):
    return None if pd.isna(x) else round(float(x), nd)


def last_season_edge() -> int:
    """Held-out 2025-26 test (model.py): extra best-XI points over the season vs the season-average rule."""
    sig = pd.read_csv(REPORTS_DIR / "model_significance.csv")
    row = sig[(sig.baseline == "Season average") & (sig.metric == "Best XI: avg points per GW")].iloc[0]
    return int(round(row.model_edge * 38))


def query(con, name: str, **params) -> pd.DataFrame:
    """Run one of the site's analysis queries in sql/site/."""
    return pd.read_sql((SQL_DIR / "site" / f"{name}.sql").read_text(), con, params={"live": LIVE_SEASON, **params})


def rows(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))


def analysis(next_gw: int) -> dict:
    """The dashboard's four analysis sections, all computed in SQL."""
    with sqlite3.connect(DB_PATH) as con:
        # The fixture grid starts at the first gameweek that hasn't kicked off yet.
        upcoming = con.execute("""SELECT gw FROM fixtures WHERE season = ? AND gw >= ?
                                  GROUP BY gw HAVING MIN(kickoff_time) > ? ORDER BY gw LIMIT 1""",
                               (LIVE_SEASON, next_gw, pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ"))).fetchone()
        grid_gw = upcoming[0] if upcoming else next_gw
        value_live = query(con, "value_live")
        xg_live = query(con, "xg_live").sort_values("diff")
        n_rows = con.execute("SELECT COUNT(*) FROM player_match").fetchone()[0]
        out = {
            "rows": n_rows,
            "value": {
                "tiers": rows(query(con, "value_tiers")),
                "players": rows(value_live),
                "best": rows(value_live[value_live.minutes >= 360]
                             .assign(per_m=lambda d: (d.points / d.price).round(2))
                             .sort_values("per_m", ascending=False).head(10)),
            },
            "xg": {
                "over": rows(xg_live.tail(8).iloc[::-1]),
                "under": rows(xg_live.head(8)),
                "regression": rows(query(con, "xg_regression")),
            },
            "fdr": {
                "points": rows(query(con, "fdr_points")),
                "grid_start": int(grid_gw),
                "grid": rows(query(con, "fixtures_next", gw=int(grid_gw))),
            },
            "crowd": rows(query(con, "crowd")),
        }
    return out


def last_gameweek(played: pd.DataFrame, weekly: pd.DataFrame) -> dict:
    """How the model's picks did in the most recent finished gameweek."""
    gw = int(played.gw.max())
    g = played[played.gw == gw].reset_index(drop=True)
    team = best_xi(g, "predicted_points")
    cap = team.loc[team.is_captain].iloc[0]
    rule = weekly[(weekly.method == "Season average") & (weekly.gw == gw)].xi_points
    out = {
        "gw": gw,
        "model": int(xi_points(g, "predicted_points", "actual_points")),
        "rule": int(rule.iloc[0]) if len(rule) else None,
        "best": int(xi_points(g, "actual_points", "actual_points")),  # best possible XI with hindsight
        "captain": {"name": cap.web_name, "team": cap.team_short, "pred": round(float(cap.predicted_points), 1),
                    "points": int(cap.actual_points)},
        "team": [{"name": r.web_name, "team": r.team_short, "pos": r.position,
                  "pred": round(float(r.predicted_points), 1), "points": int(r.actual_points), "cap": bool(r.is_captain)}
                 for r in team.sort_values("actual_points", ascending=False).itertuples()],
    }
    events = RAW_DIR / LIVE_SEASON / "events.csv"  # written by fetch_official.py
    if events.exists():
        ev = pd.read_csv(events).set_index("id")
        if gw in ev.index:
            out["fpl_average"] = int(ev.loc[gw, "average_entry_score"])
            out["fpl_highest"] = int(ev.loc[gw, "highest_score"])
    return out


def first_kickoffs() -> dict:
    """First kickoff of every gameweek that hasn't finished. FPL's deadline is 90 minutes before it."""
    fx = pd.read_csv(RAW_DIR / LIVE_SEASON / "fixtures.csv")
    fx = fx[fx.event.notna() & fx.kickoff_time.notna() & (fx.finished.astype(str) != "True")]
    first = fx.groupby(fx.event.astype(int)).kickoff_time.min()
    return {str(g): t for g, t in first.items()}


def build() -> dict:
    live = REPORTS_DIR / "live"
    nxt = pd.read_csv(live / "next_gameweek_predictions.csv").reset_index(drop=True)
    played = pd.read_csv(live / "season_so_far_predictions.csv")
    weekly = pd.read_csv(live / "season_so_far_weekly.csv")
    sig = pd.read_csv(live / "season_so_far_significance.csv")
    meta = json.loads((live / "meta.json").read_text())

    horizon = pd.read_csv(live / "horizon_predictions.csv")
    hz = {pid: g.sort_values("gw")[["gw", "predicted_points"]].round(2).values.tolist()
          for pid, g in horizon.groupby("player_id")}
    xi = best_xi(nxt, "predicted_points")
    xi_ids = set(xi.player_id)
    captain_id = int(xi.loc[xi.is_captain, "player_id"].iloc[0])

    players = [{
        "id": int(r.player_id), "name": r.web_name, "team": r.team, "short": r.team_short,
        "pos": r.position, "price": _num(r.price, 1), "pred": _num(r.predicted_points),
        "raw": _num(r.predicted_raw), "chance": None if pd.isna(r.chance_of_playing) else int(r.chance_of_playing),
        "news": r.news if isinstance(r.news, str) else "", "xi": int(r.player_id) in xi_ids,
        # next six gameweeks: [gw, predicted points]; blank gameweeks are missing
        "h": [[int(g), float(v)] for g, v in hz.get(r.player_id, [])],
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
                 "horizon_gws": sorted(int(g) for g in horizon.gw.unique()),
                 "xi_cost": _num(xi.price.sum(), 1), "kickoffs": first_kickoffs()},
        "captain": captain_id,
        "players": players,
        "history": history,
        "weekly": {m: g.sort_values("gw")[["gw", "xi_points"]].values.astype(int).tolist()
                   for m, g in weekly.groupby("method")},
        "edges": edges,
        "last_season_edge": last_season_edge(),
        "analysis": analysis(int(nxt.gw.iloc[0])),
        "last_gw": last_gameweek(played, pd.read_csv(live / "season_so_far_weekly.csv")),
        "model_team": json.loads((live / "model_team.json").read_text()) if (live / "model_team.json").exists() else None,
    }


def main() -> None:
    SITE_DATA.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    SITE_DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"[site] wrote {SITE_DATA.relative_to(ROOT)} ({SITE_DATA.stat().st_size // 1024} KB)")
    site_seo.main(data)


if __name__ == "__main__":
    main()
