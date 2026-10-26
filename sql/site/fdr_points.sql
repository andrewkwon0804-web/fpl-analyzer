-- Average points for players who played 60+ minutes, by position and FPL's difficulty rating
-- for that fixture (from the player's side), across finished seasons.
SELECT p.position AS pos,
       CASE WHEN pm.was_home = 1 THEN f.home_difficulty ELSE f.away_difficulty END AS fdr,
       COUNT(*) AS matches,
       ROUND(AVG(pm.total_points), 2) AS points
FROM player_match pm
JOIN players p  ON p.season = pm.season AND p.player_id = pm.player_id
JOIN fixtures f ON f.season = pm.season AND f.fixture_id = pm.fixture_id
WHERE pm.season <> :live AND pm.minutes >= 60 AND p.position IN ('GK', 'DEF', 'MID', 'FWD')
GROUP BY pos, fdr
HAVING COUNT(*) >= 200
ORDER BY pos, fdr;
