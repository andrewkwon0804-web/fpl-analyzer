-- Q: Which low-owned players returned the most points each season?
--
-- The data gives ownership as a raw count of managers, not a percentage.
-- Every FPL squad holds exactly 15 players, so for any gameweek:
--     total managers ~= SUM(selected_by over all players) / 15
-- which lets us turn counts into ownership %.
WITH managers_per_gw AS (
    SELECT season, gw, SUM(selected_by) / 15.0 AS managers
    FROM player_gw
    GROUP BY season, gw
),
ownership AS (
    SELECT g.season, g.player_id, g.points, g.price,
           100.0 * g.selected_by / m.managers AS ownership_pct
    FROM player_gw g
    JOIN managers_per_gw m ON m.season = g.season AND m.gw = g.gw
),
totals AS (
    SELECT o.season, p.web_name, p.position,
           SUM(o.points)        AS points,
           AVG(o.price)         AS avg_price,
           AVG(o.ownership_pct) AS avg_ownership_pct
    FROM ownership o
    JOIN players p ON p.season = o.season AND p.player_id = o.player_id
    GROUP BY o.season, o.player_id
),
ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY season ORDER BY points DESC) AS rn
    FROM totals
    WHERE avg_ownership_pct < 5.0
)
SELECT season, web_name, position, points,
       ROUND(avg_price, 1)         AS avg_price,
       ROUND(avg_ownership_pct, 1) AS avg_ownership_pct
FROM ranked
WHERE rn <= 5
ORDER BY season, points DESC;
