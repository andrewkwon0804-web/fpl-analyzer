"""Project-wide paths and settings."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "fpl.db"
SQL_DIR = ROOT / "sql"
REPORTS_DIR = ROOT / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"
TABLEAU_DIR = ROOT / "tableau"

# Open FPL archive maintained by Vaastav Anand (github.com/vaastav/Fantasy-Premier-League)
SOURCE_BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"

# 2022-23 is the first season FPL published expected goals (xG/xA) per match.
SEASONS = ["2022-23", "2023-24", "2024-25", "2025-26"]

# Time-based split: never train on the future.
TRAIN_SEASONS = ["2022-23", "2023-24"]
VALID_SEASON = "2024-25"
TEST_SEASON = "2025-26"

RAW_FILES = {
    "gws": "gws/merged_gw.csv",
    "teams": "teams.csv",
    "fixtures": "fixtures.csv",
    "players": "players_raw.csv",
}
