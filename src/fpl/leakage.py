"""Leakage check: does any input "know" the gameweek it is meant to predict?

Idea: a genuine pre-deadline forecast should correlate about equally with
this gameweek's points and next gameweek's points (both are in its future).
A column that correlates much more with *this* gameweek is carrying
information from the match itself.

To keep the test fair we only use regular starters who played 60+ minutes in
both gameweeks, so injuries and rotation news can't explain the gap.
"""
import pandas as pd

from fpl.config import REPORTS_DIR
from fpl.model import load_features

CHECK_COLUMNS = ["fpl_xp", "points_l3", "points_l5", "points_std", "xg_l5", "ict_l5"]


def leakage_table(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["season", "player_id", "gw"]).copy()
    grp = df.groupby(["season", "player_id"])
    df["points_next"] = grp["target_points"].shift(-1)
    df["minutes_next"] = grp["minutes_actual"].shift(-1)
    sample = df[(df["minutes_l5"] >= 60) & (df["minutes_actual"] >= 60)
                & (df["minutes_next"] >= 60) & (df["fpl_xp"] > 0)]
    rows = []
    for col in CHECK_COLUMNS:
        same = sample[col].corr(sample["target_points"])
        nxt = sample[col].corr(sample["points_next"])
        rows.append({"column": col, "corr_this_gw": same, "corr_next_gw": nxt,
                     "ratio": same / nxt, "verdict": "LEAKS" if same > 2 * nxt else "ok"})
    out = pd.DataFrame(rows)
    out.attrs["n"] = len(sample)
    return out


def main() -> pd.DataFrame:
    table = leakage_table(load_features())
    print(f"[leakage] sample size {table.attrs['n']}\n" + table.round(3).to_string(index=False))
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    table.to_csv(REPORTS_DIR / "leakage_check.csv", index=False)
    return table


if __name__ == "__main__":
    main()
