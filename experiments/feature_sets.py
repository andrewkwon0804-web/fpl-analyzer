import sys, json, warnings
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "src")); warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
from fpl import model as M
from fpl.config import TRAIN_SEASONS, VALID_SEASON, TEST_SEASON, FINISHED_SEASONS, LIVE_SEASON

df = M.load_features()
k = 4
df["blended_ppg"] = np.where(df.prev_ppg.notna(),
    (df.gws_so_far * df.points_std.fillna(0) + k * df.prev_ppg) / (df.gws_so_far + k), df.points_std)
NEWF = ["team_attack_xg_std", "team_defence_xga_std", "team_cs_rate_std", "opp_attack_xg_std", "opp_defence_xga_std",
        "defcon_l5", "defcon_std", "bonus_std", "starts_std", "points_p90_std", "xgi_p90_std", "blended_ppg"]
SETS = {
    "current": M.FEATURES,
    "new": M.FEATURES + NEWF,
    "new, no ownership/price-change": [f for f in M.FEATURES + NEWF if f not in ("selected_by_prev", "price_change_season")],
}
GRID = [{"learning_rate": lr, "max_leaf_nodes": lv, "min_samples_leaf": 100, "l2_regularization": 1.0}
        for lr in (0.03, 0.06) for lv in (15, 31)]

def fit(feats, data, params):
    m = HistGradientBoostingRegressor(loss="squared_error", max_iter=600, early_stopping=True, validation_fraction=0.1,
        n_iter_no_change=30, categorical_features=[feats.index("position_code")], random_state=42, **params)
    return m.fit(data[feats], data[M.TARGET])

train = df[df.season.isin(TRAIN_SEASONS)]; valid = df[df.season == VALID_SEASON]
test = df[df.season == TEST_SEASON].reset_index(drop=True)
fin = df[df.season.isin(FINISHED_SEASONS)]; live = df[df.season == LIVE_SEASON].reset_index(drop=True)
rows, weekly = [], {}
for name, feats in SETS.items():
    best = min(GRID, key=lambda p: mean_absolute_error(valid[M.TARGET], fit(feats, train, p).predict(valid[feats])))
    m = fit(feats, pd.concat([train, valid]), best)
    pt = pd.Series(m.predict(test[feats]))
    ml = fit(feats, fin, best); pl = pd.Series(ml.predict(live[feats]))
    et, el = M.evaluate(test, pt), M.evaluate(live, pl)
    weekly[name] = (M.per_gameweek(test, pt), M.per_gameweek(live, pl))
    rows.append({"features": name, "params": json.dumps(best),
        "test MAE reg": et["MAE (regular starters)"], "test rank corr": et["Rank correlation per GW"], "test XI/GW": et["Best XI: avg points per GW"],
        "live MAE reg": el["MAE (regular starters)"], "live rank corr": el["Rank correlation per GW"], "live XI/GW": el["Best XI: avg points per GW"]})
    print(name, "done", flush=True)
print(pd.DataFrame(rows).round(3).to_string(index=False))
for name in list(SETS)[1:]:
    for which, idx in (("test", 0), ("live", 1)):
        r = M.paired_bootstrap(weekly[name][idx], weekly["current"][idx])
        print(name, which, {k: tuple(round(x, 2) for x in v) for k, v in r.items()})
