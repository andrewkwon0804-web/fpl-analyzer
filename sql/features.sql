-- Feature engineering in SQL.
-- Every rolling window ends at "1 PRECEDING", so a gameweek's features only use
-- information available BEFORE that gameweek's deadline (no target leakage).
-- tests/test_features.py checks this property directly.

DROP TABLE IF EXISTS team_form;
DROP TABLE IF EXISTS player_gw;
DROP TABLE IF EXISTS player_features;

-- 1. Team results per match, built from both sides of each fixture ----------
CREATE TABLE team_form AS
WITH team_xg AS (
    SELECT season, fixture_id, team_id, SUM(expected_goals) AS xg
    FROM player_match
    GROUP BY season, fixture_id, team_id
),
team_match AS (
    SELECT f.season, f.fixture_id, f.kickoff_time,
           f.home_team_id AS team_id, f.away_team_id AS opponent_id,
           f.home_score AS goals_for, f.away_score AS goals_against
    FROM fixtures f WHERE f.finished = 1
    UNION ALL
    SELECT f.season, f.fixture_id, f.kickoff_time,
           f.away_team_id, f.home_team_id,
           f.away_score, f.home_score
    FROM fixtures f WHERE f.finished = 1
)
SELECT tm.season, tm.fixture_id, tm.team_id, tm.kickoff_time,
       tm.goals_for, tm.goals_against,
       x_for.xg AS xg_for, x_against.xg AS xg_against,
       -- form over the previous 6 matches, excluding this one
       AVG(x_for.xg)      OVER w AS xg_for_l6,
       AVG(x_against.xg)  OVER w AS xg_against_l6,
       AVG(tm.goals_for)  OVER w AS goals_for_l6,
       AVG(tm.goals_against) OVER w AS goals_against_l6
FROM team_match tm
LEFT JOIN team_xg x_for
       ON x_for.season = tm.season AND x_for.fixture_id = tm.fixture_id AND x_for.team_id = tm.team_id
LEFT JOIN team_xg x_against
       ON x_against.season = tm.season AND x_against.fixture_id = tm.fixture_id AND x_against.team_id = tm.opponent_id
WINDOW w AS (PARTITION BY tm.season, tm.team_id ORDER BY tm.kickoff_time
             ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING);

CREATE INDEX idx_tf ON team_form (season, fixture_id, team_id);

-- 2. One row per player per gameweek (double gameweeks are summed) ----------
CREATE TABLE player_gw AS
SELECT pm.season, pm.player_id, pm.gw,
       COUNT(*)                       AS n_fixtures,
       SUM(pm.was_home)               AS home_fixtures,
       SUM(pm.total_points)           AS points,
       SUM(pm.minutes)                AS minutes,
       SUM(pm.starts)                 AS starts,
       SUM(pm.expected_goals)         AS xg,
       SUM(pm.expected_assists)       AS xa,
       SUM(pm.expected_goals_conceded) AS xgc,
       SUM(pm.bonus)                  AS bonus,
       SUM(pm.bps)                    AS bps,
       SUM(pm.ict_index)              AS ict,
       SUM(pm.defensive_contribution) AS defcon,
       MAX(pm.price)                  AS price,
       MAX(pm.selected_by)            AS selected_by,
       SUM(pm.fpl_xp)                 AS fpl_xp,
       AVG(CASE WHEN pm.was_home = 1 THEN f.home_difficulty ELSE f.away_difficulty END) AS fixture_difficulty,
       AVG(opp.xg_for_l6)             AS opp_attack_xg_l6,   -- threat to clean sheets
       AVG(opp.xg_against_l6)         AS opp_defence_xga_l6, -- how leaky the opponent is
       AVG(own.xg_for_l6)             AS team_attack_xg_l6
FROM player_match pm
JOIN fixtures f
  ON f.season = pm.season AND f.fixture_id = pm.fixture_id
LEFT JOIN team_form opp
  ON opp.season = pm.season AND opp.fixture_id = pm.fixture_id AND opp.team_id = pm.opponent_team_id
LEFT JOIN team_form own
  ON own.season = pm.season AND own.fixture_id = pm.fixture_id AND own.team_id = pm.team_id
GROUP BY pm.season, pm.player_id, pm.gw;

CREATE INDEX idx_pgw ON player_gw (season, player_id, gw);

-- 3. Model-ready features ----------------------------------------------------
CREATE TABLE player_features AS
WITH prior_season AS (
    -- last season's points per appearance, linked by the stable player_code
    SELECT p.player_code,
           CASE s.season WHEN '2022-23' THEN '2023-24'
                         WHEN '2023-24' THEN '2024-25'
                         WHEN '2024-25' THEN '2025-26'
                         WHEN '2025-26' THEN '2026-27' END AS next_season,
           1.0 * SUM(s.points) / NULLIF(SUM(CASE WHEN s.minutes > 0 THEN 1 ELSE 0 END), 0) AS prev_ppg,
           SUM(s.minutes) AS prev_minutes
    FROM player_gw s
    JOIN players p ON p.season = s.season AND p.player_id = s.player_id
    GROUP BY p.player_code, s.season
)
SELECT g.season, g.player_id, g.gw,
       p.web_name, p.position,
       -- fixture context (known before the deadline)
       g.n_fixtures, g.home_fixtures, g.fixture_difficulty,
       g.opp_attack_xg_l6, g.opp_defence_xga_l6, g.team_attack_xg_l6,
       g.price,
       g.price - FIRST_VALUE(g.price) OVER season_w AS price_change_season,
       LAG(g.selected_by) OVER season_w             AS selected_by_prev,
       -- recent form (previous gameweeks only)
       AVG(g.points)  OVER l3 AS points_l3,
       AVG(g.points)  OVER l5 AS points_l5,
       AVG(g.minutes) OVER l3 AS minutes_l3,
       AVG(g.minutes) OVER l5 AS minutes_l5,
       AVG(g.starts)  OVER l5 AS starts_l5,
       AVG(g.xg)      OVER l5 AS xg_l5,
       AVG(g.xa)      OVER l5 AS xa_l5,
       AVG(g.xgc)     OVER l5 AS xgc_l5,
       AVG(g.bonus)   OVER l5 AS bonus_l5,
       AVG(g.bps)     OVER l5 AS bps_l5,
       AVG(g.ict)     OVER l5 AS ict_l5,
       -- season to date (previous gameweeks only)
       AVG(g.points)  OVER std AS points_std,
       AVG(g.minutes) OVER std AS minutes_std,
       SUM(g.xg + g.xa) OVER std AS xgi_total_std,
       COUNT(*)       OVER std AS gws_so_far,
       ps.prev_ppg, ps.prev_minutes,
       -- baseline and target
       g.fpl_xp,
       g.minutes AS minutes_actual,
       g.points  AS target_points
FROM player_gw g
JOIN players p ON p.season = g.season AND p.player_id = g.player_id
LEFT JOIN prior_season ps ON ps.player_code = p.player_code AND ps.next_season = g.season
WINDOW season_w AS (PARTITION BY g.season, g.player_id ORDER BY g.gw),
       l3  AS (PARTITION BY g.season, g.player_id ORDER BY g.gw ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING),
       l5  AS (PARTITION BY g.season, g.player_id ORDER BY g.gw ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING),
       std AS (PARTITION BY g.season, g.player_id ORDER BY g.gw ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING);

CREATE INDEX idx_pf ON player_features (season, gw);
