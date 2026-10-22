"""Step 6: write flat CSV extracts for the Tableau Public dashboard (see tableau/README.md)."""
import sqlite3

import pandas as pd

from fpl.config import DB_PATH, REPORTS_DIR, SQL_DIR, TABLEAU_DIR

VIEWS = ["tableau_player_season", "tableau_player_gameweek", "tableau_team_season"]


def main() -> None:
    TABLEAU_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.executescript((SQL_DIR / "tableau_exports.sql").read_text())
        for view in VIEWS:
            df = pd.read_sql(f"SELECT * FROM {view}", con)
            name = view.removeprefix("tableau_")
            df.to_csv(TABLEAU_DIR / f"{name}.csv", index=False)
            print(f"[tableau] {name}.csv  {len(df):>6} rows")

    preds = pd.read_csv(REPORTS_DIR / "test_predictions.csv")
    with sqlite3.connect(DB_PATH) as con:
        context = pd.read_sql("""
            SELECT f.season, f.player_id, f.gw, t.name AS team, f.minutes_actual,
                   f.points_l5, f.points_std, f.prev_ppg
            FROM player_features f
            JOIN players p ON p.season = f.season AND p.player_id = f.player_id
            JOIN teams   t ON t.season = p.season AND t.team_id = p.team_id""", con)
    preds = preds.merge(context, on=["season", "player_id", "gw"], how="left", validate="one_to_one")

    # Same baseline rules as model.baselines(), so the app and dashboards can compare them.
    season_avg = preds["points_std"].fillna(preds["prev_ppg"]).fillna(0)
    preds["pred_season_avg"] = season_avg.round(2)
    preds["pred_form"] = preds["points_l5"].fillna(season_avg).round(2)

    preds = preds.rename(columns={"pred_model": "predicted_points", "target_points": "actual_points",
                                  "web_name": "player", "minutes_actual": "minutes"})
    preds["predicted_points"] = preds["predicted_points"].round(2)
    preds["error"] = (preds["predicted_points"] - preds["actual_points"]).round(2)
    preds["regular_starter"] = preds["minutes_l5"].fillna(0) >= 60
    preds.drop(columns=["minutes_l5", "fpl_xp", "points_l5", "points_std", "prev_ppg"]).to_csv(
        TABLEAU_DIR / "model_predictions_2025_26.csv", index=False)
    print(f"[tableau] model_predictions_2025_26.csv  {len(preds):>6} rows")


if __name__ == "__main__":
    main()
