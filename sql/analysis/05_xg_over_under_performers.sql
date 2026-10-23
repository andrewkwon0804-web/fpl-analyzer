-- Q: Who scored far more (or fewer) goals than their chances deserved?
-- Big gaps between goals and xG tend to shrink the next season, which makes
-- this a useful "buy low / sell high" signal.
WITH season_xg AS (
    SELECT pm.season, p.player_code, p.web_name, p.position,
           SUM(pm.goals_scored)   AS goals,
           SUM(pm.expected_goals) AS xg,
           SUM(pm.minutes)        AS minutes
    FROM player_match pm
    JOIN players p ON p.season = pm.season AND p.player_id = pm.player_id
    -- 2022-23 is excluded: xG was only tracked from GW16 that season, so a
    -- full season of goals would be compared with half a season of xG.
    WHERE pm.season <> '2022-23'
    GROUP BY pm.season, p.player_code
    HAVING SUM(pm.expected_goals) >= 5
),
with_next AS (
    SELECT a.*,
           b.goals - b.xg AS next_season_gap,
           b.season       AS next_season
    FROM season_xg a
    LEFT JOIN season_xg b
      ON b.player_code = a.player_code
     AND b.season = CASE a.season WHEN '2022-23' THEN '2023-24'
                                  WHEN '2023-24' THEN '2024-25'
                                  WHEN '2024-25' THEN '2025-26' END
)
SELECT season, web_name, position, goals,
       ROUND(xg, 1)              AS xg,
       ROUND(goals - xg, 1)      AS goals_minus_xg,
       ROUND(next_season_gap, 1) AS next_season_goals_minus_xg,
       RANK() OVER (PARTITION BY season ORDER BY goals - xg DESC) AS overperf_rank
FROM with_next
ORDER BY season, goals_minus_xg DESC;
