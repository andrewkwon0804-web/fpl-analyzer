"""Step 9b: one of the model's trees, for the model report's tree view.

The gradient boosting model is a sum of small decision trees. This writes the first one
(the tree that does the most work: it carries the largest share of the split gain) and a
sample of real 2025-26 player-gameweeks, so the page can send each player down the tree
using the same thresholds the model uses.

Writes docs/data/tree.json. Run on its own: python src/fpl/export_tree.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fpl import model as M  # noqa: E402
from fpl.config import REPORTS_DIR, ROOT, TEST_SEASON, TRAIN_SEASONS, VALID_SEASON  # noqa: E402

OUT = ROOT / "docs" / "data" / "tree.json"


def main(sample_size: int = 360) -> None:
    df = M.load_features()
    fit = df[df.season.isin(TRAIN_SEASONS + [VALID_SEASON])]
    params = json.loads((REPORTS_DIR / "best_params.json").read_text())
    model = M.make_model(**params).fit(fit[M.FEATURES], fit[M.TARGET])

    # the first tree without a category split (position), so every split is "feature <= value"
    index, nodes = next((i, p.nodes) for i, (p,) in enumerate(model._predictors) if not p.nodes["is_categorical"].any())
    total_gain = sum(float(p.nodes["gain"].sum()) for (p,) in model._predictors)
    tree = [{
        "id": i, "leaf": bool(n["is_leaf"]), "value": round(float(n["value"]), 4), "count": int(n["count"]),
        "feature": None if n["is_leaf"] else M.FEATURES[int(n["feature_idx"])],
        "threshold": None if n["is_leaf"] else round(float(n["num_threshold"]), 4),
        "missing_left": bool(n["missing_go_to_left"]),
        "left": None if n["is_leaf"] else int(n["left"]), "right": None if n["is_leaf"] else int(n["right"]),
        "depth": int(n["depth"]), "gain": round(float(n["gain"]), 1),
    } for i, n in enumerate(nodes)]
    used = sorted({t["feature"] for t in tree if t["feature"]})

    # real player-weeks from the held-out season, weighted toward people who play
    test = df[df.season == TEST_SEASON]
    saved = pd.read_csv(REPORTS_DIR / "test_predictions.csv")[["gw", "player_id", "pred_model"]]
    test = test.merge(saved, on=["gw", "player_id"], how="inner")
    rng = np.random.default_rng(7)
    plays = test[test.minutes_l5.fillna(0) >= 30]
    bench = test[test.minutes_l5.fillna(0) < 30]
    pick = pd.concat([plays.sample(int(sample_size * 0.75), random_state=7), bench.sample(int(sample_size * 0.25), random_state=7)])
    pick = pick.iloc[rng.permutation(len(pick))]
    rows = [{
        "name": r.web_name, "pos": r.position, "gw": int(r.gw), "actual": int(r.target_points), "pred": round(float(r.pred_model), 2),
        "x": {f: (None if pd.isna(getattr(r, f)) else round(float(getattr(r, f)), 3)) for f in used},
    } for r in pick.itertuples()]

    out = {"index": index, "trees": int(model.n_iter_), "baseline": round(float(np.ravel(model._baseline_prediction)[0]), 4),
           "share_of_gain": round(float(nodes["gain"].sum()) / total_gain, 4), "nodes": tree, "features": used, "sample": rows}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"[tree] tree {index} of {model.n_iter_}, {len(tree)} nodes, {len(rows)} sample rows -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
