"""Step 2: clean the raw CSVs and load them into a SQLite database.

Cleaning rules (each is logged so you can see what changed):
  * exact duplicate player-fixture rows are dropped (seen in the 2025-26 export)
  * prices are converted from FPL's tenths (e.g. 55) to £m (5.5)
  * player team is taken from the match row, so mid-season transfers are handled
  * xG columns are set to NULL for gameweeks where FPL didn't track xG yet (2022-23 GW1-15)
"""
import sqlite3

import numpy as np
import pandas as pd

from fpl.config import DB_PATH, RAW_DIR, SEASONS, SQL_DIR

POSITIONS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD", 5: "AM"}


def _bool(series: pd.Series) -> pd.Series:
    return series.astype(str).str.lower().isin(["true", "1"]).astype(int)


def clean_teams(season: str) -> pd.DataFrame:
    t = pd.read_csv(RAW_DIR / season / "teams.csv")
    out = t.rename(columns={"id": "team_id"})[
        ["team_id", "name", "short_name", "strength",
         "strength_attack_home", "strength_attack_away",
         "strength_defence_home", "strength_defence_away"]
    ]
    return out.assign(season=season)


def clean_players(season: str) -> pd.DataFrame:
    p = pd.read_csv(RAW_DIR / season / "players_raw.csv")
    return pd.DataFrame({
        "season": season,
        "player_id": p["id"],
        "player_code": p["code"],
        "web_name": p["web_name"],
        "full_name": (p["first_name"] + " " + p["second_name"]).str.strip(),
        "position": p["element_type"].map(POSITIONS),
        "team_id": p["team"],
    })


def clean_fixtures(season: str) -> pd.DataFrame:
    f = pd.read_csv(RAW_DIR / season / "fixtures.csv")
    return pd.DataFrame({
        "season": season,
        "fixture_id": f["id"],
        "gw": f["event"],
        "kickoff_time": f["kickoff_time"],
        "home_team_id": f["team_h"],
        "away_team_id": f["team_a"],
        "home_score": f["team_h_score"],
        "away_score": f["team_a_score"],
        "home_difficulty": f["team_h_difficulty"],
        "away_difficulty": f["team_a_difficulty"],
        "finished": _bool(f["finished"]),
    })


def clean_player_match(season: str, teams: pd.DataFrame) -> pd.DataFrame:
    g = pd.read_csv(RAW_DIR / season / "merged_gw.csv")
    before = len(g)
    g = g.drop_duplicates()
    dupes = before - len(g)
    if dupes:
        print(f"  dropped {dupes} exact duplicate rows")
    if g.duplicated(["element", "fixture"]).any():
        raise ValueError(f"{season}: conflicting rows for the same player and fixture")

    # FPL only started publishing xG partway through 2022-23 (from GW16). Earlier
    # gameweeks store 0 for every player, which means "not tracked", not "no chances".
    # Store NULL instead so SQL averages and sums skip those weeks.
    xg_cols = ["expected_goals", "expected_assists", "expected_goal_involvements",
               "expected_goals_conceded"]
    untracked = g.groupby("GW")["expected_goals"].transform("sum") == 0
    if untracked.any():
        g.loc[untracked, xg_cols] = np.nan
        gws = sorted(g.loc[untracked, "GW"].unique())
        print(f"  xG not tracked in GW {gws[0]}-{gws[-1]}: stored as NULL")

    team_lookup = dict(zip(teams["name"], teams["team_id"]))
    team_id = g["team"].map(team_lookup)
    if team_id.isna().any():
        raise ValueError(f"{season}: unmapped team names {set(g.loc[team_id.isna(), 'team'])}")

    def col(name):
        return g[name] if name in g.columns else None

    return pd.DataFrame({
        "season": season,
        "player_id": g["element"],
        "fixture_id": g["fixture"],
        "gw": g["GW"],
        "team_id": team_id.astype(int),
        "opponent_team_id": g["opponent_team"],
        "was_home": _bool(g["was_home"]),
        "minutes": g["minutes"],
        "starts": g["starts"],
        "total_points": g["total_points"],
        "goals_scored": g["goals_scored"],
        "assists": g["assists"],
        "clean_sheets": g["clean_sheets"],
        "goals_conceded": g["goals_conceded"],
        "saves": g["saves"],
        "bonus": g["bonus"],
        "bps": g["bps"],
        "yellow_cards": g["yellow_cards"],
        "red_cards": g["red_cards"],
        "expected_goals": g["expected_goals"],
        "expected_assists": g["expected_assists"],
        "expected_goals_conceded": g["expected_goals_conceded"],
        "ict_index": g["ict_index"],
        "influence": g["influence"],
        "creativity": g["creativity"],
        "threat": g["threat"],
        "defensive_contribution": col("defensive_contribution"),
        "price": g["value"] / 10.0,
        "selected_by": g["selected"],
        "transfers_in": g["transfers_in"],
        "transfers_out": g["transfers_out"],
        "fpl_xp": g["xP"],
    })


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript((SQL_DIR / "schema.sql").read_text())
    for season in SEASONS:
        print(f"[load] {season}")
        teams = clean_teams(season)
        tables = {
            "teams": teams,
            "players": clean_players(season),
            "fixtures": clean_fixtures(season),
            "player_match": clean_player_match(season, teams),
        }
        for name, df in tables.items():
            df.to_sql(name, con, if_exists="append", index=False)
            print(f"  {name:<13} {len(df):>6} rows")
    con.executescript((SQL_DIR / "features.sql").read_text())
    con.commit()
    con.close()
    print(f"[load] database written to {DB_PATH}")


if __name__ == "__main__":
    main()
