-- Points per £m by position and price tier, finished seasons.
-- One row per player-season with at least 900 minutes (about 10 full games).
WITH season_totals AS (
    SELECT pm.season, pm.player_id, p.position,
           SUM(pm.total_points) AS points,
           SUM(pm.minutes)      AS minutes,
           AVG(pm.price)        AS price
    FROM player_match pm
    JOIN players p ON p.season = pm.season AND p.player_id = pm.player_id
    WHERE pm.season <> :live AND p.position IN ('GK', 'DEF', 'MID', 'FWD')
    GROUP BY pm.season, pm.player_id, p.position
    HAVING SUM(pm.minutes) >= 900
)
SELECT position,
       CASE WHEN price < 5    THEN 1 WHEN price < 6.5  THEN 2
            WHEN price < 8.5  THEN 3 WHEN price < 10.5 THEN 4 ELSE 5 END AS tier,
       COUNT(*)                          AS players,
       ROUND(AVG(points / price), 2)     AS points_per_m,
       ROUND(AVG(points * 90.0 / minutes), 2) AS points_per_90
FROM season_totals
GROUP BY position, tier
ORDER BY position, tier;
