-- Flat, Tableau-friendly views. export_tableau.py writes each to tableau/<view>.csv.

DROP VIEW IF EXISTS tableau_player_season;
CREATE VIEW tableau_player_season AS
WITH managers_per_gw AS (
    SELECT season, gw, SUM(selected_by) / 15.0 AS managers FROM player_gw GROUP BY season, gw
)
SELECT g.season, p.player_code, p.web_name AS player, p.position, t.name AS team,
       SUM(g.points)                          AS total_points,
       SUM(g.minutes)                         AS minutes,
       SUM(g.starts)                          AS starts,
       ROUND(SUM(g.xg), 2)                    AS xg,
       ROUND(SUM(g.xa), 2)                    AS xa,
       SUM(pm_goals.goals)                    AS goals,
       SUM(pm_goals.assists)                  AS assists,
       SUM(g.bonus)                           AS bonus,
       ROUND(AVG(g.price), 1)                 AS avg_price,
       MIN(g.price)                           AS start_price,
       MAX(g.price)                           AS peak_price,
       ROUND(SUM(g.points) / AVG(g.price), 2) AS points_per_million,
       ROUND(AVG(100.0 * g.selected_by / m.managers), 2) AS avg_ownership_pct
FROM player_gw g
JOIN players p ON p.season = g.season AND p.player_id = g.player_id
JOIN teams   t ON t.season = p.season AND t.team_id = p.team_id
JOIN managers_per_gw m ON m.season = g.season AND m.gw = g.gw
JOIN (SELECT season, player_id, gw, SUM(goals_scored) AS goals, SUM(assists) AS assists
      FROM player_match GROUP BY season, player_id, gw) pm_goals
  ON pm_goals.season = g.season AND pm_goals.player_id = g.player_id AND pm_goals.gw = g.gw
WHERE p.position <> 'AM'
GROUP BY g.season, g.player_id;

DROP VIEW IF EXISTS tableau_player_gameweek;
CREATE VIEW tableau_player_gameweek AS
SELECT f.season, f.gw, f.web_name AS player, f.position, t.name AS team,
       f.target_points AS points, f.minutes_actual AS minutes,
       f.price, f.fixture_difficulty, f.n_fixtures,
       ROUND(f.points_l5, 2) AS form_last5
FROM player_features f
JOIN players p ON p.season = f.season AND p.player_id = f.player_id
JOIN teams   t ON t.season = p.season AND t.team_id = p.team_id
WHERE f.position <> 'AM' AND f.minutes_actual > 0;

DROP VIEW IF EXISTS tableau_team_season;
CREATE VIEW tableau_team_season AS
SELECT tf.season, t.name AS team, t.short_name,
       COUNT(*)                         AS matches,
       SUM(tf.goals_for)                AS goals_for,
       SUM(tf.goals_against)            AS goals_against,
       ROUND(SUM(tf.xg_for), 1)         AS xg_for,
       ROUND(SUM(tf.xg_against), 1)     AS xg_against,
       ROUND(SUM(tf.goals_for) - SUM(tf.xg_for), 1) AS finishing_vs_xg
FROM team_form tf
JOIN teams t ON t.season = tf.season AND t.team_id = tf.team_id
GROUP BY tf.season, tf.team_id;
