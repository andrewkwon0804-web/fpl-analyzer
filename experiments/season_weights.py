import sys, warnings, json
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "src")); warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from fpl import model as M
from fpl.config import FINISHED_SEASONS, LIVE_SEASON
df = M.load_features()
params = json.load(open(__import__("pathlib").Path(__file__).resolve().parents[1] / "reports" / "best_params.json"))
fin = df[df.season.isin(FINISHED_SEASONS)]; live = df[df.season == LIVE_SEASON].reset_index(drop=True)
reg = live.minutes_l5.fillna(0) >= 60
base = None
for name, w in {"equal": {}, "recent x2": {"2025-26": 2.0}, "recent x3, oldest x0.5": {"2025-26": 3.0, "2022-23": 0.5}}.items():
    sw = fin.season.map(lambda s: w.get(s, 1.0))
    m = M.make_model(**params).fit(fin[M.FEATURES], fin[M.TARGET], sample_weight=sw)
    p = pd.Series(m.predict(live[M.FEATURES]))
    e = M.evaluate(live, p); wk = M.per_gameweek(live, p)
    bias = (p[reg] - live.loc[reg, M.TARGET]).mean()
    line = f"{name:24s} MAE reg {e['MAE (regular starters)']:.3f}  rank {e['Rank correlation per GW']:.3f}  XI {e['Best XI: avg points per GW']:.1f}  bias reg {bias:+.2f}"
    if base is not None:
        b = M.paired_bootstrap(wk, base)
        line += "  vs equal: " + str({k[:12]: tuple(round(x, 2) for x in v) for k, v in b.items()})
    else: base = wk
    print(line)
