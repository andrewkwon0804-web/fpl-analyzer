import sys, warnings
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "src")); warnings.filterwarnings("ignore")
import json, numpy as np, pandas as pd
from fpl import model as M
from fpl.config import TRAIN_SEASONS, VALID_SEASON, TEST_SEASON, FINISHED_SEASONS, LIVE_SEASON
df = M.load_features()
params = json.load(open(__import__("pathlib").Path(__file__).resolve().parents[1] / "reports" / "best_params.json"))
fitd = df[df.season.isin(TRAIN_SEASONS + [VALID_SEASON])]
m = M.make_model(**params).fit(fitd[M.FEATURES], fitd[M.TARGET])
fin = df[df.season.isin(FINISHED_SEASONS)]
ml = M.make_model(**params).fit(fin[M.FEATURES], fin[M.TARGET])
for name, d, mod in (("test 2025-26", df[df.season == TEST_SEASON].copy(), m), ("live 2026-27", df[df.season == LIVE_SEASON].copy(), ml)):
    d["pred"] = mod.predict(d[M.FEATURES])
    d = d[(d.minutes_l5.fillna(0) >= 60) & (d.gws_so_far >= 3) & d.prev_ppg.notna()]
    d["gap"] = d.points_std - d.prev_ppg
    d["grp"] = pd.cut(d.gap, [-99, -2, -1, 1, 2, 99], labels=["much worse than last season", "worse", "similar", "better", "much better"])
    d["early"] = np.where(d.gw <= 12, "GW<=12", "GW>12")
    out = d.groupby(["early", "grp"]).agg(rows=("pred", "size"), pred=("pred", "mean"), actual=(M.TARGET, "mean"), season_avg=("points_std", "mean"), last_season=("prev_ppg", "mean"))
    out["bias"] = out.pred - out.actual
    print("==", name); print(out.round(2).to_string())
