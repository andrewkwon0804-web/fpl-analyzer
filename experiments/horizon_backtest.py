"""Backtest on 2025-26: predict gameweek t+j with form as of t and the fixture of t+j."""
import sys, warnings, json
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "src")); warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from fpl import model as M
from fpl.config import TRAIN_SEASONS, VALID_SEASON, TEST_SEASON
df = M.load_features()
params = json.load(open(__import__("pathlib").Path(__file__).resolve().parents[1] / "reports" / "best_params.json"))
fitd = df[df.season.isin(TRAIN_SEASONS + [VALID_SEASON])]
m = M.make_model(**params).fit(fitd[M.FEATURES], fitd[M.TARGET])
test = df[df.season == TEST_SEASON]
FIX = ["n_fixtures", "home_fixtures", "fixture_difficulty", "opp_attack_xg_l6", "opp_defence_xga_l6", "team_attack_xg_l6"]
FORM = [f for f in M.FEATURES if f not in FIX]
rows = []
for j in range(0, 5):
    later = test[["player_id", "gw", M.TARGET, "minutes_actual"] + FIX].assign(gw_from=lambda d: d.gw - j)
    now = test[["player_id", "gw"] + FORM].rename(columns={"gw": "gw_from"})
    x = later.merge(now, on=["player_id", "gw_from"])
    x["pred"] = m.predict(x[M.FEATURES])
    reg = x.minutes_l5.fillna(0) >= 60
    corr = x.groupby("gw").apply(lambda g: g["pred"].corr(g[M.TARGET], method="spearman")).mean()
    rows.append({"weeks ahead": j + 1, "MAE regulars": (x.pred - x[M.TARGET])[reg].abs().mean(), "rank corr": corr, "rows": len(x)})
out = pd.DataFrame(rows).round(3)
print(out.to_string(index=False))
out.to_csv(M.REPORTS_DIR / "horizon_backtest.csv", index=False)  # read by export_research.py
