-- Q: Did the 2025-26 "defensive contribution" scoring rule change which positions score?
-- Share of all FPL points earned by each position, per season (starters only).
WITH by_pos AS (
    SELECT pm.season, p.position,
           SUM(pm.total_points) AS points,
           SUM(pm.minutes)      AS minutes
    FROM player_match pm
    JOIN players p ON p.season = pm.season AND p.player_id = pm.player_id
    WHERE p.position <> 'AM'
    GROUP BY pm.season, p.position
)
SELECT season, position,
       points,
       ROUND(100.0 * points / SUM(points) OVER (PARTITION BY season), 1) AS share_of_points_pct,
       ROUND(90.0 * points / minutes, 2)                                AS points_per_90
FROM by_pos
ORDER BY position, season;
