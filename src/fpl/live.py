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


def score_live_season(df: pd.DataFrame, model) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
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
    return results, pd.DataFrame(rows), weekly


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


def main() -> dict:
    df = load_features()
    model = train_on_finished_seasons(df)
    results, sig, weekly = score_live_season(df, model)
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
    return {"results": results, "significance": sig, "weekly": weekly, "predictions": preds}


if __name__ == "__main__":
    main()
