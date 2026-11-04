"""Run the whole project end to end: python run_pipeline.py

python run_pipeline.py --refresh   the weekly update only: new data, live predictions, the
                                   prediction ledger and the site. Skips re-tuning and the
                                   2025-26 held-out evaluation, which don't change week to week.
"""
import argparse
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))
warnings.filterwarnings("ignore", category=UserWarning)

from fpl import (export_research, export_site, export_tableau, ingest, leakage, ledger, live,  # noqa: E402
                 load_db, model, model_team, report, run_sql)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="weekly update only")
    weekly = parser.parse_args().refresh

    ingest.main()              # 1. download raw CSVs (cached) + the live season from the FPL API
    load_db.main()             # 2. clean + load SQLite, build SQL features
    run_sql.main(verbose=False)  # 3. analysis queries -> reports/sql_results/
    if not weekly:
        leakage.main()         # 4. check inputs for target leakage
        model.main()           # 5. train, tune, evaluate on the held-out season
    live.main()                # 5b. score the season in progress; predict the next gameweek
    ledger.main()              # 5c. save picks before the deadline; score saved weeks once played
    model_team.main()          # 5d. the simulated FPL team the model manages
    if not weekly:
        report.main()          # 6. charts for the README
    export_tableau.main()      # 7. CSV extracts for Tableau Public
    export_site.main()         # 8. data file for the website in docs/
    if not weekly:
        export_research.main()  # 9. model report data and the SQL lab database
