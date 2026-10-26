-- Every player this season with at least 180 minutes: points so far against current price.
SELECT p.web_name AS name, p.position AS pos, t.short_name AS team, p.now_cost AS price,
       SUM(pm.total_points) AS points, SUM(pm.minutes) AS minutes
FROM player_match pm
JOIN players p ON p.season = pm.season AND p.player_id = pm.player_id
JOIN teams t   ON t.season = p.season AND t.team_id = p.team_id
WHERE pm.season = :live AND p.position IN ('GK', 'DEF', 'MID', 'FWD')
GROUP BY pm.player_id
HAVING SUM(pm.minutes) >= 180;
