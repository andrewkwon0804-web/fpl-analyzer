"""Run the whole project end to end: python run_pipeline.py"""
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))
warnings.filterwarnings("ignore", category=UserWarning)

from fpl import export_research, export_site, export_tableau, ingest, model_team, leakage, live, load_db, model, report, run_sql  # noqa: E402

if __name__ == "__main__":
    ingest.main()          # 1. download raw CSVs (cached)
    load_db.main()         # 2. clean + load SQLite, build SQL features
    run_sql.main(verbose=False)  # 3. analysis queries -> reports/sql_results/
    leakage.main()         # 4. check inputs for target leakage
    model.main()           # 5. train, tune, evaluate on the held-out season
    live.main()            # 5b. score the season in progress; predict the next gameweek
    model_team.main()      # 5c. the simulated FPL team the model manages
    report.main()          # 6. charts for the README
    export_tableau.main()  # 7. CSV extracts for Tableau Public
    export_site.main()     # 8. data file for the website in docs/
    export_research.main() # 9. model report data and the SQL lab database
