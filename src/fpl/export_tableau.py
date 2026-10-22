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
    preds = preds.rename(columns={"pred_model": "predicted_points", "target_points": "actual_points",
                                  "web_name": "player"})
    preds["predicted_points"] = preds["predicted_points"].round(2)
    preds["error"] = (preds["predicted_points"] - preds["actual_points"]).round(2)
    preds["regular_starter"] = preds["minutes_l5"].fillna(0) >= 60
    preds.drop(columns=["player_id", "minutes_l5", "fpl_xp"]).to_csv(
        TABLEAU_DIR / "model_predictions_2025_26.csv", index=False)
    print(f"[tableau] model_predictions_2025_26.csv  {len(preds):>6} rows")


if __name__ == "__main__":
    main()
