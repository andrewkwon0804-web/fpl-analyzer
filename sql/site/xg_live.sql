-- Goals minus expected goals this season, for players with real chances (xG of 1.5 or more, or 3+ goals).
SELECT p.web_name AS name, p.position AS pos, t.short_name AS team,
       SUM(pm.goals_scored) AS goals, ROUND(SUM(pm.expected_goals), 2) AS xg,
       ROUND(SUM(pm.goals_scored) - SUM(pm.expected_goals), 2) AS diff
FROM player_match pm
JOIN players p ON p.season = pm.season AND p.player_id = pm.player_id
JOIN teams t   ON t.season = p.season AND t.team_id = p.team_id
WHERE pm.season = :live
GROUP BY pm.player_id
HAVING SUM(pm.expected_goals) >= 1.5 OR SUM(pm.goals_scored) >= 3;
