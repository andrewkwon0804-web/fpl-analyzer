"""Data-quality and leakage tests. Run `python run_pipeline.py` first, then `pytest`."""
import sqlite3

import numpy as np
import pandas as pd
import pytest

from fpl.config import DB_PATH, SEASONS, TEST_SEASON, TRAIN_SEASONS, VALID_SEASON

pytestmark = pytest.mark.skipif(not DB_PATH.exists(), reason="run the pipeline first")


@pytest.fixture(scope="module")
def con():
    c = sqlite3.connect(DB_PATH)
    yield c
    c.close()


def q(con, sql):
    return pd.read_sql(sql, con)


def test_all_seasons_loaded(con):
    seasons = q(con, "SELECT DISTINCT season FROM player_features")["season"].tolist()
    assert sorted(seasons) == sorted(SEASONS)


def test_primary_keys_unique(con):
    dupes = q(con, """SELECT season, player_id, gw, COUNT(*) n FROM player_features
                      GROUP BY 1, 2, 3 HAVING n > 1""")
    assert dupes.empty


def test_double_gameweeks_are_summed(con):
    check = q(con, """
        SELECT g.n_fixtures, g.points, SUM(pm.total_points) AS raw_points, COUNT(*) AS raw_n
        FROM player_gw g
        JOIN player_match pm USING (season, player_id, gw)
        GROUP BY g.season, g.player_id, g.gw""")
    assert (check["n_fixtures"] == check["raw_n"]).all()
    assert (check["points"] == check["raw_points"]).all()
    assert (check["n_fixtures"] == 2).any(), "expected at least one double gameweek"


def test_rolling_features_use_only_past_gameweeks(con):
    """Recompute points_l5 in pandas with an explicit shift and compare to SQL."""
    gw = q(con, "SELECT season, player_id, gw, points FROM player_gw ORDER BY season, player_id, gw")
    expected = (gw.groupby(["season", "player_id"])["points"]
                  .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean()))
    feats = q(con, "SELECT season, player_id, gw, points_l5 FROM player_features")
    merged = gw.assign(expected=expected).merge(feats, on=["season", "player_id", "gw"])
    assert np.allclose(merged["points_l5"], merged["expected"], equal_nan=True)


def test_first_gameweek_has_no_form(con):
    first = q(con, """SELECT points_l5, points_std FROM player_features f
                      WHERE gw = (SELECT MIN(gw) FROM player_features g
                                  WHERE g.season = f.season AND g.player_id = f.player_id)""")
    assert first["points_l5"].isna().all() and first["points_std"].isna().all()


def test_team_form_excludes_current_match(con):
    tf = q(con, "SELECT season, team_id, kickoff_time, xg_for, xg_for_l6 FROM team_form "
                "ORDER BY season, team_id, kickoff_time")
    expected = (tf.groupby(["season", "team_id"])["xg_for"]
                  .transform(lambda s: s.shift(1).rolling(6, min_periods=1).mean()))
    assert np.allclose(tf["xg_for_l6"], expected, equal_nan=True)


def test_splits_do_not_overlap():
    assert VALID_SEASON not in TRAIN_SEASONS
    assert TEST_SEASON not in TRAIN_SEASONS + [VALID_SEASON]
    assert max(TRAIN_SEASONS) < VALID_SEASON < TEST_SEASON
