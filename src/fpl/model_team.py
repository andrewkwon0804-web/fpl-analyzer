"""Step 5c: a simulated FPL team managed by the model, under the real game rules.

* Gameweek 1: pick the best 15-man squad for £100m with integer programming (PuLP):
  2 GK, 5 DEF, 5 MID, 3 FWD, at most 3 players per club.
* Every later gameweek: one free transfer (unused ones roll over, up to 5), -4 points
  for each extra one, at most 3 transfers a week. A transfer has to add at least a
  point of predicted value to be made, so the team doesn't churn on noise.
* Each week: the best XI and captain by predicted points, the other 4 on the bench.
  Starters who don't play are auto-subbed from the bench in order, and the vice-captain
  takes the armband if the captain doesn't play.
* Prices follow FPL: you buy at the current price and sell at the purchase price plus
  half of any rise (rounded down to £0.1m).

Predictions for gameweeks already played come from the live model, which was trained on
2022-23 to 2025-26 only, so every pick is out of sample. FPL doesn't keep past injury
flags, so the backfilled weeks don't know about injuries; from now on each week's
decision is saved in model_team_log.json before its results are known, and never redone.
"""
import json
import math

import pandas as pd
import pulp

from fpl.config import LIVE_SEASON, RAW_DIR, REPORTS_DIR

BUDGET = 100.0
QUOTA = {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}
XI_MIN = {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}
XI_MAX = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3}
MAX_PER_CLUB = 3
HIT = 4
MAX_TRANSFERS = 3
TRANSFER_MARGIN = 1.0   # predicted points a transfer must add
BENCH_WEIGHT = 0.1      # bench players matter a little (injury cover)
LIVE = REPORTS_DIR / "live"
LOG = LIVE / "model_team_log.json"


def choose_squad(pool: pd.DataFrame, current: dict | None, bank: float, free: int) -> dict:
    """Best squad for one gameweek. `current` maps player_id -> selling price (None at GW1)."""
    prob = pulp.LpProblem("squad", pulp.LpMaximize)
    ids = list(pool.index)
    x = pulp.LpVariable.dicts("in", ids, cat="Binary")
    y = pulp.LpVariable.dicts("start", ids, cat="Binary")
    c = pulp.LpVariable.dicts("cap", ids, cat="Binary")
    pred, pos, club, price = pool["pred"], pool["position"], pool["team_short"], pool["price"]
    score = pulp.lpSum(pred[i] * (y[i] + c[i]) + BENCH_WEIGHT * pred[i] * (x[i] - y[i]) for i in ids)

    for p, n in QUOTA.items():
        prob += pulp.lpSum(x[i] for i in ids if pos[i] == p) == n
    for p in XI_MIN:
        starters = pulp.lpSum(y[i] for i in ids if pos[i] == p)
        prob += starters >= XI_MIN[p]
        prob += starters <= XI_MAX[p]
    prob += pulp.lpSum(y.values()) == 11
    prob += pulp.lpSum(c.values()) == 1
    for i in ids:
        prob += y[i] <= x[i]
        prob += c[i] <= y[i]
    for team in club.unique():
        prob += pulp.lpSum(x[i] for i in ids if club[i] == team) <= MAX_PER_CLUB

    if current is None:
        prob += pulp.lpSum(price[i] * x[i] for i in ids) <= BUDGET
        prob += score
    else:
        owned = [i for i in ids if i in current]
        new = [i for i in ids if i not in current]
        buys = pulp.lpSum(x[i] for i in new)
        hits = pulp.LpVariable("hits", lowBound=0, cat="Integer")
        prob += hits >= buys - free
        prob += buys <= MAX_TRANSFERS
        # money: what's in the bank plus what the sold players fetch
        prob += (pulp.lpSum(price[i] * x[i] for i in new)
                 <= bank + pulp.lpSum(current[i] * (1 - x[i]) for i in owned))
        prob += score - HIT * hits - TRANSFER_MARGIN * buys

    prob.solve(pulp.PULP_CBC_CMD(msg=0))
    if pulp.LpStatus[prob.status] != "Optimal":
        raise RuntimeError(f"squad selection failed: {pulp.LpStatus[prob.status]}")
    pick = [i for i in ids if x[i].value() > 0.5]
    return {"squad": pick, "start": [i for i in pick if y[i].value() > 0.5],
            "captain": next(i for i in pick if c[i].value() > 0.5)}


def selling_price(bought: float, now: float) -> float:
    """FPL keeps half of any price rise, rounded down to £0.1m; drops are passed on in full."""
    if now <= bought:
        return now
    return round(bought + math.floor(round((now - bought) * 10) / 2) / 10, 1)


def score_week(rows: pd.DataFrame, start: list, captain: int) -> dict:
    """Actual points with FPL auto-subs and the vice-captain rule."""
    bench = [i for i in rows.sort_values("pred", ascending=False).index if i not in start]
    xi = list(start)
    played = lambda i: rows.at[i, "minutes"] > 0  # noqa: E731
    subs = []
    for out in [i for i in start if not played(i)]:
        for b in bench:
            if not played(b) or b in xi:
                continue
            trial = [p for p in xi if p != out] + [b]
            counts = rows.loc[trial, "position"].value_counts()
            if all(XI_MIN[p] <= counts.get(p, 0) <= XI_MAX[p] for p in XI_MIN):
                xi = trial
                subs.append((int(out), int(b)))
                break
    order = rows.loc[start].sort_values("pred", ascending=False).index
    vice = next(i for i in order if i != captain)
    armband = captain if played(captain) else vice if played(vice) else None
    pts = int(rows.loc[xi, "actual"].sum() + (rows.at[armband, "actual"] if armband is not None else 0))
    return {"points": pts, "xi": [int(i) for i in xi], "subs": subs, "vice": int(vice),
            "armband": None if armband is None else int(armband)}


def week_pool(df: pd.DataFrame, gw: int, owned: list) -> pd.DataFrame:
    pool = df[df.gw == gw].set_index("player_id")
    missing = [i for i in owned if i not in pool.index]  # e.g. a player who left the league
    if missing:
        last = df[df.player_id.isin(missing)].sort_values("gw").groupby("player_id").tail(1).set_index("player_id")
        pool = pd.concat([pool, last.assign(gw=gw, pred=0.0, actual=0, minutes=0)])
    return pool[["web_name", "team_short", "position", "price", "pred", "actual", "minutes"]]


def simulate() -> dict:
    played = pd.read_csv(LIVE / "season_so_far_predictions.csv").rename(
        columns={"predicted_points": "pred", "actual_points": "actual"})
    nxt = pd.read_csv(LIVE / "next_gameweek_predictions.csv")
    next_gw = int(nxt.gw.iloc[0])
    # If that gameweek has already kicked off, today's injury flags may come from its own
    # matches. Use the prediction before any news, like the backfilled weeks.
    meta = json.loads((LIVE / "meta.json").read_text())
    kickoff = meta.get("next_gw_first_kickoff")
    started = bool(kickoff) and pd.Timestamp(kickoff) < pd.Timestamp.now(tz="UTC")
    upcoming = nxt.assign(pred=nxt.predicted_raw if started else nxt.predicted_points, actual=0, minutes=0)[
        ["gw", "player_id", "web_name", "team_short", "position", "price", "pred", "actual", "minutes"]]
    df = pd.concat([played[played.gw < next_gw], upcoming], ignore_index=True)
    log = json.loads(LOG.read_text()) if LOG.exists() else {}

    weeks, owned, bank, free = [], {}, BUDGET, 1
    for gw in sorted(df.gw.unique()):
        gw = int(gw)
        pool = week_pool(df, gw, list(owned))
        sell = {i: selling_price(b, pool.at[i, "price"]) for i, b in owned.items()}
        if str(gw) in log:  # a decision already made before this gameweek: never redo it
            d = log[str(gw)]
            pick = {"squad": d["squad"], "start": d["start"], "captain": d["captain"]}
        else:
            pick = choose_squad(pool, sell if owned else None, bank, free)
            log[str(gw)] = {k: [int(i) for i in v] if isinstance(v, list) else int(v) for k, v in pick.items()}
        bought = [i for i in pick["squad"] if i not in owned]
        sold = [i for i in owned if i not in pick["squad"]]
        n = len(bought) if owned else 0
        hits = max(0, n - free) * HIT if owned else 0
        bank = round(bank + sum(sell[i] for i in sold) - sum(pool.at[i, "price"] for i in bought), 1)
        owned = {i: owned.get(i, pool.at[i, "price"]) for i in pick["squad"]}
        rows = pool.loc[pick["squad"]]
        done = gw < next_gw
        res = score_week(rows, pick["start"], pick["captain"]) if done else {"points": None, "subs": [], "vice": None}
        weeks.append({
            "gw": gw, "finished": done, "points": None if not done else res["points"] - hits, "hits": hits,
            "transfers": [{"out": int(o), "in": int(i)} for o, i in zip(sold, bought)],
            "bank": bank, "free_transfers": free, "captain": int(pick["captain"]),
            "squad": [{"id": int(i), "name": rows.at[i, "web_name"], "team": rows.at[i, "team_short"],
                       "pos": rows.at[i, "position"], "price": float(rows.at[i, "price"]),
                       "pred": round(float(rows.at[i, "pred"]), 2), "start": i in pick["start"],
                       "points": int(rows.at[i, "actual"]) if done else None,
                       "minutes": int(rows.at[i, "minutes"]) if done else None}
                      for i in rows.sort_values(["position", "pred"], ascending=[True, False]).index],
            "subs": res["subs"],
        })
        free = 1 if hits else min(5, free - n + 1) if owned and gw > 1 else 1
        if gw == 1:
            free = 1
    LOG.write_text(json.dumps(log, indent=1))
    return {"weeks": weeks, "fpl": fpl_context()}


def fpl_context() -> dict:
    """FPL's average and highest manager score per gameweek, when fetch_official.py saved them."""
    f = RAW_DIR / LIVE_SEASON / "events.csv"
    if not f.exists():
        return {}
    ev = pd.read_csv(f)
    ev = ev[ev.finished.astype(str).str.lower().isin(["true", "1"])]
    return {str(int(r.id)): {"average": int(r.average_entry_score), "highest": int(r.highest_score)}
            for r in ev.itertuples()}


def main() -> dict:
    out = simulate()
    (LIVE / "model_team.json").write_text(json.dumps(out, indent=1))
    done = [w for w in out["weeks"] if w["finished"]]
    total = sum(w["points"] for w in done)
    print(f"[team] model team: {total} pts over GW1-{done[-1]['gw']}"
          + "".join(f"\n  GW{w['gw']}: {w['points']:>3} pts, {len(w['transfers'])} transfer(s), hits {w['hits']}, bank £{w['bank']}m"
                    for w in done))
    return out


if __name__ == "__main__":
    main()
