"""Step 5d: the prediction ledger. Picks are saved before the deadline and scored after.

The season-so-far record in live.py re-scores played gameweeks with today's model, which
is fair (the model never trained on this season) but can't prove anything was known in
advance. The ledger can: every refresh before a gameweek's deadline overwrites that
gameweek's file with the current picks, and once the deadline passes the file is never
written again. Git history timestamps each version.

Files (reports/ledger/):
  <season>-gw<NN>.csv   every player's published prediction, plus the XI and captain the
                        model and the season-average rule would pick
  index.json            per gameweek: deadline, when the picks were last saved, the picks
  scores.csv            each saved gameweek after it's played: what the picks scored
"""
import json
import sqlite3

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from fpl.config import DB_PATH, LIVE_SEASON, REPORTS_DIR
from fpl.picks import best_xi

LEDGER = REPORTS_DIR / "ledger"
INDEX = LEDGER / "index.json"
DEADLINE_BEFORE_KICKOFF = pd.Timedelta(minutes=90)  # FPL's deadline rule


def _file(gw: int):
    return LEDGER / f"{LIVE_SEASON}-gw{gw:02d}.csv"


def _picks(df: pd.DataFrame, col: str) -> tuple[list, int]:
    team = best_xi(df, col)
    return [int(i) for i in team.player_id], int(team.loc[team.is_captain, "player_id"].iloc[0])


def record(now: pd.Timestamp | None = None) -> dict | None:
    """Save the next gameweek's picks if its deadline hasn't passed."""
    now = now or pd.Timestamp.now(tz="UTC")
    live = REPORTS_DIR / "live"
    nxt = pd.read_csv(live / "next_gameweek_predictions.csv")
    meta = json.loads((live / "meta.json").read_text())
    if nxt.empty or not meta.get("next_gw_first_kickoff"):
        return None
    gw = int(nxt.gw.iloc[0])
    deadline = pd.Timestamp(meta["next_gw_first_kickoff"]) - DEADLINE_BEFORE_KICKOFF
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    if now >= deadline:
        state = "saved" if str(gw) in index else "missed"
        print(f"[ledger] GW{gw} deadline passed ({deadline:%a %d %b %H:%M} UTC); picks {state}, not changed")
        return None

    xi, cap = _picks(nxt, "predicted_points")
    rule_xi, rule_cap = _picks(nxt, "pred_season_avg")
    out = nxt[["player_id", "web_name", "team_short", "position", "price", "predicted_points",
               "pred_season_avg", "chance_of_playing", "minutes_l5"]].copy()
    out["in_xi"] = out.player_id.isin(xi)
    out["captain"] = out.player_id == cap
    out["rule_in_xi"] = out.player_id.isin(rule_xi)
    out["rule_captain"] = out.player_id == rule_cap
    LEDGER.mkdir(parents=True, exist_ok=True)
    text = out.round(3).to_csv(index=False)
    if _file(gw).exists() and _file(gw).read_text() == text and str(gw) in index:
        print(f"[ledger] GW{gw} picks unchanged since {index[str(gw)]['saved_at']}")
        return index[str(gw)]
    _file(gw).write_text(text)
    index[str(gw)] = {"season": LIVE_SEASON, "gw": gw, "deadline": deadline.isoformat(),
                      "saved_at": now.isoformat(timespec="seconds"),
                      "xi": xi, "captain": cap, "rule_xi": rule_xi, "rule_captain": rule_cap}
    INDEX.write_text(json.dumps(dict(sorted(index.items(), key=lambda kv: int(kv[0]))), indent=1))
    print(f"[ledger] saved GW{gw} picks (deadline {deadline:%a %d %b %H:%M} UTC)")
    return index[str(gw)]


def score() -> pd.DataFrame:
    """Score every saved gameweek that has been played."""
    if not INDEX.exists():
        return pd.DataFrame()
    index = json.loads(INDEX.read_text())
    with sqlite3.connect(DB_PATH) as con:
        played = con.execute("SELECT MAX(gw) FROM player_gw WHERE season = ?", (LIVE_SEASON,)).fetchone()[0] or 0
        actual = pd.read_sql("SELECT gw, player_id, points, minutes FROM player_gw WHERE season = ?",
                             con, params=(LIVE_SEASON,))
    rows = []
    for key, e in index.items():
        gw = int(key)
        if gw > played or not _file(gw).exists():
            continue
        df = pd.read_csv(_file(gw)).merge(actual[actual.gw == gw], on="player_id", how="left")
        df[["points", "minutes"]] = df[["points", "minutes"]].fillna(0)  # no fixture = 0
        pts = df.set_index("player_id").points

        def team(ids, cap):
            return float(pts.reindex(ids).fillna(0).sum() + pts.get(cap, 0))

        hind_xi, hind_cap = _picks(df, "points")
        regs = df[df.minutes_l5.fillna(0) >= 60]
        rows.append({
            "gw": gw, "saved_at": e["saved_at"], "deadline": e["deadline"],
            "model_xi": team(e["xi"], e["captain"]), "rule_xi": team(e["rule_xi"], e["rule_captain"]),
            "hindsight_xi": team(hind_xi, hind_cap),
            "captain": df.loc[df.player_id == e["captain"], "web_name"].iloc[0],
            "captain_points": float(pts.get(e["captain"], 0)) * 2,
            "rule_captain": df.loc[df.player_id == e["rule_captain"], "web_name"].iloc[0],
            "rule_captain_points": float(pts.get(e["rule_captain"], 0)) * 2,
            "rank_corr": spearmanr(df.predicted_points, df.points).statistic,
            "mae_regulars": float((regs.predicted_points - regs.points).abs().mean()) if len(regs) else np.nan,
        })
    out = pd.DataFrame(rows).sort_values("gw") if rows else pd.DataFrame()
    if not out.empty:
        out.round(3).to_csv(LEDGER / "scores.csv", index=False)
    return out


def main() -> pd.DataFrame:
    record()
    s = score()
    if not s.empty:
        print(f"[ledger] {len(s)} scored gameweek(s); model XI {s.model_xi.sum():.0f} vs rule {s.rule_xi.sum():.0f}")
    return s


if __name__ == "__main__":
    main()
