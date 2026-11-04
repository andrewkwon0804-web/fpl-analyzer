"""Does telling the model about the 2025-26 scoring rule fix the defender bias?

2025-26 added points for defensive contributions (tackles, clearances, blocks and
interceptions). Seasons before it never paid those points, so a model trained on them
under-predicts defenders. Three versions, same settings (reports/best_params.json):

  v1          the current 27 features
  v2 era      + a 0/1 flag for seasons scored under the new rule
  v2 era+dc   + the flag and each player's recent defensive contributions

Two tests, both on games the model never saw:
  A. 2025-26, second half: train on 2022-23 to 2024-25 plus 2025-26 gameweeks 1-19,
     test on 2025-26 gameweeks 20-38 (19 weeks, enough new-rule games to learn from).
  B. 2026-27 so far: train on every finished season, test on the played gameweeks.

Run: python experiments/rule_era.py   (writes reports/rule_era.csv)
"""
import json
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
warnings.filterwarnings("ignore")
import pandas as pd  # noqa: E402
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402

from fpl import model as M  # noqa: E402
from fpl.config import FINISHED_SEASONS, LIVE_SEASON, REPORTS_DIR  # noqa: E402

RULE_SEASONS = {"2025-26", "2026-27", "2027-28"}
VERSIONS = {
    "v1": M.FEATURES,
    "v2 era": M.FEATURES + ["defcon_rule"],
    "v2 era+dc": M.FEATURES + ["defcon_rule", "defcon_l5", "defcon_std"],
}
PARAMS = json.loads((REPORTS_DIR / "best_params.json").read_text())


def fit(feats, data):
    m = HistGradientBoostingRegressor(loss="squared_error", max_iter=600, early_stopping=True, validation_fraction=0.1,
                                      n_iter_no_change=30, categorical_features=[feats.index("position_code")],
                                      random_state=42, **PARAMS)
    return m.fit(data[feats], data[M.TARGET])


def bias(df, pred):
    regs = df.minutes_l5.fillna(0) >= 60
    d = df[regs].assign(err=pred[regs] - df.loc[regs, M.TARGET])
    return d.groupby("position").err.mean().to_dict()


def main():
    df = M.load_features()
    df["defcon_rule"] = df.season.isin(RULE_SEASONS).astype(int)
    splits = {
        "A: 2025-26 GW20-38": (df[(df.season < "2025-26") | ((df.season == "2025-26") & (df.gw <= 19))],
                               df[(df.season == "2025-26") & (df.gw >= 20)]),
        "B: 2026-27 so far": (df[df.season.isin(FINISHED_SEASONS)], df[df.season == LIVE_SEASON]),
    }
    rows, weekly = [], {}
    for split, (train, test) in splits.items():
        test = test.reset_index(drop=True)
        for name, feats in VERSIONS.items():
            pred = pd.Series(fit(feats, train).predict(test[feats]))
            e, b = M.evaluate(test, pred), bias(test, pred)
            weekly[(split, name)] = M.per_gameweek(test, pred)
            rows.append({"test": split, "version": name, "gameweeks": test.gw.nunique(),
                         "MAE regulars": e["MAE (regular starters)"], "rank corr": e["Rank correlation per GW"],
                         "best XI/GW": e["Best XI: avg points per GW"],
                         **{f"bias {p}": b.get(p) for p in ["GK", "DEF", "MID", "FWD"]}})
    out = pd.DataFrame(rows)
    print(out.round(3).to_string(index=False))
    for split in splits:
        for name in list(VERSIONS)[1:]:
            r = M.paired_bootstrap(weekly[(split, name)], weekly[(split, "v1")])
            print(split, name, "vs v1:", {k: tuple(round(x, 3) for x in v) for k, v in r.items()})
    out.round(4).to_csv(REPORTS_DIR / "rule_era.csv", index=False)


if __name__ == "__main__":
    main()
