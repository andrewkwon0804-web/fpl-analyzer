-- Q: How much do venue and FPL's fixture difficulty rating (FDR) move points?
-- Single-fixture gameweeks only, players who started.
SELECT p.position,
       CASE WHEN pm.was_home = 1 THEN 'home' ELSE 'away' END AS venue,
       CASE WHEN pm.was_home = 1 THEN f.home_difficulty ELSE f.away_difficulty END AS fdr,
       COUNT(*)                               AS starts,
       ROUND(AVG(pm.total_points), 2)         AS avg_points,
       ROUND(100.0 * AVG(pm.clean_sheets), 1) AS clean_sheet_pct,
       ROUND(AVG(pm.expected_goals + pm.expected_assists), 3) AS avg_xgi
FROM player_match pm
JOIN players  p ON p.season = pm.season AND p.player_id = pm.player_id
JOIN fixtures f ON f.season = pm.season AND f.fixture_id = pm.fixture_id
WHERE pm.starts = 1 AND p.position <> 'AM'
GROUP BY p.position, venue, fdr
HAVING COUNT(*) >= 100
ORDER BY p.position, venue, fdr;
