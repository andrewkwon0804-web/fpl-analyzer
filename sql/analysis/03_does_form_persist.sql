-- Q: Is "form" real? If a player averaged X points over his last 5 gameweeks,
-- what does he actually score next? Compared with what his season-long average predicts.
-- Restricted to regular starters so we measure form, not rotation.
SELECT CASE WHEN points_l5 < 2 THEN '1: under 2'
            WHEN points_l5 < 4 THEN '2: 2-4'
            WHEN points_l5 < 6 THEN '3: 4-6'
            WHEN points_l5 < 8 THEN '4: 6-8'
            ELSE '5: 8+' END                    AS last5_avg_band,
       COUNT(*)                                 AS player_gameweeks,
       ROUND(AVG(points_l5), 2)                 AS avg_last5,
       ROUND(AVG(points_std), 2)                AS avg_season_to_date,
       ROUND(AVG(target_points), 2)             AS avg_next_gw_points
FROM player_features
WHERE gws_so_far >= 8
  AND starts_l5 >= 0.8
  AND position <> 'AM'
GROUP BY last5_avg_band
ORDER BY last5_avg_band;
