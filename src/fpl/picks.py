"""Turn point predictions into an FPL-style team: a valid starting XI plus a captain.

Used by model.py (to score each prediction method) and by the Streamlit app
(to draw the pitch view), so both always pick teams the same way.
"""
import pandas as pd

# FPL formation rules for a starting XI.
MIN_PER_POSITION = {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}
MAX_PER_POSITION = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3}
XI_SIZE = 11


def best_xi(gameweek: pd.DataFrame, score_col: str) -> pd.DataFrame:
    """Pick the 11 highest-scoring players by `score_col` in a valid formation.

    Budget is ignored on purpose: this measures how well a method ranks players,
    not how well it manages money. Greedy works here because, without a budget,
    the best team is the minimum per position plus the best of the rest.
    """
    # Many players share the same prediction (e.g. 0.0 or identical season averages).
    # Break ties by player_id with a stable sort, so the same inputs always give the
    # same team on every computer.
    keys = [score_col] + (["player_id"] if "player_id" in gameweek.columns else [])
    ranked = gameweek.sort_values(keys, ascending=[False] + [True] * (len(keys) - 1), kind="mergesort")
    picks = []
    for pos, n in MIN_PER_POSITION.items():
        picks += list(ranked.index[ranked["position"] == pos][:n])
    counts = dict(MIN_PER_POSITION)
    for idx, pos in ranked.drop(picks)["position"].items():
        if len(picks) == XI_SIZE:
            break
        if counts[pos] < MAX_PER_POSITION[pos]:
            picks.append(idx)
            counts[pos] += 1
    team = gameweek.loc[picks].copy()
    captain = next(idx for idx in ranked.index if idx in set(picks))  # top-ranked pick
    team["is_captain"] = team.index == captain
    return team


def xi_points(gameweek: pd.DataFrame, score_col: str, actual_col: str) -> float:
    """Actual points the XI scored, with the captain's points doubled like in FPL."""
    team = best_xi(gameweek, score_col)
    return float(team[actual_col].sum() + team.loc[team["is_captain"], actual_col].sum())
