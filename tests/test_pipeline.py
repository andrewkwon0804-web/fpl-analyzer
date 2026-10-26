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


def test_untracked_xg_is_null_not_zero(con):
    """FPL added xG in 2022-23 GW16; earlier weeks must be NULL, not 0."""
    cover = q(con, """SELECT season, gw, COUNT(expected_goals) AS with_xg, COUNT(*) AS n,
                             SUM(expected_goals) AS xg
                      FROM player_match GROUP BY season, gw""")
    untracked = cover[cover["with_xg"] == 0]
    assert set(untracked["season"]) <= {"2022-23"}
    assert (cover.loc[cover["with_xg"] > 0, "xg"] > 0).all(), "a tracked week has zero total xG"


def test_splits_do_not_overlap():
    assert VALID_SEASON not in TRAIN_SEASONS
    assert TEST_SEASON not in TRAIN_SEASONS + [VALID_SEASON]
    assert max(TRAIN_SEASONS) < VALID_SEASON < TEST_SEASON


LIVE_FEATURES = ["n_fixtures", "home_fixtures", "fixture_difficulty", "opp_attack_xg_l6",
                 "opp_defence_xga_l6", "team_attack_xg_l6", "points_l3", "points_l5", "minutes_l3",
                 "minutes_l5", "starts_l5", "xg_l5", "xa_l5", "xgc_l5", "bonus_l5", "bps_l5", "ict_l5",
                 "points_std", "minutes_std", "xgi_total_std", "gws_so_far", "prev_ppg", "prev_minutes",
                 # candidate features tested in experiments/ (not used by the model yet)
                 "team_attack_xg_std", "team_defence_xga_std", "team_cs_rate_std", "opp_attack_xg_std",
                 "opp_defence_xga_std", "defcon_l5", "defcon_std", "bonus_std", "starts_std",
                 "points_p90_std", "xgi_p90_std"]


def test_upcoming_features_match_training_features(tmp_path):
    """Replay the live season: hide its last played gameweek, rebuild the 'upcoming'
    features, and check they equal the features training used for that gameweek.
    This proves live picks use exactly the inputs the model learned from."""
    import shutil

    from fpl.config import LIVE_SEASON, SQL_DIR

    copy = tmp_path / "replay.db"
    shutil.copy(DB_PATH, copy)
    with sqlite3.connect(DB_PATH) as con:
        last_gw = con.execute("SELECT MAX(gw) FROM player_match WHERE season = ?",
                              (LIVE_SEASON,)).fetchone()[0]
        truth = pd.read_sql("SELECT * FROM player_features WHERE season = ? AND gw = ?",
                            con, params=(LIVE_SEASON, last_gw))
    with sqlite3.connect(copy) as con:
        con.execute("DELETE FROM player_match WHERE season = ? AND gw = ?", (LIVE_SEASON, last_gw))
        con.execute("UPDATE fixtures SET finished = 0 WHERE season = ? AND gw >= ?", (LIVE_SEASON, last_gw))
        con.executescript((SQL_DIR / "features.sql").read_text())
        con.executescript((SQL_DIR / "upcoming.sql").read_text())
        replay = pd.read_sql("SELECT * FROM player_upcoming", con)

    assert (replay["gw"] == last_gw).all()
    both = truth.merge(replay, on="player_id", suffixes=("_train", "_live"))
    assert len(both) > 0.9 * len(truth), "most players should be matched"
    # A player who changed club since that gameweek has a different fixture now; skip those.
    same_fixture = np.isclose(both["fixture_difficulty_train"], both["fixture_difficulty_live"]) & \
        (both["home_fixtures_train"] == both["home_fixtures_live"])
    assert same_fixture.mean() > 0.98
    both = both[same_fixture]
    for col in LIVE_FEATURES:
        assert np.allclose(both[f"{col}_train"], both[f"{col}_live"], equal_nan=True), col


def test_horizon_first_week_matches_upcoming():
    """The planner's first gameweek must use exactly the same inputs as the live picks."""
    with sqlite3.connect(DB_PATH) as con:
        up = pd.read_sql("SELECT * FROM player_upcoming", con)
        hz = pd.read_sql("SELECT * FROM player_horizon", con)
    first = hz[hz["gw"] == up["gw"].iloc[0]]
    assert len(first) == len(up)
    both = up.merge(first, on="player_id", suffixes=("_up", "_hz"))
    for col in LIVE_FEATURES:
        assert np.allclose(both[f"{col}_up"], both[f"{col}_hz"], equal_nan=True), col
    assert hz.groupby("player_id")["gw"].nunique().max() <= 6
