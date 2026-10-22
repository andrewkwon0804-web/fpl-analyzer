"""Step 4: predict next-gameweek FPL points and compare against honest baselines.

Validation is strictly time-based:
    train on 2022-23 + 2023-24  ->  tune on 2024-25  ->  refit on all three  ->  test once on 2025-26
so the model never sees the season it is graded on.
"""
import json
import sqlite3

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error

from fpl.config import DB_PATH, REPORTS_DIR, TEST_SEASON, TRAIN_SEASONS, VALID_SEASON

FEATURES = [
    "position_code", "price", "price_change_season", "selected_by_prev",
    "n_fixtures", "home_fixtures", "fixture_difficulty",
    "opp_attack_xg_l6", "opp_defence_xga_l6", "team_attack_xg_l6",
    "points_l3", "points_l5", "minutes_l3", "minutes_l5", "starts_l5",
    "xg_l5", "xa_l5", "xgc_l5", "bonus_l5", "bps_l5", "ict_l5",
    "points_std", "minutes_std", "xgi_total_std", "gws_so_far",
    "prev_ppg", "prev_minutes",
]
POSITION_CODES = {"GK": 0, "DEF": 1, "MID": 2, "FWD": 3}
TARGET = "target_points"

# Searched on the validation season; kept small on purpose.
PARAM_GRID = [
    {"learning_rate": lr, "max_leaf_nodes": leaves, "min_samples_leaf": 100, "l2_regularization": 1.0}
    for lr in (0.03, 0.06)
    for leaves in (15, 31)
]


def load_features() -> pd.DataFrame:
    with sqlite3.connect(DB_PATH) as con:
        df = pd.read_sql("SELECT * FROM player_features WHERE position <> 'AM'", con)
    df["position_code"] = df["position"].map(POSITION_CODES)
    return df


def make_model(**params) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="squared_error", max_iter=600, early_stopping=True,
        validation_fraction=0.1, n_iter_no_change=30,
        categorical_features=[FEATURES.index("position_code")],
        random_state=42, **params,
    )


def baselines(df: pd.DataFrame) -> dict[str, pd.Series]:
    """Simple rules a sensible FPL manager might use instead of a model."""
    season_avg = df["points_std"].fillna(df["prev_ppg"]).fillna(0)
    return {
        "Form (last 5 GW avg)": df["points_l5"].fillna(season_avg),
        "Season average": season_avg,
        # Kept for reference only: leakage.py shows this column contains
        # information from the gameweek it is supposed to predict.
        "FPL xP column (leaky, reference only)": df["fpl_xp"],
    }


def evaluate(df: pd.DataFrame, pred: pd.Series) -> dict[str, float]:
    """Accuracy on all rows and on regular starters, plus pick quality per gameweek."""
    regulars = df["minutes_l5"].fillna(0) >= 60
    out = {
        "MAE (all players)": mean_absolute_error(df[TARGET], pred),
        "MAE (regular starters)": mean_absolute_error(df.loc[regulars, TARGET], pred[regulars]),
        "RMSE (regular starters)": mean_squared_error(df.loc[regulars, TARGET], pred[regulars]) ** 0.5,
    }
    tmp = df[["gw", TARGET, "minutes_actual"]].assign(pred=pred.values)
    rank_corr, captain, captain_benched, top15 = [], [], [], []
    for _, g in tmp.groupby("gw"):
        if g["pred"].nunique() > 1:  # skip a gameweek where a baseline is constant
            rank_corr.append(spearmanr(g["pred"], g[TARGET]).statistic)
        best = g.nlargest(15, "pred")
        captain.append(best[TARGET].iloc[0])
        captain_benched.append(best["minutes_actual"].iloc[0] == 0)
        top15.append(best[TARGET].mean())
    out["Rank correlation per GW"] = float(np.mean(rank_corr))
    out["Captain pick: avg points"] = float(np.mean(captain))
    out["Captain pick: % didn't play"] = 100 * float(np.mean(captain_benched))
    out["Top-15 picks: avg points"] = float(np.mean(top15))
    return out


def main() -> dict:
    df = load_features()
    train = df[df.season.isin(TRAIN_SEASONS)]
    valid = df[df.season == VALID_SEASON]
    test = df[df.season == TEST_SEASON].reset_index(drop=True)

    # 1. tune on the validation season
    best_params, best_mae = None, np.inf
    for params in PARAM_GRID:
        m = make_model(**params).fit(train[FEATURES], train[TARGET])
        mae = mean_absolute_error(valid[TARGET], m.predict(valid[FEATURES]))
        print(f"[model] {params} -> valid MAE {mae:.4f}")
        if mae < best_mae:
            best_params, best_mae = params, mae
    print(f"[model] best params: {best_params}")

    # 2. refit on everything before the test season, score the test season once
    fit_df = pd.concat([train, valid])
    model = make_model(**best_params).fit(fit_df[FEATURES], fit_df[TARGET])
    test["pred_model"] = model.predict(test[FEATURES])

    candidates = {"Gradient boosting model": test["pred_model"], **baselines(test)}
    oracle = test[TARGET].astype(float)
    results = {name: evaluate(test, pred) for name, pred in candidates.items()}
    results["Perfect hindsight (ceiling)"] = {
        k: v for k, v in evaluate(test, oracle).items() if "pick" in k
    }
    table = pd.DataFrame(results).T
    print("\n[model] test season results\n" + table.round(3).to_string())

    # 3. what drives the model (permutation importance on regular starters)
    regs = test[test["minutes_l5"].fillna(0) >= 60]
    imp = permutation_importance(model, regs[FEATURES], regs[TARGET], n_repeats=5,
                                 random_state=0, scoring="neg_mean_absolute_error")
    importance = (pd.Series(imp.importances_mean, index=FEATURES)
                  .sort_values(ascending=False).rename("mae_increase"))

    # 4. where it is wrong: bias by position (e.g. new 2025-26 defensive scoring rule)
    by_pos = (test.assign(err=test["pred_model"] - test[TARGET])
                  .loc[test["minutes_l5"].fillna(0) >= 60]
                  .groupby("position")
                  .agg(avg_pred=("pred_model", "mean"), avg_actual=(TARGET, "mean"),
                       bias=("err", "mean"), rows=("err", "size")))
    print("\n[model] bias by position (regular starters)\n" + by_pos.round(3).to_string())

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    table.to_csv(REPORTS_DIR / "model_results.csv")
    importance.to_csv(REPORTS_DIR / "feature_importance.csv")
    by_pos.to_csv(REPORTS_DIR / "bias_by_position.csv")
    test[["season", "gw", "player_id", "web_name", "position", "price",
          "fpl_xp", "pred_model", TARGET, "minutes_l5"]].to_csv(
        REPORTS_DIR / "test_predictions.csv", index=False)
    (REPORTS_DIR / "best_params.json").write_text(json.dumps(best_params, indent=2))
    return {"results": table, "importance": importance, "by_pos": by_pos,
            "test": test, "model": model}


if __name__ == "__main__":
    main()
