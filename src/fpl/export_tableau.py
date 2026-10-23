"""Step 6: write flat CSV extracts for the Tableau Public dashboard (see tableau/README.md)."""
import sqlite3

import pandas as pd

from fpl.config import DB_PATH, REPORTS_DIR, SQL_DIR, TABLEAU_DIR
from fpl.picks import xi_points

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
    # predictions keep full precision: rounding creates ties that change which XI gets picked
    preds["error"] = (preds["predicted_points"] - preds["actual_points"]).round(3)
    preds["regular_starter"] = preds["minutes_l5"].fillna(0) >= 60
    preds.drop(columns=["minutes_l5", "fpl_xp", "points_l5", "points_std", "prev_ppg"]).to_csv(
        TABLEAU_DIR / "model_predictions_2025_26.csv", index=False)
    print(f"[tableau] model_predictions_2025_26.csv  {len(preds):>6} rows")

    # Season race: points each method's best XI scored every gameweek (captain doubled).
    methods = {"Model": "predicted_points", "Season average": "pred_season_avg", "Recent form": "pred_form"}
    rows = []
    for gw, g in preds.groupby("gw"):
        for name, col in methods.items():
            rows.append({"gw": gw, "method": name, "xi_points": xi_points(g, col, "actual_points")})
    weekly = pd.DataFrame(rows)
    weekly["cumulative_points"] = weekly.groupby("method")["xi_points"].cumsum()
    weekly.to_csv(TABLEAU_DIR / "weekly_xi_points.csv", index=False)
    print(f"[tableau] weekly_xi_points.csv  {len(weekly):>6} rows")

    # Model edge over each baseline with bootstrap intervals, in plain-language labels.
    sig = pd.read_csv(REPORTS_DIR / "model_significance.csv")
    sig["baseline"] = sig["baseline"].replace({"Form (last 5 GW avg)": "Recent form"})
    sig["metric"] = sig["metric"].replace({
        "MAE (regular starters)": "Lower prediction error",
        "Best XI: avg points per GW": "Best XI points per GW",
        "Captain pick: avg points": "Captain points per GW"})
    sig["verdict"] = sig["significant"].map({True: "Real edge", False: "Too close to call"})
    # Two plain label columns (Tableau stacks them as two lines of text in a cell).
    pts = sig["metric"] != "Lower prediction error"
    sig["edge_label"] = [f"{e:+.1f} pts" if p else f"{e:.2f} lower" for e, p in zip(sig["model_edge"], pts)]
    sig["range_label"] = [f"95% range {lo:+.1f} to {hi:+.1f}" if p else f"95% range {lo:.2f} to {hi:.2f}"
                          for lo, hi, p in zip(sig["ci_low"], sig["ci_high"], pts)]
    sig.round(3).to_csv(TABLEAU_DIR / "model_edges.csv", index=False)
    pd.read_csv(REPORTS_DIR / "bias_by_position.csv").round(3).to_csv(
        TABLEAU_DIR / "model_bias_by_position.csv", index=False)
    print("[tableau] model_edges.csv, model_bias_by_position.csv")


if __name__ == "__main__":
    main()
