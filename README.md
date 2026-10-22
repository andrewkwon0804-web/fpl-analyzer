# FPL Points Lab

**Predicting Fantasy Premier League points with SQL feature engineering and gradient boosting, tested on a season the model never saw.**

Python · SQL (SQLite, window functions, CTEs) · scikit-learn · pytest

> Andrew Kwon, B.S. Information Sciences @ UIUC. Follow-up to my earlier
> [FPL Analyzer](https://github.com/andrewkwon084/fpl-analyzer) (a React app with a hand-tuned value score).

---

## Results at a glance

Trained on 2022-23 and 2023-24, tuned on 2024-25, and scored **once** on the full 2025-26 season (38 gameweeks, ~29k player-gameweeks).

![Model vs baselines](reports/figures/model_vs_baselines.png)

| Method (2025-26 test season) | MAE, regular starters | Captain pick avg pts | Top-15 picks avg pts |
|---|---|---|---|
| **Gradient boosting model** | **2.31** | **6.4** | **4.5** |
| Season average to date | 2.52 | 6.2 | 4.2 |
| Form (last 5 GW average) | 2.71 | 4.1 | 3.8 |
| Perfect hindsight (ceiling) | — | 17.2 | 11.9 |

* The model cuts prediction error by **8%** against the best simple rule and **15%** against "pick by form".
* The model's captain outscores the form rule's captain by **2.3 points per gameweek** before the captaincy doubling, across all 38 gameweeks.
* Only 1 of 38 model captain picks failed to play, against 5 of 38 for the form rule.

## Four findings

**1. Form is mostly noise.** Starters who averaged 9+ points over their last five gameweeks scored 5.3 the next week, almost exactly their season average (5.7), not their form. Picking by recent form is the worst of the strategies tested.

![Form regression](reports/figures/form_regression.png)

**2. Overperforming xG doesn't last.** Players who beat their expected goals by 3+ in a season (average +5.6 goals) were back to +0.0 the following season; 28 of 30 regressed. (`sql/analysis/05_xg_over_under_performers.sql`)

**3. The 2025-26 rule change moved points to defenders.** The new defensive contribution rule lifted defenders from 29% to 35% of all points scored. The model was trained before the rule existed, and it under-predicts starting defenders by 0.5 points per gameweek in 2025-26, the largest bias of any position. Retraining with the new season fixes this going forward.

![Defensive rule change](reports/figures/defcon_rule_change.png)

**4. The dataset's `xP` column leaks the answer.** The open dataset includes an expected-points column. A real pre-match forecast should correlate equally with *this* week's and *next* week's points. The model's features do; `xP` correlates **4x more** with the week it is supposed to predict, so it contains information from the match itself. Adding it to the model makes the scores look better, but that gain isn't real. It is excluded from training and shown only as a reference.

![Leakage check](reports/figures/leakage_check.png)

## What the model uses

![Feature importance](reports/figures/feature_importance.png)

Expected minutes (recent minutes and starts) matter most: a player who doesn't play scores nothing. Fixture difficulty and whether the gameweek is a double come next, then underlying attacking output (xG, xA) and season-long scoring.

## How it works

```
open FPL archive (CSV)                 SQLite: fpl.db
  merged_gw / teams /   ─ ingest.py ─▶  teams, players, fixtures, player_match
  fixtures / players       load_db.py            │
                                                  │ sql/features.sql (window functions)
                                                  ▼
                                    team_form ─▶ player_gw ─▶ player_features
                                                                   │
                         ┌──────────────────────┬──────────────────┼────────────────────┐
                         ▼                      ▼                  ▼                    ▼
                  sql/analysis/*.sql      leakage.py           model.py          export_tableau.py
                  business questions      input audit     time-split training    CSVs for Tableau
```

**Data.** Every player in every match for four seasons (2022-23 to 2025-26): about 113,000 player-match rows from the community-maintained [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) archive of the official FPL API. 2022-23 is the first season with per-match xG.

**Cleaning.** Dropped exact duplicate rows in the 2025-26 export, converted prices from tenths to £m, mapped team names to ids per season, excluded the one-season "assistant manager" chip, and summed double gameweeks into one row per player per gameweek.

**Features (all in SQL).** Rolling 3- and 5-gameweek averages of points, minutes, starts, xG, xA, xGC, bonus and ICT; season-to-date averages; last season's points per game (linked across seasons by FPL's stable `player_code`); opponent attack and defence strength from their last six matches' xG; FPL fixture difficulty, home fixtures, and number of fixtures in the gameweek. Every window ends at `1 PRECEDING`, so features only use information available before the deadline. `tests/test_pipeline.py` recomputes them independently in pandas to check this.

**Model.** `HistGradientBoostingRegressor` (scikit-learn), position as a categorical feature, early stopping. Small hyperparameter grid chosen on the 2024-25 validation season, then refit on 2022-25 and evaluated once on 2025-26.

**Evaluation.** MAE is reported for regular starters (60+ minutes recently) because most rows are bench players with 0 points, which makes every method look good. The decision metrics simulate how an FPL manager would use a forecast: pick a captain and a top 15 each gameweek, then score those picks by what actually happened.

## SQL analysis

Questions answered in `sql/analysis/` (results in `reports/sql_results/`):

| Query | Question |
|---|---|
| `01_value_by_price_band` | Are premium players worth the money? (points per £m by position and price) |
| `02_top_differentials` | Which players under 5% ownership scored the most each season? |
| `03_does_form_persist` | Does a hot streak predict next week? |
| `04_home_away_and_difficulty` | How much do venue and fixture difficulty move points? |
| `05_xg_over_under_performers` | Who beat their xG, and did it last? |
| `06_defcon_rule_change` | Did the 2025-26 rule change shift points between positions? |

Note on query 02: the data stores ownership as a raw count of managers, not a percentage. Every FPL squad has exactly 15 players, so `SUM(selected_by) / 15` for a gameweek recovers the total number of managers, and ownership % follows.

## Repository layout

```
run_pipeline.py          one command to rebuild everything
src/fpl/                 ingest, load_db, run_sql, leakage, model, report, export_tableau
sql/schema.sql           relational schema with keys and constraints
sql/features.sql         feature engineering with window functions
sql/analysis/            standalone analysis queries
sql/tableau_exports.sql  flat views for Tableau
tests/                   pytest checks for duplicates, double gameweeks, and leakage
reports/                 metrics, SQL results, figures
tableau/                 dashboard extracts + build guide
```

## Limitations and next steps

* **No injury news.** The model only sees past matches, not press-conference updates. Joining the live FPL API's `chance_of_playing` flag would be a useful next feature.
* **Rule change bias.** Defenders are under-predicted in 2025-26; adding defensive-contribution features once a second season of that data exists should close the gap.
* **`starts` is incomplete in 2022-23**, because FPL began tracking it mid-season. Minutes-based features carry most of the signal anyway.
* **Squad optimization.** Turning predictions into a full 15-player squad under the £100m budget and three-per-club rule is a linear programming problem (e.g. with PuLP).

---
Data: [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) (MIT). Not affiliated with the Premier League or FPL.
