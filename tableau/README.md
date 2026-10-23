# Tableau dashboards

`FPL Points Lab.twbx` is a packaged Tableau workbook with three dashboards. It carries its own data,
so it opens in Tableau Desktop or Tableau Public with nothing else installed.

| Dashboard | Question it answers |
|---|---|
| **Model scorecard** | Does the model beat simple rules? Season-long points race between the model, season average and recent form; the model's edge with 95% bootstrap ranges; bias by position. |
| **Value finder** | Who gave the most points for the money? Price vs points for every player with 900+ minutes, plus the top scorers owned by under 5% of managers. Season selector. |
| **Team attack vs defence** | Which teams create more than they concede? xG for vs xG against per match, with the y axis flipped so top right is best. Season selector. |

## How it's built

The workbook is generated from code by `build_workbook.py`, so it can be rebuilt whenever the data
changes and every color and font choice lives in one place. It uses the same palette as the web
app and README charts: blue for the model, grey and orange for the two baselines.

```bash
python run_pipeline.py            # refreshes the CSV extracts in this folder
python tableau/build_workbook.py  # rebuilds FPL Points Lab.twbx from them
```

## Data files

| File | Grain | Used by |
|---|---|---|
| `weekly_xi_points.csv` | method × gameweek | Model scorecard |
| `model_edges.csv` | metric × baseline, with bootstrap range | Model scorecard |
| `model_bias_by_position.csv` | position | Model scorecard |
| `player_season.csv` | player × season | Value finder |
| `differentials.csv` | top low-owned scorers per season | Value finder |
| `team_season.csv` | team × season | Team attack vs defence |
| `model_predictions_2025_26.csv` | player × gameweek, test season | web app |
| `player_gameweek.csv` | player × gameweek played | extra exploration |

## Publish to Tableau Public

1. Open `FPL Points Lab.twbx` in Tableau.
2. **File → Save to Tableau Public**, sign in, and keep the name *FPL Points Lab*.
3. On the Tableau Public page, open the workbook settings and turn on **Show workbook sheets as tabs**
   so visitors can switch between the three dashboards.
4. Copy the link into the main README.
