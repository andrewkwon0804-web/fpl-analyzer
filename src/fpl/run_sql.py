"""Run every query in sql/analysis/ and save the results to reports/sql_results/."""
import sqlite3

import pandas as pd

from fpl.config import DB_PATH, REPORTS_DIR, SQL_DIR


def main(verbose: bool = True) -> dict[str, pd.DataFrame]:
    out_dir = REPORTS_DIR / "sql_results"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    with sqlite3.connect(DB_PATH) as con:
        for path in sorted((SQL_DIR / "analysis").glob("*.sql")):
            df = pd.read_sql(path.read_text(), con)
            df.to_csv(out_dir / f"{path.stem}.csv", index=False)
            results[path.stem] = df
            if verbose:
                print(f"\n=== {path.stem} ({len(df)} rows) ===")
                print(df.head(20).to_string(index=False))
    return results


if __name__ == "__main__":
    main()
