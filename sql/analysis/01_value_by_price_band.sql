-- Q: Are premium players worth the money? Points per £m by position and price band.
-- Only counts players who played meaningful minutes (900+ in the season).
WITH season_totals AS (
    SELECT g.season, g.player_id, p.position,
           SUM(g.points)  AS points,
           SUM(g.minutes) AS minutes,
           AVG(g.price)   AS avg_price
    FROM player_gw g
    JOIN players p ON p.season = g.season AND p.player_id = g.player_id
    WHERE p.position <> 'AM'
    GROUP BY g.season, g.player_id, p.position
    HAVING SUM(g.minutes) >= 900
)
SELECT position,
       CASE WHEN avg_price < 5.0 THEN '1: under 5.0'
            WHEN avg_price < 6.5 THEN '2: 5.0-6.4'
            WHEN avg_price < 8.5 THEN '3: 6.5-8.4'
            ELSE '4: 8.5+' END                         AS price_band,
       COUNT(*)                                        AS player_seasons,
       ROUND(AVG(points), 1)                           AS avg_season_points,
       ROUND(AVG(points / avg_price), 2)               AS points_per_million,
       ROUND(AVG(90.0 * points / minutes), 2)          AS points_per_90
FROM season_totals
GROUP BY position, price_band
ORDER BY position, price_band;
