-- Following the crowd. Each gameweek, rank players by transfers in, transfers out and ownership,
-- then compare what each group scored that week. Only players who played count.
WITH ranked AS (
    SELECT season, gw, total_points, minutes,
           RANK() OVER (PARTITION BY season, gw ORDER BY transfers_in DESC)  AS in_rank,
           RANK() OVER (PARTITION BY season, gw ORDER BY transfers_out DESC) AS out_rank,
           RANK() OVER (PARTITION BY season, gw ORDER BY selected_by DESC)   AS own_rank
    FROM player_match
    WHERE minutes > 0
)
SELECT 'Top 10 transferred in' AS grp, ROUND(AVG(total_points), 2) AS points, COUNT(*) AS n FROM ranked WHERE in_rank <= 10
UNION ALL SELECT 'Top 10 transferred out', ROUND(AVG(total_points), 2), COUNT(*) FROM ranked WHERE out_rank <= 10
UNION ALL SELECT 'Top 10 most owned', ROUND(AVG(total_points), 2), COUNT(*) FROM ranked WHERE own_rank <= 10
UNION ALL SELECT 'Owned 11th-50th', ROUND(AVG(total_points), 2), COUNT(*) FROM ranked WHERE own_rank BETWEEN 11 AND 50
UNION ALL SELECT 'Everyone else who played', ROUND(AVG(total_points), 2), COUNT(*) FROM ranked WHERE own_rank > 50;
