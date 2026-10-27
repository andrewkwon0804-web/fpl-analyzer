"""Step 9: the model report page's data, and a small database for its SQL lab.

Writes
  docs/data/research.json   every chart on research.html, computed from the 2025-26 test season
                            (a season the model never saw) and the reports/ outputs
  docs/data/fpl-lite.db.gz  a trimmed copy of the SQLite database that the page loads into the
                            browser (sql.js), so visitors can run the project's own SQL

Nothing here retrains the model: it reads reports/test_predictions.csv, which model.py wrote
when it scored the test season, and rebuilds the simple baselines from the same features.
"""
import gzip
import json
import shutil
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fpl.config import DB_PATH, REPORTS_DIR, ROOT, TEST_SEASON, TRAIN_SEASONS, VALID_SEASON  # noqa: E402
from fpl.model import FEATURES, TARGET, baselines, load_features, per_gameweek  # noqa: E402

OUT = ROOT / "docs" / "data"
r2 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 3)  # noqa: E731


def records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records", double_precision=4))


def test_frame() -> pd.DataFrame:
    """The test season with the model's saved predictions and the two baselines."""
    feats = load_features()
    test = feats[feats.season == TEST_SEASON].reset_index(drop=True)
    saved = pd.read_csv(REPORTS_DIR / "test_predictions.csv")[["gw", "player_id", "pred_model"]]
    test = test.merge(saved, on=["gw", "player_id"], how="inner")
    for name, pred in baselines(test).items():
        test[name] = pred.values
    return test


def calibration(test: pd.DataFrame, regs: pd.Series) -> dict:
    """Mean actual points per predicted-points bin, with a 95% interval for the mean."""
    out = {}
    for label, sub in [("All", test[regs])] + [(p, test[regs & (test.position == p)]) for p in ["GK", "DEF", "MID", "FWD"]]:
        b = (sub.pred_model.clip(0, 9.99) // 1).astype(int)
        g = sub.groupby(b).agg(pred=("pred_model", "mean"), actual=(TARGET, "mean"), sd=(TARGET, "std"), n=(TARGET, "size"))
        g = g[g.n >= 20]
        g["lo"] = g.actual - 1.96 * g.sd / np.sqrt(g.n)
        g["hi"] = g.actual + 1.96 * g.sd / np.sqrt(g.n)
        out[label] = records(g.reset_index(names="bin").drop(columns="sd"))
    return out


def main() -> None:
    test = test_frame()
    regs = test["minutes_l5"].fillna(0) >= 60
    methods = {"Model": "pred_model", "Season average": "Season average", "Form (last 5 GW avg)": "Form (last 5 GW avg)"}

    # per gameweek: best XI points, captain points and rank correlation, for each method
    weekly = {}
    for label, col in methods.items():
        w = per_gameweek(test, test[col])
        weekly[label] = [{"gw": int(gw), "xi": r2(r.xi_points), "cap": r2(r.captain_points), "rho": r2(r.rank_corr), "mae": r2(r.mae_regulars)}
                         for gw, r in w.iterrows()]
    hindsight = per_gameweek(test, test[TARGET].astype(float))
    weekly["Perfect hindsight"] = [{"gw": int(gw), "xi": r2(r.xi_points)} for gw, r in hindsight.iterrows()]

    # lift: regular starters split into ten equal groups by predicted points
    rg = test[regs].copy()
    rg["decile"] = pd.qcut(rg.pred_model.rank(method="first"), 10, labels=False) + 1
    lift = rg.groupby("decile").agg(pred=("pred_model", "mean"), actual=(TARGET, "mean"), n=(TARGET, "size"),
                                    blank=(TARGET, lambda s: float((s <= 2).mean())), haul=(TARGET, lambda s: float((s >= 10).mean())))

    # what actually happens at each predicted level: quantiles of the real score
    rg["pbin"] = (rg.pred_model.clip(0.5, 8.49) * 2).round() / 2
    q = rg.groupby("pbin")[TARGET].describe(percentiles=[.1, .25, .5, .75, .9])
    q = q[q["count"] >= 30][["count", "mean", "10%", "25%", "50%", "75%", "90%"]]
    q.columns = ["n", "mean", "p10", "p25", "p50", "p75", "p90"]

    # residuals for regular starters, by position
    rg["resid"] = rg[TARGET] - rg.pred_model
    edges = list(range(-8, 17))
    resid = {pos: np.histogram(rg.loc[rg.position == pos, "resid"].clip(-8, 15.99), bins=edges)[0].tolist() for pos in ["GK", "DEF", "MID", "FWD"]}

    # error slices: where is the model better or worse than the season average?
    rg["price_band"] = pd.cut(rg.price, [0, 5, 6.5, 8.5, 20], labels=["under £5m", "£5-6.5m", "£6.5-8.5m", "£8.5m+"])
    rg["fdr"] = rg.fixture_difficulty.round().clip(1, 5).astype("Int64")
    rg["err_model"] = (rg.pred_model - rg[TARGET]).abs()
    rg["err_base"] = (rg["Season average"] - rg[TARGET]).abs()
    slices = {}
    for key, col in [("Position", "position"), ("Price", "price_band"), ("Fixture difficulty", "fdr")]:
        s = rg.groupby(col, observed=True).agg(model=("err_model", "mean"), baseline=("err_base", "mean"), n=("err_model", "size")).reset_index()
        s[col] = s[col].astype(str)
        slices[key] = records(s.rename(columns={col: "group"}))

    results = pd.read_csv(REPORTS_DIR / "model_results.csv", index_col=0)
    sig = pd.read_csv(REPORTS_DIR / "model_significance.csv")
    imp = pd.read_csv(REPORTS_DIR / "feature_importance.csv", index_col=0)["mae_increase"]
    leak = pd.read_csv(REPORTS_DIR / "leakage_check.csv")
    bias = pd.read_csv(REPORTS_DIR / "bias_by_position.csv")

    sql_dir = ROOT / "sql" / "analysis"
    def title(text: str) -> str:  # the comment block at the top of each query, as one line
        lines = []
        for line in text.splitlines():
            if not line.startswith("--"):
                break
            lines.append(line.removeprefix("--").strip())
        return " ".join(lines).removeprefix("Q:").strip()
    queries = [{"file": f.name, "title": title(f.read_text()), "sql": f.read_text()} for f in sorted(sql_dir.glob("*.sql"))]

    horizon_file = REPORTS_DIR / "horizon_backtest.csv"
    horizon = records(pd.read_csv(horizon_file)) if horizon_file.exists() else []

    data = {
        "meta": {"test_season": TEST_SEASON, "train_seasons": list(TRAIN_SEASONS), "valid_season": VALID_SEASON,
                 "test_rows": int(len(test)), "regular_rows": int(regs.sum()), "features": len(FEATURES),
                 "gameweeks": int(test.gw.nunique()), "params": json.loads((REPORTS_DIR / "best_params.json").read_text())},
        "results": [{"method": m, **{k: r2(v) for k, v in row.items()}} for m, row in results.iterrows()],
        "significance": records(sig),
        "weekly": weekly,
        "calibration": calibration(test, regs),
        "lift": records(lift.reset_index()),
        "intervals": records(q.reset_index()),
        "residuals": {"edges": edges, "counts": resid},
        "slices": slices,
        "importance": [{"feature": f, "mae_increase": r2(v)} for f, v in imp.items()],
        "leakage": records(leak),
        "bias": records(bias),
        "horizon": horizon,
        "queries": queries,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "research.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"[research] wrote research.json ({(OUT / 'research.json').stat().st_size // 1024} KB)")
    lite_db()


# columns kept in the browser copy: enough to run every query in sql/analysis/ and explore
LITE = {
    "players": "season, player_id, player_code, web_name, position, team_id, now_cost",
    "teams": "season, team_id, name, short_name",
    "fixtures": "season, fixture_id, gw, kickoff_time, home_team_id, away_team_id, home_score, away_score, home_difficulty, away_difficulty, finished",
    "player_match": ("season, player_id, fixture_id, gw, team_id, opponent_team_id, was_home, minutes, starts, total_points, goals_scored, "
                     "assists, clean_sheets, goals_conceded, saves, bonus, bps, expected_goals, expected_assists, defensive_contribution, price"),
    "player_gw": "season, player_id, gw, n_fixtures, points, minutes, starts, xg, xa, bonus, price, selected_by, fixture_difficulty",
    "player_features": ("season, player_id, gw, web_name, position, price, fixture_difficulty, points_l3, points_l5, points_std, "
                        "minutes_l5, starts_l5, xg_l5, xa_l5, gws_so_far, target_points"),
}


def lite_db() -> None:
    tmp = OUT / "fpl-lite.db"
    tmp.unlink(missing_ok=True)
    with sqlite3.connect(DB_PATH) as src, sqlite3.connect(tmp) as dst:
        for table, cols in LITE.items():
            df = pd.read_sql(f"SELECT {cols} FROM {table}", src)
            for c in df.select_dtypes("float").columns:
                df[c] = df[c].round(3)
            df.to_sql(table, dst, index=False)
        dst.execute("VACUUM")
    with tmp.open("rb") as f, gzip.open(OUT / "fpl-lite.db.gz", "wb", compresslevel=9) as g:
        shutil.copyfileobj(f, g)
    print(f"[research] wrote fpl-lite.db.gz ({(OUT / 'fpl-lite.db.gz').stat().st_size // 1024} KB, {tmp.stat().st_size // 1024} KB unpacked)")
    tmp.unlink()


if __name__ == "__main__":
    main()
