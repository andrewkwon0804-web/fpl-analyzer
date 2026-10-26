-- Features for the NEXT, not-yet-played gameweek of the live season.
--
-- features.sql builds features for gameweeks that already happened, each using only
-- earlier gameweeks. This file builds the same features "as of now" for the
-- upcoming gameweek, so the trained model can make live picks.
-- tests/test_pipeline.py replays the season (hides a played gameweek, rebuilds this
-- table) and checks these features match what features.sql built for that week.

DROP TABLE IF EXISTS player_upcoming;

CREATE TABLE player_upcoming AS
WITH live AS (          -- the season that still has unplayed fixtures
    SELECT season FROM fixtures WHERE finished = 0
    GROUP BY season ORDER BY season DESC LIMIT 1
),
last_played AS (
    SELECT MAX(g.gw) AS gw FROM player_gw g JOIN live USING (season)
),
next_gw AS (            -- first unplayed gameweek after the last played one (skips postponements)
    SELECT f.season, MIN(f.gw) AS gw
    FROM fixtures f JOIN live USING (season)
    WHERE f.finished = 0 AND f.gw > COALESCE((SELECT gw FROM last_played), 0)
    GROUP BY f.season
),
team_fixture AS (       -- both sides of every fixture in that gameweek
    SELECT f.season, f.gw, f.home_team_id AS team_id, f.away_team_id AS opp_id,
           1 AS home, f.home_difficulty AS fdr
    FROM fixtures f JOIN next_gw n ON n.season = f.season AND n.gw = f.gw
    UNION ALL
    SELECT f.season, f.gw, f.away_team_id, f.home_team_id, 0, f.away_difficulty
    FROM fixtures f JOIN next_gw n ON n.season = f.season AND n.gw = f.gw
),
team_recent AS (        -- each team's last 6 finished matches (same window as team_form)
    SELECT season, team_id, AVG(xg_for) AS xg_for_l6, AVG(xg_against) AS xg_against_l6
    FROM (
        SELECT tf.season, tf.team_id, tf.xg_for, tf.xg_against,
               ROW_NUMBER() OVER (PARTITION BY tf.season, tf.team_id ORDER BY tf.kickoff_time DESC) AS rn
        FROM team_form tf JOIN live USING (season)
    )
    WHERE rn <= 6
    GROUP BY season, team_id
),
team_season AS (        -- each team's whole season so far (same as the _std columns in team_form)
    SELECT tf.season, tf.team_id, AVG(tf.xg_for) AS xg_for_std, AVG(tf.xg_against) AS xg_against_std,
           AVG(CASE WHEN tf.goals_against = 0 THEN 1.0 ELSE 0.0 END) AS clean_sheet_rate_std
    FROM team_form tf JOIN live USING (season)
    GROUP BY tf.season, tf.team_id
),
fixture_ctx AS (        -- per team: double gameweeks have two fixtures, blank ones have none
    SELECT tfx.season, tfx.team_id,
           COUNT(*)             AS n_fixtures,
           SUM(tfx.home)        AS home_fixtures,
           AVG(tfx.fdr)         AS fixture_difficulty,
           AVG(opp.xg_for_l6)   AS opp_attack_xg_l6,
           AVG(opp.xg_against_l6) AS opp_defence_xga_l6,
           AVG(own.xg_for_l6)   AS team_attack_xg_l6,
           AVG(owns.xg_for_std) AS team_attack_xg_std,
           AVG(owns.xg_against_std) AS team_defence_xga_std,
           AVG(owns.clean_sheet_rate_std) AS team_cs_rate_std,
           AVG(opps.xg_for_std) AS opp_attack_xg_std,
           AVG(opps.xg_against_std) AS opp_defence_xga_std
    FROM team_fixture tfx
    LEFT JOIN team_recent opp ON opp.season = tfx.season AND opp.team_id = tfx.opp_id
    LEFT JOIN team_recent own ON own.season = tfx.season AND own.team_id = tfx.team_id
    LEFT JOIN team_season opps ON opps.season = tfx.season AND opps.team_id = tfx.opp_id
    LEFT JOIN team_season owns ON owns.season = tfx.season AND owns.team_id = tfx.team_id
    GROUP BY tfx.season, tfx.team_id
),
history AS (            -- every played gameweek of the live season, newest first
    SELECT g.*,
           ROW_NUMBER() OVER (PARTITION BY g.season, g.player_id ORDER BY g.gw DESC) AS rn,
           COUNT(*)     OVER (PARTITION BY g.season, g.player_id)                    AS n_rows
    FROM player_gw g JOIN live USING (season)
),
form AS (               -- same averages as features.sql, over the most recent rows
    SELECT season, player_id,
           AVG(CASE WHEN rn <= 3 THEN points  END) AS points_l3,
           AVG(CASE WHEN rn <= 5 THEN points  END) AS points_l5,
           AVG(CASE WHEN rn <= 3 THEN minutes END) AS minutes_l3,
           AVG(CASE WHEN rn <= 5 THEN minutes END) AS minutes_l5,
           AVG(CASE WHEN rn <= 5 THEN starts  END) AS starts_l5,
           AVG(CASE WHEN rn <= 5 THEN xg      END) AS xg_l5,
           AVG(CASE WHEN rn <= 5 THEN xa      END) AS xa_l5,
           AVG(CASE WHEN rn <= 5 THEN xgc     END) AS xgc_l5,
           AVG(CASE WHEN rn <= 5 THEN bonus   END) AS bonus_l5,
           AVG(CASE WHEN rn <= 5 THEN bps     END) AS bps_l5,
           AVG(CASE WHEN rn <= 5 THEN ict     END) AS ict_l5,
           AVG(CASE WHEN rn <= 5 THEN defcon  END) AS defcon_l5,
           AVG(defcon)  AS defcon_std,
           AVG(bonus)   AS bonus_std,
           AVG(starts)  AS starts_std,
           90.0 * SUM(points) / NULLIF(SUM(minutes), 0) AS points_p90_std,
           90.0 * SUM(xg + xa) / NULLIF(SUM(CASE WHEN xg IS NOT NULL THEN minutes END), 0) AS xgi_p90_std,
           AVG(points)  AS points_std,
           AVG(minutes) AS minutes_std,
           SUM(xg + xa) AS xgi_total_std,
           COUNT(*)     AS gws_so_far,
           MAX(CASE WHEN rn = 1 THEN selected_by END) AS selected_by_prev,
           MAX(CASE WHEN rn = n_rows THEN price END)  AS first_price
    FROM history
    GROUP BY season, player_id
),
prior_season AS (       -- identical to features.sql
    SELECT p.player_code,
           CASE s.season WHEN '2022-23' THEN '2023-24'
                         WHEN '2023-24' THEN '2024-25'
                         WHEN '2024-25' THEN '2025-26'
                         WHEN '2025-26' THEN '2026-27'
                         WHEN '2026-27' THEN '2027-28' END AS next_season,
           1.0 * SUM(s.points) / NULLIF(SUM(CASE WHEN s.minutes > 0 THEN 1 ELSE 0 END), 0) AS prev_ppg,
           SUM(s.minutes) AS prev_minutes
    FROM player_gw s
    JOIN players p ON p.season = s.season AND p.player_id = s.player_id
    GROUP BY p.player_code, s.season
)
SELECT p.season, p.player_id, n.gw,
       p.web_name, p.position, t.name AS team, t.short_name AS team_short,
       fc.n_fixtures, fc.home_fixtures, fc.fixture_difficulty,
       fc.opp_attack_xg_l6, fc.opp_defence_xga_l6, fc.team_attack_xg_l6,
       fc.team_attack_xg_std, fc.team_defence_xga_std, fc.team_cs_rate_std,
       fc.opp_attack_xg_std, fc.opp_defence_xga_std,
       p.now_cost AS price,
       p.now_cost - COALESCE(f.first_price, p.now_cost) AS price_change_season,
       f.selected_by_prev,
       f.points_l3, f.points_l5, f.minutes_l3, f.minutes_l5, f.starts_l5,
       f.xg_l5, f.xa_l5, f.xgc_l5, f.bonus_l5, f.bps_l5, f.ict_l5, f.defcon_l5,
       f.defcon_std, f.bonus_std, f.starts_std, f.points_p90_std, f.xgi_p90_std,
       f.points_std, f.minutes_std, f.xgi_total_std,
       COALESCE(f.gws_so_far, 0) AS gws_so_far,
       ps.prev_ppg, ps.prev_minutes,
       p.chance_of_playing, p.news
FROM players p
JOIN live USING (season)
JOIN next_gw n ON n.season = p.season
JOIN fixture_ctx fc ON fc.season = p.season AND fc.team_id = p.team_id   -- no fixture, no row
JOIN teams t ON t.season = p.season AND t.team_id = p.team_id
LEFT JOIN form f ON f.season = p.season AND f.player_id = p.player_id
LEFT JOIN prior_season ps ON ps.player_code = p.player_code AND ps.next_season = p.season
WHERE p.position <> 'AM';
