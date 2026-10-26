-- Each team's next five gameweeks: opponent, home or away, and FPL's difficulty rating.
WITH sides AS (
    SELECT f.gw, f.home_team_id AS team_id, f.away_team_id AS opp_id, 1 AS home, f.home_difficulty AS fdr
    FROM fixtures f WHERE f.season = :live AND f.finished = 0
    UNION ALL
    SELECT f.gw, f.away_team_id, f.home_team_id, 0, f.away_difficulty
    FROM fixtures f WHERE f.season = :live AND f.finished = 0
)
SELECT t.short_name AS team, s.gw, o.short_name AS opp, s.home, s.fdr
FROM sides s
JOIN teams t ON t.season = :live AND t.team_id = s.team_id
JOIN teams o ON o.season = :live AND o.team_id = s.opp_id
WHERE s.gw BETWEEN :gw AND :gw + 4
ORDER BY t.short_name, s.gw;
