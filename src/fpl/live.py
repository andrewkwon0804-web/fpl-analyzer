"""Step 5b: the season in progress.

1. Second out-of-sample test: retrain on every finished season and score the model on
   the live season's played gameweeks (it has never seen any of them).
2. Live picks: predict the next, unplayed gameweek, adjusted for FPL's availability flag.

Run weekly during the season:  python run_pipeline.py   (re-downloads the live season)
"""
import json
import sqlite3

import numpy as np
import pandas as pd

from fpl.config import DB_PATH, FINISHED_SEASONS, LIVE_SEASON, REPORTS_DIR
from fpl.model import (FEATURES, POSITION_CODES, TARGET, baselines, evaluate, load_features,
                       make_model, paired_bootstrap, per_gameweek)


def train_on_finished_seasons(df: pd.DataFrame):
    params = json.loads((REPORTS_DIR / "best_params.json").read_text())
    fit = df[df.season.isin(FINISHED_SEASONS)]
    return make_model(**params).fit(fit[FEATURES], fit[TARGET])


def score_live_season(df: pd.DataFrame, model) -> tuple:
    live = df[df.season == LIVE_SEASON].reset_index(drop=True)
    live["pred_model"] = model.predict(live[FEATURES])
    candidates = {"Gradient boosting model": live["pred_model"], **baselines(live)}
    candidates.pop("FPL xP column (leaky, reference only)")
    # Before anyone has played 5 games, "last 5 gameweeks" and "season so far" are the
    # same average, so report them once instead of as two identical baselines.
    same_rule = np.allclose(candidates["Season average"], candidates["Form (last 5 GW avg)"])
    if same_rule:
        candidates.pop("Form (last 5 GW avg)")
    results = pd.DataFrame({name: evaluate(live, pred) for name, pred in candidates.items()}).T

    model_weekly = per_gameweek(live, live["pred_model"])
    rows, weekly = [], [model_weekly.assign(method="Model")]
    for name, label in [("Season average", "Season average"), ("Form (last 5 GW avg)", "Recent form")]:
        if name not in candidates:
            continue
        base_weekly = per_gameweek(live, candidates[name])
        weekly.append(base_weekly.assign(method=label))
        for metric, (diff, lo, hi) in paired_bootstrap(model_weekly, base_weekly).items():
            rows.append({"baseline": name, "metric": metric, "model_edge": diff,
                         "ci_low": lo, "ci_high": hi, "significant": lo > 0 or hi < 0})
    weekly = pd.concat(weekly).reset_index()[["gw", "method", "xi_points"]]
    return results, pd.DataFrame(rows), weekly, live


def predict_next_gameweek(model) -> pd.DataFrame:
    with sqlite3.connect(DB_PATH) as con:
        up = pd.read_sql("SELECT * FROM player_upcoming", con)
    if up.empty:
        print("[live] no upcoming gameweek (season finished?)")
        return up
    up["position_code"] = up["position"].map(POSITION_CODES)
    up["predicted_raw"] = model.predict(up[FEATURES])
    # The model has never seen injury news. FPL publishes a chance of playing (0-100) for
    # flagged players; scale the prediction by it. No flag means no known concern.
    chance = up["chance_of_playing"].fillna(100) / 100
    up["predicted_points"] = up["predicted_raw"] * chance
    season_avg = up["points_std"].fillna(up["prev_ppg"]).fillna(0)
    up["pred_season_avg"] = season_avg * chance
    up["pred_form"] = up["points_l5"].fillna(season_avg) * chance
    cols = ["season", "gw", "player_id", "web_name", "team", "team_short", "position", "price",
            "predicted_points", "predicted_raw", "pred_season_avg", "pred_form", "chance_of_playing",
            "news", "fixture_difficulty", "n_fixtures", "home_fixtures", "points_l5", "points_std",
            "minutes_l5", "selected_by_prev"]
    return up[cols].sort_values("predicted_points", ascending=False)


def write_meta(out) -> dict:
    """When the data was refreshed, and when the 'next' gameweek kicks off.

    The open archive can lag the real season by a week or more. If the next gameweek's
    first kickoff is already in the past, the picks are stale; the app warns about it.
    """
    with sqlite3.connect(DB_PATH) as con:
        last_played = con.execute("SELECT MAX(gw) FROM player_match WHERE season = ?",
                                  (LIVE_SEASON,)).fetchone()[0]
        nxt = con.execute("""SELECT gw, MIN(kickoff_time) FROM fixtures
                             WHERE season = ? AND finished = 0 AND gw > ?""",
                          (LIVE_SEASON, last_played or 0)).fetchone()
    meta = {"season": LIVE_SEASON, "last_played_gw": last_played, "next_gw": nxt[0],
            "next_gw_first_kickoff": nxt[1],
            "refreshed_at": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    kickoff = pd.Timestamp(meta["next_gw_first_kickoff"]) if meta["next_gw_first_kickoff"] else None
    if kickoff is not None and kickoff < pd.Timestamp.now(tz="UTC"):
        print(f"[live] WARNING: GW{meta['next_gw']} kicked off {kickoff:%d %b}; the archive hasn't "
              f"published its results yet, so these picks are out of date")
    return meta


def main() -> dict:
    df = load_features()
    model = train_on_finished_seasons(df)
    results, sig, weekly, played = score_live_season(df, model)
    n_gw = weekly["gw"].nunique()
    print(f"[live] {LIVE_SEASON}, {n_gw} played gameweeks, model trained on {FINISHED_SEASONS[0]}..{FINISHED_SEASONS[-1]}")
    print(results[["MAE (regular starters)", "Best XI: avg points per GW", "Captain pick: avg points"]].round(2).to_string())
    print(sig.round(2).to_string(index=False))

    preds = predict_next_gameweek(model)
    if not preds.empty:
        print(f"[live] GW{preds['gw'].iloc[0]} top predictions\n"
              + preds.head(10)[["web_name", "team_short", "position", "price", "predicted_points",
                                "chance_of_playing"]].round(2).to_string(index=False))

    out = REPORTS_DIR / "live"
    out.mkdir(parents=True, exist_ok=True)
    results.to_csv(out / "season_so_far_results.csv")
    sig.to_csv(out / "season_so_far_significance.csv", index=False)
    weekly.to_csv(out / "season_so_far_weekly.csv", index=False)
    preds.to_csv(out / "next_gameweek_predictions.csv", index=False)
    write_meta(out)

    # Every played gameweek of the live season, predicted vs actual (for the app's player lookup).
    with sqlite3.connect(DB_PATH) as con:
        teams = pd.read_sql("""SELECT p.player_id, t.name AS team, t.short_name AS team_short
                               FROM players p JOIN teams t ON t.season = p.season AND t.team_id = p.team_id
                               WHERE p.season = ?""", con, params=(LIVE_SEASON,))
    played = played.merge(teams, on="player_id", how="left")
    played[["season", "gw", "player_id", "web_name", "team", "team_short", "position", "price",
            "pred_model", TARGET, "minutes_actual"]].rename(
        columns={"pred_model": "predicted_points", TARGET: "actual_points", "minutes_actual": "minutes"}
    ).to_csv(out / "season_so_far_predictions.csv", index=False)
    return {"results": results, "significance": sig, "weekly": weekly, "predictions": preds}


if __name__ == "__main__":
    main()
