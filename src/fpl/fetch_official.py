"""Step 1b: pull the season in progress straight from the official FPL API.

The open archive used for past seasons can lag the real season by a week or more, so
the live season comes from fantasy.premierleague.com instead. The output has the same
four files and columns as the archive, so the rest of the pipeline doesn't change.

Only gameweeks that FPL has marked finished are written, so a half-played gameweek
never shows up as if it were complete.

Run on its own:  python src/fpl/fetch_official.py
Uses only the standard library, so it works with any Python 3.
"""
import csv
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fpl.config import LIVE_SEASON, RAW_DIR  # noqa: E402

API = "https://fantasy.premierleague.com/api"
HEADERS = {"User-Agent": "fpl-points-lab (github.com/andrewkwon0804-web/fpl-analyzer)"}
POSITIONS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD", 5: "AM"}
SOURCE_FILE = "SOURCE"  # records where the cached live-season files came from

TEAM_COLS = ["id", "name", "short_name", "strength", "strength_attack_home", "strength_attack_away",
             "strength_defence_home", "strength_defence_away"]
PLAYER_COLS = ["id", "code", "web_name", "first_name", "second_name", "element_type", "team",
               "now_cost", "chance_of_playing_next_round", "news"]
FIXTURE_COLS = ["id", "event", "kickoff_time", "team_h", "team_a", "team_h_score", "team_a_score",
                "team_h_difficulty", "team_a_difficulty", "finished"]
GW_COLS = ["name", "position", "team", "xP", "assists", "bonus", "bps", "clean_sheets", "creativity",
           "element", "expected_assists", "expected_goal_involvements", "expected_goals",
           "expected_goals_conceded", "fixture", "goals_conceded", "goals_scored", "ict_index",
           "influence", "kickoff_time", "minutes", "modified", "opponent_team", "own_goals",
           "penalties_missed", "penalties_saved", "red_cards", "round", "saves", "selected", "starts",
           "team_a_score", "team_h_score", "threat", "total_points", "transfers_balance",
           "transfers_in", "transfers_out", "value", "was_home", "yellow_cards",
           "clearances_blocks_interceptions", "defensive_contribution", "recoveries", "tackles", "GW"]


def get(path: str, retries: int = 3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{API}/{path}", headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except OSError:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def write_csv(path: Path, rows: list, cols: list) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main() -> dict:
    out = RAW_DIR / LIVE_SEASON
    out.mkdir(parents=True, exist_ok=True)

    boot = get("bootstrap-static/")
    fixtures = get("fixtures/")
    finished_gws = {e["id"] for e in boot["events"] if e["finished"]}
    teams = {t["id"]: t["name"] for t in boot["teams"]}
    players = boot["elements"]
    print(f"[official] {len(players)} players, finished gameweeks: "
          f"{min(finished_gws, default=0)}-{max(finished_gws, default=0)}")

    # One request per player for his match-by-match history. A small thread pool keeps
    # this to a minute or two without hammering the API.
    with ThreadPoolExecutor(max_workers=8) as pool:
        histories = list(pool.map(lambda p: get(f"element-summary/{p['id']}/")["history"], players))

    fixture_by_id = {f["id"]: f for f in fixtures}
    gw_rows = []
    for p, history in zip(players, histories):
        for h in history:
            if h["round"] not in finished_gws:
                continue
            fx = fixture_by_id[h["fixture"]]
            gw_rows.append({
                **h,
                "name": f"{p['first_name']} {p['second_name']}".strip(),
                "position": POSITIONS[p["element_type"]],
                "team": teams[fx["team_h"] if h["was_home"] else fx["team_a"]],
                "xP": "",  # FPL's own estimate isn't kept per past gameweek by the API
                "GW": h["round"],
            })

    write_csv(out / "teams.csv", boot["teams"], TEAM_COLS)
    write_csv(out / "players_raw.csv", players, PLAYER_COLS)
    write_csv(out / "fixtures.csv", fixtures, FIXTURE_COLS)
    write_csv(out / "merged_gw.csv", gw_rows, GW_COLS)
    # Gameweek summaries: FPL's average and highest manager score, used for context on the site.
    write_csv(out / "events.csv", boot["events"], ["id", "finished", "average_entry_score", "highest_score"])
    stamp = {"source": "official FPL API", "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "last_finished_gw": max(finished_gws, default=None)}
    (out / SOURCE_FILE).write_text(json.dumps(stamp))
    print(f"[official] wrote {len(gw_rows)} player-match rows to {out}")
    return stamp


if __name__ == "__main__":
    main()
