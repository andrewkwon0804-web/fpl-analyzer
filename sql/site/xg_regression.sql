-- Does finishing above or below xG last? For each finished season with full xG data, compare a
-- player's goals minus xG per 90 in gameweeks 1-19 with the same number in gameweeks 20-38.
-- Players need 900+ minutes in both halves.
WITH halves AS (
    SELECT season, player_id,
           CASE WHEN gw <= 19 THEN 1 ELSE 2 END AS half,
           SUM(goals_scored - expected_goals) * 90.0 / SUM(minutes) AS diff90,
           SUM(minutes) AS minutes
    FROM player_match
    WHERE season IN ('2023-24', '2024-25', '2025-26')
    GROUP BY season, player_id, half
    HAVING SUM(minutes) >= 900
),
paired AS (
    SELECT a.season, a.player_id, a.diff90 AS first_half, b.diff90 AS second_half
    FROM halves a JOIN halves b
      ON b.season = a.season AND b.player_id = a.player_id AND a.half = 1 AND b.half = 2
)
SELECT CASE WHEN first_half >= 0.15 THEN 1 WHEN first_half >= 0.05 THEN 2
            WHEN first_half > -0.05 THEN 3 WHEN first_half > -0.15 THEN 4 ELSE 5 END AS bucket,
       COUNT(*)                         AS players,
       ROUND(AVG(first_half), 3)        AS first_half,
       ROUND(AVG(second_half), 3)       AS second_half
FROM paired
GROUP BY bucket
ORDER BY bucket;
